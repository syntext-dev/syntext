import { describe, it, expect } from 'bun:test'
import {
  EXTENSION_LANGUAGES,
  SOURCE_EXTENSIONS,
  UNSUPPORTED_EXTENSIONS,
  languageForExtension,
  languageForPath,
  unsupportedLanguageForPath,
} from './languages'

describe('languages', () => {
  it('should map every extension the backend annotation parser maps, except deliberately unsupported ones', () => {
    // Mirrors detectLanguage() in syntext-backend/src/services/annotation-parser.ts.
    // Ruby (rb) is the one entry the CLI deliberately omits — see UNSUPPORTED_EXTENSIONS.
    const backendMapping: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      py: 'python', go: 'go', rs: 'rust', java: 'java', php: 'php', cs: 'csharp',
    }
    for (const [ext, lang] of Object.entries(backendMapping)) {
      expect(languageForExtension(ext)).toBe(lang as never)
    }
  })

  it('should resolve the ESM and CJS TypeScript/JavaScript extensions the backend accepts', () => {
    // Regression: these four returned null, so annotated .mts/.cts/.mjs/.cjs
    // files silently produced zero symbols locally while a hosted build parsed them.
    expect(languageForExtension('mts')).toBe('typescript')
    expect(languageForExtension('cts')).toBe('typescript')
    expect(languageForExtension('mjs')).toBe('javascript')
    expect(languageForExtension('cjs')).toBe('javascript')
  })

  it('should route Kotlin through the Java parser', () => {
    expect(languageForExtension('kt')).toBe('java')
    expect(languageForExtension('kts')).toBe('java')
  })

  it('should tolerate a leading dot and uppercase', () => {
    expect(languageForExtension('.TS')).toBe('typescript')
    expect(languageForExtension('.Cs')).toBe('csharp')
  })

  it('should return null for an unknown extension', () => {
    expect(languageForExtension('txt')).toBeNull()
    expect(languageForExtension('')).toBeNull()
  })

  it('should resolve a full path to a language', () => {
    expect(languageForPath('/a/b/thing.mts')).toBe('typescript')
    expect(languageForPath('/a/b/thing.md')).toBeNull()
  })

  it('should expose every mapped extension in SOURCE_EXTENSIONS', () => {
    expect(SOURCE_EXTENSIONS.length).toBe(Object.keys(EXTENSION_LANGUAGES).length)
    for (const ext of ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'kt', 'kts', 'php', 'cs']) {
      expect(SOURCE_EXTENSIONS).toContain(ext)
    }
  })

  it('should not list a deliberately unsupported extension as parseable', () => {
    for (const ext of Object.keys(UNSUPPORTED_EXTENSIONS)) {
      expect(languageForExtension(ext)).toBeNull()
      expect(SOURCE_EXTENSIONS).not.toContain(ext)
    }
  })

  it('should name the language for a file the CLI cannot parse but the backend can', () => {
    expect(unsupportedLanguageForPath('/a/b/model.rb')).toBe('Ruby')
    expect(unsupportedLanguageForPath('/a/b/MODEL.RB')).toBe('Ruby')
  })

  it('should return null from unsupportedLanguageForPath for a supported file', () => {
    expect(unsupportedLanguageForPath('/a/b/thing.ts')).toBeNull()
    expect(unsupportedLanguageForPath('/a/b/thing.md')).toBeNull()
  })
})
