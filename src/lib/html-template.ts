import type { SidebarItem } from './sidebar'
import type { TocEntry } from './toc'
import type { SyntextConfig } from './config'

type StaticHtmlOptions = {
  content: string
  frontmatter: Record<string, unknown>
  toc: TocEntry[]
  sidebar: SidebarItem[]
  config: SyntextConfig
  prevPage?: { title: string; slug: string }
  nextPage?: { title: string; slug: string }
  breadcrumbs?: Array<{ title: string; slug?: string }>
  currentSlug?: string
}

export function isDraftPage(frontmatter: Record<string, unknown>): boolean {
  return frontmatter.draft === true
}

export function generateRedirectHtml(target: string): string {
  const escaped = target.replace(/"/g, '&quot;')
  return `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${escaped}"><link rel="canonical" href="${escaped}"></head><body><a href="${escaped}">Moved</a></body></html>`
}

export function generateStaticHtml(options: StaticHtmlOptions): string {
  const { content, frontmatter, toc, sidebar, config, prevPage, nextPage, breadcrumbs, currentSlug } = options
  const title = (frontmatter.title as string) ?? 'Documentation'
  const description = (frontmatter.description as string) ?? ''
  const siteName = config.name ?? 'Docs'
  const favicon = config.favicon ? `<link rel="icon" href="${config.favicon}">` : ''
  const customCSSLinks = (config.customCSS || []).map((href) => `<link rel="stylesheet" href="${href}">`).join('\n  ')
  const customJSScripts = (config.customJS || []).map((src) => `<script src="${src}" defer></script>`).join('\n  ')
  const katexCSS = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">'
  const fontFamily = buildFontLink(config)

  const bannerHtml = config.banner?.text
    ? `<div class="stx-banner">${escapeHtml(config.banner.text)}${config.banner.link ? ` <a href="${escapeHtml(config.banner.link.href)}">${escapeHtml(config.banner.link.label)}</a>` : ''}${config.banner.dismissible ? '<button class="stx-banner-close" onclick="this.parentElement.remove()">×</button>' : ''}</div>`
    : ''

  const breadcrumbHtml = breadcrumbs?.length
    ? `<nav class="stx-breadcrumbs">${breadcrumbs.map((b, i) => b.slug != null ? `<a href="/${b.slug}">${escapeHtml(b.title)}</a>${i < breadcrumbs.length - 1 ? '<span class="stx-bc-sep">/</span>' : ''}` : `<span>${escapeHtml(b.title)}</span>`).join('')}</nav>`
    : ''

  const prevNextHtml = (prevPage || nextPage)
    ? `<nav class="stx-prev-next">${prevPage ? `<a class="stx-pn-link stx-pn-prev" href="/${prevPage.slug}"><span class="stx-pn-label">Previous</span><span class="stx-pn-title">${escapeHtml(prevPage.title)}</span></a>` : '<div></div>'}${nextPage ? `<a class="stx-pn-link stx-pn-next" href="/${nextPage.slug}"><span class="stx-pn-label">Next</span><span class="stx-pn-title">${escapeHtml(nextPage.title)}</span></a>` : '<div></div>'}</nav>`
    : ''

  const footerHtml = buildFooterHtml(config)

  return `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(siteName)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${favicon}
  ${katexCSS}
  ${fontFamily}
  ${customCSSLinks}
  ${customJSScripts}
  <style>
${getThemeCSS(config)}
  </style>
</head>
<body>
  ${bannerHtml}
  <header class="stx-header">
    <div class="stx-header-inner">
      <div class="stx-header-left">
        <button class="stx-mobile-menu-btn" onclick="document.body.classList.toggle('sidebar-open')" aria-label="Toggle menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        <a class="stx-logo" href="/">${escapeHtml(siteName)}</a>
      </div>
      <div class="stx-header-right">
        <button class="stx-theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">
          <svg class="stx-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          <svg class="stx-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
      </div>
    </div>
  </header>
  <div class="stx-layout">
    <aside class="stx-sidebar">
      <nav class="stx-sidebar-nav">
        <div class="stx-sidebar-group">
          <div class="stx-sidebar-group-title">Documentation</div>
          ${sidebar.map((item) => `<a class="stx-sidebar-link" href="/${item.slug === 'index' ? '' : item.slug}">${escapeHtml(item.title)}</a>`).join('\n          ')}
        </div>
      </nav>
    </aside>
    <main class="stx-content">
      <article class="stx-article">
        ${breadcrumbHtml}
        <div class="stx-page-header">
          <h1>${escapeHtml(title)}</h1>
          ${description ? `<p class="stx-page-description">${escapeHtml(description)}</p>` : ''}
        </div>
        ${content}
        ${prevNextHtml}
      </article>
    </main>
    <aside class="stx-toc">
      <div class="stx-toc-inner">
        <div class="stx-toc-title">On this page</div>
        ${toc.map((t) => `<a class="stx-toc-link" href="#${t.id}" data-depth="${t.depth}" style="padding-left: ${(t.depth - 2) * 0.75}rem">${escapeHtml(t.text)}</a>`).join('\n        ')}
      </div>
    </aside>
  </div>
  <script>
${getThemeJS()}
  </script>
  ${footerHtml}
</body>
</html>`
}

function buildFontLink(config: SyntextConfig): string {
  const heading = config.fonts?.heading || 'Inter'
  const body = config.fonts?.body || 'Inter'
  const mono = config.fonts?.mono || 'JetBrains Mono'
  const families = [...new Set([heading, body, mono])].map(
    (f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`
  )
  return `<link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?${families.join('&')}&display=swap" rel="stylesheet">`
}

function buildFooterHtml(config: SyntextConfig): string {
  if (!config.footer) return ''
  const links = (config.footer.links || [])
    .map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
    .join('')
  const socials = (config.footer.socials || [])
    .map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.platform)}</a>`)
    .join('')
  const copyright = config.footer.copyright ? `<span class="stx-footer-copy">${escapeHtml(config.footer.copyright)}</span>` : ''
  return `<footer class="stx-footer"><div class="stx-footer-inner">${links}${socials}${copyright}</div></footer>`
}

function getThemeCSS(config: SyntextConfig): string {
  const primary = config.colors?.primary ?? '#6366f1'
  const accent = config.colors?.accent ?? '#8b5cf6'
  const fontHeading = config.fonts?.heading || 'Inter'
  const fontBody = config.fonts?.body || 'Inter'
  const fontMono = config.fonts?.mono || 'JetBrains Mono'

  return `    :root {
      --stx-primary: ${primary};
      --stx-primary-light: ${primary}1a;
      --stx-accent: ${accent};
      --stx-font-sans: '${fontBody}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --stx-font-heading: '${fontHeading}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --stx-font-mono: '${fontMono}', 'Fira Code', 'Cascadia Code', monospace;
      --stx-bg: #ffffff;
      --stx-bg-subtle: #f8fafc;
      --stx-surface: #f1f5f9;
      --stx-border: #e2e8f0;
      --stx-text: #0f172a;
      --stx-text-secondary: #475569;
      --stx-text-dim: #94a3b8;
      --stx-header-bg: rgba(255, 255, 255, 0.8);
      --stx-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
      --stx-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      --stx-radius: 8px;
      --stx-radius-lg: 12px;
    }

    [data-theme="dark"] {
      --stx-bg: #0b0f1a;
      --stx-bg-subtle: #111827;
      --stx-surface: #1e293b;
      --stx-border: #334155;
      --stx-text: #f1f5f9;
      --stx-text-secondary: #cbd5e1;
      --stx-text-dim: #64748b;
      --stx-header-bg: rgba(11, 15, 26, 0.85);
      --stx-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
      --stx-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--stx-font-sans);
      background: var(--stx-bg);
      color: var(--stx-text);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Header */
    .stx-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--stx-header-bg);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--stx-border);
      height: 60px;
    }
    .stx-header-inner {
      max-width: 1440px;
      margin: 0 auto;
      padding: 0 1.5rem;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .stx-header-left { display: flex; align-items: center; gap: 1rem; }
    .stx-header-right { display: flex; align-items: center; gap: 0.75rem; }
    .stx-logo {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--stx-text);
      text-decoration: none;
      letter-spacing: -0.02em;
    }
    .stx-mobile-menu-btn {
      display: none;
      background: none;
      border: none;
      color: var(--stx-text);
      cursor: pointer;
      padding: 0.25rem;
    }
    .stx-theme-toggle {
      background: none;
      border: 1px solid var(--stx-border);
      border-radius: 6px;
      color: var(--stx-text-secondary);
      cursor: pointer;
      padding: 0.375rem;
      display: flex;
      align-items: center;
      transition: all 0.15s;
    }
    .stx-theme-toggle:hover { background: var(--stx-surface); color: var(--stx-text); }
    .stx-icon-moon { display: none; }
    [data-theme="dark"] .stx-icon-sun { display: none; }
    [data-theme="dark"] .stx-icon-moon { display: block; }

    /* Layout */
    .stx-layout {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr) 220px;
      max-width: 1440px;
      margin: 0 auto;
      min-height: calc(100vh - 60px);
    }

    /* Sidebar */
    .stx-sidebar {
      border-right: 1px solid var(--stx-border);
      position: sticky;
      top: 60px;
      height: calc(100vh - 60px);
      overflow-y: auto;
      padding: 1.5rem 0;
    }
    .stx-sidebar-nav { padding: 0 1rem; }
    .stx-sidebar-group { margin-bottom: 1.5rem; }
    .stx-sidebar-group-title {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--stx-text-dim);
      padding: 0 0.75rem;
      margin-bottom: 0.375rem;
    }
    .stx-sidebar-link {
      display: block;
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      color: var(--stx-text-secondary);
      text-decoration: none;
      border-radius: 6px;
      transition: all 0.12s ease;
      margin-bottom: 1px;
    }
    .stx-sidebar-link:hover { color: var(--stx-text); background: var(--stx-surface); }
    .stx-sidebar-link.active {
      color: var(--stx-primary);
      background: var(--stx-primary-light);
      font-weight: 500;
    }

    /* Main content */
    .stx-content { padding: 2.5rem 3.5rem; min-width: 0; }
    .stx-article { max-width: 720px; }
    .stx-page-header { margin-bottom: 2rem; }
    .stx-page-header h1 {
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      line-height: 1.2;
      color: var(--stx-text);
    }
    .stx-page-description {
      margin-top: 0.5rem;
      font-size: 1.125rem;
      color: var(--stx-text-secondary);
      line-height: 1.6;
    }

    /* Typography */
    .stx-article h2 {
      font-size: 1.5rem;
      font-weight: 650;
      margin-top: 3rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.015em;
      color: var(--stx-text);
      scroll-margin-top: 80px;
    }
    .stx-article h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 2rem;
      margin-bottom: 0.5rem;
      color: var(--stx-text);
      scroll-margin-top: 80px;
    }
    .stx-article h4 {
      font-size: 1rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
      color: var(--stx-text);
    }
    .stx-article p {
      margin-bottom: 1.25rem;
      color: var(--stx-text-secondary);
      font-size: 0.9375rem;
    }
    .stx-article ul, .stx-article ol {
      margin-bottom: 1.25rem;
      padding-left: 1.5rem;
      color: var(--stx-text-secondary);
    }
    .stx-article li { margin-bottom: 0.375rem; font-size: 0.9375rem; }
    .stx-article a {
      color: var(--stx-primary);
      text-decoration: none;
      font-weight: 500;
      transition: opacity 0.15s;
    }
    .stx-article a:hover { opacity: 0.8; text-decoration: underline; }
    .stx-article strong { color: var(--stx-text); font-weight: 600; }
    .stx-article blockquote {
      border-left: 3px solid var(--stx-primary);
      padding: 0.5rem 1rem;
      margin-bottom: 1.25rem;
      background: var(--stx-bg-subtle);
      border-radius: 0 var(--stx-radius) var(--stx-radius) 0;
    }
    .stx-article blockquote p { color: var(--stx-text-secondary); margin-bottom: 0; }

    /* Code */
    .stx-article code {
      background: var(--stx-surface);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.8125rem;
      font-family: var(--stx-font-mono);
      font-weight: 500;
    }
    .stx-article pre {
      background: var(--stx-surface);
      border: 1px solid var(--stx-border);
      border-radius: var(--stx-radius);
      padding: 1rem 1.25rem;
      overflow-x: auto;
      margin-bottom: 1.5rem;
    }
    .stx-article pre code {
      background: none;
      padding: 0;
      font-size: 0.8125rem;
      font-weight: 400;
      line-height: 1.7;
    }

    /* Tables */
    .stx-article table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }
    .stx-article th, .stx-article td {
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--stx-border);
      text-align: left;
    }
    .stx-article th {
      background: var(--stx-bg-subtle);
      font-weight: 600;
      color: var(--stx-text);
    }
    .stx-article td { color: var(--stx-text-secondary); }

    /* Images */
    .stx-article img {
      max-width: 100%;
      border-radius: var(--stx-radius);
      border: 1px solid var(--stx-border);
      margin-bottom: 1.5rem;
    }

    /* Horizontal rule */
    .stx-article hr {
      border: none;
      border-top: 1px solid var(--stx-border);
      margin: 2.5rem 0;
    }

    /* Table of contents */
    .stx-toc {
      position: sticky;
      top: 60px;
      height: calc(100vh - 60px);
      overflow-y: auto;
      padding: 1.5rem 1rem;
    }
    .stx-toc-inner { padding-left: 0.5rem; border-left: 1px solid var(--stx-border); }
    .stx-toc-title {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--stx-text-dim);
      margin-bottom: 0.75rem;
      padding-left: 0.75rem;
    }
    .stx-toc-link {
      display: block;
      font-size: 0.8125rem;
      padding: 0.25rem 0.75rem;
      color: var(--stx-text-dim);
      text-decoration: none;
      border-radius: 4px;
      transition: all 0.12s ease;
    }
    .stx-toc-link:hover { color: var(--stx-text); }
    .stx-toc-link.active { color: var(--stx-primary); font-weight: 500; }

    /* ===== Built-in Component Styles ===== */

    /* Callout */
    .stx-callout {
      border-radius: var(--stx-radius);
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      border: 1px solid var(--stx-border);
    }
    .stx-callout--info {
      background: #eff6ff;
      border-color: #bfdbfe;
    }
    .stx-callout--warning {
      background: #fffbeb;
      border-color: #fde68a;
    }
    .stx-callout--error {
      background: #fef2f2;
      border-color: #fecaca;
    }
    .stx-callout--tip {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    [data-theme="dark"] .stx-callout--info { background: #1e293b; border-color: #1e40af40; }
    [data-theme="dark"] .stx-callout--warning { background: #1c1917; border-color: #92400e40; }
    [data-theme="dark"] .stx-callout--error { background: #1c1917; border-color: #991b1b40; }
    [data-theme="dark"] .stx-callout--tip { background: #0f1f17; border-color: #166534 40; }

    .stx-callout-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      margin-bottom: 0.375rem;
      color: var(--stx-text);
    }
    .stx-callout--info .stx-callout-title { color: #1d4ed8; }
    .stx-callout--warning .stx-callout-title { color: #d97706; }
    .stx-callout--error .stx-callout-title { color: #dc2626; }
    .stx-callout--tip .stx-callout-title { color: #16a34a; }
    [data-theme="dark"] .stx-callout--info .stx-callout-title { color: #60a5fa; }
    [data-theme="dark"] .stx-callout--warning .stx-callout-title { color: #fbbf24; }
    [data-theme="dark"] .stx-callout--error .stx-callout-title { color: #f87171; }
    [data-theme="dark"] .stx-callout--tip .stx-callout-title { color: #4ade80; }

    .stx-callout-content { font-size: 0.875rem; color: var(--stx-text-secondary); }
    .stx-callout-content p { margin-bottom: 0.5rem; }
    .stx-callout-content p:last-child { margin-bottom: 0; }

    /* Tabs */
    .stx-tabs {
      border: 1px solid var(--stx-border);
      border-radius: var(--stx-radius);
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .stx-tabs-header {
      display: flex;
      background: var(--stx-bg-subtle);
      border-bottom: 1px solid var(--stx-border);
      overflow-x: auto;
    }
    .stx-tab-button {
      padding: 0.625rem 1rem;
      font-size: 0.8125rem;
      font-weight: 500;
      font-family: var(--stx-font-sans);
      color: var(--stx-text-dim);
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .stx-tab-button:hover { color: var(--stx-text); }
    .stx-tab-button.active {
      color: var(--stx-primary);
      border-bottom-color: var(--stx-primary);
      background: var(--stx-bg);
    }
    .stx-tab-panel { display: none; padding: 1rem 1.25rem; }
    .stx-tab-panel.active { display: block; }
    .stx-tab-panel p { margin-bottom: 0.5rem; }
    .stx-tab-panel p:last-child { margin-bottom: 0; }

    /* CodeGroup */
    .stx-code-group {
      border: 1px solid var(--stx-border);
      border-radius: var(--stx-radius);
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .stx-code-group-header {
      display: flex;
      background: var(--stx-surface);
      border-bottom: 1px solid var(--stx-border);
      padding: 0 0.25rem;
    }
    .stx-code-tab {
      padding: 0.5rem 0.875rem;
      font-size: 0.75rem;
      font-weight: 500;
      font-family: var(--stx-font-mono);
      color: var(--stx-text-dim);
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
    }
    .stx-code-tab:hover { color: var(--stx-text); }
    .stx-code-tab.active {
      color: var(--stx-primary);
      border-bottom-color: var(--stx-primary);
    }
    .stx-code-panel { display: none; }
    .stx-code-panel.active { display: block; }
    .stx-code-panel pre {
      margin: 0;
      border: none;
      border-radius: 0;
    }

    /* Steps */
    .stx-steps {
      margin-bottom: 1.5rem;
      padding-left: 0.25rem;
    }
    .stx-step {
      display: flex;
      gap: 1rem;
      position: relative;
    }
    .stx-step-indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }
    .stx-step-number {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--stx-primary);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .stx-step-line {
      width: 2px;
      flex: 1;
      background: var(--stx-border);
      margin: 0.375rem 0;
      min-height: 1.5rem;
    }
    .stx-step:last-child .stx-step-line { display: none; }
    .stx-step-content { padding-bottom: 1.5rem; flex: 1; min-width: 0; }
    .stx-step:last-child .stx-step-content { padding-bottom: 0; }
    .stx-step-title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--stx-text);
      margin-bottom: 0.375rem;
      line-height: 28px;
    }
    .stx-step-body { color: var(--stx-text-secondary); font-size: 0.875rem; }
    .stx-step-body p { margin-bottom: 0.5rem; }
    .stx-step-body p:last-child { margin-bottom: 0; }

    /* Card */
    .stx-card {
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      padding: 1.25rem;
      border: 1px solid var(--stx-border);
      border-radius: var(--stx-radius-lg);
      text-decoration: none;
      color: inherit;
      transition: all 0.15s ease;
      margin-bottom: 1rem;
    }
    a.stx-card:hover {
      border-color: var(--stx-primary);
      box-shadow: var(--stx-shadow-md);
      transform: translateY(-1px);
    }
    .stx-card-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--stx-primary-light);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .stx-card-title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--stx-text);
      margin-bottom: 0.25rem;
    }
    .stx-card-description {
      font-size: 0.8125rem;
      color: var(--stx-text-secondary);
      line-height: 1.5;
    }
    .stx-card-description p { margin-bottom: 0; }

    /* CardGroup */
    .stx-card-group {
      display: grid;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .stx-card-group .stx-card { margin-bottom: 0; }

    /* Responsive */
    @media (max-width: 1200px) {
      .stx-toc { display: none; }
      .stx-layout { grid-template-columns: 260px 1fr; }
    }
    @media (max-width: 768px) {
      .stx-mobile-menu-btn { display: flex; }
      .stx-sidebar {
        position: fixed;
        top: 60px;
        left: 0;
        bottom: 0;
        width: 280px;
        z-index: 90;
        background: var(--stx-bg);
        transform: translateX(-100%);
        transition: transform 0.2s ease;
        box-shadow: none;
      }
      body.sidebar-open .stx-sidebar {
        transform: translateX(0);
        box-shadow: var(--stx-shadow-md);
      }
      .stx-layout { grid-template-columns: 1fr; }
      .stx-content { padding: 1.5rem 1.25rem; }
      .stx-page-header h1 { font-size: 1.75rem; }
      .stx-card-group { grid-template-columns: 1fr !important; }
    }

    /* Accordion */
    .stx-accordion { border: 1px solid var(--stx-border); border-radius: var(--stx-radius); margin-bottom: 1rem; overflow: hidden; }
    .stx-accordion-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.875rem 1.25rem; background: var(--stx-bg-subtle); border: none; font-family: var(--stx-font-sans); font-size: 0.9375rem; font-weight: 600; color: var(--stx-text); cursor: pointer; transition: background 0.15s; text-align: left; }
    .stx-accordion-trigger:hover { background: var(--stx-surface); }
    .stx-accordion-trigger::after { content: ''; display: block; width: 8px; height: 8px; border-right: 2px solid var(--stx-text-dim); border-bottom: 2px solid var(--stx-text-dim); transform: rotate(45deg); transition: transform 0.2s; flex-shrink: 0; margin-left: 1rem; }
    .stx-accordion[open] .stx-accordion-trigger::after { transform: rotate(-135deg); }
    .stx-accordion-content { padding: 1rem 1.25rem; font-size: 0.875rem; color: var(--stx-text-secondary); }
    .stx-accordion-content p:last-child { margin-bottom: 0; }

    /* Frame */
    .stx-frame { border: 1px solid var(--stx-border); border-radius: var(--stx-radius-lg); overflow: hidden; margin-bottom: 1.5rem; background: var(--stx-bg-subtle); }
    .stx-frame img, .stx-frame video { display: block; width: 100%; border: none; margin: 0; border-radius: 0; }
    .stx-frame-caption { padding: 0.625rem 1rem; font-size: 0.8125rem; color: var(--stx-text-dim); text-align: center; border-top: 1px solid var(--stx-border); }

    /* Embed */
    .stx-embed { margin-bottom: 1.5rem; }
    .stx-embed-wrapper { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: var(--stx-radius-lg); border: 1px solid var(--stx-border); }
    .stx-embed-wrapper iframe, .stx-embed-wrapper video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }

    /* Mermaid */
    .stx-mermaid { margin-bottom: 1.5rem; text-align: center; }
    .stx-mermaid pre.mermaid { background: none; border: none; padding: 0; }

    /* Banner */
    .stx-banner { background: var(--stx-primary); color: white; text-align: center; padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500; position: relative; }
    .stx-banner a { color: white; text-decoration: underline; font-weight: 600; margin-left: 0.5rem; }
    .stx-banner-close { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: white; font-size: 1.125rem; cursor: pointer; opacity: 0.7; }
    .stx-banner-close:hover { opacity: 1; }

    /* Breadcrumbs */
    .stx-breadcrumbs { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1rem; font-size: 0.8125rem; }
    .stx-breadcrumbs a { color: var(--stx-text-dim); text-decoration: none; }
    .stx-breadcrumbs a:hover { color: var(--stx-primary); }
    .stx-breadcrumbs span { color: var(--stx-text-dim); }
    .stx-bc-sep { margin: 0 0.25rem; color: var(--stx-text-dim); }

    /* Prev / Next */
    .stx-prev-next { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--stx-border); }
    .stx-pn-link { display: block; padding: 1rem 1.25rem; border: 1px solid var(--stx-border); border-radius: var(--stx-radius); text-decoration: none; transition: all 0.15s; }
    .stx-pn-link:hover { border-color: var(--stx-primary); box-shadow: var(--stx-shadow-sm); }
    .stx-pn-prev { text-align: left; }
    .stx-pn-next { text-align: right; }
    .stx-pn-label { display: block; font-size: 0.75rem; color: var(--stx-text-dim); margin-bottom: 0.25rem; }
    .stx-pn-title { font-size: 0.9375rem; font-weight: 600; color: var(--stx-primary); }

    /* Footer */
    .stx-footer { border-top: 1px solid var(--stx-border); padding: 2rem 1.5rem; margin-top: 3rem; }
    .stx-footer-inner { max-width: 1440px; margin: 0 auto; display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--stx-text-dim); }
    .stx-footer a { color: var(--stx-text-secondary); text-decoration: none; }
    .stx-footer a:hover { color: var(--stx-primary); }
    .stx-footer-copy { margin-left: auto; }

    /* Headings use heading font */
    .stx-article h1, .stx-article h2, .stx-article h3, .stx-article h4 { font-family: var(--stx-font-heading); }

    /* Shiki overrides */
    .stx-article pre.shiki { background: var(--stx-surface) !important; }
    [data-theme="dark"] .stx-article pre.shiki { background: #1e293b !important; }`
}

function getThemeJS(): string {
  return `    (function() {
      var stored = localStorage.getItem('stx-theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = stored || (prefersDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
    })();

    function toggleTheme() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('stx-theme', next);
    }

    // Active TOC tracking
    (function() {
      var headings = document.querySelectorAll('.stx-article h2, .stx-article h3');
      var tocLinks = document.querySelectorAll('.stx-toc-link');
      if (!headings.length || !tocLinks.length) return;

      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            tocLinks.forEach(function(l) { l.classList.remove('active'); });
            var active = document.querySelector('.stx-toc-link[href="#' + entry.target.id + '"]');
            if (active) active.classList.add('active');
          }
        });
      }, { rootMargin: '-80px 0px -70% 0px' });

      headings.forEach(function(h) { observer.observe(h); });
    })();`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
