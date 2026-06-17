import { Command } from 'commander'
import { join, relative } from 'node:path'
import { readFile } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'
import { parseDirectory, generateSignatureHashes } from '../annotations'
import { detectDrift, findUnannotated, loadStoredHashes, saveHashes, generateDriftReport, formatDriftMarkdown } from '../annotations/drift'
import type { DriftConfig, DriftIssue } from '../annotations/drift'
import { loadStyleGuide, validateStyleGuide } from '../annotations/style-guide'

export const checkCommand = new Command('check')
  .description('Validate documentation and detect annotation drift')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('-s, --src <paths...>', 'Source directories to scan', ['src'])
  .option('--json', 'Output result as JSON')
  .option('--strict', 'Treat warnings as errors')
  .option('--require-annotations', 'Require @stx on all exported functions')
  .option('--save-hashes', 'Save current hashes for future drift detection')
  .option('--coverage', 'Show annotation coverage report')
  .option('--style-guide <path>', 'Path to annotation style-guide JSON file', '.syntext/style-guide.json')
  .option('--markdown', 'Output as markdown (for PR comments)')
  .action(async (options) => {
    const rootDir = join(process.cwd(), options.dir)
    const docsDir = join(rootDir, 'docs')
    const spinner = options.json || options.markdown ? null : ora('Checking documentation...').start()

    const issues: Array<{ file: string; type: string; message: string; line?: number }> = []

    try {
      // --- Phase 1: MDX validation (existing) ---
      const mdxGlob = new Bun.Glob('**/*.{md,mdx}')
      const files: string[] = []
      try {
        for await (const file of mdxGlob.scan({ cwd: docsDir })) {
          files.push(file)
        }
      } catch {
        // No docs directory — skip MDX checks
      }

      for (const file of files) {
        const filePath = join(docsDir, file)
        const content = await readFile(filePath, 'utf-8')

        if (!content.startsWith('---')) {
          issues.push({ file, type: 'warning', message: 'Missing frontmatter' })
        } else {
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
          if (fmMatch) {
            const fm = fmMatch[1]
            if (!fm.includes('title:')) {
              issues.push({ file, type: 'warning', message: 'Missing title in frontmatter' })
            }
          }
        }

        const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g
        let match
        while ((match = linkPattern.exec(content)) !== null) {
          const href = match[2]
          if (href.startsWith('/') || href.startsWith('./')) {
            const targetSlug = href.replace(/^[./]+/, '').replace(/\/$/, '')
            const targetFile = files.find(
              (f) => f.replace(/\.(md|mdx)$/, '') === targetSlug || f.replace(/\/index\.(md|mdx)$/, '') === targetSlug
            )
            if (!targetFile && !href.startsWith('/public/')) {
              issues.push({ file, type: 'error', message: 'Broken link: ' + href })
            }
          }
        }
      }

      // --- Phase 2: Annotation drift detection ---
      spinner && (spinner.text = 'Checking annotation drift...')

      const srcDirs: string[] = options.src
      const sourceFiles: string[] = []
      const extensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'php']

      for (const srcDir of srcDirs) {
        const fullSrcDir = join(rootDir, srcDir)
        for (const ext of extensions) {
          const glob = new Bun.Glob('**/*.' + ext)
          try {
            for await (const file of glob.scan({ cwd: fullSrcDir })) {
              if (file.includes('.test.') || file.includes('.spec.') || file.includes('node_modules')) continue
              sourceFiles.push(join(fullSrcDir, file))
            }
          } catch {
            // Directory doesn't exist
          }
        }
      }

      const symbols = await parseDirectory(sourceFiles)
      const relativeSymbols = symbols.map((s) => ({ ...s, sourceFile: relative(rootDir, s.sourceFile) }))
      const currentHashes = generateSignatureHashes(relativeSymbols)
      const storedHashes = await loadStoredHashes(rootDir)

      const driftConfig: DriftConfig = {
        strictness: options.strict ? 'error' : 'warn',
        requireAnnotations: options.requireAnnotations,
      }

      const driftIssues: DriftIssue[] = []

      // Signature drift
      if (storedHashes.length > 0) {
        driftIssues.push(...detectDrift(relativeSymbols, storedHashes, driftConfig))
      }

      // Unannotated check
      if (options.requireAnnotations) {
        const annotatedNames = new Set(relativeSymbols.map((s) => s.name))
        for (const file of sourceFiles) {
          const content = await readFile(file, 'utf-8')
          const relPath = relative(rootDir, file)
          driftIssues.push(...findUnannotated(content, relPath, annotatedNames))
        }
      }

      // Convert drift issues to standard format
      for (const di of driftIssues) {
        issues.push({
          file: di.sourceFile,
          type: di.severity,
          message: di.message,
          line: di.sourceLine,
        })
      }

      // Style-guide linting
      const styleGuide = await loadStyleGuide(join(rootDir, options.styleGuide))
      if (styleGuide) {
        const styleIssues = validateStyleGuide(relativeSymbols, styleGuide)
        for (const si of styleIssues) {
          issues.push({
            file: si.sourceFile,
            line: si.sourceLine,
            type: options.strict ? 'error' : 'warning',
            message: '[style-guide] ' + si.message,
          })
        }
      }

      // Save hashes if requested
      if (options.saveHashes) {
        await saveHashes(rootDir, currentHashes)
      }

      // Coverage
      const annotatedCount = relativeSymbols.length
      let totalExported = annotatedCount
      if (options.requireAnnotations) {
        totalExported += driftIssues.filter((i) => i.type === 'unannotated').length
      }

      // Output
      if (options.markdown) {
        const report = generateDriftReport(driftIssues, annotatedCount, totalExported)
        console.log(formatDriftMarkdown(report))
        if (driftIssues.some((i) => i.severity === 'error')) process.exit(1)
        return
      }

      if (options.json) {
        console.log(JSON.stringify({
          files: files.length,
          sourceFiles: sourceFiles.length,
          issues,
          annotations: annotatedCount,
          coverage: totalExported > 0 ? Math.round((annotatedCount / totalExported) * 100) : 100,
        }))
      } else {
        if (issues.length === 0) {
          spinner?.succeed(chalk.green(
            'All checks passed' +
            (annotatedCount > 0 ? ' — ' + annotatedCount + ' annotations found' : '') +
            (options.coverage ? ' (' + (totalExported > 0 ? Math.round((annotatedCount / totalExported) * 100) : 100) + '% coverage)' : '')
          ))
        } else {
          spinner?.warn(chalk.yellow('Found ' + issues.length + ' issue(s)'))
          for (const issue of issues) {
            const icon = issue.type === 'error' ? chalk.red('\u2717') : chalk.yellow('\u26A0')
            const loc = issue.line ? issue.file + ':' + issue.line : issue.file
            console.log('  ' + icon + ' ' + chalk.dim(loc) + ': ' + issue.message)
          }

          if (options.coverage && annotatedCount > 0) {
            const pct = totalExported > 0 ? Math.round((annotatedCount / totalExported) * 100) : 100
            console.log('\n  ' + chalk.bold('Coverage:') + ' ' + annotatedCount + '/' + totalExported + ' (' + pct + '%)')
          }
        }
      }

      const hasErrors = issues.some((i) => i.type === 'error')
      if (hasErrors) process.exit(1)
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }))
      } else {
        spinner?.fail(chalk.red('Check failed'))
        console.error((err as Error).message)
      }
      process.exit(1)
    }
  })
