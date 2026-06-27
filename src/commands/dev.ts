import { Command } from 'commander'
import { watch } from 'chokidar'
import { join, relative } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import chalk from 'chalk'
import { loadConfig } from '../lib/config'
import { compileMdx } from '../compiler'
import { buildSidebarAsync } from '../lib/sidebar'
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
    let sidebar = await buildSidebarAsync(docsDir, config)

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
      sidebar = await buildSidebarAsync(docsDir, config)

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
  const projectName = config.name ?? 'Docs'
  const primaryColor = config.colors?.primary ?? '#6366f1'
  const accentColor = config.colors?.accent ?? '#8b5cf6'

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --color-primary: ${primaryColor};
      --color-accent: ${accentColor};
      --color-bg: #09090b;
      --color-surface: #18181b;
      --color-surface-raised: #1f1f23;
      --color-border: #27272a;
      --color-border-subtle: #1f1f23;
      --color-text: #fafafa;
      --color-text-secondary: #a1a1aa;
      --color-text-dim: #71717a;
      --radius: 8px;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: var(--font-sans);
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }

    /* Layout */
    .layout { display: grid; grid-template-columns: 260px 1fr 200px; min-height: 100vh; }
    .header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1.5rem;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--color-text);
    }
    .header-logo svg { width: 20px; height: 20px; }
    .header-badge {
      font-size: 0.65rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }
    .header-spacer { flex: 1; }
    .header-dev-badge {
      font-size: 0.7rem;
      font-weight: 500;
      color: #22c55e;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.2);
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
    }

    /* Sidebar */
    .sidebar {
      border-right: 1px solid var(--color-border);
      padding: 1.25rem 0.75rem;
      position: sticky;
      top: 49px;
      height: calc(100vh - 49px);
      overflow-y: auto;
      background: var(--color-bg);
    }
    .sidebar::-webkit-scrollbar { width: 4px; }
    .sidebar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
    .sidebar-section { margin-bottom: 1.25rem; }
    .sidebar-heading {
      color: var(--color-text-dim);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.25rem 0.75rem;
      margin-bottom: 0.25rem;
    }
    .sidebar a {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      color: var(--color-text-secondary);
      text-decoration: none;
      border-radius: 6px;
      font-size: 0.84rem;
      font-weight: 450;
      transition: all 0.15s;
    }
    .sidebar a:hover {
      color: var(--color-text);
      background: var(--color-surface);
    }
    .sidebar a.active {
      color: var(--color-text);
      background: var(--color-surface-raised);
      font-weight: 500;
    }
    .sidebar a.active::before {
      content: '';
      width: 3px;
      height: 16px;
      background: var(--color-primary);
      border-radius: 3px;
      margin-left: -0.25rem;
    }

    /* Content */
    .content-wrapper {
      padding: 2.5rem 3rem;
      max-width: 800px;
      margin: 0 auto;
    }
    .content h1 {
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, var(--color-text), var(--color-text-secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .content h1 + p { font-size: 1.1rem; color: var(--color-text-secondary); margin-bottom: 2rem; }
    .content h2 {
      font-size: 1.4rem;
      font-weight: 650;
      margin-top: 2.5rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.015em;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .content h3 { font-size: 1.15rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.5rem; }
    .content p { margin-bottom: 1rem; color: var(--color-text-secondary); line-height: 1.8; }
    .content a { color: var(--color-primary); text-decoration: none; font-weight: 500; }
    .content a:hover { text-decoration: underline; text-underline-offset: 3px; }
    .content h1 a, .content h2 a, .content h3 a, .content h4 a { color: inherit; font-weight: inherit; -webkit-text-fill-color: inherit; background: none; }
    .content h1 a:hover, .content h2 a:hover, .content h3 a:hover { text-decoration: none; opacity: 0.8; }
    .content strong { color: var(--color-text); font-weight: 600; }
    .content ul, .content ol { margin-bottom: 1rem; padding-left: 1.5rem; color: var(--color-text-secondary); }
    .content li { margin-bottom: 0.4rem; }
    .content li::marker { color: var(--color-text-dim); }
    .content blockquote {
      border-left: 3px solid var(--color-primary);
      background: var(--color-surface);
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      border-radius: 0 var(--radius) var(--radius) 0;
    }
    .content blockquote p { margin: 0; color: var(--color-text-secondary); }
    .content hr { border: none; border-top: 1px solid var(--color-border); margin: 2rem 0; }
    .content img { max-width: 100%; border-radius: var(--radius); border: 1px solid var(--color-border); }
    .content table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.875rem; }
    .content th { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--color-border); color: var(--color-text); font-weight: 600; }
    .content td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--color-border-subtle); color: var(--color-text-secondary); }
    .content tr:last-child td { border-bottom: none; }

    /* Code */
    .content code {
      font-family: var(--font-mono);
      background: var(--color-surface-raised);
      padding: 0.15rem 0.4rem;
      border-radius: 5px;
      font-size: 0.82rem;
      border: 1px solid var(--color-border);
      color: #e879f9;
    }
    .content pre {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      overflow-x: auto;
      margin-bottom: 1.5rem;
      position: relative;
    }
    .content pre code {
      background: none;
      border: none;
      padding: 0;
      color: var(--color-text-secondary);
      font-size: 0.82rem;
      line-height: 1.6;
    }

    /* Custom components: Card */
    .content card, .content .card-grid {
      display: grid;
      gap: 1rem;
    }
    .content card {
      display: block;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 1.25rem 1.5rem;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none !important;
    }
    .content card:hover {
      border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
      background: var(--color-surface-raised);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .content card [title]::before { content: attr(title); }

    /* Custom components: Callout */
    .content callout, .content [data-callout] {
      display: block;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-left: 3px solid var(--color-primary);
      border-radius: 0 var(--radius) var(--radius) 0;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
    }

    /* Custom components: Steps */
    .content steps { display: block; margin-bottom: 1.5rem; padding-left: 1.5rem; border-left: 2px solid var(--color-border); }
    .content step { display: block; margin-bottom: 1rem; padding-left: 1rem; position: relative; }
    .content step::before {
      content: '';
      position: absolute;
      left: -1.85rem;
      top: 0.5rem;
      width: 10px;
      height: 10px;
      background: var(--color-primary);
      border-radius: 50%;
      border: 2px solid var(--color-bg);
    }

    /* ToC */
    .toc {
      padding: 1.5rem 1rem;
      position: sticky;
      top: 49px;
      height: calc(100vh - 49px);
      overflow-y: auto;
      font-size: 0.78rem;
      border-left: 1px solid var(--color-border-subtle);
    }
    .toc-title {
      color: var(--color-text-dim);
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.75rem;
    }
    .toc a {
      display: block;
      padding: 0.3rem 0.5rem;
      color: var(--color-text-dim);
      text-decoration: none;
      border-radius: 4px;
      transition: color 0.15s;
    }
    .toc a:hover { color: var(--color-text-secondary); }

    /* Loading state */
    #loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 6rem;
      color: var(--color-text-dim);
      font-size: 0.875rem;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Responsive */
    @media (max-width: 1024px) { .toc { display: none; } .layout { grid-template-columns: 260px 1fr; } }
    @media (max-width: 768px) { .sidebar { display: none; } .layout { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
        <path d="M8 7h6"/>
        <path d="M8 11h8"/>
      </svg>
      ${projectName}
    </div>
    <span class="header-badge">docs</span>
    <div class="header-spacer"></div>
    <span class="header-dev-badge">● dev server</span>
  </header>
  <div class="layout">
    <nav class="sidebar" id="sidebar"></nav>
    <main class="content-wrapper">
      <article class="content" id="content">
        <div id="loading"><div class="spinner"></div> Loading...</div>
      </article>
    </main>
    <aside class="toc" id="toc"><div class="toc-title">On this page</div></aside>
  </div>
  <script>
    const BASE = 'http://localhost:${port}';
    let currentSlug = '';

    async function loadPage(slug) {
      currentSlug = slug;
      const res = await fetch(BASE + '/__api/page?slug=' + encodeURIComponent(slug));
      if (!res.ok) {
        document.getElementById('content').innerHTML = '<h1>Page not found</h1><p>The page you requested does not exist.</p>';
        return;
      }
      const data = await res.json();
      document.getElementById('content').innerHTML = data.html;

      // ToC
      const tocHtml = data.toc.length > 0
        ? '<div class="toc-title">On this page</div>' + data.toc.map(t =>
            '<a href="#' + t.id + '" style="padding-left:' + ((t.depth - 2) * 0.75) + 'rem">' + t.text + '</a>'
          ).join('')
        : '';
      document.getElementById('toc').innerHTML = tocHtml;
      document.title = (data.frontmatter.title || slug || 'Docs') + ' — ${projectName}';

      // Highlight active sidebar link
      document.querySelectorAll('.sidebar a').forEach(a => {
        a.classList.toggle('active', a.dataset.slug === slug);
      });

      // Scroll to top
      document.querySelector('.content-wrapper').scrollTo(0, 0);
    }

    async function loadSidebar() {
      const res = await fetch(BASE + '/__api/sidebar');
      const items = await res.json();
      const html = items.map(i =>
        '<a href="#" data-slug="' + i.slug + '" class="' + (i.slug === currentSlug ? 'active' : '') + '">' + i.title + '</a>'
      ).join('');
      document.getElementById('sidebar').innerHTML = '<div class="sidebar-section"><div class="sidebar-heading">Pages</div>' + html + '</div>';
      document.getElementById('sidebar').addEventListener('click', (e) => {
        const link = e.target.closest('a[data-slug]');
        if (link) { e.preventDefault(); loadPage(link.dataset.slug); }
      });
    }

    loadSidebar();
    loadPage(location.pathname.slice(1) || 'index');

    // HMR
    const ws = new WebSocket('ws://localhost:${port}/__hmr');
    ws.onmessage = () => { loadPage(currentSlug || 'index'); loadSidebar(); };
    ws.onclose = () => setTimeout(() => location.reload(), 1000);
  </script>
</body>
</html>`
}
