/**
 * Freshness check for the doc engine v2 syntax modules the CLI copies from
 * syntext-backend (duplication over coupling: the CLI ships as one binary).
 *
 * The copies live in src/syntax and src/appearance (plus migrate-syntax/home-to-mdx.ts
 * and lib/starter-index.ts); each starts with a
 * "Copied from syntext-backend …" line. Point SYNTEXT_BACKEND_DIR at a backend
 * checkout (a `:`-separated list of roots, searched in order) and this test
 * fails when a copy has drifted:
 *
 *   SYNTEXT_BACKEND_DIR=../backend bun run test:sync
 *
 * Without it (CI, or a backend branch that is behind) the comparisons skip.
 *
 * To re-sync: copy the backend file over the CLI one, keep the header line,
 * and re-apply the import rewrites listed in PAIRS. For
 * fixtures/validate-golden.json, run this test with SYNTEXT_SYNC_WRITE=1 from
 * a machine where the backend's dependencies are installed.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import golden from './fixtures/validate-golden.json'
import { PRESET_SURFACES } from '../appearance/surfaces'

const CLI_SRC = resolve(import.meta.dir, '..')
const roots = (process.env.SYNTEXT_BACKEND_DIR ?? '').split(':').filter(Boolean).map((r) => resolve(r))

/** The first backend root that has `rel`, as an absolute path. */
function backendFile(rel: string): string | undefined {
  return roots.map((r) => join(r, rel)).find((p) => existsSync(p))
}

type Pair = { cli: string; backend: string; imports?: Array<[cliImport: string, backendImport: string]> }

const M = 'src/modules'
const PAIRS: Pair[] = [
  { cli: 'syntax/suggest.ts', backend: `${M}/appearance/suggest.ts` },
  { cli: 'syntax/fences.ts', backend: `${M}/compiler/fences.ts` },
  { cli: 'syntax/locate.ts', backend: `${M}/deprecations/locate.ts` },
  { cli: 'syntax/mdx-tags.ts', backend: `${M}/deprecations/mdx-tags.ts`, imports: [["'./fences'", "'../compiler/fences'"]] },
  { cli: 'syntax/home-cutoff.ts', backend: `${M}/deprecations/home-cutoff.ts` },
  { cli: 'syntax/registry.ts', backend: `${M}/deprecations/registry.ts` },
  { cli: 'syntax/state.ts', backend: `${M}/deprecations/state.ts` },
  { cli: 'syntax/usage.ts', backend: `${M}/deprecations/usage.ts` },
  { cli: 'syntax/table.ts', backend: `${M}/deprecations/table.ts` },
  { cli: 'syntax/scan-config.ts', backend: `${M}/deprecations/scan-config.ts`, imports: [["'./validate'", "'../site-config/validate'"]] },
  { cli: 'syntax/scan-page.ts', backend: `${M}/deprecations/scan-page.ts`, imports: [["'./frontmatter'", "'../site-config/frontmatter'"]] },
  { cli: 'syntax/parse.ts', backend: `${M}/site-config/parse.ts` },
  { cli: 'syntax/frontmatter-keys.ts', backend: `${M}/catalogue/frontmatter.ts`, imports: [["'./home-cutoff'", "'../deprecations/home-cutoff'"]] },
  {
    cli: 'syntax/frontmatter.ts',
    backend: `${M}/site-config/frontmatter.ts`,
    imports: [["'./frontmatter-keys'", "'../catalogue/frontmatter'"], ["'./suggest'", "'../appearance/suggest'"], ["'./locate'", "'../deprecations/locate'"]],
  },
  { cli: 'appearance/values.ts', backend: `${M}/appearance/values.ts` },
  { cli: 'appearance/presets.ts', backend: `${M}/appearance/presets.ts` },
  { cli: 'appearance/resolve.ts', backend: `${M}/appearance/resolve.ts`, imports: [["'../syntax/suggest'", "'./suggest'"], ["'../syntax/home-cutoff'", "'../deprecations/home-cutoff'"]] },
  { cli: 'appearance/colour.ts', backend: `${M}/appearance/colour.ts` },
  { cli: 'appearance/contrast.ts', backend: `${M}/appearance/contrast.ts`, imports: [["'./wcag'", "'../theme/contrast'"]] },
  { cli: 'appearance/org-theme-ref.ts', backend: `${M}/appearance/org-theme-ref.ts` },
  { cli: 'appearance/wcag.ts', backend: `${M}/theme/contrast.ts` },
  { cli: 'migrate-syntax/home-to-mdx.ts', backend: 'src/services/v2/home-to-mdx.ts' },
  { cli: 'migrate-syntax/home-to-mdx.test.ts', backend: 'src/services/v2/home-to-mdx.test.ts' },
  { cli: 'lib/starter-index.ts', backend: 'src/services/v2/starter-index.ts' },
]

function normalizedCopy(pair: Pair): string {
  const lines = readFileSync(join(CLI_SRC, pair.cli), 'utf-8').split('\n')
  if (!lines[0].startsWith('// Copied from syntext-backend')) throw new Error(`${pair.cli} lost its "Copied from syntext-backend" header`)
  let text = lines.slice(1).join('\n')
  for (const [mine, theirs] of pair.imports ?? []) text = text.split(mine).join(theirs)
  return text
}

describe('backend copies', () => {
  it('should keep the provenance header on every copy', () => {
    for (const pair of PAIRS) expect(() => normalizedCopy(pair)).not.toThrow()
  })

  for (const pair of PAIRS) {
    const file = backendFile(pair.backend)
    it.skipIf(!file)(`should match ${pair.backend}`, () => {
      expect(normalizedCopy(pair)).toBe(readFileSync(file as string, 'utf-8'))
    })
  }

  const schema = backendFile(`${M}/site-config/syntext.schema.json`)
  it.skipIf(!schema)('should bundle the same syntext.schema.json', () => {
    expect(readFileSync(join(CLI_SRC, 'syntax/syntext.schema.json'), 'utf-8')).toBe(readFileSync(schema as string, 'utf-8'))
  })

  const tokens = backendFile('src/services/v2/tokens.ts')
  it.skipIf(!tokens)('should use the page colours the v2 renderer draws', async () => {
    const { presetVars } = (await import(tokens as string)) as { presetVars: (p: string, m: 'light' | 'dark') => Record<string, string> }
    for (const [preset, s] of Object.entries(PRESET_SURFACES)) {
      expect({ light: presetVars(preset, 'light')['--surface'], dark: presetVars(preset, 'dark')['--surface'] }).toEqual(s)
    }
  })

  const validate = backendFile(`${M}/site-config/validate.ts`)
  it.skipIf(!validate)('should hold the backend validator output in validate-golden.json', async () => {
    let mod: { validateSiteConfig: (c: unknown) => unknown[] }
    try {
      mod = await import(validate as string)
    } catch {
      return // The backend's dependencies (zod) are not installed in that checkout.
    }
    const fresh = (golden as Array<{ name: string; config: unknown }>).map(({ name, config }) => ({ name, config, issues: mod.validateSiteConfig(config) }))
    if (process.env.SYNTEXT_SYNC_WRITE === '1') writeFileSync(join(import.meta.dir, 'fixtures/validate-golden.json'), `${JSON.stringify(fresh, null, 2)}\n`)
    expect(fresh).toEqual(golden as never)
  })
})
