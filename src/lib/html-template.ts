import type { SidebarItem } from './sidebar'
import type { TocEntry } from './toc'
import type { SyntextConfig } from './config'

type StaticHtmlOptions = {
  content: string
  frontmatter: Record<string, unknown>
  toc: TocEntry[]
  sidebar: SidebarItem[]
  config: SyntextConfig
}

export function generateStaticHtml(options: StaticHtmlOptions): string {
  const { content, frontmatter, toc, sidebar, config } = options
  const title = (frontmatter.title as string) ?? 'Documentation'
  const description = (frontmatter.description as string) ?? ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(config.name ?? 'Docs')}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <style>
    :root {
      --color-primary: ${config.colors?.primary ?? '#6366f1'};
      --color-accent: ${config.colors?.accent ?? '#8b5cf6'};
      --color-bg: #ffffff;
      --color-surface: #f4f4f5;
      --color-border: #e4e4e7;
      --color-text: #18181b;
      --color-text-dim: #71717a;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #0f0f11;
        --color-surface: #1a1a1f;
        --color-border: #2a2a32;
        --color-text: #e4e4e7;
        --color-text-dim: #a1a1aa;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.7;
    }
    .layout { display: grid; grid-template-columns: 260px minmax(0, 1fr) 200px; max-width: 1440px; margin: 0 auto; min-height: 100vh; }
    .sidebar {
      border-right: 1px solid var(--color-border);
      padding: 2rem 1.5rem;
      position: sticky; top: 0; height: 100vh; overflow-y: auto;
    }
    .sidebar-group { margin-bottom: 1.5rem; }
    .sidebar-group-title { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-dim); margin-bottom: 0.5rem; }
    .sidebar a { display: block; padding: 0.375rem 0.75rem; font-size: 0.875rem; color: var(--color-text-dim); text-decoration: none; border-radius: 6px; transition: all 0.15s; }
    .sidebar a:hover { color: var(--color-text); background: var(--color-surface); }
    .content { padding: 2.5rem 3rem; max-width: 720px; }
    .content h1 { font-size: 2.25rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
    .content h2 { font-size: 1.5rem; font-weight: 600; margin-top: 2.5rem; margin-bottom: 0.75rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
    .content h3 { font-size: 1.25rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.5rem; }
    .content p { margin-bottom: 1rem; color: var(--color-text-dim); }
    .content ul, .content ol { margin-bottom: 1rem; padding-left: 1.5rem; color: var(--color-text-dim); }
    .content li { margin-bottom: 0.375rem; }
    .content code { background: var(--color-surface); padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.85em; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
    .content pre { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; padding: 1rem 1.25rem; overflow-x: auto; margin-bottom: 1.5rem; }
    .content pre code { background: none; padding: 0; font-size: 0.8rem; }
    .content a { color: var(--color-primary); text-decoration: none; }
    .content a:hover { text-decoration: underline; }
    .content blockquote { border-left: 3px solid var(--color-primary); padding-left: 1rem; margin-bottom: 1rem; color: var(--color-text-dim); }
    .content table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
    .content th, .content td { padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); text-align: left; font-size: 0.875rem; }
    .content th { background: var(--color-surface); font-weight: 600; }
    .toc { padding: 2rem 1rem; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
    .toc-title { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-dim); margin-bottom: 0.75rem; }
    .toc a { display: block; font-size: 0.8rem; padding: 0.25rem 0; color: var(--color-text-dim); text-decoration: none; transition: color 0.15s; }
    .toc a:hover { color: var(--color-text); }
    @media (max-width: 1024px) { .toc { display: none; } .layout { grid-template-columns: 260px 1fr; } }
    @media (max-width: 768px) { .sidebar { display: none; } .layout { grid-template-columns: 1fr; } .content { padding: 1.5rem; } }
  </style>
</head>
<body>
  <div class="layout">
    <nav class="sidebar">
      <div class="sidebar-group">
        <div class="sidebar-group-title">Documentation</div>
        ${sidebar.map((item) => `<a href="/${item.slug === 'index' ? '' : item.slug}">${escapeHtml(item.title)}</a>`).join('\n        ')}
      </div>
    </nav>
    <main class="content">
      ${content}
    </main>
    <aside class="toc">
      <div class="toc-title">On this page</div>
      ${toc.map((t) => `<a href="#${t.id}" style="padding-left: ${(t.depth - 2) * 0.75}rem">${escapeHtml(t.text)}</a>`).join('\n      ')}
    </aside>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
