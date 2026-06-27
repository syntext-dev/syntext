import { Command } from 'commander'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig } from '../lib/config'
import { loadCredentials } from '../lib/credentials'

export const deployCommand = new Command('deploy')
  .description('Build and deploy documentation to Syntext')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--preview', 'Deploy as a preview (non-production)')
  .option('--branch <branch>', 'Branch name for preview deploys')
  .option('--token <token>', 'Auth token (for CI, overrides login)')
  .option('--json', 'Output result as JSON')
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

      // Step 1: Build to .syntext/
      if (spinner) spinner.text = 'Building documentation...'
      const outDir = join(rootDir, '.syntext')
      const { execSync } = await import('node:child_process')
      execSync(`stx build --dir ${options.dir} --out .syntext`, {
        stdio: 'pipe',
        cwd: process.cwd(),
      })

      // Step 2: Collect all built files
      if (spinner) spinner.text = 'Collecting assets...'
      const files: Array<{ path: string; content: Buffer }> = []
      const glob = new Bun.Glob('**/*')
      for await (const file of glob.scan({ cwd: outDir })) {
        const filePath = join(outDir, file)
        const content = await Bun.file(filePath).arrayBuffer()
        files.push({ path: file, content: Buffer.from(content) })
      }

      if (files.length === 0) {
        throw new Error('Build produced no output files. Check your docs/ directory.')
      }

      // Step 3: Create a deployment via API
      if (spinner) spinner.text = `Uploading ${files.length} files...`
      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

      // Create a multipart form with all files
      const formData = new FormData()
      formData.append('metadata', JSON.stringify({
        projectId,
        preview: options.preview ?? false,
        branch: options.branch,
        fileCount: files.length,
      }))

      for (const file of files) {
        formData.append('files', new Blob([file.content]), file.path)
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

      const { data: deployment } = await res.json() as { data: { id: string; url: string; status: string } }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          deploymentId: deployment.id,
          url: deployment.url,
          files: files.length,
          preview: options.preview ?? false,
        }))
      } else {
        spinner?.succeed(chalk.green(`Deployed ${files.length} files successfully!`))
        console.log(`\n  ${chalk.dim('Deployment:')} ${deployment.id}`)
        console.log(`  ${chalk.dim('URL:')}        ${chalk.cyan(deployment.url)}\n`)
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
