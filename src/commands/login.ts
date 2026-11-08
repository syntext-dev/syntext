import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { saveCredentials } from '../lib/credentials'
import { apiFetch } from '../lib/api'
import { pollDeviceToken } from '../lib/device-poll'
import { apiKeysUrl, projectsUrl } from '../lib/dashboard-urls'
import { configFileExists, loadConfig } from '../lib/config'
import { resolveDocsRoot } from '../lib/resolve-docs-root'

/** The project id from a syntext.json in `cwd` (or its .syntext/ / .stx/), if any. */
export async function findLocalProjectId(cwd: string): Promise<string | undefined> {
  try {
    const { docsRoot } = await resolveDocsRoot(cwd)
    if (!(await configFileExists(docsRoot))) return undefined
    const config = await loadConfig(docsRoot)
    return typeof config.projectId === 'string' && config.projectId ? config.projectId : undefined
  } catch {
    return undefined
  }
}

/** Instructions shown when the device flow is unavailable. */
export function tokenFallbackLines(projectId: string | undefined): string[] {
  const where = projectId
    ? `  1. Open ${chalk.cyan(apiKeysUrl(projectId))}`
    : `  1. Open ${chalk.cyan(projectsUrl())}, pick your project, then go to Settings → API keys`
  return [
    chalk.dim('  Browser login is not available right now. To deploy without it, use a project API key:\n'),
    where,
    '  2. Create an API key',
    `  3. Pass it to commands with ${chalk.bold('--token')}, e.g. ${chalk.bold('stx deploy --token <api-key>')}\n`,
  ]
}

export const loginCommand = new Command('login')
  .description(
    'Authenticate with Syntext. Opens the browser to approve this device; stops if the request is denied there or the code expires. ' +
      'The session appears as "stx CLI" in the dashboard\'s sessions list, where it can be revoked.',
  )
  .option('--token <token>', 'CLI session token to store instead of browser login (project API keys are passed to deploy/build/dev with --token)')
  .option('--api-url <url>', 'Custom API URL', 'https://api.syntext.dev')
  .action(async (options) => {
    if (options.token) {
      // Non-interactive: validate and save
      const spinner = ora('Verifying token...').start()
      try {
        const res = await apiFetch(`${options.apiUrl}/v1/auth/profile`, {
          headers: { Authorization: `Bearer ${options.token}` },
        })
        if (!res.ok) {
          throw new Error('Invalid token')
        }
        const { data: user } = await res.json() as { data: { name: string; email: string } }
        await saveCredentials({ token: options.token, apiUrl: options.apiUrl })
        spinner.succeed(chalk.green(`Authenticated as ${user.name} (${user.email})`))
      } catch (err) {
        spinner.fail(chalk.red((err as Error).message))
        process.exit(1)
      }
      return
    }

    // Interactive: device flow via browser
    console.log(chalk.bold('\n  Syntext CLI Login\n'))

    const spinner = ora('Starting authentication...').start()
    try {
      const res = await apiFetch(`${options.apiUrl}/v1/auth/device-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'syntext-cli' }),
      })

      if (!res.ok) {
        spinner.stop()
        for (const line of tokenFallbackLines(await findLocalProjectId(process.cwd()))) console.log(line)
        return
      }

      const { data } = await res.json() as { data: { deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number; interval: number } }

      spinner.stop()
      const approveUrl = `${data.verificationUrl}?code=${data.userCode}`
      console.log(`  Opening browser to complete login...\n`)
      console.log(`  If the browser doesn't open, visit:`)
      console.log(`  ${chalk.underline(approveUrl)}\n`)

      // Try to open browser
      try {
        const { exec } = await import('node:child_process')
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
        exec(`${cmd} "${approveUrl}"`)
      } catch {
        // Silent fail — user can open manually
      }

      const pollSpinner = ora('Waiting for authorization...').start()
      const result = await pollDeviceToken({
        apiUrl: options.apiUrl,
        deviceCode: data.deviceCode,
        clientId: 'syntext-cli',
        intervalSec: data.interval,
        expiresInSec: data.expiresIn,
      })

      if (result.kind === 'approved') {
        await saveCredentials({ token: result.token, apiUrl: options.apiUrl })
        pollSpinner.succeed(chalk.green(`Authenticated as ${result.user.name} (${result.user.email})`))
        return
      }

      pollSpinner.fail(chalk.red(result.message))
      process.exit(1)
    } catch (err) {
      spinner.fail(chalk.red('Login failed'))
      console.error(`  ${(err as Error).message}`)
      process.exit(1)
    }
  })
