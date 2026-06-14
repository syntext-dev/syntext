import { Command } from 'commander'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'

export const checkCommand = new Command('check')
  .description('Validate documentation (frontmatter, links, annotations)')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('--json', 'Output result as JSON')
  .action(async (options) => {
    const rootDir = join(process.cwd(), options.dir)
    const docsDir = join(rootDir, 'docs')
    const spinner = options.json ? null : ora('Checking documentation...').start()

    const issues: Array<{ file: string; type: string; message: string }> = []

    try {
      const glob = new Bun.Glob('**/*.{md,mdx}')
      const files: string[] = []
      for await (const file of glob.scan({ cwd: docsDir })) {
        files.push(file)
      }

      for (const file of files) {
        const filePath = join(docsDir, file)
        const content = await readFile(filePath, 'utf-8')

        // Check frontmatter exists
        if (!content.startsWith('---')) {
          issues.push({ file, type: 'warning', message: 'Missing frontmatter' })
        } else {
          // Check required frontmatter fields
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
          if (fmMatch) {
            const fm = fmMatch[1]
            if (!fm.includes('title:')) {
              issues.push({ file, type: 'warning', message: 'Missing title in frontmatter' })
            }
          }
        }

        // Check for broken internal links
        const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g
        let match
        while ((match = linkPattern.exec(content)) !== null) {
          const href = match[2]
          if (href.startsWith('/') || href.startsWith('./')) {
            // Internal link — verify target exists
            const targetSlug = href.replace(/^[./]+/, '').replace(/\/$/, '')
            const targetFile = files.find(
              (f) => f.replace(/\.(md|mdx)$/, '') === targetSlug || f.replace(/\/index\.(md|mdx)$/, '') === targetSlug
            )
            if (!targetFile && !href.startsWith('/public/')) {
              issues.push({ file, type: 'error', message: `Broken link: ${href}` })
            }
          }
        }
      }

      if (options.json) {
        console.log(JSON.stringify({ files: files.length, issues }))
      } else {
        if (issues.length === 0) {
          spinner?.succeed(chalk.green(`All ${files.length} pages passed validation`))
        } else {
          spinner?.warn(chalk.yellow(`Found ${issues.length} issue(s) in ${files.length} pages`))
          for (const issue of issues) {
            const icon = issue.type === 'error' ? chalk.red('✗') : chalk.yellow('⚠')
            console.log(`  ${icon} ${chalk.dim(issue.file)}: ${issue.message}`)
          }
        }
      }

      if (issues.some((i) => i.type === 'error')) {
        process.exit(1)
      }
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
