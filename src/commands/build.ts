import { Command } from 'commander'
import { join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'
import { compileMdx } from '../compiler'
import { buildSidebar } from '../lib/sidebar'
import { extractToc } from '../lib/toc'
import { loadConfig } from '../lib/config'
import { generateStaticHtml, isDraftPage, generateRedirectHtml } from '../lib/html-template'

export const buildCommand = new Command('build')
  .description('Build documentation site (MDX → static HTML/CSS/JS)')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('-o, --out <out>', 'Output directory', '.syntext')
  .option('--json', 'Output build result as JSON')
  .option('--include-drafts', 'Include draft pages in build')
  .action(async (options) => {
    const startTime = Date.now()
    const rootDir = join(process.cwd(), options.dir)
    const outDir = join(rootDir, options.out)
    const docsDir = join(rootDir, 'docs')

    const spinner = options.json ? null : ora('Building documentation...').start()

    try {
      const config = await loadConfig(rootDir)
      await mkdir(outDir, { recursive: true })

      // Find all MDX files
      const glob = new Bun.Glob('**/*.{md,mdx}')
      const files: string[] = []
      for await (const file of glob.scan({ cwd: docsDir })) {
        files.push(file)
      }

      if (spinner) spinner.text = `Compiling ${files.length} pages...`

      const pages: Array<{ slug: string; html: string; frontmatter: Record<string, unknown>; toc: any[] }> = []
      const errors: Array<{ file: string; error: string }> = []
      let draftCount = 0

      // Parallel compilation for performance (batch of 10 concurrent compiles)
      const BATCH_SIZE = 10
      const batches: string[][] = []
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        batches.push(files.slice(i, i + BATCH_SIZE))
      }

      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(async (file) => {
            const filePath = join(docsDir, file)
            const content = await readFile(filePath, 'utf-8')
            const slug = file.replace(/\.(md|mdx)$/, '').replace(/\/index$/, '') || 'index'
            const { html, frontmatter } = await compileMdx(content)
            const toc = extractToc(content)
            return { slug, html, frontmatter, toc, file }
          })
        )

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { slug, html, frontmatter, toc } = result.value
            // Filter draft pages unless --include-drafts
            if (isDraftPage(frontmatter) && !options.includeDrafts) {
              draftCount++
              continue
            }
            pages.push({ slug, html, frontmatter, toc })
          } else {
            const file = batch[results.indexOf(result)]
            errors.push({ file, error: result.reason?.message ?? 'Compilation failed' })
          }
        }
      }

      // Generate sidebar
      const sidebar = buildSidebar(docsDir)

      // Write static HTML for each page with prev/next navigation
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const prevPage = i > 0
          ? { title: (pages[i - 1].frontmatter.title as string) ?? pages[i - 1].slug, slug: pages[i - 1].slug }
          : undefined
        const nextPage = i < pages.length - 1
          ? { title: (pages[i + 1].frontmatter.title as string) ?? pages[i + 1].slug, slug: pages[i + 1].slug }
          : undefined

        const pageDir = join(outDir, page.slug === 'index' ? '' : page.slug)
        await mkdir(pageDir, { recursive: true })

        const fullHtml = generateStaticHtml({
          content: page.html,
          frontmatter: page.frontmatter,
          toc: page.toc,
          sidebar,
          config,
          prevPage,
          nextPage,
          currentSlug: page.slug,
        })

        const outPath = join(pageDir, 'index.html')
        await writeFile(outPath, fullHtml)
      }

      // Generate redirect pages from config
      if (config.redirects?.length) {
        for (const redirect of config.redirects) {
          const redirectDir = join(outDir, redirect.from.replace(/^\//, ''))
          await mkdir(redirectDir, { recursive: true })
          await writeFile(
            join(redirectDir, 'index.html'),
            generateRedirectHtml(redirect.to),
          )
        }
      }

      // Copy public assets
      const publicDir = join(rootDir, 'public')
      const publicGlob = new Bun.Glob('**/*')
      try {
        for await (const file of publicGlob.scan({ cwd: publicDir })) {
          const src = join(publicDir, file)
          const dest = join(outDir, file)
          await mkdir(join(dest, '..'), { recursive: true })
          await Bun.write(dest, Bun.file(src))
        }
      } catch {
        // public dir might not exist
      }

      const durationMs = Date.now() - startTime

      if (options.json) {
        console.log(JSON.stringify({
          success: errors.length === 0,
          pages: pages.length,
          drafts: draftCount,
          redirects: config.redirects?.length ?? 0,
          errors,
          durationMs,
          outDir,
        }))
      } else {
        if (errors.length > 0) {
          spinner?.warn(chalk.yellow(`Built with ${errors.length} error(s)`))
          for (const e of errors) {
            console.log(`  ${chalk.red('✗')} ${e.file}: ${e.error}`)
          }
        } else {
          spinner?.succeed(chalk.green(`Built ${pages.length} pages in ${durationMs}ms → ${options.out}/`) + (draftCount > 0 ? chalk.dim(` (${draftCount} draft(s) skipped)`) : ''))
        console.log(chalk.dim(`\n  Run ${chalk.cyan('stx deploy')} to publish, or ${chalk.cyan('stx dev')} to preview locally.`))
        }
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (err as Error).message }))
      } else {
        spinner?.fail(chalk.red('Build failed'))
        console.error((err as Error).message)
      }
      process.exit(1)
    }
  })
