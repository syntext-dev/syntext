import { Command } from 'commander'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig, configFileExists } from '../lib/config'
import type { SyntextConfig } from '../lib/config'
import { loadCredentials } from '../lib/credentials'
import { resolveDocsRoot } from '../lib/resolve-docs-root'

/**
 * Every OpenAPI spec path a deploy must upload, derived from the `openapi`
 * config rather than a fixed filename list.
 *
 * Accepts all three documented forms — a single path, a list of paths, or
 * entries pairing a path with a URL prefix — and falls back to the conventional
 * root filenames when the config declares nothing, so projects that relied on
 * `openapi.json` sitting at the root keep working.
 *
 * Paths are returned relative to the project root, with any leading `./`
 * stripped, because that is the shape the upload bundle expects.
 */
export function collectSpecPaths(config: SyntextConfig, _rootDir: string): string[] {
  const normalize = (p: string) => p.replace(/^\.\//, '').trim()
  const spec = config.openapi

  const declared: string[] = []
  if (typeof spec === 'string') {
    declared.push(spec)
  } else if (Array.isArray(spec)) {
    for (const entry of spec) {
      if (typeof entry === 'string') declared.push(entry)
      else if (entry && typeof entry.path === 'string') declared.push(entry.path)
    }
  }

  if (declared.length > 0) {
    // De-duplicate: two prefixes may legitimately share one spec file.
    return [...new Set(declared.map(normalize).filter(Boolean))]
  }

  // Nothing declared — keep the historical convention.
  return ['openapi.json', 'openapi.yaml', 'openapi.yml']
}

/**
 * Directories and extensions the build pipeline searches for protocol schemas.
 * Mirrors `findFileByExtension` in the backend build worker — if that list
 * changes, this must change with it, or the schema is uploaded but never found
 * (or worse, found by the build but never uploaded).
 */
const SCHEMA_DIRS = ['', 'api/', 'spec/', 'docs/', 'proto/', 'schema/']
const SCHEMA_EXTENSIONS = ['.graphql', '.gql', '.proto', 'asyncapi.yaml', 'asyncapi.yml', 'asyncapi.json']

/**
 * Protocol schema files (GraphQL, gRPC, AsyncAPI) the build would look for.
 *
 * Same failure mode as the OpenAPI bug: the build searches several directories,
 * but a deploy only uploaded docs/ and public/. A .proto in proto/ or a schema
 * in schema/ never reached the build, so the reference pages it would have
 * generated were silently absent.
 *
 * Returns paths relative to the project root. Files already covered by the
 * docs/ upload are skipped, since they are uploaded anyway.
 */
export async function collectSchemaPaths(
  rootDir: string,
  readdirFn: (dir: string) => Promise<string[]>
): Promise<string[]> {
  const found: string[] = []
  for (const dir of SCHEMA_DIRS) {
    let entries: string[]
    try {
      entries = await readdirFn(join(rootDir, dir))
    } catch {
      continue // directory does not exist — expected for most projects
    }
    for (const entry of entries) {
      if (!SCHEMA_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue
      const rel = `${dir}${entry}`
      // docs/ is uploaded wholesale already.
      if (rel.startsWith('docs/')) continue
      found.push(rel)
    }
  }
  return [...new Set(found)]
}

export const deployCommand = new Command('deploy')
  .description('Deploy documentation to Syntext (server-side compilation)')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--preview', 'Deploy as a preview (non-production)')
  .option('--branch <branch>', 'Branch name for preview deploys')
  .option('--token <token>', 'Auth token (for CI, overrides login)')
  .option('--json', 'Output result as JSON')
  .option('--promote [buildId]', 'Promote a preview deployment to production')
  .action(async (options) => {
    const baseDir = join(process.cwd(), options.dir)
    const { docsRoot: rootDir } = await resolveDocsRoot(baseDir)
    const spinner = options.json ? null : ora('Preparing deployment...').start()

    try {
      // Check if config file exists before loading
      if (!(await configFileExists(rootDir))) {
        throw new Error('No syntext.json found in this directory. Run `stx init` to create a new documentation project.')
      }

      const config = await loadConfig(rootDir)
      const token = options.token ?? (await loadCredentials())?.token

      if (!token) {
        throw new Error('Not authenticated. Run `stx login` first, or pass --token.')
      }

      const projectId = config.projectId
      if (!projectId) {
        throw new Error('No projectId in syntext.json. Run `stx connect <projectId>` to link this directory to a project.')
      }

      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

      // Handle --promote flow
      if (options.promote !== undefined) {
        if (spinner) spinner.text = 'Promoting to production...'

        const promoteBody: Record<string, string> = {}
        if (typeof options.promote === 'string') {
          promoteBody.buildId = options.promote
        }

        const res = await fetch(`${apiUrl}/v1/projects/${projectId}/deploy/promote`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(promoteBody),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
          throw new Error(err.error?.message ?? `Promote failed (${res.status})`)
        }

        const { data } = await res.json() as { data: { buildId: string; message: string } }

        if (options.json) {
          console.log(JSON.stringify({ success: true, ...data }))
        } else {
          spinner?.succeed(chalk.green('Promotion started!'))
          console.log(`\n  ${chalk.dim('Build ID:')} ${data.buildId}`)
          console.log(`  ${chalk.dim('Status:')}   ${data.message}\n`)
        }
        return
      }

      // Collect source files (docs/, public/, syntext.json, docs.json)
      if (spinner) spinner.text = 'Collecting source files...'

      const sourceFiles: Array<{ path: string; content: Buffer }> = []

      // Include config file (first match wins)
      const configNames = ['syntext.json', 'syntext.yaml', 'syntext.yml', 'stx.json', 'stx.yaml', 'stx.yml']
      for (const name of configNames) {
        const configPath = join(rootDir, name)
        const configFile = Bun.file(configPath)
        if (await configFile.exists()) {
          sourceFiles.push({ path: name, content: Buffer.from(await configFile.arrayBuffer()) })
          break
        }
      }

      // Include docs.json if present
      const docsJsonPath = join(rootDir, 'docs.json')
      const docsJsonFile = Bun.file(docsJsonPath)
      if (await docsJsonFile.exists()) {
        sourceFiles.push({ path: 'docs.json', content: Buffer.from(await docsJsonFile.arrayBuffer()) })
      }

      // Include all docs/ files
      const docsDir = join(rootDir, 'docs')
      const docsGlob = new Bun.Glob('**/*')
      for await (const file of docsGlob.scan({ cwd: docsDir })) {
        const filePath = join(docsDir, file)
        const content = await Bun.file(filePath).arrayBuffer()
        sourceFiles.push({ path: `docs/${file}`, content: Buffer.from(content) })
      }

      // Include all public/ files (assets)
      const publicDir = join(rootDir, 'public')
      const publicGlob = new Bun.Glob('**/*')
      try {
        for await (const file of publicGlob.scan({ cwd: publicDir })) {
          const filePath = join(publicDir, file)
          const content = await Bun.file(filePath).arrayBuffer()
          sourceFiles.push({ path: `public/${file}`, content: Buffer.from(content) })
        }
      } catch {
        // public/ dir doesn't exist — that's fine
      }

      // Include OpenAPI specs.
      //
      // This used to check only for openapi.{json,yaml,yml} at the project root,
      // which silently dropped every spec declared via the `openapi` config —
      // including the array form pointing at a subdirectory. The build then
      // generated no API reference pages and reported success, so a project with
      // specs would deploy with its entire API reference missing.
      const specPaths = collectSpecPaths(config, rootDir)
      const missingSpecs: string[] = []
      for (const rel of specPaths) {
        const specFile = Bun.file(join(rootDir, rel))
        if (await specFile.exists()) {
          sourceFiles.push({ path: rel, content: Buffer.from(await specFile.arrayBuffer()) })
        } else {
          missingSpecs.push(rel)
        }
      }

      // Protocol schemas (GraphQL / gRPC / AsyncAPI) live outside docs/ by
      // convention, so they need collecting explicitly too.
      for (const rel of await collectSchemaPaths(rootDir, (d) => readdir(d))) {
        const f = Bun.file(join(rootDir, rel))
        if (await f.exists()) {
          sourceFiles.push({ path: rel, content: Buffer.from(await f.arrayBuffer()) })
        }
      }

      // A declared-but-absent spec means the deploy would drop pages. Fail rather
      // than publish a site quietly missing its API reference.
      if (missingSpecs.length > 0) {
        throw new Error(
          `OpenAPI spec(s) declared in your config but not found:\n` +
            missingSpecs.map((m) => `  - ${m}`).join('\n') +
            `\n\nDeploying would publish a site with no API reference pages for them.`
        )
      }

      if (sourceFiles.length === 0) {
        throw new Error('No source files found. Make sure you have a docs/ directory.')
      }

      // Upload source files to API for server-side compilation
      if (spinner) spinner.text = `Uploading ${sourceFiles.length} source files...`

      const formData = new FormData()
      formData.append('preview', options.preview ? 'true' : 'false')
      if (options.branch) {
        formData.append('branch', options.branch)
      }

      for (const file of sourceFiles) {
        formData.append('files', new Blob([file.content]), file.path)
        formData.append('paths', file.path)
      }

      const res = await fetch(`${apiUrl}/v1/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        throw new Error(err.error?.message ?? `Deploy failed (${res.status})`)
      }

      const { data } = await res.json() as {
        data: { buildId: string; status: string; branch: string; isPreview: boolean; fileCount: number; logsUrl: string }
      }

      // Stream build logs until completion
      if (spinner) spinner.text = 'Building on server...'

      const buildResult = await waitForBuild(apiUrl, token, projectId, data.buildId, spinner)

      if (buildResult.status === 'deployed') {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            buildId: data.buildId,
            url: buildResult.deployUrl,
            files: data.fileCount,
            preview: data.isPreview,
            duration: buildResult.durationMs,
          }))
        } else {
          spinner?.succeed(chalk.green('Deployed successfully!'))
          console.log('')
          console.log(`  ${chalk.dim('Build:')}    ${data.buildId.slice(0, 8)}`)
          console.log(`  ${chalk.dim('URL:')}      ${chalk.cyan(buildResult.deployUrl)}`)
          console.log(`  ${chalk.dim('Pages:')}    ${buildResult.pageCount}`)
          console.log(`  ${chalk.dim('Duration:')} ${buildResult.durationMs}ms`)
          if (data.isPreview) {
            console.log(`\n  ${chalk.dim('This is a preview deploy. Run')} stx deploy --promote ${chalk.dim('to go live.')}`)
          }
          console.log('')
        }
      } else {
        throw new Error(buildResult.error || 'Build failed on server')
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (err as Error).message }))
      } else {
        spinner?.fail(chalk.red('Deploy failed'))
        console.error(`\n  ${(err as Error).message}\n`)
      }
      process.exit(1)
    }
  })

async function waitForBuild(
  apiUrl: string,
  token: string,
  projectId: string,
  buildId: string,
  spinner: ReturnType<typeof ora> | null,
): Promise<{ status: string; deployUrl?: string; pageCount?: number; durationMs?: number; error?: string }> {
  const maxWait = 120_000 // 2 minutes
  const pollInterval = 2_000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    const res = await fetch(`${apiUrl}/v1/projects/${projectId}/builds/${buildId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      await Bun.sleep(pollInterval)
      continue
    }

    const { data: build } = await res.json() as {
      data: { status: string; deployUrl: string | null; pageCount: number | null; durationMs: number | null; error: string | null }
    }

    if (spinner) {
      const statusMap: Record<string, string> = {
        queued: 'Queued...',
        uploading: 'Uploading...',
        cloning: 'Preparing source...',
        parsing: 'Parsing documentation...',
        compiling: 'Compiling pages...',
        deploying: 'Deploying to CDN...',
      }
      spinner.text = statusMap[build.status] || `Status: ${build.status}`
    }

    if (build.status === 'deployed') {
      return {
        status: 'deployed',
        deployUrl: build.deployUrl || undefined,
        pageCount: build.pageCount || undefined,
        durationMs: build.durationMs || undefined,
      }
    }

    if (build.status === 'failed') {
      return { status: 'failed', error: build.error || 'Build failed' }
    }

    await Bun.sleep(pollInterval)
  }

  return { status: 'failed', error: 'Build timed out after 2 minutes' }
}
