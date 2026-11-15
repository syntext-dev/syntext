/**
 * Content rules for custom code from your docs (`_syntext/*.css`, `*.js`,
 * `head.html` and page `css:` files). The same rules and messages as the
 * hosted build, the editor's live checks and the API: the CSS/JS rules
 * (css-js-rules.ts) and head.html rules (head-html.ts) are shared copies of
 * syntext-backend's, checked against the same fixtures
 * (content-rules.fixtures.json). Messages carry no file name; callers add it.
 */
export { cssContentErrors, cssUrls, isAllowedCssUrl, isAllowedLoadUrl, jsContentErrors, escapeScriptText } from './css-js-rules'
export { headHtmlErrors, serializeHeadHtml } from './head-html'

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
