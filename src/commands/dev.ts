import { Command } from 'commander'
import { watch } from 'chokidar'
import { join, relative } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import chalk from 'chalk'
import { loadConfig } from '../lib/config'
import { compileMdx } from '../compiler'
import { buildSidebar } from '../lib/sidebar'
import { extractToc } from '../lib/toc'

export const devCommand = new Command('dev')
  .description('Start local development server with hot-reload')
  .option('-p, --port <port>', 'Port to serve on', '3333')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .action(async (options) => {
    const port = Number(options.port)
    const rootDir = join(process.cwd(), options.dir)

    console.log(chalk.bold('\n  🚀 Syntext Dev Server\n'))

    const config = await loadConfig(rootDir)
    const docsDir = join(rootDir, 'docs')

    // Build initial content
    let pages = await buildAllPages(docsDir, rootDir)
    let sidebar = buildSidebar(docsDir)

    // Start Bun HTTP server
    const server = Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url)
        const pathname = url.pathname

        // WebSocket upgrade for HMR
        if (pathname === '/__hmr') {
          const upgraded = server.upgrade(req)
          if (!upgraded) {
            return new Response('WebSocket upgrade failed', { status: 400 })
          }
          return undefined as any
        }

        // Serve static assets from /public
        if (pathname.startsWith('/public/')) {
          const filePath = join(rootDir, pathname)
          const file = Bun.file(filePath)
          if (await file.exists()) {
            return new Response(file)
          }
        }

        // API: sidebar data
        if (pathname === '/__api/sidebar') {
          return Response.json(sidebar)
        }

        // API: page data
        if (pathname === '/__api/page') {
          const slug = url.searchParams.get('slug') ?? 'index'
          const page = pages.get(slug)
          if (!page) {
            return Response.json({ error: 'Page not found' }, { status: 404 })
          }
          return Response.json(page)
        }

        // Serve the shell HTML for all routes
        return new Response(generateShellHtml(config, port), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      },
      websocket: {
        open(ws) {
          ws.subscribe('hmr')
        },
        message() {},
        close(ws) {
          ws.unsubscribe('hmr')
        },
      },
    })

    console.log(`  ${chalk.green('➜')} Local:   ${chalk.cyan(`http://localhost:${port}`)}`)
    console.log(`  ${chalk.dim('Watching for changes...')}\n`)

    // Watch for file changes
    const watcher = watch(docsDir, {
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.git/**'],
    })

    watcher.on('all', async (event, filePath) => {
      if (!filePath.match(/\.(md|mdx)$/)) return

      const rel = relative(docsDir, filePath)
      console.log(`  ${chalk.dim(`[${event}]`)} ${rel}`)

      // Rebuild affected page
      pages = await buildAllPages(docsDir, rootDir)
      sidebar = buildSidebar(docsDir)

      // Notify connected clients
      server.publish('hmr', JSON.stringify({ type: 'reload', file: rel }))
    })
  })

async function buildAllPages(docsDir: string, rootDir: string) {
  const pages = new Map<string, { html: string; frontmatter: Record<string, unknown>; toc: any[] }>()

  const glob = new Bun.Glob('**/*.{md,mdx}')
  for await (const file of glob.scan({ cwd: docsDir })) {
    const filePath = join(docsDir, file)
    const content = await readFile(filePath, 'utf-8')
    const slug = file.replace(/\.(md|mdx)$/, '').replace(/\/index$/, '') || 'index'

    try {
      const { html, frontmatter } = await compileMdx(content)
      const toc = extractToc(content)
      pages.set(slug, { html, frontmatter, toc })
    } catch (err) {
      console.error(chalk.red(`  Error compiling ${file}:`), (err as Error).message)
    }
  }

  return pages
}

function generateShellHtml(config: any, port: number): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.name ?? 'Syntext Docs'}</title>
  <style>
    :root {
      --color-primary: ${config.colors?.primary ?? '#6366f1'};
      --color-accent: ${config.colors?.accent ?? '#8b5cf6'};
      --color-bg: #0f0f11;
      --color-surface: #1a1a1f;
      --color-border: #2a2a32;
      --color-text: #e4e4e7;
      --color-text-dim: #a1a1aa;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.7;
    }
    .layout { display: grid; grid-template-columns: 260px 1fr 200px; min-height: 100vh; }
    .sidebar {
      border-right: 1px solid var(--color-border);
      padding: 1.5rem;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }
    .sidebar h3 { color: var(--color-text-dim); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .sidebar a { display: block; padding: 0.375rem 0.75rem; color: var(--color-text-dim); text-decoration: none; border-radius: 6px; font-size: 0.875rem; }
    .sidebar a:hover, .sidebar a.active { color: var(--color-text); background: var(--color-surface); }
    .content { max-width: 720px; margin: 0 auto; padding: 2rem 3rem; }
    .content h1 { font-size: 2rem; margin-bottom: 1rem; }
    .content h2 { font-size: 1.5rem; margin-top: 2rem; margin-bottom: 0.75rem; }
    .content h3 { font-size: 1.25rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    .content p { margin-bottom: 1rem; color: var(--color-text-dim); }
    .content code { background: var(--color-surface); padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.875rem; }
    .content pre { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; padding: 1rem; overflow-x: auto; margin-bottom: 1rem; }
    .content pre code { background: none; padding: 0; }
    .toc { padding: 1.5rem; position: sticky; top: 0; height: 100vh; overflow-y: auto; font-size: 0.8rem; }
    .toc a { display: block; padding: 0.25rem 0; color: var(--color-text-dim); text-decoration: none; }
    .toc a:hover { color: var(--color-text); }
    #loading { text-align: center; padding: 4rem; color: var(--color-text-dim); }
  </style>
</head>
<body>
  <div class="layout">
    <nav class="sidebar" id="sidebar">Loading...</nav>
    <main class="content" id="content"><div id="loading">Loading...</div></main>
    <aside class="toc" id="toc"></aside>
  </div>
  <script>
    const BASE = 'http://localhost:${port}';
    async function loadPage(slug) {
      const res = await fetch(BASE + '/__api/page?slug=' + encodeURIComponent(slug));
      if (!res.ok) { document.getElementById('content').innerHTML = '<h1>Page not found</h1>'; return; }
      const data = await res.json();
      document.getElementById('content').innerHTML = data.html;
      document.getElementById('toc').innerHTML = data.toc.map(t =>
        '<a href="#' + t.id + '" style="padding-left:' + (t.depth - 1) * 0.75 + 'rem">' + t.text + '</a>'
      ).join('');
      document.title = (data.frontmatter.title || 'Docs') + ' — ${config.name ?? 'Syntext'}';
    }
    async function loadSidebar() {
      const res = await fetch(BASE + '/__api/sidebar');
      const items = await res.json();
      document.getElementById('sidebar').innerHTML = items.map(i =>
        '<a href="#" data-slug="' + i.slug + '">' + i.title + '</a>'
      ).join('');
      document.getElementById('sidebar').addEventListener('click', (e) => {
        if (e.target.dataset.slug) { e.preventDefault(); loadPage(e.target.dataset.slug); }
      });
    }
    loadSidebar();
    loadPage(location.pathname.slice(1) || 'index');

    // HMR
    const ws = new WebSocket('ws://localhost:${port}/__hmr');
    ws.onmessage = () => { loadPage(location.pathname.slice(1) || 'index'); loadSidebar(); };
  </script>
</body>
</html>`
}
