/**
 * Custom code content rules: CSS and JavaScript. SHARED COPY — the backend keeps
 * the same file (syntext-backend src/services/docs-code/css-js-rules.ts) and both run the same
 * fixtures (content-rules.fixtures.json). Change both together.
 *
 * Every scan is a single forward pass (no backtracking regex on author text):
 * these run on every keystroke of the editor's live check.
 *
 * CSS is checked as the browser reads it: CSS escapes decoded (`u\72l(` is
 * `url(`), comments removed, and `image-set()` / `src()` strings treated as
 * URLs like `url()` targets. The checks that guard the surrounding HTML
 * (`</style>`, `</head>`) look at the raw text, which is what the HTML parser
 * sees.
 */
import { decodeCssEscapes } from './css-escapes'

const DOC_BREAK = /<\/\s*(head|body)\s*>/i
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const DATA_OK = /^data:(image\/|font\/|application\/(x-)?font)/i

/** Whether CSS may load `url`: https, relative, a fragment, or an image/font data URI. */
export function isAllowedCssUrl(url: string): boolean {
  const u = url.trim()
  if (u === '' || u.startsWith('#')) return true
  if (/^https:\/\//i.test(u)) return true
  if (DATA_OK.test(u)) return true
  if (u.startsWith('//') || u.startsWith('\\')) return false
  return !SCHEME.test(u)
}

/** Whether head.html may load `url` (`<script src>`, `<link href>`): https or a relative path. */
export function isAllowedLoadUrl(url: string): boolean {
  const u = url.trim()
  if (/^https:\/\//i.test(u)) return true
  if (u === '' || u.startsWith('//') || u.startsWith('\\')) return false
  return !SCHEME.test(u)
}

const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'

function skipSpaces(text: string, i: number): number {
  while (i < text.length && isSpace(text[i])) i++
  return i
}

/** `css` without its comments; an unclosed comment runs to the end. */
export function stripCssComments(css: string): string {
  let out = ''
  let i = 0
  for (let open = css.indexOf('/*'); open !== -1; open = css.indexOf('/*', i)) {
    out += css.slice(i, open)
    const close = css.indexOf('*/', open + 2)
    if (close === -1) return out
    i = close + 2
  }
  return out + css.slice(i)
}

/** A quoted string at `i` (its content, and the index after it), or null. */
function readString(css: string, i: number): { value: string; end: number } | null {
  const q = css[i]
  if (q !== '"' && q !== "'") return null
  const close = css.indexOf(q, i + 1)
  return close === -1 ? { value: css.slice(i + 1), end: css.length } : { value: css.slice(i + 1, close), end: close + 1 }
}

/** A `url(` target: a quoted string, or everything up to the closing parenthesis, trimmed. */
function readUrlArg(css: string, i: number): string {
  const start = skipSpaces(css, i)
  const str = readString(css, start)
  if (str) return str.value
  const end = css.indexOf(')', start)
  return (end === -1 ? css.slice(start) : css.slice(start, end)).trim()
}

const isIdentChar = (c: string | undefined) => c !== undefined && /[a-z0-9_-]/i.test(c)

/** Every quoted string in the arguments of each `name(` function (to its closing parenthesis). */
function functionStrings(css: string, lower: string, name: string, out: string[]): void {
  let i = lower.indexOf(name)
  while (i !== -1) {
    if (isIdentChar(lower[i - 1]) && !lower.slice(0, i).endsWith('-webkit-')) {
      i = lower.indexOf(name, i + name.length)
      continue
    }
    let j = i + name.length
    let depth = 1
    while (j < css.length && depth > 0) {
      const c = css[j]
      const str = c === '"' || c === "'" ? readString(css, j) : null
      if (str) {
        out.push(str.value)
        j = str.end
        continue
      }
      if (c === '(') depth++
      else if (c === ')') depth--
      j++
    }
    i = lower.indexOf(name, j)
  }
}

/** Every URL a stylesheet loads: `url()`, `@import "…"`, and `image-set()` / `src()` strings. Expects decoded CSS. */
export function cssUrls(css: string): string[] {
  const urls: string[] = []
  const lower = css.toLowerCase()
  for (let i = lower.indexOf('url('); i !== -1; i = lower.indexOf('url(', i + 4)) urls.push(readUrlArg(css, i + 4))
  for (let i = lower.indexOf('@import'); i !== -1; i = lower.indexOf('@import', i + 7)) {
    const start = skipSpaces(css, i + 7)
    const str = start === i + 7 ? null : readString(css, start)
    if (str) urls.push(str.value)
  }
  functionStrings(css, lower, 'image-set(', urls)
  functionStrings(css, lower, 'src(', urls)
  return urls
}

/** Problems with a stylesheet's content; [] when it may be applied. */
export function cssContentErrors(css: string): string[] {
  const errors: string[] = []
  if (/<\/\s*style/i.test(css)) errors.push('CSS must not contain </style>')
  if (DOC_BREAK.test(css)) errors.push('CSS must not contain </head> or </body>')
  const read = stripCssComments(decodeCssEscapes(css))
  if (/expression\s*\(/i.test(read)) errors.push('CSS must not use expression()')
  if (/(java|vb)script\s*:/i.test(read)) errors.push('CSS must not contain javascript: or vbscript: URLs')
  if (/behavior\s*:|-moz-binding/i.test(read)) errors.push('CSS must not use behavior or -moz-binding')
  const bad = cssUrls(read).find((url) => !isAllowedCssUrl(url))
  if (bad !== undefined) errors.push(`CSS may load only https:// URLs (found "${bad}")`)
  return errors
}

/** Problems with a script's content (it is wrapped in a <script> element). */
export function jsContentErrors(js: string): string[] {
  const errors: string[] = []
  if (/<\/\s*script/i.test(js)) errors.push('JavaScript must not contain </script>')
  if (DOC_BREAK.test(js)) errors.push('JavaScript must not contain </head> or </body>')
  return errors
}

/**
 * Script text made safe to put between `<script>` and `</script>`: `<!--`
 * and `<script` would switch the HTML parser into its escaped states and let
 * the script run past its own end tag. `\x3C` is `<` to JavaScript, in a
 * string, a template or a regular expression alike.
 */
export function escapeScriptText(js: string): string {
  return js.replace(/<(?=!--|script[\s>/])/gi, '\\x3C')
}
