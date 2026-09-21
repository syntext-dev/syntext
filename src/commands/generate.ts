import { Command } from 'commander'
import { join, relative } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'
import { parseDirectory, generatePages, resolveEmbeds, SOURCE_EXTENSIONS, UNSUPPORTED_EXTENSIONS } from '../annotations'
import { loadConfig } from '../lib/config'

export const generateCommand = new Command('generate')
  .description('Parse @stx annotations from source code and generate API reference pages')
  .option('-d, --dir <dir>', 'Project root directory', '.')
  .option('-s, --src <paths...>', 'Source directories to scan (relative to project root)', ['src'])
  .option('-o, --output <dir>', 'Output directory for generated pages', 'docs/api')
  .option('--repo-url <url>', 'Repository URL for source links')
  .option('--json', 'Output result as JSON')
  .option('--dry-run', 'Show what would be generated without writing files')
  .action(async (options) => {
    const rootDir = join(process.cwd(), options.dir)
    const outputDir = join(rootDir, options.output)
    const spinner = options.json ? null : ora('Scanning source files...').start()

    try {
      const config = await loadConfig(rootDir)
      const repoUrl = options.repoUrl || undefined

      // Collect source files
      const srcDirs: string[] = options.src
      const files: string[] = []
      // Shared with `stx check` via SOURCE_EXTENSIONS so the two commands cannot
      // scan different sets — they used to, and `check` silently skipped C#/Kotlin.
      const extensions = SOURCE_EXTENSIONS
      const skippedUnsupported = new Map<string, number>()

      // Load .gitignore patterns for filtering
      const ignorePatterns = await loadIgnorePatterns(rootDir)

      // Skip test files, node_modules, and gitignored paths
      const shouldSkip = (file: string): boolean =>
        file.includes('.test.') || file.includes('.spec.') || file.includes('node_modules') ||
        file.includes('__tests__') || file.includes('__mocks__') || isIgnored(file, ignorePatterns)

      for (const srcDir of srcDirs) {
        const fullSrcDir = join(rootDir, srcDir)
        for (const ext of extensions) {
          const glob = new Bun.Glob(`**/*.${ext}`)
          for await (const file of glob.scan({ cwd: fullSrcDir })) {
            if (shouldSkip(file)) continue
            files.push(join(fullSrcDir, file))
          }
        }

        // Count files a hosted build would parse but this CLI cannot, so we can
        // say so rather than silently reporting "no annotations found".
        for (const ext of Object.keys(UNSUPPORTED_EXTENSIONS)) {
          const label = UNSUPPORTED_EXTENSIONS[ext]
          const glob = new Bun.Glob(`**/*.${ext}`)
          for await (const file of glob.scan({ cwd: fullSrcDir })) {
            if (shouldSkip(file)) continue
            skippedUnsupported.set(label, (skippedUnsupported.get(label) ?? 0) + 1)
          }
        }
      }

      const unsupportedWarnings = [...skippedUnsupported.entries()].map(
        ([label, count]) =>
          `${count} ${label} file${count === 1 ? '' : 's'} skipped: the stx CLI has no local ${label} annotation parser. ` +
          `A hosted build parses ${label}, so these pages are missing locally.`,
      )
      if (unsupportedWarnings.length > 0 && !options.json) {
        spinner?.stop()
        for (const w of unsupportedWarnings) console.log(`  ${chalk.yellow('⚠')} ${w}`)
        spinner?.start()
      }

      if (spinner) spinner.text = `Parsing ${files.length} source files...`

      // Parse annotations
      const symbols = await parseDirectory(files)

      if (symbols.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ files: files.length, symbols: 0, pages: 0, warnings: unsupportedWarnings }))
        } else {
          spinner?.info(chalk.yellow('No @stx annotations found in source files'))
        }
        return
      }

      if (spinner) spinner.text = `Found ${symbols.length} annotated symbols, generating pages...`

      // Make paths relative for display
      const relativeSymbols = symbols.map((s) => ({
        ...s,
        sourceFile: relative(rootDir, s.sourceFile),
      }))

      // Generate pages
      const pages = generatePages(relativeSymbols, repoUrl)

      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ files: files.length, symbols: symbols.length, warnings: unsupportedWarnings, pages: pages.map((p) => ({ slug: p.slug, title: p.title, symbolCount: p.symbols.length })) }))
        } else {
          spinner?.stop()
          console.log(chalk.bold(`\nDry run — would generate ${pages.length} page(s):\n`))
          for (const page of pages) {
            console.log(`  ${chalk.green('+')} ${page.slug}.mdx (${page.symbols.length} symbols)`)
            for (const sym of page.symbols) {
              console.log(`      ${chalk.dim(sym.kind)} ${sym.name}`)
            }
          }
        }
        return
      }

      // Write pages
      await mkdir(outputDir, { recursive: true })
      for (const page of pages) {
        const filePath = join(outputDir, `${page.slug.replace('api/', '')}.mdx`)
        await mkdir(join(filePath, '..'), { recursive: true })
        await writeFile(filePath, page.content, 'utf-8')
      }

      // Resolve {@embed} directives in existing MDX files
      const docsDir = join(rootDir, 'docs')
      const mdxGlob = new Bun.Glob('**/*.{md,mdx}')
      let embedCount = 0
      for await (const file of mdxGlob.scan({ cwd: docsDir })) {
        const filePath = join(docsDir, file)
        const content = await readFile(filePath, 'utf-8')
        if (content.includes('{@embed')) {
          const resolved = resolveEmbeds(content, relativeSymbols, repoUrl)
          if (resolved !== content) {
            await writeFile(filePath, resolved, 'utf-8')
            embedCount++
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify({
          files: files.length,
          symbols: symbols.length,
          pages: pages.length,
          embedsResolved: embedCount,
          warnings: unsupportedWarnings,
        }))
      } else {
        spinner?.succeed(
          chalk.green(`Generated ${pages.length} page(s) from ${symbols.length} annotations`) +
          (embedCount > 0 ? chalk.dim(` (${embedCount} embeds resolved)`) : '')
        )
        for (const page of pages) {
          console.log(`  ${chalk.dim('→')} ${relative(rootDir, join(outputDir, page.slug.replace('api/', '') + '.mdx'))}`)
        }
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }))
      } else {
        spinner?.fail(chalk.red(`Generation failed: ${(err as Error).message}`))
      }
      process.exit(1)
    }
  })

async function loadIgnorePatterns(rootDir: string): Promise<string[]> {
  const patterns: string[] = []
  try {
    const gitignore = await readFile(join(rootDir, '.gitignore'), 'utf-8')
    for (const line of gitignore.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed)
      }
    }
  } catch {
    // no .gitignore
  }
  return patterns
}

function isIgnored(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const clean = pattern.replace(/^\//, '').replace(/\/$/, '')
    if (filePath.includes(clean)) return true
  }
  return false
}
