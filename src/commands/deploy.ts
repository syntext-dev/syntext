import { Command } from 'commander'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig } from '../lib/config'
import { loadCredentials } from '../lib/credentials'

export const deployCommand = new Command('deploy')
  .description('Deploy documentation to Syntext (server-side compilation)')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--preview', 'Deploy as a preview (non-production)')
  .option('--branch <branch>', 'Branch name for preview deploys')
  .option('--token <token>', 'Auth token (for CI, overrides login)')
  .option('--json', 'Output result as JSON')
  .option('--promote [buildId]', 'Promote a preview deployment to production')
  .action(async (options) => {
    const rootDir = join(process.cwd(), options.dir)
    const spinner = options.json ? null : ora('Preparing deployment...').start()

    try {
      const config = await loadConfig(rootDir)
      const token = options.token ?? (await loadCredentials())?.token

      if (!token) {
        throw new Error('Not authenticated. Run `stx login` first, or pass --token.')
      }

      const projectId = config.projectId
      if (!projectId) {
        throw new Error('No projectId in syntext.json. Run `stx init` and connect to a project.')
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

      // Include syntext.json
      const configPath = join(rootDir, 'syntext.json')
      const configFile = Bun.file(configPath)
      if (await configFile.exists()) {
        sourceFiles.push({ path: 'syntext.json', content: Buffer.from(await configFile.arrayBuffer()) })
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

      // Include openapi.json/yaml if present
      for (const specName of ['openapi.json', 'openapi.yaml', 'openapi.yml']) {
        const specPath = join(rootDir, specName)
        const specFile = Bun.file(specPath)
        if (await specFile.exists()) {
          sourceFiles.push({ path: specName, content: Buffer.from(await specFile.arrayBuffer()) })
        }
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
