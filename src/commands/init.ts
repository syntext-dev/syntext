import { Command } from 'commander'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'

export const initCommand = new Command('init')
  .description('Initialize a new Syntext documentation project')
  .argument('[directory]', 'Target directory', '.')
  .option('--name <name>', 'Project name')
  .option('--template <template>', 'Starter template', 'default')
  .action(async (directory, options) => {
    const spinner = ora('Creating Syntext project...').start()
    const targetDir = join(process.cwd(), directory)

    try {
      // Create directory structure
      await mkdir(join(targetDir, 'docs'), { recursive: true })
      await mkdir(join(targetDir, 'docs/guides'), { recursive: true })
      await mkdir(join(targetDir, 'docs/api'), { recursive: true })
      await mkdir(join(targetDir, 'public'), { recursive: true })

      // Create syntext.config.ts
      const projectName = options.name ?? directory === '.' ? 'my-docs' : directory
      await writeFile(
        join(targetDir, 'syntext.config.ts'),
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

      spinner.succeed(chalk.green('Syntext project created!'))
      console.log('')
      console.log(`  ${chalk.bold('Next steps:')}`)
      console.log('')
      if (directory !== '.') {
        console.log(`    cd ${directory}`)
      }
      console.log(`    syntext dev`)
      console.log('')
      console.log(`  ${chalk.dim('This will start a local dev server with hot-reload.')}`)
    } catch (err) {
      spinner.fail(chalk.red('Failed to create project'))
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

function generateConfig(name: string): string {
  return `import { defineConfig } from '@syntext/cli'

export default defineConfig({
  name: '${name}',
  theme: 'default',
  colors: {
    primary: '#6366f1',
    accent: '#8b5cf6',
  },
  navigation: {
    tabs: ['Guides', 'API Reference'],
  },
  footer: {
    links: [],
  },
})
`
}

function generateIndexPage(name: string): string {
  return `---
title: Welcome to ${name}
description: Get started with ${name} documentation
---

# Welcome to ${name}

This is your documentation home page. Edit this file at \`docs/index.mdx\`.

<Card title="Getting Started" href="/guides/getting-started">
  Learn how to set up and configure your project.
</Card>

<Card title="API Reference" href="/api">
  Explore the complete API documentation.
</Card>
`
}

function generateGettingStarted(name: string): string {
  return `---
title: Getting Started
description: Learn how to get started with ${name}
---

# Getting Started

Welcome to the ${name} getting started guide.

## Installation

<CodeGroup>
\`\`\`bash npm
npm install ${name}
\`\`\`

\`\`\`bash yarn
yarn add ${name}
\`\`\`

\`\`\`bash bun
bun add ${name}
\`\`\`
</CodeGroup>

## Quick Start

<Steps>
  <Step title="Install the package">
    Run the installation command above for your package manager.
  </Step>
  <Step title="Configure your project">
    Create a configuration file in your project root.
  </Step>
  <Step title="Start building">
    You're ready to go! Check the API reference for details.
  </Step>
</Steps>

<Callout type="info">
  Need help? Check our [FAQ](/guides/faq) or reach out on Discord.
</Callout>
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
