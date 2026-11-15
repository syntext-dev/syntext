import { Command } from 'commander'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig, configFileExists } from '../lib/config'
import { loadCredentials } from '../lib/credentials'
import { apiFetch, jsonError } from '../lib/api'
import { resolveDocsRoot } from '../lib/resolve-docs-root'
import { appendSourceFiles, collectSourceBundle } from '../lib/source-bundle'
import { waitForBuild, type QueuedBehind } from '../lib/build-wait'

export const deployCommand = new Command('deploy')
  .description('Deploy documentation to Syntext (server-side compilation)')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--preview', 'Deploy as a preview (non-production)')
  .option('--branch <branch>', 'Branch name for preview deploys')
  .option('--token <token>', 'Login token or project API key (for CI, overrides stx login)')
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

        const res = await apiFetch(`${apiUrl}/v1/projects/${projectId}/deploy/promote`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(promoteBody),
        })

        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as { error?: { message?: string } }
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

      // Collect source files: pages from docs/ or the project root, plus the
      // config, assets, custom code, API specs and schemas (lib/source-bundle.ts).
      if (spinner) spinner.text = 'Collecting source files...'
      const { files: sourceFiles } = await collectSourceBundle(rootDir, config)

      if (sourceFiles.length === 0) {
        throw new Error('No source files found. Put your pages in a docs/ folder or next to syntext.json.')
      }

      // Upload source files to API for server-side compilation
      if (spinner) spinner.text = `Uploading ${sourceFiles.length} source files...`

      const formData = new FormData()
      formData.append('preview', options.preview ? 'true' : 'false')
      if (options.branch) {
        formData.append('branch', options.branch)
      }

      appendSourceFiles(formData, sourceFiles)

      const res = await apiFetch(`${apiUrl}/v1/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as { error?: { message?: string } }
        throw new Error(err.error?.message ?? `Deploy failed (${res.status})`)
      }

      const { data } = await res.json() as {
        data: { buildId: string; status: string; branch: string; isPreview: boolean; fileCount: number; logsUrl: string; queuedBehind?: QueuedBehind | null }
      }

      // Wait for the build. Behind another build of this project (e.g. the
      // webhook build of a merge), it waits for that one instead of timing out.
      if (spinner) spinner.text = 'Building on server...'

      const buildResult = await waitForBuild({
        apiUrl,
        token,
        projectId,
        buildId: data.buildId,
        queuedBehind: data.queuedBehind,
        labels: DEPLOY_STATUS_LABELS,
        onProgress: (text) => {
          if (spinner) spinner.text = text
        },
      })

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
        console.log(JSON.stringify(jsonError(err)))
      } else {
        spinner?.fail(chalk.red('Deploy failed'))
        console.error(`\n  ${(err as Error).message}\n`)
      }
      process.exit(1)
    }
  })

const DEPLOY_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued...',
  uploading: 'Uploading...',
  cloning: 'Preparing source...',
  parsing: 'Parsing documentation...',
  compiling: 'Compiling pages...',
  deploying: 'Deploying to CDN...',
}
