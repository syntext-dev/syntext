/**
 * Content rules for custom code from your docs (`_syntext/*.css`, `*.js`,
 * `head.html` and page `css:` files). The same rules and messages as the
 * hosted build, the editor's live checks and the API (syntext-backend is the
 * source of truth). Messages carry no file name; callers add it.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const HEAD_OR_BODY_CLOSE = /<\/\s*(head|body)\s*>/i
const SCRIPT_CLOSE = /<\/\s*script/i

export const NOT_TEXT = 'is not a text file'

/** The file as UTF-8 text, or null when it has a NUL byte or is not valid UTF-8. */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** A relative path: no scheme and not protocol-relative. */
const isRelative = (url: string) => !url.startsWith('//') && !SCHEME.test(url)

/** `url()` / `@import` targets CSS may load: https, relative, `#…`, and data: images and fonts. */
export function isAllowedCssUrl(raw: string): boolean {
  const url = raw.trim()
  if (/^https:\/\//i.test(url) || url.startsWith('#')) return true
  if (/^data:(image\/|font\/|application\/(x-)?font)/i.test(url)) return true
  return isRelative(url)
}

/** The `url(...)` and `@import "..."` targets in a stylesheet, in order. */
export function cssUrls(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  for (const m of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) out.push(m[1] ?? m[2] ?? '')
  return out
}

/** Every rule a stylesheet breaks (site-wide, page `css:` or a `<style>` in head.html). */
export function cssContentErrors(css: string): string[] {
  const out: string[] = []
  if (/<\/\s*style/i.test(css)) out.push('CSS must not contain </style>')
  if (HEAD_OR_BODY_CLOSE.test(css)) out.push('CSS must not contain </head> or </body>')
  if (/expression\s*\(/i.test(css)) out.push('CSS must not use expression()')
  if (/(java|vb)script\s*:/i.test(css)) out.push('CSS must not contain javascript: or vbscript: URLs')
  if (/behavior\s*:/i.test(css) || /-moz-binding/i.test(css)) out.push('CSS must not use behavior or -moz-binding')
  for (const url of cssUrls(css)) {
    if (!isAllowedCssUrl(url)) out.push(`CSS may load only https:// URLs (found "${url}")`)
  }
  return [...new Set(out)]
}

/** Every rule a `_syntext/*.js` file breaks (size aside). */
export function jsContentErrors(js: string): string[] {
  const out: string[] = []
  if (SCRIPT_CLOSE.test(js)) out.push('JavaScript must not contain </script>')
  if (HEAD_OR_BODY_CLOSE.test(js)) out.push('JavaScript must not contain </head> or </body>')
  return out
}

const HEAD_ELEMENTS = new Set(['meta', 'link', 'script', 'noscript', 'style'])
const BLOCKED_HTTP_EQUIV = new Set(['refresh', 'set-cookie', 'content-security-policy', 'content-security-policy-report-only'])

/** An attribute's value in an opening tag, or null. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null
}

/** Every rule `_syntext/head.html` breaks (size aside). */
export function headHtmlErrors(html: string): string[] {
  const out: string[] = []
  const bodies: Array<{ kind: string; body: string }> = []
  // Comments go first; <script> and <style> bodies are checked on their own.
  const rest = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b([^>]*)>([\s\S]*?)(<\/\1\s*>|$)/gi, (_all, kind: string, attrs: string, body: string, close: string) => {
      bodies.push({ kind: kind.toLowerCase(), body })
      return `<${kind}${attrs}>${close}`
    })

  if (/<\/\s*(head|body|html)\s*>/i.test(rest) || /<\s*(body|html)\b/i.test(rest)) {
    out.push('head.html must not contain </head>, <body> or <html>')
  }
  for (const m of rest.matchAll(/<([a-z][a-z0-9-]*)/gi)) {
    const name = m[1].toLowerCase()
    if (HEAD_ELEMENTS.has(name) || name === 'body' || name === 'html') continue
    out.push(`<${name}> is not allowed (head.html may contain only <meta>, <link>, <script>, <noscript> and <style>)`)
  }
  for (const [tag] of rest.matchAll(/<meta\b[^>]*>/gi)) {
    const equiv = attr(tag, 'http-equiv')?.trim().toLowerCase()
    if (equiv && BLOCKED_HTTP_EQUIV.has(equiv)) out.push(`<meta http-equiv="${equiv}"> is not allowed`)
  }
  for (const [tag, name] of rest.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const which = name.toLowerCase() === 'script' ? 'src' : 'href'
    const url = attr(tag, which)
    if (url !== null && !/^https:\/\//i.test(url.trim()) && !isRelative(url.trim())) {
      out.push(`<${name.toLowerCase()} ${which}> may load only https:// URLs (found "${url}")`)
    }
  }
  for (const { kind, body } of bodies) {
    if (kind === 'style') out.push(...cssContentErrors(body))
    else if (SCRIPT_CLOSE.test(body)) out.push('JavaScript must not contain </script>')
  }
  return [...new Set(out)]
}
