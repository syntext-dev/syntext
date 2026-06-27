import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { loadCredentials } from '../lib/credentials'

export const projectsCommand = new Command('projects')
  .description('Manage Syntext projects')

projectsCommand
  .command('create')
  .description('Create a new project on Syntext')
  .argument('<name>', 'Project name')
  .option('--json', 'Output result as JSON')
  .action(async (name, options) => {
    const spinner = options.json ? null : ora('Creating project...').start()

    try {
      const creds = await loadCredentials()
      if (!creds?.token) {
        throw new Error('Not authenticated. Run `stx login` first.')
      }

      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

      const res = await fetch(`${apiUrl}/v1/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        const msg = err.error?.message ?? `Failed to create project (${res.status})`

        // Plan gating — surface limit errors clearly
        if (res.status === 403 || res.status === 402) {
          throw new Error(`Plan limit reached: ${msg}. Upgrade at https://syntext.dev/settings/billing`)
        }
        throw new Error(msg)
      }

      const { data } = await res.json() as {
        data: { id: string; name: string; slug: string; docsUrl: string }
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, ...data }))
      } else {
        spinner?.succeed(chalk.green('Project created!'))
        console.log('')
        console.log(`  ${chalk.dim('ID:')}       ${data.id}`)
        console.log(`  ${chalk.dim('Name:')}     ${data.name}`)
        console.log(`  ${chalk.dim('Slug:')}     ${data.slug}`)
        console.log(`  ${chalk.dim('Docs URL:')} ${chalk.cyan(data.docsUrl)}`)
        console.log('')
        console.log(`  ${chalk.dim('Connect this project to your local docs:')}`)
        console.log(`    stx connect ${data.id}`)
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

projectsCommand
  .command('list')
  .description('List your Syntext projects')
  .option('--json', 'Output result as JSON')
  .action(async (options) => {
    const spinner = options.json ? null : ora('Fetching projects...').start()

    try {
      const creds = await loadCredentials()
      if (!creds?.token) {
        throw new Error('Not authenticated. Run `stx login` first.')
      }

      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

      const res = await fetch(`${apiUrl}/v1/projects`, {
        headers: { 'Authorization': `Bearer ${creds.token}` },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        throw new Error(err.error?.message ?? `Failed to fetch projects (${res.status})`)
      }

      const { data } = await res.json() as {
        data: Array<{ id: string; name: string; slug: string; docsUrl: string; plan: string }>
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, projects: data }))
      } else {
        spinner?.succeed(chalk.green(`${data.length} project${data.length === 1 ? '' : 's'}`))
        console.log('')
        for (const project of data) {
          console.log(`  ${chalk.bold(project.name)} ${chalk.dim(`(${project.plan})`)}`)
          console.log(`    ${chalk.dim('ID:')}  ${project.id}`)
          console.log(`    ${chalk.dim('URL:')} ${chalk.cyan(project.docsUrl)}`)
          console.log('')
        }
        if (data.length === 0) {
          console.log(`  ${chalk.dim('No projects yet. Create one with:')}`)
          console.log(`    stx projects create my-docs`)
          console.log('')
        }
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

projectsCommand
  .command('delete')
  .description('Delete a project (requires confirmation)')
  .argument('<projectId>', 'Project ID to delete')
  .option('--confirm', 'Skip confirmation prompt')
  .option('--json', 'Output result as JSON')
  .action(async (projectId, options) => {
    if (!options.confirm) {
      console.error(chalk.red('This action is irreversible. Pass --confirm to proceed.'))
      process.exit(1)
    }

    const spinner = options.json ? null : ora('Deleting project...').start()

    try {
      const creds = await loadCredentials()
      if (!creds?.token) {
        throw new Error('Not authenticated. Run `stx login` first.')
      }

      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

      const res = await fetch(`${apiUrl}/v1/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${creds.token}` },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        throw new Error(err.error?.message ?? `Failed to delete project (${res.status})`)
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, projectId }))
      } else {
        spinner?.succeed(chalk.green('Project deleted.'))
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
