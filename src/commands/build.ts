import { Command } from 'commander'
import { join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'
import { compileMdx } from '../compiler'
import { buildSidebar } from '../lib/sidebar'
import { extractToc } from '../lib/toc'
import { loadConfig } from '../lib/config'
import { generateStaticHtml } from '../lib/html-template'

export const buildCommand = new Command('build')
  .description('Build documentation site (MDX → static HTML/CSS/JS)')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('-o, --out <out>', 'Output directory', 'dist')
  .option('--json', 'Output build result as JSON')
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

      for (const file of files) {
        const filePath = join(docsDir, file)
        const content = await readFile(filePath, 'utf-8')
        const slug = file.replace(/\.(md|mdx)$/, '').replace(/\/index$/, '') || 'index'

        try {
          const { html, frontmatter } = await compileMdx(content)
          const toc = extractToc(content)
          pages.push({ slug, html, frontmatter, toc })
        } catch (err) {
          errors.push({ file, error: (err as Error).message })
        }
      }

      // Generate sidebar
      const sidebar = buildSidebar(docsDir)

      // Write static HTML for each page
      for (const page of pages) {
        const pageDir = join(outDir, page.slug === 'index' ? '' : page.slug)
        await mkdir(pageDir, { recursive: true })

        const fullHtml = generateStaticHtml({
          content: page.html,
          frontmatter: page.frontmatter,
          toc: page.toc,
          sidebar,
          config,
        })

        const outPath = join(pageDir, 'index.html')
        await writeFile(outPath, fullHtml)
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
          spinner?.succeed(chalk.green(`Built ${pages.length} pages in ${durationMs}ms → ${options.out}/`))
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
