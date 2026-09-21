/**
 * Single source of truth for which source-file extensions the CLI's annotation
 * parser understands.
 *
 * This list previously lived, duplicated and out of step, in three places:
 * `parseDirectory`'s switch, `stx generate`'s scan list, and `stx check`'s scan
 * list. They disagreed — `stx generate` scanned `.cs`/`.kt`, `stx check` did
 * not, so C# and Kotlin symbols got documentation pages that drift checking
 * then never looked at. Keep the mapping here and derive every scan list from
 * it so the three cannot diverge again.
 */

/** Parser families the CLI ships a local implementation for. */
export type ParserLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'php'
  | 'csharp'

/**
 * Extension (without the leading dot) to parser family.
 *
 * Mirrors `detectLanguage` in the backend's annotation parser, minus the
 * languages the CLI deliberately does not ship a parser for — see
 * {@link UNSUPPORTED_EXTENSIONS}.
 */
export const EXTENSION_LANGUAGES: Readonly<Record<string, ParserLanguage>> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'java',
  kts: 'java',
  php: 'php',
  cs: 'csharp',
}

/** Every extension the CLI can parse, for glob-based source scanning. */
export const SOURCE_EXTENSIONS: readonly string[] = Object.keys(EXTENSION_LANGUAGES)

/**
 * Extensions the hosted build parses but the CLI deliberately does not.
 *
 * The CLI's parsers are hand-written per language; Ruby has a backend parser
 * with no CLI counterpart. Rather than silently returning zero symbols — which
 * reads to an author exactly like "this file has no annotations" — commands
 * that scan source warn when they encounter these, so the author knows local
 * results are incomplete relative to a hosted build.
 */
export const UNSUPPORTED_EXTENSIONS: Readonly<Record<string, string>> = {
  rb: 'Ruby',
}

/** Resolve an extension (with or without a leading dot) to a parser family. */
export function languageForExtension(ext: string): ParserLanguage | null {
  return EXTENSION_LANGUAGES[ext.replace(/^\./, '').toLowerCase()] ?? null
}

/** Resolve a file path to a parser family, or null if unparseable locally. */
export function languageForPath(filePath: string): ParserLanguage | null {
  const ext = filePath.split('.').pop()
  return ext ? languageForExtension(ext) : null
}

/**
 * Name the language behind a path the CLI cannot parse locally but the hosted
 * build can, or null when the path is not one of those.
 */
export function unsupportedLanguageForPath(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext ? (UNSUPPORTED_EXTENSIONS[ext] ?? null) : null
}
