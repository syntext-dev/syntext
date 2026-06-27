import { Command } from 'commander'
import { join } from 'node:path'
import { watch } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig, configFileExists } from '../lib/config'
import { loadCredentials } from '../lib/credentials'
import { resolveDocsRoot } from '../lib/resolve-docs-root'

export const devCommand = new Command('dev')
  .description('Watch for changes and auto-deploy previews')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--branch <branch>', 'Branch name for preview', 'dev')
  .option('--token <token>', 'Auth token (overrides login)')
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

    let previewUrl = await deployPreview(rootDir, apiUrl, token, projectId, branch)
    if (previewUrl) {
      console.log(`\n  ${chalk.bold('Preview:')} ${chalk.cyan(previewUrl)}\n`)
    }

    // Watch for changes
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const dirsToWatch = ['docs', 'public'].map((d) => join(rootDir, d))
    const configFiles = [
      'syntext.json', 'syntext.yaml', 'syntext.yml',
      'stx.json', 'stx.yaml', 'stx.yml',
      'openapi.json', 'openapi.yaml', 'openapi.yml',
    ].map((f) => join(rootDir, f))

    const triggerDeploy = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        const url = await deployPreview(rootDir, apiUrl, token, projectId, branch)
        if (url && url !== previewUrl) {
          previewUrl = url
          console.log(`\n  ${chalk.bold('Preview:')} ${chalk.cyan(previewUrl)}\n`)
        }
      }, 800)
    }

    // Watch docs/ and public/ recursively
    for (const dir of dirsToWatch) {
      try {
        watch(dir, { recursive: true }, () => triggerDeploy())
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

async function deployPreview(
  rootDir: string,
  apiUrl: string,
  token: string,
  projectId: string,
  branch: string,
): Promise<string | null> {
  const spinner = ora('Deploying preview...').start()

  try {
    const sourceFiles: Array<{ path: string; content: Buffer }> = []

    // Config file (first match wins)
    const configNames = ['syntext.json', 'syntext.yaml', 'syntext.yml', 'stx.json', 'stx.yaml', 'stx.yml']
    for (const name of configNames) {
      const configPath = join(rootDir, name)
      const configFile = Bun.file(configPath)
      if (await configFile.exists()) {
        sourceFiles.push({ path: name, content: Buffer.from(await configFile.arrayBuffer()) })
        break
      }
    }

    // docs.json
    const docsJsonPath = join(rootDir, 'docs.json')
    const docsJsonFile = Bun.file(docsJsonPath)
    if (await docsJsonFile.exists()) {
      sourceFiles.push({ path: 'docs.json', content: Buffer.from(await docsJsonFile.arrayBuffer()) })
    }

    // docs/
    const docsDir = join(rootDir, 'docs')
    const docsGlob = new Bun.Glob('**/*')
    try {
      for await (const file of docsGlob.scan({ cwd: docsDir })) {
        const filePath = join(docsDir, file)
        const content = await Bun.file(filePath).arrayBuffer()
        sourceFiles.push({ path: `docs/${file}`, content: Buffer.from(content) })
      }
    } catch {
      // no docs dir
    }

    // public/
    const publicDir = join(rootDir, 'public')
    const publicGlob = new Bun.Glob('**/*')
    try {
      for await (const file of publicGlob.scan({ cwd: publicDir })) {
        const filePath = join(publicDir, file)
        const content = await Bun.file(filePath).arrayBuffer()
        sourceFiles.push({ path: `public/${file}`, content: Buffer.from(content) })
      }
    } catch {
      // no public dir
    }

    // openapi spec
    for (const specName of ['openapi.json', 'openapi.yaml', 'openapi.yml']) {
      const specPath = join(rootDir, specName)
      const specFile = Bun.file(specPath)
      if (await specFile.exists()) {
        sourceFiles.push({ path: specName, content: Buffer.from(await specFile.arrayBuffer()) })
      }
    }

    if (sourceFiles.length === 0) {
      spinner.fail(chalk.red('No source files found'))
      return null
    }

    spinner.text = `Uploading ${sourceFiles.length} files...`

    const formData = new FormData()
    formData.append('preview', 'true')
    formData.append('branch', branch)

    for (const file of sourceFiles) {
      formData.append('files', new Blob([file.content]), file.path)
      formData.append('paths', file.path)
    }

    const res = await fetch(`${apiUrl}/v1/projects/${projectId}/deploy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
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
      const buildRes = await fetch(`${apiUrl}/v1/projects/${projectId}/builds/${data.buildId}`, {
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
    return null
  }
}
