/**
 * `_syntext/head.html`: checked and re-written from a parse tree. SHARED COPY
 * — the backend keeps the same file (syntext-backend src/services/docs-code/head-html.ts) and both
 * run the same fixtures (content-rules.fixtures.json). Change both together.
 *
 * The file is parsed as the browser parses the inside of <head> (parse5, head
 * context), so spellings regexes miss — `<meta/http-equiv=refresh>`,
 * `http-equiv="&#114;efresh"`, `<script/src=…>`, `<!--><img onerror>-->` —
 * are read as the browser reads them. What goes on the site is serialized
 * from that tree, never the raw text:
 *
 * - elements: <meta>, <link>, <script>, <noscript>, <style> only;
 * - attributes: an allowlist per element (plus `id` and `data-*`); event
 *   handlers (`on*`) refused;
 * - <meta http-equiv>: content-type, default-style, x-ua-compatible and
 *   content-language only;
 * - <script src> / <link href>: https or a relative path;
 * - malformed comments and CDATA refused (they hide markup from a reader);
 * - <script> elements are written out only when scripts may run ("Scripts
 *   from your docs"), so head tags alone never run JavaScript.
 */
import { defaultTreeAdapter, html as parse5Html, parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { cssContentErrors, escapeScriptText, isAllowedLoadUrl, jsContentErrors } from './css-js-rules'

type Node = DefaultTreeAdapterMap['childNode'] | DefaultTreeAdapterMap['documentFragment']
type Element = DefaultTreeAdapterMap['element']

export const HEAD_ELEMENTS = new Set(['meta', 'link', 'script', 'noscript', 'style'])
const ALLOWED_LIST = 'head.html may contain only <meta>, <link>, <script>, <noscript> and <style>'

const ATTRIBUTES: Record<string, Set<string>> = {
  meta: new Set(['name', 'content', 'property', 'charset', 'http-equiv', 'itemprop', 'media']),
  link: new Set(['rel', 'href', 'type', 'sizes', 'media', 'hreflang', 'crossorigin', 'integrity', 'as', 'title', 'color', 'referrerpolicy', 'fetchpriority']),
  script: new Set(['src', 'type', 'async', 'defer', 'crossorigin', 'integrity', 'nomodule', 'referrerpolicy', 'fetchpriority']),
  style: new Set(['media', 'type']),
  noscript: new Set([]),
}
const ALLOWED_HTTP_EQUIV = new Set(['content-type', 'default-style', 'x-ua-compatible', 'content-language'])
const COMMENT_TRICKS = new Set([
  'cdata-in-html-content', 'incorrectly-opened-comment', 'nested-comment', 'abrupt-closing-of-empty-comment',
  'eof-in-comment', 'incorrectly-closed-comment', 'eof-in-cdata', 'eof-in-script-html-comment-like-text',
])
const VOID = new Set(['meta', 'link'])

const isElement = (n: Node): n is Element => 'tagName' in n
const attrAllowed = (el: string, name: string) => name === 'id' || name.startsWith('data-') || (ATTRIBUTES[el]?.has(name) ?? false)

/**
 * The fragment as the inside of <head>. `scripting` decides how <noscript>
 * reads: raw text with JavaScript on, markup with it off — the rules check
 * both, so nothing hides in a <noscript> for readers without JavaScript.
 */
function parseHead(html: string, scripting = true): { root: DefaultTreeAdapterMap['documentFragment']; trickery: boolean } {
  let trickery = false
  const context = defaultTreeAdapter.createElement('head', parse5Html.NS.HTML, [])
  const root = parseFragment(context, html, { scriptingEnabled: scripting, onParseError: (e) => { if (COMMENT_TRICKS.has(e.code)) trickery = true } })
  return { root, trickery }
}

const RAW_START = /<!--|<(script|style)\b/gi

/** `html` without comments and script/style bodies, for the document-structure check. One forward pass. */
function outsideRawText(html: string): string {
  let out = ''
  let i = 0
  RAW_START.lastIndex = 0
  for (let m = RAW_START.exec(html); m; m = RAW_START.exec(html)) {
    out += html.slice(i, m.index) + ' '
    let end: number
    if (!m[1]) {
      const close = html.indexOf('-->', m.index + 4)
      end = close === -1 ? html.length : close + 3
    } else {
      const gt = html.indexOf('>', m.index)
      const close = new RegExp(`<\\/\\s*${m[1]}\\s*>`, 'gi')
      close.lastIndex = gt === -1 ? html.length : gt + 1
      const found = gt === -1 ? null : close.exec(html)
      end = found ? found.index + found[0].length : html.length
    }
    i = end
    RAW_START.lastIndex = end
  }
  return out + html.slice(i)
}

function textOf(el: Element): string {
  return el.childNodes.map((c) => ('value' in c && c.nodeName === '#text' ? c.value : '')).join('')
}

/** Problems with head.html; [] when it may go into <head>. */
export function headHtmlErrors(html: string): string[] {
  const errors = new Set<string>()
  const { root, trickery } = parseHead(html)
  if (trickery) errors.add('head.html must not contain malformed comments or CDATA')
  if (/<\/\s*(head|body|html)\b|<\s*(body|html)\b/i.test(outsideRawText(html))) errors.add('head.html must not contain </head>, <body> or <html>')
  const visit = (node: Node) => {
    if (node.nodeName === '#text' && 'value' in node && node.value.trim() !== '') {
      errors.add('head.html may contain only elements (text outside them would start the page body)')
    }
    if (!isElement(node)) {
      if ('childNodes' in node) node.childNodes.forEach(visit)
      return
    }
    const name = node.tagName
    if (name === 'body' || name === 'html' || name === 'head') {
      node.childNodes.forEach(visit)
      return
    }
    if (!HEAD_ELEMENTS.has(name)) {
      errors.add(`<${name}> is not allowed (${ALLOWED_LIST})`)
      return
    }
    for (const a of node.attrs) {
      const attr = (a.prefix ? `${a.prefix}:${a.name}` : a.name).toLowerCase()
      if (attr.startsWith('on')) errors.add(`<${name}> must not have event handlers (found ${attr})`)
      else if (!attrAllowed(name, attr)) errors.add(`<${name}> must not have the ${attr} attribute`)
    }
    const get = (n: string) => node.attrs.find((a) => a.name === n)?.value
    const equiv = get('http-equiv')?.trim().toLowerCase()
    if (name === 'meta' && equiv && !ALLOWED_HTTP_EQUIV.has(equiv)) errors.add(`<meta http-equiv="${equiv}"> is not allowed`)
    const src = get('src')
    if (name === 'script' && src !== undefined && !isAllowedLoadUrl(src)) errors.add(`<script src> may load only https:// URLs (found "${src}")`)
    const href = get('href')
    if (name === 'link' && href !== undefined && !isAllowedLoadUrl(href)) errors.add(`<link href> may load only https:// URLs (found "${href}")`)
    if (name === 'script') for (const e of jsContentErrors(textOf(node))) errors.add(e)
    if (name === 'style') for (const e of cssContentErrors(textOf(node))) errors.add(e)
    // Without JavaScript a <noscript> is markup: its elements meet the same rules.
    if (name === 'noscript') node.childNodes.filter(isElement).forEach(visit)
  }
  visit(root)
  visit(parseHead(html, false).root)
  return [...errors]
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * head.html as it goes on the site: re-written from the parse tree with only
 * allowed elements and attributes (call after `headHtmlErrors` is empty).
 * `<script>` elements are left out unless `scripts` is true.
 */
export function serializeHeadHtml(html: string, opts: { scripts: boolean }): { html: string; scriptsLeftOut: number } {
  const { root } = parseHead(html)
  let scriptsLeftOut = 0
  const out: string[] = []
  const write = (node: Node) => {
    if (!isElement(node)) {
      if (node.nodeName === '#document-fragment' && 'childNodes' in node) node.childNodes.forEach(write)
      return
    }
    const name = node.tagName
    if (name === 'html' || name === 'head' || name === 'body') return node.childNodes.forEach(write)
    if (!HEAD_ELEMENTS.has(name)) return
    if (name === 'script' && !opts.scripts) {
      scriptsLeftOut++
      return
    }
    const attrs = node.attrs
      .filter((a) => !a.prefix && !a.name.startsWith('on') && attrAllowed(name, a.name))
      .map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${escapeAttr(a.value)}"`))
      .join('')
    if (VOID.has(name)) return void out.push(`<${name}${attrs}>`)
    const text = textOf(node)
    const body = name === 'script' ? escapeScriptText(text) : text
    out.push(`<${name}${attrs}>${body}</${name}>`)
  }
  write(root)
  return { html: out.join('\n'), scriptsLeftOut }
}
