#!/usr/bin/env bun
import { Command } from 'commander'
import { initCommand } from './commands/init'
import { devCommand } from './commands/dev'
import { buildCommand } from './commands/build'
import { deployCommand } from './commands/deploy'
import { checkCommand } from './commands/check'
import { generateCommand } from './commands/generate'
import { migrateCommand } from './commands/migrate'
import { loginCommand } from './commands/login'
import { logoutCommand } from './commands/logout'

const program = new Command()

program
  .name('stx')
  .description('AI-powered documentation platform CLI')
  .version('0.3.0')

program.addCommand(initCommand)
program.addCommand(devCommand)
program.addCommand(buildCommand)
program.addCommand(deployCommand)
program.addCommand(checkCommand)
program.addCommand(generateCommand)
program.addCommand(migrateCommand)
program.addCommand(loginCommand)
program.addCommand(logoutCommand)

program.parse()
