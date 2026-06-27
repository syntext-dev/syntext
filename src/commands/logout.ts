import { Command } from 'commander'
import chalk from 'chalk'
import { clearCredentials } from '../lib/credentials'

export const logoutCommand = new Command('logout')
  .description('Remove stored credentials')
  .action(async () => {
    await clearCredentials()
    console.log(chalk.green('  Logged out successfully.'))
  })
