import { Command } from 'commander'
import { join, basename, dirname, extname, relative, resolve } from 'node:path'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'

type MigrationSource = 'mintlify' | 'docusaurus' | 'gitbook' | 'readme'

type MigrationResult = {
  source: MigrationSource
  pagesConverted: number
  configGenerated: boolean
  redirects: Array<{ from: string; to: string }>
  warnings: string[]
}

export const migrateCommand = new Command('migrate')
  .description('Migrate documentation from another platform to Syntext')
  .requiredOption('--from <platform>', 'Source platform (mintlify, docusaurus, gitbook, readme)')
  .option('-d, --dir <dir>', 'Source docs directory', '.')
  .option('-o, --output <dir>', 'Output directory', 'docs')
  .option('--json', 'Output result as JSON')
  .option('--dry-run', 'Show what would be migrated without writing files')
  .action(async (options) => {
    const source = options.from as MigrationSource
    const sourceDir = resolve(options.dir)
    const outputDir = resolve(options.output)
    const spinner = options.json ? null : ora(`Migrating from ${source}...`).start()

    const validSources: MigrationSource[] = ['mintlify', 'docusaurus', 'gitbook', 'readme']
    if (!validSources.includes(source)) {
      spinner?.fail(`Invalid source: ${source}. Must be one of: ${validSources.join(', ')}`)
      process.exit(1)
    }

    try {
      let result: MigrationResult

      switch (source) {
        case 'mintlify':
          result = await migrateMintlify(sourceDir, outputDir, options.dryRun)
          break
        case 'docusaurus':
          result = await migrateDocusaurus(sourceDir, outputDir, options.dryRun)
          break
        case 'gitbook':
          result = await migrateGitbook(sourceDir, outputDir, options.dryRun)
          break
        case 'readme':
          result = await migrateReadme(sourceDir, outputDir, options.dryRun)
          break
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }

      spinner?.succeed(`Migration complete from ${source}`)
      console.log()
      console.log(`  Pages converted: ${chalk.green(result.pagesConverted)}`)
      console.log(`  Config generated: ${chalk.green(result.configGenerated ? 'Yes' : 'No')}`)
      console.log(`  Redirects:       ${chalk.yellow(result.redirects.length)}`)

      if (result.warnings.length > 0) {
        console.log()
        console.log(chalk.yellow('Warnings:'))
        for (const w of result.warnings) {
          console.log(`  ${chalk.yellow('⚠')} ${w}`)
        }
      }

      if (result.redirects.length > 0 && !options.dryRun) {
        const redirectPath = join(outputDir, '_redirects.json')
        await writeFile(redirectPath, JSON.stringify(result.redirects, null, 2))
        console.log()
        console.log(`  Redirect map saved to: ${chalk.cyan(relative(process.cwd(), redirectPath))}`)
      }
    } catch (err) {
      spinner?.fail('Migration failed')
      console.error(chalk.red((err as Error).message))
      process.exit(1)
    }
  })

// ─── Mintlify Migration ───

async function migrateMintlify(sourceDir: string, outputDir: string, dryRun?: boolean): Promise<MigrationResult> {
  const result: MigrationResult = { source: 'mintlify', pagesConverted: 0, configGenerated: false, redirects: [], warnings: [] }

  // Read mint.json config
  let mintConfig: Record<string, unknown> = {}
  try {
    const configRaw = await readFile(join(sourceDir, 'mint.json'), 'utf-8')
    mintConfig = JSON.parse(configRaw)
  } catch {
    result.warnings.push('No mint.json found — scanning for MDX files only')
  }

  // Scan for MDX/MD files
  const files = await collectFiles(sourceDir, ['.mdx', '.md'])

  for (const file of files) {
    const relativePath = relative(sourceDir, file)
    const content = await readFile(file, 'utf-8')
    const converted = convertMintlifyPage(content, relativePath)

    const outputPath = join(outputDir, relativePath)
    if (!dryRun) {
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, converted.content)
    }

    result.pagesConverted++
    if (converted.oldSlug !== converted.newSlug) {
      result.redirects.push({ from: converted.oldSlug, to: converted.newSlug })
    }
    result.warnings.push(...converted.warnings)
  }

  // Generate syntext config
  if (Object.keys(mintConfig).length > 0 && !dryRun) {
    const syntextConfig = convertMintlifyConfig(mintConfig)
    await writeFile(join(outputDir, '..', 'syntext.config.json'), JSON.stringify(syntextConfig, null, 2))
    result.configGenerated = true
  }

  return result
}

function convertMintlifyPage(content: string, relativePath: string) {
  const warnings: string[] = []
  let converted = content

  // Convert Mintlify-specific components to standard MDX
  converted = converted.replace(/<Card\s+title="([^"]+)"([^>]*)>/g, '## $1')
  converted = converted.replace(/<\/Card>/g, '')
  converted = converted.replace(/<CardGroup[^>]*>/g, '')
  converted = converted.replace(/<\/CardGroup>/g, '')
  converted = converted.replace(/<Accordion\s+title="([^"]+)">/g, '<details>\n<summary>$1</summary>\n')
  converted = converted.replace(/<\/Accordion>/g, '</details>')
  converted = converted.replace(/<AccordionGroup>/g, '')
  converted = converted.replace(/<\/AccordionGroup>/g, '')
  converted = converted.replace(/<Tabs>/g, '{/* tabs */}')
  converted = converted.replace(/<\/Tabs>/g, '{/* /tabs */}')
  converted = converted.replace(/<Tab\s+title="([^"]+)">/g, '{/* tab: $1 */}')
  converted = converted.replace(/<\/Tab>/g, '{/* /tab */}')
  converted = converted.replace(/<ResponseField[^>]*name="([^"]+)"[^>]*type="([^"]+)"[^>]*>/g, '- `$1` ($2)')
  converted = converted.replace(/<\/ResponseField>/g, '')
  converted = converted.replace(/<ParamField[^>]*name="([^"]+)"[^>]*type="([^"]+)"[^>]*>/g, '- `$1` ($2)')
  converted = converted.replace(/<\/ParamField>/g, '')

  // Check for unsupported components
  const unsupported = ['<Frame', '<CodeGroup', '<Snippet', '<RequestExample', '<ResponseExample']
  for (const comp of unsupported) {
    if (converted.includes(comp)) {
      warnings.push(`${relativePath}: Contains ${comp} — manual conversion needed`)
    }
  }

  const slug = '/' + relativePath.replace(extname(relativePath), '')
  return { content: converted, oldSlug: slug, newSlug: slug, warnings }
}

function convertMintlifyConfig(mintConfig: Record<string, unknown>) {
  const nav = mintConfig.navigation as Array<{ group: string; pages: string[] }> | undefined

  return {
    name: (mintConfig.name as string) || 'Docs',
    navigation: nav?.map((group) => ({
      title: group.group,
      items: group.pages.map((p) => ({ path: p })),
    })) || [],
    theme: {
      primaryColor: (mintConfig.colors as Record<string, string>)?.primary || '#3b82f6',
    },
  }
}

// ─── Docusaurus Migration ───

async function migrateDocusaurus(sourceDir: string, outputDir: string, dryRun?: boolean): Promise<MigrationResult> {
  const result: MigrationResult = { source: 'docusaurus', pagesConverted: 0, configGenerated: false, redirects: [], warnings: [] }

  // Find docs folder (typically /docs or specified in config)
  let docsDir = join(sourceDir, 'docs')
  try {
    await stat(docsDir)
  } catch {
    docsDir = sourceDir // Fallback: assume sourceDir IS the docs dir
  }

  // Read sidebars if available
  let sidebars: Record<string, unknown> = {}
  try {
    const sidebarsPath = join(sourceDir, 'sidebars.js')
    const raw = await readFile(sidebarsPath, 'utf-8')
    // Basic extraction of sidebar structure (simplified)
    const match = raw.match(/module\.exports\s*=\s*(\{[\s\S]*\})/)
    if (match) {
      try {
        sidebars = JSON.parse(match[1].replace(/'/g, '"'))
      } catch {
        result.warnings.push('Could not parse sidebars.js — manual navigation setup needed')
      }
    }
  } catch {
    result.warnings.push('No sidebars.js found')
  }

  const files = await collectFiles(docsDir, ['.mdx', '.md'])

  for (const file of files) {
    const relativePath = relative(docsDir, file)
    const content = await readFile(file, 'utf-8')
    const converted = convertDocusaurusPage(content, relativePath)

    const outputPath = join(outputDir, relativePath)
    if (!dryRun) {
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, converted.content)
    }

    result.pagesConverted++
    if (converted.oldSlug !== converted.newSlug) {
      result.redirects.push({ from: converted.oldSlug, to: converted.newSlug })
    }
    result.warnings.push(...converted.warnings)
  }

  // Generate syntext config from docusaurus.config.js
  try {
    const configPath = join(sourceDir, 'docusaurus.config.js')
    const configRaw = await readFile(configPath, 'utf-8')
    const titleMatch = configRaw.match(/title:\s*['"]([^'"]+)['"]/)
    if (titleMatch && !dryRun) {
      const syntextConfig = {
        name: titleMatch[1],
        navigation: [],
        theme: { primaryColor: '#3b82f6' },
      }
      await writeFile(join(outputDir, '..', 'syntext.config.json'), JSON.stringify(syntextConfig, null, 2))
      result.configGenerated = true
    }
  } catch {
    result.warnings.push('No docusaurus.config.js found')
  }

  return result
}

function convertDocusaurusPage(content: string, relativePath: string) {
  const warnings: string[] = []
  let converted = content

  // Convert Docusaurus admonitions to standard syntax
  converted = converted.replace(/:::(\w+)\s*(.*?)\n([\s\S]*?):::/g, (_match, type, title, body) => {
    const heading = title ? `**${title}**\n` : ''
    return `> ${heading}> ${type.toUpperCase()}: ${body.trim().replace(/\n/g, '\n> ')}`
  })

  // Remove import statements for Docusaurus components
  converted = converted.replace(/^import\s+.*from\s+['"]@theme\/.*['"];?\s*$/gm, '')
  converted = converted.replace(/^import\s+.*from\s+['"]@docusaurus\/.*['"];?\s*$/gm, '')

  // Convert Docusaurus tabs
  converted = converted.replace(/<Tabs[^>]*>/g, '{/* tabs */}')
  converted = converted.replace(/<\/Tabs>/g, '{/* /tabs */}')
  converted = converted.replace(/<TabItem\s+value="([^"]+)"[^>]*>/g, '{/* tab: $1 */}')
  converted = converted.replace(/<\/TabItem>/g, '{/* /tab */}')

  // Handle sidebar_position in frontmatter (keep but note)
  if (converted.includes('sidebar_position')) {
    warnings.push(`${relativePath}: Has sidebar_position — use navigation config instead`)
  }

  // Convert slug frontmatter to path
  const slugMatch = converted.match(/^slug:\s*(.+)$/m)
  const oldSlug = slugMatch ? slugMatch[1].trim() : '/' + relativePath.replace(extname(relativePath), '')
  const newSlug = '/' + relativePath.replace(extname(relativePath), '')

  return { content: converted, oldSlug, newSlug, warnings }
}

// ─── GitBook Migration ───

async function migrateGitbook(sourceDir: string, outputDir: string, dryRun?: boolean): Promise<MigrationResult> {
  const result: MigrationResult = { source: 'gitbook', pagesConverted: 0, configGenerated: false, redirects: [], warnings: [] }

  // GitBook uses SUMMARY.md for navigation
  let summaryContent = ''
  try {
    summaryContent = await readFile(join(sourceDir, 'SUMMARY.md'), 'utf-8')
  } catch {
    result.warnings.push('No SUMMARY.md found — scanning for MD files')
  }

  const files = await collectFiles(sourceDir, ['.md'])

  for (const file of files) {
    const name = basename(file)
    if (name === 'SUMMARY.md' || name === 'README.md') continue

    const relativePath = relative(sourceDir, file)
    const content = await readFile(file, 'utf-8')
    const converted = convertGitbookPage(content, relativePath)

    // GitBook uses .md, Syntext uses .mdx
    const outputPath = join(outputDir, relativePath.replace('.md', '.mdx'))
    if (!dryRun) {
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, converted.content)
    }

    result.pagesConverted++
    if (converted.oldSlug !== converted.newSlug) {
      result.redirects.push({ from: converted.oldSlug, to: converted.newSlug })
    }
    result.warnings.push(...converted.warnings)
  }

  // Parse SUMMARY.md for navigation structure
  if (summaryContent && !dryRun) {
    const navigation = parseSummaryNavigation(summaryContent)
    const syntextConfig = {
      name: 'Docs',
      navigation,
      theme: { primaryColor: '#3b82f6' },
    }
    await writeFile(join(outputDir, '..', 'syntext.config.json'), JSON.stringify(syntextConfig, null, 2))
    result.configGenerated = true
  }

  return result
}

function convertGitbookPage(content: string, relativePath: string) {
  const warnings: string[] = []
  let converted = content

  // Add frontmatter if missing
  if (!converted.startsWith('---')) {
    const title = basename(relativePath, extname(relativePath))
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    converted = `---\ntitle: "${title}"\n---\n\n${converted}`
  }

  // Convert GitBook hints to callouts
  converted = converted.replace(/{% hint style="(\w+)" %}\n([\s\S]*?){% endhint %}/g, (_match, style, body) => {
    const type = style === 'danger' ? 'ERROR' : style === 'warning' ? 'WARNING' : 'INFO'
    return `> ${type}: ${body.trim()}`
  })

  // Convert GitBook tabs
  converted = converted.replace(/{% tabs %}/g, '{/* tabs */}')
  converted = converted.replace(/{% endtabs %}/g, '{/* /tabs */}')
  converted = converted.replace(/{% tab title="([^"]+)" %}/g, '{/* tab: $1 */}')
  converted = converted.replace(/{% endtab %}/g, '{/* /tab */}')

  // Convert GitBook embeds
  converted = converted.replace(/{% embed url="([^"]+)" %}/g, '[$1]($1)')
  converted = converted.replace(/{% endembed %}/g, '')

  // Convert file references
  converted = converted.replace(/{% file src="([^"]+)"[^%]*%}/g, '[$1]($1)')

  // Check for unsupported GitBook features
  if (converted.includes('{% api-method')) {
    warnings.push(`${relativePath}: Contains {% api-method %} — manual conversion needed`)
  }
  if (converted.includes('{% swagger')) {
    warnings.push(`${relativePath}: Contains {% swagger %} — use syntext generate for API docs`)
  }

  const oldSlug = '/' + relativePath.replace(extname(relativePath), '')
  const newSlug = '/' + relativePath.replace(extname(relativePath), '')

  return { content: converted, oldSlug, newSlug, warnings }
}

function parseSummaryNavigation(summary: string) {
  const navigation: Array<{ title: string; items: Array<{ path: string }> }> = []
  let currentGroup: { title: string; items: Array<{ path: string }> } | null = null

  for (const line of summary.split('\n')) {
    // Group headers
    const headerMatch = line.match(/^## (.+)/)
    if (headerMatch) {
      if (currentGroup) navigation.push(currentGroup)
      currentGroup = { title: headerMatch[1], items: [] }
      continue
    }

    // Links
    const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch && currentGroup) {
      const path = linkMatch[2].replace('.md', '').replace('README', 'index')
      currentGroup.items.push({ path })
    }
  }

  if (currentGroup) navigation.push(currentGroup)
  return navigation
}

// ─── ReadMe Migration ───

async function migrateReadme(sourceDir: string, outputDir: string, dryRun?: boolean): Promise<MigrationResult> {
  const result: MigrationResult = { source: 'readme', pagesConverted: 0, configGenerated: false, redirects: [], warnings: [] }

  // ReadMe exports as markdown files, often with numeric prefixes
  const files = await collectFiles(sourceDir, ['.md', '.mdx'])

  for (const file of files) {
    const relativePath = relative(sourceDir, file)
    const content = await readFile(file, 'utf-8')
    const converted = convertReadmePage(content, relativePath)

    // Remove numeric prefix from filename (e.g., "01-getting-started.md" → "getting-started.mdx")
    const cleanPath = relativePath
      .replace(/^\d+-/, '')
      .replace(/\/\d+-/g, '/')
      .replace('.md', '.mdx')

    const outputPath = join(outputDir, cleanPath)
    if (!dryRun) {
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, converted.content)
    }

    result.pagesConverted++
    result.redirects.push({ from: converted.oldSlug, to: '/' + cleanPath.replace(extname(cleanPath), '') })
    result.warnings.push(...converted.warnings)
  }

  if (!dryRun) {
    const syntextConfig = {
      name: 'Docs',
      navigation: [],
      theme: { primaryColor: '#3b82f6' },
    }
    await writeFile(join(outputDir, '..', 'syntext.config.json'), JSON.stringify(syntextConfig, null, 2))
    result.configGenerated = true
  }

  return result
}

function convertReadmePage(content: string, relativePath: string) {
  const warnings: string[] = []
  let converted = content

  // Convert ReadMe callouts [block:callout] format
  converted = converted.replace(/\[block:callout\]\s*\n\{[\s\S]*?"type":\s*"([^"]+)"[\s\S]*?"body":\s*"([^"]*)"[\s\S]*?\}\s*\n\[\/block\]/g,
    (_match, type, body) => {
      const prefix = type === 'danger' ? 'ERROR' : type === 'warning' ? 'WARNING' : 'INFO'
      return `> ${prefix}: ${body.replace(/\\n/g, '\n> ')}`
    }
  )

  // Convert ReadMe code blocks [block:code]
  converted = converted.replace(/\[block:code\]\s*\n\{[\s\S]*?"codes":\s*\[([\s\S]*?)\][\s\S]*?\}\s*\n\[\/block\]/g,
    (_match, codes) => {
      // Simplified — extract first code sample
      const langMatch = codes.match(/"language":\s*"([^"]+)"/)
      const codeMatch = codes.match(/"code":\s*"([\s\S]*?)"/)
      const lang = langMatch ? langMatch[1] : ''
      const code = codeMatch ? codeMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : ''
      return '```' + lang + '\n' + code + '\n```'
    }
  )

  // Convert ReadMe API blocks
  if (converted.includes('[block:api-header]')) {
    warnings.push(`${relativePath}: Contains [block:api-header] — use syntext generate for API docs`)
    converted = converted.replace(/\[block:api-header\][\s\S]*?\[\/block\]/g, '')
  }

  // Convert ReadMe image blocks
  converted = converted.replace(/\[block:image\]\s*\n\{[\s\S]*?"images":\s*\[[\s\S]*?"image":\s*\["([^"]+)"[^\]]*\][\s\S]*?\}\s*\n\[\/block\]/g,
    '![]($1)'
  )

  // Add frontmatter if missing
  if (!converted.startsWith('---')) {
    const title = basename(relativePath, extname(relativePath))
      .replace(/^\d+-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    converted = `---\ntitle: "${title}"\n---\n\n${converted}`
  }

  const oldSlug = '/' + relativePath.replace(extname(relativePath), '')

  return { content: converted, oldSlug, newSlug: oldSlug, warnings }
}

// ─── Utilities ───

async function collectFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string) {
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        await walk(fullPath)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath)
      }
    }
  }

  await walk(dir)
  return files
}
