import { Command } from 'commander'
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { generateCITemplate, generateDockerfile } from '../lib/ci-templates'
import { loadCredentials } from '../lib/credentials'
import { apiFetch, isSessionRevokedError } from '../lib/api'
import { starterIndexMdx } from '../lib/starter-index'
import { PRESET_NAMES, type PresetName } from '../appearance/presets'

export const initCommand = new Command('init')
  .description('Initialize a new Syntext documentation project')
  .argument('[directory]', 'Target directory', '.')
  .option('--name <name>', 'Project name')
  .option('--template <template>', 'Starter template', 'default')
  .option('--preset <preset>', `Start on doc engine v2 with a layout preset (${PRESET_NAMES.join(', ')}); the home page is written with the home components`)
  .option('--create', 'Also create the project on Syntext (requires login)')
  .option('--ci <provider>', 'Generate CI config (github, gitlab, bitbucket)')
  .option('--docker', 'Generate Dockerfile for self-hosted deployment')
  .addHelpText('after', `
The new syntext.json starts with "$schema": "https://syntext.dev/schema/syntext.json",
so VS Code and JetBrains autocomplete every key and flag typos as you type.

With --preset, the site starts on doc engine v2 and docs/index.mdx is a page built
from the home components (<Hero>, <SectionCards>, <LatestUpdates>) with layout: wide.
Without it, the site starts on the default theme and index.mdx is plain Markdown.

No API reference page is written. To add one, run stx generate --src . to write
pages from @stx annotations, or add an OpenAPI file under "openapi" in syntext.json.

Examples:
  $ stx init my-docs                     Default theme, Markdown home page
  $ stx init my-docs --preset paper      Doc engine v2, Paper preset, home components`)
  .action(async (directory, options) => {
    const spinner = ora('Creating Syntext project...').start()
    const targetDir = join(process.cwd(), directory)

    try {
      const preset = parsePreset(options.preset)
      const projectName = options.name ?? directory === '.' ? 'my-docs' : directory

      // syntext.json, the starter pages, and the folders they need
      await mkdir(join(targetDir, 'public'), { recursive: true })
      for (const [path, content] of Object.entries(starterFiles(projectName, { preset }))) {
        await mkdir(join(targetDir, path, '..'), { recursive: true })
        await writeFile(join(targetDir, path), content)
      }

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

      // If --create flag, create project on backend and connect
      if (options.create) {
        const creds = await loadCredentials()
        if (!creds?.token) {
          spinner.succeed(chalk.green('Syntext project scaffolded!'))
          console.log('')
          console.log(`  ${chalk.yellow('Not logged in — skipping remote project creation.')}`)
          console.log(`  ${chalk.dim('Run')} stx login ${chalk.dim('then')} stx projects create ${projectName}`)
        } else {
          spinner.text = 'Creating project on Syntext...'
          let projectId: string | null = null
          let revokedMessage: string | null = null
          try {
            projectId = await createRemoteProject(projectName, creds.token)
          } catch (err) {
            if (!isSessionRevokedError(err)) throw err
            revokedMessage = err.message
          }
          if (revokedMessage) {
            spinner.succeed(chalk.green('Syntext project scaffolded!'))
            console.log('')
            console.log(`  ${chalk.yellow(revokedMessage)}`)
            console.log(`  ${chalk.dim('Then run')} stx projects create ${projectName}`)
          } else if (projectId) {
            const configPath = join(targetDir, 'syntext.json')
            const config = JSON.parse(await readFile(configPath, 'utf-8'))
            config.projectId = projectId
            await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
            spinner.succeed(chalk.green('Project created and connected!'))
            console.log('')
            console.log(`  ${chalk.dim('Project ID:')} ${projectId}`)
          } else {
            spinner.succeed(chalk.green('Syntext project scaffolded!'))
            console.log('')
            console.log(`  ${chalk.yellow('Could not create remote project (plan limit?). Create manually:')}`)
            console.log(`    stx projects create ${projectName}`)
          }
        }
      } else {
        spinner.succeed(chalk.green('Syntext project scaffolded!'))
      }

      console.log('')
      console.log(`  ${chalk.bold('Next steps:')}`)
      console.log('')
      if (directory !== '.') {
        console.log(`    cd ${directory}`)
      }
      if (!options.create) {
        console.log(`    stx login`)
        console.log(`    stx projects create ${projectName}`)
        console.log(`    stx connect <projectId>`)
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

/** The JSON Schema URL editors use to autocomplete and check syntext.json. */
export const SYNTEXT_SCHEMA_URL = 'https://syntext.dev/schema/syntext.json'

/**
 * The starter syntext.json: the `$schema` line first, so editors autocomplete
 * every key, and no deprecated keys, so `stx check` on a new project is clean.
 */
export function generateConfig(name: string, opts: { preset?: PresetName } = {}): string {
  return JSON.stringify({
    $schema: SYNTEXT_SCHEMA_URL,
    name,
    // A preset name as the theme switches the site to doc engine v2.
    theme: opts.preset ?? 'default',
    navigation: opts.preset
      ? [{ group: 'Getting Started', pages: ['index', 'quickstart'] }]
      : [
          {
            group: 'Getting Started',
            pages: ['index', 'guides/getting-started'],
          },
        ],
  }, null, 2) + '\n'
}

/** The `--preset` value, checked against the v2 presets (undefined without it). */
export function parsePreset(value: unknown): PresetName | undefined {
  if (value === undefined) return undefined
  const name = String(value).trim().toLowerCase()
  if ((PRESET_NAMES as readonly string[]).includes(name)) return name as PresetName
  throw new Error(`"${String(value)}" is not a doc engine v2 preset. Use one of: ${PRESET_NAMES.join(', ')}.`)
}

/**
 * Every file `stx init` writes besides CI and Docker files, by path. A v2 site
 * (`preset`) gets the backend's starter index.mdx (lib/starter-index.ts: home
 * components, `layout: wide`) and the quickstart its hero links to; a v1 site
 * keeps the plain Markdown home. Neither gets an API reference page: not every
 * docs site documents an API, and `stx generate` or an `openapi` entry adds one.
 */
export function starterFiles(name: string, opts: { preset?: PresetName } = {}): Record<string, string> {
  if (opts.preset) {
    return {
      'syntext.json': generateConfig(name, opts),
      'docs/index.mdx': starterIndexMdx({ title: name }),
      'docs/quickstart.mdx': generateGettingStarted(name).replace('title: Getting Started', 'title: Quickstart').replace('# Getting Started', '# Quickstart'),
    }
  }
  return {
    'syntext.json': generateConfig(name),
    'docs/index.mdx': generateIndexPage(name),
    'docs/guides/getting-started.mdx': generateGettingStarted(name),
  }
}

function generateIndexPage(name: string): string {
  return `---
title: Welcome to ${name}
description: Get started with ${name}
---

# Welcome to ${name}

Your docs site is ready. Replace this page with an introduction: what ${name} is, who it is for, and where to start.

## Quick links

- [Getting started](/guides/getting-started) — The first steps for new readers

## What's next

1. **Write pages** — Add \`.mdx\` files to \`docs/\` and list them under \`navigation\` in syntext.json
2. **Preview** — Run \`stx dev\` to see your changes as you write
3. **Publish** — Run \`stx deploy\` to put your site live

> Edit this page at \`docs/index.mdx\`.
`
}

function generateGettingStarted(name: string): string {
  return `---
title: Getting Started
description: The first steps with ${name}
---

# Getting Started

Welcome to ${name}. This page walks new readers through their first steps.

## Install

Tell readers how to get ${name}: a sign-up link, a download, or an install command.

## First steps

### 1. Set up

Describe what readers do first, such as creating an account or changing a setting.

### 2. Try it

Walk through one small task from start to finish.

### 3. Keep going

Link to the pages that come next.

---

> **Need help?** Say where readers can ask, such as a support email or a community forum.
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

/**
 * Creates the project on the backend. Returns null on any failure except a
 * revoked session, which is rethrown so the caller can tell the user to sign in.
 */
export async function createRemoteProject(name: string, token: string): Promise<string | null> {
  const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

  try {
    const res = await apiFetch(`${apiUrl}/v1/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    })

    if (!res.ok) return null

    const { data } = await res.json() as { data: { id: string } }
    return data.id
  } catch (err) {
    if (isSessionRevokedError(err)) throw err
    return null
  }
}
