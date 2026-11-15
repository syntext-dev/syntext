import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pageCssValue, resolvePageCss, validatePageCss } from './page-css'

describe('resolvePageCss', () => {
  it('should resolve paths relative to the page folder', () => {
    expect(resolvePageCss('./pricing.css', 'guides/pricing.mdx')).toEqual({ path: 'guides/pricing.css' })
    expect(resolvePageCss('pricing.css', 'guides/pricing.mdx')).toEqual({ path: 'guides/pricing.css' })
    expect(resolvePageCss('../shared/x.css', 'guides/pricing.mdx')).toEqual({ path: 'shared/x.css' })
    expect(resolvePageCss('./x.css', 'index.mdx')).toEqual({ path: 'x.css' })
  })

  it('should resolve a leading / from the docs root', () => {
    expect(resolvePageCss('/styles/pricing.css', 'guides/deep/page.mdx')).toEqual({ path: 'styles/pricing.css' })
  })

  it('should accept an upper-case .CSS extension', () => {
    expect(resolvePageCss('./X.CSS', 'a.mdx')).toEqual({ path: 'X.CSS' })
  })

  it('should reject non-strings and empty values', () => {
    expect(resolvePageCss(42, 'a.mdx')).toEqual({ reason: 'must be a path to a .css file' })
    expect(resolvePageCss(['a.css'], 'a.mdx')).toEqual({ reason: 'must be a path to a .css file' })
    expect(resolvePageCss('  ', 'a.mdx')).toEqual({ reason: 'must not be empty' })
  })

  it('should reject URLs and scheme prefixes', () => {
    const url = { reason: 'must be a path to a .css file in the docs folder, not a URL' }
    expect(resolvePageCss('https://cdn.example.com/x.css', 'a.mdx')).toEqual(url)
    expect(resolvePageCss('//cdn.example.com/x.css', 'a.mdx')).toEqual(url)
    expect(resolvePageCss('data:text/css,a.css', 'a.mdx')).toEqual(url)
    expect(resolvePageCss('javascript:x.css', 'a.mdx')).toEqual(url)
  })

  it('should reject backslashes and other file types', () => {
    expect(resolvePageCss('.\\x.css', 'a.mdx')).toEqual({ reason: 'must use forward slashes, not backslashes' })
    expect(resolvePageCss('./x.js', 'a.mdx')).toEqual({ reason: 'must point to a .css file' })
    expect(resolvePageCss('./x.css.map', 'a.mdx')).toEqual({ reason: 'must point to a .css file' })
  })

  it('should reject paths that escape the docs folder', () => {
    const out = { reason: 'points outside the docs folder' }
    expect(resolvePageCss('../x.css', 'a.mdx')).toEqual(out)
    expect(resolvePageCss('../../x.css', 'guides/a.mdx')).toEqual(out)
    expect(resolvePageCss('/../x.css', 'a.mdx')).toEqual(out)
  })
})

describe('pageCssValue', () => {
  it('should read the css key from frontmatter', () => {
    expect(pageCssValue('---\ntitle: A\ncss: ./a.css\n---\n# A')).toBe('./a.css')
  })

  it('should be undefined without frontmatter, without the key or with broken YAML', () => {
    expect(pageCssValue('# A')).toBeUndefined()
    expect(pageCssValue('---\ntitle: A\n---\n')).toBeUndefined()
    expect(pageCssValue('---\ntitle: [\n---\n')).toBeUndefined()
  })
})

describe('validatePageCss', () => {
  let docs: string

  beforeEach(async () => {
    docs = await mkdtemp(join(tmpdir(), 'stx-page-css-'))
    await mkdir(join(docs, 'guides'), { recursive: true })
    await mkdir(join(docs, 'styles'), { recursive: true })
  })

  afterEach(async () => {
    await rm(docs, { recursive: true, force: true })
  })

  const page = (css: string) => `---\ntitle: Pricing\ncss: ${css}\n---\n# Pricing`

  it('should pass a page without css', () => {
    expect(validatePageCss('---\ntitle: A\n---\n', 'a.mdx', docs)).toBeNull()
  })

  it('should pass an existing small stylesheet', async () => {
    await writeFile(join(docs, 'guides/pricing.css'), '.price{color:red}')
    await writeFile(join(docs, 'styles/shared.css'), 'a{}')
    expect(validatePageCss(page('./pricing.css'), 'guides/pricing.mdx', docs)).toBeNull()
    expect(validatePageCss(page('/styles/shared.css'), 'guides/pricing.mdx', docs)).toBeNull()
  })

  it('should report a missing file with the value and the resolved path', () => {
    expect(validatePageCss(page('./nope.css'), 'guides/pricing.mdx', docs)).toBe('css "./nope.css": file not found (guides/nope.css in the docs folder)')
  })

  it('should report a folder named like a stylesheet as not found', async () => {
    await mkdir(join(docs, 'dir.css'))
    expect(validatePageCss(page('/dir.css'), 'a.mdx', docs)).toContain('file not found')
  })

  it('should report a file over 50KB', async () => {
    await writeFile(join(docs, 'big.css'), 'a'.repeat(51201))
    expect(validatePageCss(page('/big.css'), 'a.mdx', docs)).toBe('css "/big.css": the file is 50.0KB; the limit is 50KB')
  })

  it('should report forbidden content', async () => {
    await writeFile(join(docs, 'bad.css'), 'a{} </style><script>')
    expect(validatePageCss(page('/bad.css'), 'a.mdx', docs)).toBe('css "/bad.css": CSS must not contain </style>')
  })

  it('should report a rejected value with the value shown', () => {
    expect(validatePageCss(page('https://x.dev/a.css'), 'a.mdx', docs)).toBe('css "https://x.dev/a.css" must be a path to a .css file in the docs folder, not a URL')
    expect(validatePageCss(page('42'), 'a.mdx', docs)).toBe('css 42 must be a path to a .css file')
    expect(validatePageCss(page('""'), 'a.mdx', docs)).toBe('css "" must not be empty')
  })
})

describe('validatePageCss content rules', () => {
  let docs: string

  beforeEach(async () => {
    docs = await mkdtemp(join(tmpdir(), 'stx-page-css-rules-'))
  })

  afterEach(async () => {
    await rm(docs, { recursive: true, force: true })
  })

  it('should apply the CSS rules to the page stylesheet', async () => {
    await writeFile(join(docs, 'a.css'), 'a{background:url(http://x/a.png)}')
    expect(validatePageCss('---\ncss: ./a.css\n---\n', 'p.mdx', docs)).toBe('css "./a.css": CSS may load only https:// URLs (found "http://x/a.png")')
  })

  it('should refuse a stylesheet that is not text', async () => {
    await writeFile(join(docs, 'a.css'), new Uint8Array([0x61, 0x00]))
    expect(validatePageCss('---\ncss: ./a.css\n---\n', 'p.mdx', docs)).toBe('css "./a.css": a.css is not a text file')
  })
})
