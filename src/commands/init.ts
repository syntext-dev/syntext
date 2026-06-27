import { Command } from 'commander'
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { generateCITemplate, generateDockerfile } from '../lib/ci-templates'

export const initCommand = new Command('init')
  .description('Initialize a new Syntext documentation project')
  .argument('[directory]', 'Target directory', '.')
  .option('--name <name>', 'Project name')
  .option('--template <template>', 'Starter template', 'default')
  .option('--ci <provider>', 'Generate CI config (github, gitlab, bitbucket)')
  .option('--docker', 'Generate Dockerfile for self-hosted deployment')
  .action(async (directory, options) => {
    const spinner = ora('Creating Syntext project...').start()
    const targetDir = join(process.cwd(), directory)

    try {
      // Create directory structure
      await mkdir(join(targetDir, 'docs'), { recursive: true })
      await mkdir(join(targetDir, 'docs/guides'), { recursive: true })
      await mkdir(join(targetDir, 'docs/api'), { recursive: true })
      await mkdir(join(targetDir, 'public'), { recursive: true })

      // Create syntext.json
      const projectName = options.name ?? directory === '.' ? 'my-docs' : directory
      await writeFile(
        join(targetDir, 'syntext.json'),
        generateConfig(projectName)
      )

      // Create starter docs
      await writeFile(
        join(targetDir, 'docs/index.mdx'),
        generateIndexPage(projectName)
      )

      await writeFile(
        join(targetDir, 'docs/guides/getting-started.mdx'),
        generateGettingStarted(projectName)
      )

      // Create docs.json (navigation config)
      await writeFile(
        join(targetDir, 'docs.json'),
        generateDocsJson()
      )

      // Generate CI configuration if requested
      if (options.ci) {
        const provider = options.ci as 'github' | 'gitlab' | 'bitbucket'
        const ciTemplate = generateCITemplate({ provider, branch: 'main' })

        if (provider === 'github') {
          await mkdir(join(targetDir, '.github/workflows'), { recursive: true })
          await writeFile(join(targetDir, '.github/workflows/syntext-deploy.yml'), ciTemplate)
        } else if (provider === 'gitlab') {
          await writeFile(join(targetDir, '.gitlab-ci.yml'), ciTemplate)
        } else if (provider === 'bitbucket') {
          await writeFile(join(targetDir, 'bitbucket-pipelines.yml'), ciTemplate)
        }
      }

      // Generate Dockerfile if requested
      if (options.docker) {
        await writeFile(join(targetDir, 'Dockerfile'), generateDockerfile())
      }

      // Add .syntext/ to .gitignore
      await appendGitignore(targetDir)

      spinner.succeed(chalk.green('Syntext project created!'))
      console.log('')
      console.log(`  ${chalk.bold('Next steps:')}`)
      console.log('')
      if (directory !== '.') {
        console.log(`    cd ${directory}`)
      }
      console.log(`    stx dev`)
      console.log('')
      console.log(`  ${chalk.dim('This will deploy a preview and watch for changes.')}`)
      console.log(`  ${chalk.dim('Run')} stx deploy ${chalk.dim('to publish to production.')}`)
    } catch (err) {
      spinner.fail(chalk.red('Failed to create project'))
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

function generateConfig(name: string): string {
  return JSON.stringify({
    name,
    theme: 'default',
    colors: {
      primary: '#6366f1',
      accent: '#8b5cf6',
    },
    navigation: [
      {
        group: 'Getting Started',
        pages: ['index', 'guides/getting-started'],
      },
    ],
  }, null, 2) + '\n'
}

function generateIndexPage(name: string): string {
  return `---
title: Welcome to ${name}
description: Get started with ${name} documentation
---

# Welcome to ${name}

Your documentation is ready. Start writing guides, tutorials, and API references — everything stays in sync with your codebase.

## Quick Links

- [Getting Started](/guides/getting-started) — Set up and configure your project
- [API Reference](/api) — Auto-generated from your source code

## What's Next

1. **Write documentation** — Add \`.mdx\` files to \`docs/\`
2. **Generate API docs** — Run \`stx generate --src .\` to parse code annotations
3. **Deploy** — Run \`stx deploy\` to publish to your live site

> Edit this page at \`docs/index.mdx\`. Changes appear instantly in dev mode.
`
}

function generateGettingStarted(name: string): string {
  return `---
title: Getting Started
description: Learn how to get started with ${name}
---

# Getting Started

Welcome to ${name}. This guide walks you through setup and first use.

## Installation

\`\`\`bash
# Install via npm
npm install ${name}

# Or with bun
bun add ${name}
\`\`\`

## Quick Start

### 1. Install the package

Run the installation command above for your package manager.

### 2. Configure your project

Create a configuration file in your project root:

\`\`\`json
{
  "name": "${name}",
  "version": "1.0.0"
}
\`\`\`

### 3. Start building

You're ready to go! Check the [API Reference](/api) for detailed documentation.

---

> **Need help?** Open an issue on GitHub or check the FAQ.
`
}

function generateDocsJson(): string {
  return JSON.stringify(
    {
      navigation: [
        {
          tab: 'Guides',
          groups: [
            {
              title: 'Getting Started',
              pages: ['docs/index', 'docs/guides/getting-started'],
            },
          ],
        },
        {
          tab: 'API Reference',
          groups: [
            {
              title: 'API',
              pages: [],
            },
          ],
        },
      ],
    },
    null,
    2
  )
}

async function appendGitignore(targetDir: string): Promise<void> {
  const gitignorePath = join(targetDir, '.gitignore')
  const entry = '.syntext/'

  try {
    const existing = await readFile(gitignorePath, 'utf-8')
    if (existing.includes(entry)) return
    await appendFile(gitignorePath, `\n# Syntext build output\n${entry}\n`)
  } catch {
    // .gitignore doesn't exist yet
    await writeFile(gitignorePath, `# Syntext build output\n${entry}\n`)
  }
}
