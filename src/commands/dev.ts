import { Command } from 'commander'
import { join } from 'node:path'
import { watch } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig, configFileExists } from '../lib/config'
import { loadCredentials } from '../lib/credentials'
import { apiFetch, isSessionRevokedError } from '../lib/api'
import { resolveDocsRoot } from '../lib/resolve-docs-root'
import { CUSTOM_CODE_DIR, hasRepoScripts } from '../lib/repo-custom-code'
import { appendSourceFiles, collectSourceBundle, type SourceLayout } from '../lib/source-bundle'
import { findPagesDir } from '../lib/pages-dir'
import { collectSpecs } from '../lib/source-specs'
import { EXCLUDED_DIRS, isInExcludedDir, isSecretPath } from '../lib/upload-filter'

export const devCommand = new Command('dev')
  .description('Watch for changes and auto-deploy previews (your pages in docs/ or next to syntext.json, public/, _syntext/ and the config). CSS from _syntext/ applies in previews; head.html and scripts never run there')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--branch <branch>', 'Branch name for preview', 'dev')
  .option('--token <token>', 'Login token or project API key (overrides stx login)')
  .action(async (options) => {
    const baseDir = join(process.cwd(), options.dir)
    const { docsRoot: rootDir, nested } = await resolveDocsRoot(baseDir)

    // Check if config file exists before loading
    if (!(await configFileExists(rootDir))) {
      console.error(chalk.red('No syntext.json found in this directory.'))
      console.error(chalk.dim('Run `stx init` to create a new documentation project.'))
      process.exit(1)
    }

    const config = await loadConfig(rootDir)
    const token = options.token ?? (await loadCredentials())?.token

    if (!token) {
      console.error(chalk.red('Not authenticated. Run `stx login` first, or pass --token.'))
      process.exit(1)
    }

    const projectId = config.projectId
    if (!projectId) {
      console.error(chalk.red('No projectId in syntext.json.'))
      console.error(chalk.dim('Run `stx connect <projectId>` to link this directory to a project.'))
      process.exit(1)
    }

    const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'
    const branch = options.branch

    // Initial deploy
    const displayDir = nested ? rootDir.replace(process.cwd() + '/', '') : '.'
    console.log(chalk.dim(`Watching ${displayDir} for changes...`))
    console.log(chalk.dim(`Branch: ${branch}\n`))
    const scriptsNote = previewScriptsNote(rootDir)
    if (scriptsNote) console.log(chalk.dim(scriptsNote + '\n'))

    let previewUrl = await deployPreview(rootDir, apiUrl, token, projectId, branch).catch(exitIfSessionRevoked)
    if (previewUrl) {
      console.log(`\n  ${chalk.bold('Preview:')} ${chalk.cyan(previewUrl)}\n`)
    }

    // Watch for changes
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    // docs/ covers docs/_syntext/; the root _syntext/ is watched on its own.
    // Pages at the project root: the whole folder, minus what is never uploaded.
    const layout: SourceLayout = (await findPagesDir(rootDir)).prefix === 'docs' ? 'docs' : 'root'
    const dirsToWatch = devWatchDirs(rootDir, layout)
    const configFiles = [
      'syntext.json', 'syntext.yaml', 'syntext.yml',
      'stx.json', 'stx.yaml', 'stx.yml',
      ...collectSpecs(config).paths,
    ].map((f) => join(rootDir, f))

    const triggerDeploy = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        const url = await deployPreview(rootDir, apiUrl, token, projectId, branch).catch(exitIfSessionRevoked)
        if (url && url !== previewUrl) {
          previewUrl = url
          console.log(`\n  ${chalk.bold('Preview:')} ${chalk.cyan(previewUrl)}\n`)
        }
      }, 800)
    }

    // Watch docs/, public/ and _syntext/ (or the project folder) recursively
    for (const dir of dirsToWatch) {
      try {
        watch(dir, { recursive: true }, (_event, file) => {
          if (isWatchedChange(file, layout)) triggerDeploy()
        })
      } catch {
        // directory doesn't exist — skip
      }
    }

    // Watch config files
    for (const file of configFiles) {
      try {
        watch(file, () => triggerDeploy())
      } catch {
        // file doesn't exist — skip
      }
    }

    console.log(chalk.dim('Press Ctrl+C to stop.\n'))

    // Keep process alive
    await new Promise(() => {})
  })

/**
 * Folders `stx dev` watches for changes: docs/ (with docs/_syntext/), public/
 * and the root _syntext/; with pages at the project root, the project folder.
 */
export function devWatchDirs(rootDir: string, layout: SourceLayout = 'docs'): string[] {
  if (layout === 'root') return [rootDir]
  return ['docs', 'public', CUSTOM_CODE_DIR].map((d) => join(rootDir, d))
}

/** False for a change the upload never includes (dependencies, git, build output, dot files, secrets) when watching the project folder. */
export function isWatchedChange(file: string | null, layout: SourceLayout): boolean {
  if (layout === 'docs' || !file) return true
  const rel = file.replace(/\\/g, '/')
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  return !isInExcludedDir(rel) && !EXCLUDED_DIRS.has(rel.split('/')[0]) && !name.startsWith('.') && !isSecretPath(rel)
}

/** The note `stx dev` prints when the project has head.html or scripts, which previews never run. Null without them. */
export function previewScriptsNote(rootDir: string): string | null {
  if (!hasRepoScripts(rootDir)) return null
  return `Note: ${CUSTOM_CODE_DIR}/*.js and head.html never run in previews (CSS does). On the live site they run only when "Scripts from your docs" / "Head tags from your docs" are on in Integrations › Custom code.`
}

/** A revoked session cannot recover while watching: say so and stop. Other errors propagate. */
export function exitIfSessionRevoked(err: unknown): never {
  if (isSessionRevokedError(err)) {
    console.error(chalk.red(`\n  ${err.message}`))
    process.exit(1)
  }
  throw err
}

/**
 * Uploads the docs as a preview build and waits for it. Returns the preview URL,
 * or null on failure (already reported). A revoked session is rethrown.
 */
export async function deployPreview(
  rootDir: string,
  apiUrl: string,
  token: string,
  projectId: string,
  branch: string,
): Promise<string | null> {
  const spinner = ora('Deploying preview...').start()

  try {
    // Same upload as stx deploy: pages from docs/ or the project root (lib/source-bundle.ts).
    const { files: sourceFiles } = await collectSourceBundle(rootDir, await loadConfig(rootDir))

    if (sourceFiles.length === 0) {
      spinner.fail(chalk.red('No source files found'))
      return null
    }

    spinner.text = `Uploading ${sourceFiles.length} files...`

    const formData = new FormData()
    formData.append('preview', 'true')
    formData.append('branch', branch)

    appendSourceFiles(formData, sourceFiles)

    const res = await apiFetch(`${apiUrl}/v1/projects/${projectId}/deploy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as { error?: { message?: string } }
      spinner.fail(chalk.red(err.error?.message ?? `Deploy failed (${res.status})`))
      return null
    }

    const { data } = await res.json() as {
      data: { buildId: string; status: string; branch: string; isPreview: boolean; fileCount: number }
    }

    spinner.text = 'Building on server...'

    // Poll for completion
    const maxWait = 120_000
    const pollInterval = 2_000
    const start = Date.now()

    while (Date.now() - start < maxWait) {
      const buildRes = await apiFetch(`${apiUrl}/v1/projects/${projectId}/builds/${data.buildId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!buildRes.ok) {
        await Bun.sleep(pollInterval)
        continue
      }

      const { data: build } = await buildRes.json() as {
        data: { status: string; deployUrl: string | null; pageCount: number | null; durationMs: number | null; error: string | null }
      }

      const statusMap: Record<string, string> = {
        queued: 'Queued...',
        uploading: 'Uploading...',
        parsing: 'Parsing...',
        compiling: 'Compiling...',
        deploying: 'Deploying...',
      }
      spinner.text = statusMap[build.status] || `Status: ${build.status}`

      if (build.status === 'deployed') {
        spinner.succeed(chalk.green(`Deployed (${build.durationMs}ms)`))
        return build.deployUrl || null
      }

      if (build.status === 'failed') {
        spinner.fail(chalk.red(build.error || 'Build failed'))
        return null
      }

      await Bun.sleep(pollInterval)
    }

    spinner.fail(chalk.red('Build timed out'))
    return null
  } catch (err) {
    spinner.fail(chalk.red((err as Error).message))
    if (isSessionRevokedError(err)) throw err
    return null
  }
}
