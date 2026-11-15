import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  checkCustomCode,
  collectRootCustomCodeFiles,
  customCodeFileNames,
  formatCustomCodeIssue,
  hasRepoScripts,
  isInCustomCodeDir,
  locateCustomCode,
  readCustomCodeFiles,
  validateCustomCode,
  type CustomCodeFile,
  type CustomCodeFiles,
} from './repo-custom-code'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'stx-custom-code-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function put(rel: string, content = ''): Promise<void> {
  const abs = join(root, rel)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(abs, content)
}

const files = (over: Partial<CustomCodeFiles> = {}): CustomCodeFiles => ({ css: [], js: [], head: null, ...over })
const f = (name: string, content: string): CustomCodeFile => ({ name, content, bytes: Buffer.byteLength(content) })
const messages = (errors: Array<{ file: string; message: string }>) => errors.map(formatCustomCodeIssue)
async function mkdirp(rel: string): Promise<string> {
  await mkdir(join(root, rel), { recursive: true })
  return join(root, rel)
}

describe('isInCustomCodeDir', () => {
  it('should be true for files under _syntext/', () => {
    expect(isInCustomCodeDir('_syntext/notes.mdx')).toBe(true)
    expect(isInCustomCodeDir('_syntext/deep/page.md')).toBe(true)
  })

  it('should be false for other paths', () => {
    expect(isInCustomCodeDir('guides/_syntext.mdx')).toBe(false)
    expect(isInCustomCodeDir('guides/_syntext/x.mdx')).toBe(false)
    expect(isInCustomCodeDir('index.mdx')).toBe(false)
  })
})

describe('locateCustomCode', () => {
  it('should find nothing when there is no _syntext folder', () => {
    expect(locateCustomCode(root)).toEqual({ dir: null, ignored: null })
  })

  it('should use docs/_syntext when docs/ has one', async () => {
    await put('docs/_syntext/theme.css')
    expect(locateCustomCode(root)).toEqual({ dir: 'docs/_syntext', ignored: null })
  })

  it('should accept the root _syntext when docs live in docs/', async () => {
    await put('docs/index.mdx')
    await put('_syntext/theme.css')
    expect(locateCustomCode(root)).toEqual({ dir: '_syntext', ignored: null })
  })

  it('should use the root _syntext when there is no docs/ folder', async () => {
    await put('_syntext/theme.css')
    expect(locateCustomCode(root)).toEqual({ dir: '_syntext', ignored: null })
  })

  it('should prefer docs/_syntext and ignore the root one when both exist', async () => {
    await put('docs/_syntext/a.css')
    await put('_syntext/b.css')
    expect(locateCustomCode(root)).toEqual({ dir: 'docs/_syntext', ignored: '_syntext' })
  })
})

describe('customCodeFileNames', () => {
  it('should list top-level css, js and head.html sorted by code point, skipping others and subfolders', async () => {
    await put('_syntext/b.css')
    await put('_syntext/Z.css')
    await put('_syntext/a.js')
    await put('_syntext/head.html')
    await put('_syntext/notes.md')
    await put('_syntext/other.html')
    await put('_syntext/nested/deep.css')
    expect(customCodeFileNames(join(root, '_syntext'))).toEqual(['Z.css', 'a.js', 'b.css', 'head.html'])
  })

  it('should return nothing for a missing folder', () => {
    expect(customCodeFileNames(join(root, 'nope'))).toEqual([])
  })
})

describe('readCustomCodeFiles', () => {
  it('should group files as the build does', async () => {
    await put('_syntext/z.css', 'z{}')
    await put('_syntext/a.css', 'a{}')
    await put('_syntext/app.js', 'run()')
    await put('_syntext/head.html', '<meta name="x">')
    const r = await readCustomCodeFiles(join(root, '_syntext'))
    expect(r.css.map((f) => f.name)).toEqual(['a.css', 'z.css'])
    expect(r.js).toEqual([{ name: 'app.js', bytes: 5, content: 'run()' }])
    expect(r.head).toEqual({ name: 'head.html', bytes: 15, content: '<meta name="x">' })
  })
})

describe('validateCustomCode', () => {
  it('should pass valid CSS', () => {
    expect(validateCustomCode(files({ css: [f('theme.css', 'body{color:red}')] }))).toEqual([])
  })

  it('should apply the CSS rules, naming the file', () => {
    expect(messages(validateCustomCode(files({ css: [f('theme.css', 'a{} </ STYLE> a{background:url(http://x/a.png)}')] })))).toEqual([
      '_syntext/theme.css: CSS must not contain </style>',
      '_syntext/theme.css: CSS may load only https:// URLs (found "http://x/a.png")',
    ])
  })

  it('should refuse a file that is not text', () => {
    const bin: CustomCodeFile = { name: 'logo.css', bytes: 3, content: null }
    expect(messages(validateCustomCode(files({ css: [bin], js: [{ ...bin, name: 'a.js' }], head: { ...bin, name: 'head.html' } })))).toEqual([
      '_syntext/logo.css: is not a text file',
      '_syntext/a.js: is not a text file',
      '_syntext/head.html: is not a text file',
    ])
  })

  it('should reject combined CSS over 50KB and accept exactly 50KB', () => {
    const half = 'a'.repeat(25600)
    expect(validateCustomCode(files({ css: [f('a.css', half), f('b.css', half)] }))).toEqual([])
    expect(messages(validateCustomCode(files({ css: [f('a.css', half), f('b.css', half + 'x'.repeat(11059))] })))).toEqual(['_syntext/*.css: combined CSS is 60.8KB; the limit is 50KB'])
  })

  it('should count UTF-8 bytes, not characters', () => {
    expect(validateCustomCode(files({ css: [f('a.css', '€'.repeat(17067))] }))).toHaveLength(1)
  })

  it('should reject a script over 10KB and </script> or </body> in a script', () => {
    expect(messages(validateCustomCode(files({ js: [f('big.js', 'x'.repeat(10241)), f('bad.js', 'document.write("</script>"); "</body>"'), f('ok.js', 'x'.repeat(10240))] })))).toEqual([
      '_syntext/big.js: script is 10.0KB; the limit is 10KB',
      '_syntext/bad.js: JavaScript must not contain </script>',
      '_syntext/bad.js: JavaScript must not contain </head> or </body>',
    ])
  })

  it('should reject more than 10 scripts', () => {
    const js = Array.from({ length: 11 }, (_, i) => f(`s${i}.js`, ''))
    expect(messages(validateCustomCode(files({ js })))).toEqual(['_syntext/*.js: 11 scripts; the limit is 10'])
    expect(validateCustomCode(files({ js: js.slice(0, 10) }))).toEqual([])
  })

  it('should reject head.html over 10KB and apply the head.html rules', () => {
    expect(messages(validateCustomCode(files({ head: f('head.html', '<base href="/">' + ' '.repeat(10240)) })))).toEqual([
      '_syntext/head.html: head.html is 10.0KB; the limit is 10KB',
      '_syntext/head.html: <base> is not allowed (head.html may contain only <meta>, <link>, <script>, <noscript> and <style>)',
    ])
  })

  it('should allow a plain script in head.html', () => {
    expect(validateCustomCode(files({ head: f('head.html', '<script>x()</script>') }))).toEqual([])
  })
})

describe('checkCustomCode', () => {
  const none = { css: [], js: [], head: null }

  it('should report nothing without a _syntext folder', async () => {
    expect(await checkCustomCode(root)).toEqual({ errors: [], warnings: [], paths: none })
  })

  it('should name files from the project root for docs/_syntext', async () => {
    await put('docs/_syntext/theme.css', '</style>')
    await put('docs/_syntext/app.js', 'x()')
    await put('docs/_syntext/head.html', '<meta name="a">')
    const r = await checkCustomCode(root)
    expect(r.errors).toEqual([{ file: 'docs/_syntext/theme.css', message: 'CSS must not contain </style>' }])
    expect(r.warnings).toEqual([])
    expect(r.paths).toEqual({ css: ['docs/_syntext/theme.css'], js: ['docs/_syntext/app.js'], head: 'docs/_syntext/head.html' })
  })

  it('should refuse a binary file read from disk', async () => {
    await writeFile(join(await mkdirp('_syntext'), 'x.js'), new Uint8Array([0xff, 0x00, 0x01]))
    expect((await checkCustomCode(root)).errors).toEqual([{ file: '_syntext/x.js', message: 'is not a text file' }])
  })

  it('should warn about an ignored root folder and validate only docs/_syntext', async () => {
    await put('docs/_syntext/theme.css', 'a{}')
    await put('_syntext/bad.css', '</style>')
    const r = await checkCustomCode(root)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([{ file: '_syntext/', message: 'ignored: docs/_syntext/ exists and takes precedence. Move these files into docs/_syntext/.' }])
    expect(r.paths.css).toEqual(['docs/_syntext/theme.css'])
  })
})

describe('hasRepoScripts', () => {
  it('should be false with only CSS', async () => {
    await put('docs/_syntext/theme.css')
    expect(hasRepoScripts(root)).toBe(false)
  })

  it('should be true with head.html in the folder the build uses', async () => {
    await put('docs/_syntext/head.html')
    expect(hasRepoScripts(root)).toBe(true)
  })

  it('should ignore scripts in an ignored root folder', async () => {
    await put('docs/_syntext/theme.css')
    await put('_syntext/app.js')
    expect(hasRepoScripts(root)).toBe(false)
  })
})

describe('collectRootCustomCodeFiles', () => {
  it('should collect root _syntext top-level files as _syntext/<name>', async () => {
    await put('_syntext/theme.css', 'a{}')
    await put('_syntext/head.html', '<meta>')
    await put('_syntext/readme.md', 'no')
    await put('_syntext/sub/x.css', 'no')
    const out = await collectRootCustomCodeFiles(root)
    expect(out.map((f) => f.path)).toEqual(['_syntext/head.html', '_syntext/theme.css'])
    expect(out[1].content.toString()).toBe('a{}')
  })

  it('should return nothing when there is no root folder', async () => {
    await put('docs/_syntext/theme.css')
    expect(await collectRootCustomCodeFiles(root)).toEqual([])
  })
})
