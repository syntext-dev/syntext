import { Command } from 'commander'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig } from '../lib/config'
import { loadCredentials } from '../lib/credentials'

export const deployCommand = new Command('deploy')
  .description('Deploy documentation to Syntext hosting')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--json', 'Output result as JSON')
  .action(async (options) => {
    const rootDir = join(process.cwd(), options.dir)
    const spinner = options.json ? null : ora('Deploying...').start()

    try {
      const config = await loadConfig(rootDir)
      const credentials = await loadCredentials()

      if (!credentials?.token) {
        throw new Error('Not authenticated. Run `syntext login` first.')
      }

      if (spinner) spinner.text = 'Building documentation...'

      // Build first
      const outDir = join(rootDir, 'dist')
      // Trigger build via the build command logic (reuse)
      const { execSync } = await import('node:child_process')
      execSync(`bun run ${join(import.meta.dir, 'build.ts')} --dir ${options.dir} --out dist`, {
        stdio: 'pipe',
        cwd: rootDir,
      })

      if (spinner) spinner.text = 'Uploading to Syntext...'

      // Upload to backend
      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'
      const projectId = config.projectId

      if (!projectId) {
        throw new Error('No projectId in syntext.config.ts. Connect this project first.')
      }

      // Trigger a build via API
      const res = await fetch(`${apiUrl}/v1/projects/${projectId}/builds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trigger: 'manual' }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message ?? 'Deploy failed')
      }

      const { data: build } = await res.json()

      if (options.json) {
        console.log(JSON.stringify({ success: true, buildId: build.id, url: build.deployUrl }))
      } else {
        spinner?.succeed(chalk.green('Deployed successfully!'))
        console.log(`\n  ${chalk.dim('Build ID:')} ${build.id}`)
        if (build.deployUrl) {
          console.log(`  ${chalk.dim('URL:')}      ${chalk.cyan(build.deployUrl)}`)
        }
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (err as Error).message }))
      } else {
        spinner?.fail(chalk.red('Deploy failed'))
        console.error(`  ${(err as Error).message}`)
      }
      process.exit(1)
    }
  })
