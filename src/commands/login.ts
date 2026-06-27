import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { saveCredentials } from '../lib/credentials'

export const loginCommand = new Command('login')
  .description('Authenticate with Syntext')
  .option('--token <token>', 'API token (skip interactive login)')
  .option('--api-url <url>', 'Custom API URL', 'https://api.syntext.dev')
  .action(async (options) => {
    if (options.token) {
      // Non-interactive: validate and save
      const spinner = ora('Verifying token...').start()
      try {
        const res = await fetch(`${options.apiUrl}/v1/auth/profile`, {
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
      const res = await fetch(`${options.apiUrl}/v1/auth/device-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'syntext-cli' }),
      })

      if (!res.ok) {
        // Fallback: prompt for token
        spinner.stop()
        console.log(chalk.dim('  Device auth not available. Use token-based login:\n'))
        console.log(`  1. Go to ${chalk.cyan('https://syntext.dev/settings/tokens')}`)
        console.log(`  2. Create a new CLI token`)
        console.log(`  3. Run: ${chalk.bold('stx login --token <your-token>')}\n`)
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

      // Poll for completion
      const pollSpinner = ora('Waiting for authorization...').start()
      const deadline = Date.now() + data.expiresIn * 1000
      const interval = (data.interval || 5) * 1000

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, interval))

        const pollRes = await fetch(`${options.apiUrl}/v1/auth/device-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode: data.deviceCode, clientId: 'syntext-cli' }),
        })

        if (pollRes.ok) {
          const { data: tokenData } = await pollRes.json() as { data: { token: string; user: { name: string; email: string } } }
          await saveCredentials({ token: tokenData.token, apiUrl: options.apiUrl })
          pollSpinner.succeed(chalk.green(`Authenticated as ${tokenData.user.name} (${tokenData.user.email})`))
          return
        }

        const pollBody = await pollRes.json() as { error?: { code?: string } }
        if (pollBody.error?.code === 'expired') {
          pollSpinner.fail(chalk.red('Authentication timed out. Please try again.'))
          process.exit(1)
        }
        // authorization_pending — continue polling
      }

      pollSpinner.fail(chalk.red('Authentication timed out.'))
      process.exit(1)
    } catch (err) {
      spinner.fail(chalk.red('Login failed'))
      console.error(`  ${(err as Error).message}`)
      process.exit(1)
    }
  })
