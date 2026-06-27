import { Command } from 'commander'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'
import { loadCredentials } from '../lib/credentials'
import { resolveDocsRoot } from '../lib/resolve-docs-root'

export const connectCommand = new Command('connect')
  .description('Connect local docs to a Syntext project')
  .argument('<projectId>', 'Project ID to connect to (from `stx projects list`)')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--create <name>', 'Create a new project if projectId is not provided')
  .option('--json', 'Output result as JSON')
  .action(async (projectId, options) => {
    const spinner = options.json ? null : ora('Connecting project...').start()

    try {
      const creds = await loadCredentials()
      if (!creds?.token) {
        throw new Error('Not authenticated. Run `stx login` first.')
      }

      const baseDir = join(process.cwd(), options.dir)
      const { docsRoot } = await resolveDocsRoot(baseDir)
      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

      // Verify project exists and user has access
      if (spinner) spinner.text = 'Verifying project access...'

      const res = await fetch(`${apiUrl}/v1/projects/${projectId}`, {
        headers: { 'Authorization': `Bearer ${creds.token}` },
      })

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Project ${projectId} not found. Run \`stx projects list\` to see your projects.`)
        }
        if (res.status === 403) {
          throw new Error(`No access to project ${projectId}. Check your permissions.`)
        }
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        throw new Error(err.error?.message ?? `Failed to verify project (${res.status})`)
      }

      const { data: project } = await res.json() as {
        data: { id: string; name: string; slug: string; docsUrl: string }
      }

      // Find and update config file
      if (spinner) spinner.text = 'Updating config...'

      const configNames = ['syntext.json', 'syntext.yaml', 'syntext.yml', 'stx.json', 'stx.yaml', 'stx.yml']
      let configPath: string | null = null
      let configContent: string | null = null

      for (const name of configNames) {
        const path = join(docsRoot, name)
        try {
          configContent = await readFile(path, 'utf-8')
          configPath = path
          break
        } catch {
          continue
        }
      }

      if (!configPath || !configContent) {
        throw new Error('No config file found. Run `stx init` first to create a project structure.')
      }

      // Update the config with projectId
      if (configPath.endsWith('.json')) {
        const config = JSON.parse(configContent)
        config.projectId = projectId
        await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
      } else {
        // YAML — append or replace projectId line
        if (configContent.includes('projectId:')) {
          configContent = configContent.replace(/projectId:.*/, `projectId: "${projectId}"`)
        } else {
          configContent = `projectId: "${projectId}"\n${configContent}`
        }
        await writeFile(configPath, configContent)
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, projectId, name: project.name, docsUrl: project.docsUrl }))
      } else {
        spinner?.succeed(chalk.green(`Connected to ${chalk.bold(project.name)}`))
        console.log('')
        console.log(`  ${chalk.dim('Project:')}  ${project.name}`)
        console.log(`  ${chalk.dim('ID:')}       ${projectId}`)
        console.log(`  ${chalk.dim('Docs URL:')} ${chalk.cyan(project.docsUrl)}`)
        console.log(`  ${chalk.dim('Config:')}   ${configPath.replace(process.cwd() + '/', '')}`)
        console.log('')
        console.log(`  ${chalk.dim('You can now run:')}`)
        console.log(`    stx dev      ${chalk.dim('— watch & deploy previews')}`)
        console.log(`    stx deploy   ${chalk.dim('— publish to production')}`)
        console.log('')
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (err as Error).message }))
      } else {
        spinner?.fail(chalk.red((err as Error).message))
      }
      process.exit(1)
    }
  })
