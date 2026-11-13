// Copied from syntext-backend src/modules/deprecations/registry.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Every deprecated authoring form in Syntext: syntext.json keys and values,
 * page frontmatter keys, MDX tags and MDX props.
 *
 * Policy (doc engine v2, product owner 2026-11-12, implementation-backlog.md):
 * a deprecated form keeps working and the build warns, naming the file, the
 * line and the replacement. When a notice is recorded for a code (an email to
 * the owners of affected live sites plus a dashboard banner), a two-week
 * window starts; after it the old form stops working and the build fails with
 * the exact fix. Never a silent change in output.
 *
 * `rewrite` is machine-applicable: `stx migrate` and the GitHub app apply it.
 * The same table is published at `GET /v1/schema/deprecations.json` and in
 * `spec_docs/doc-engine-v2/deprecations.md`.
 */

export type DeprecationKind = 'config' | 'frontmatter' | 'mdx-tag' | 'mdx-prop'

export type Rewrite =
  /** Move a syntext.json value to another path (or several), mapping values when `values` is given. Skip a target that is already set. */
  | { type: 'move-key'; from: string; to: string[]; values?: Record<string, string | boolean> }
  /** Replace one value of a syntext.json key with another. */
  | { type: 'set-value'; path: string; from: string; to: string }
  /** Delete a syntext.json key that no longer does anything. */
  | { type: 'remove-key'; path: string }
  /** Rename the config file. */
  | { type: 'rename-file'; from: string; to: string }
  /** Rename a frontmatter key; skipped when the new key is already present. */
  | { type: 'rename-frontmatter-key'; from: string; to: string }
  /** Replace a boolean frontmatter key: `true` becomes `{to}: {value}` (unless `to` is set); `false` is removed. */
  | { type: 'frontmatter-flag-to-value'; from: string; to: string; value: string }
  /** Rename an MDX tag, opening and closing. */
  | { type: 'rename-tag'; from: string; to: string }
  /** Replace a generic tag whose kind is a prop with the named tag (`<Callout type="tip">` → `<Tip>`). */
  | { type: 'tag-from-prop'; tag: string; prop: string; map: Record<string, string> }
  /** Rename one prop on one MDX tag; skipped when the new prop is already present. */
  | { type: 'rename-prop'; tag: string; from: string; to: string }
  /** Needs a person: the build names the closest valid key. */
  | { type: 'manual'; hint: string }
  /**
   * Replace the generated docs home with the home components in the index page's body:
   * `homeToMdx` (services/v2/home-to-mdx.ts, GET /v1/schema/deprecations.json) writes them from
   * the page's `home` frontmatter, or from the preset's home when there is none, and drops `home`.
   * Needs the site's data (the CLI reads it from the last build: POST /v1/projects/:id/appearance/home/convert
   * with target "preview").
   */
  | { type: 'home-to-mdx'; file: 'index' }

export type Deprecation = {
  code: string
  kind: DeprecationKind
  /** The deprecated form, as an author writes it. */
  old: string
  /** What to write instead. */
  replacement: string
  rewrite: Rewrite
  /** Plain-words description of the rewrite, for build logs, emails and docs. */
  fix: string
  /**
   * The replacement lives in `appearance`, which only doc engine v2 renders.
   * A v1 site cannot follow it without switching renderers, so for v1 sites
   * the form stays a warning even after its window (see `deprecationState`).
   */
  requiresV2?: boolean
  /** Extra context for the docs and the changelog. */
  note?: string
  /**
   * After its window the form is ignored with a warning, never a build failure (the generated
   * home: a site without it still builds, it just shows its own content).
   */
  neverFails?: boolean
  /** The renderer writes the build warning itself (with the fixed cut-off date); the syntax pass only records the use. */
  reportedByRenderer?: boolean
}

const V2_NOTE = 'The appearance block applies when the site renders with doc engine v2; adding it opts the site in.'

const config = (code: string, old: string, replacement: string, rewrite: Rewrite, fix: string, extra: Partial<Deprecation> = {}): Deprecation =>
  ({ code: `config.${code}`, kind: 'config', old, replacement, rewrite, fix, ...extra })

const fm = (code: string, old: string, replacement: string, rewrite: Rewrite, fix: string, extra: Partial<Deprecation> = {}): Deprecation =>
  ({ code: `frontmatter.${code}`, kind: 'frontmatter', old, replacement, rewrite, fix, ...extra })

const tag = (code: string, old: string, replacement: string, rewrite: Rewrite, fix: string, extra: Partial<Deprecation> = {}): Deprecation =>
  ({ code: `mdx.${code}`, kind: 'mdx-tag', old, replacement, rewrite, fix, ...extra })

const prop = (code: string, tagName: string, from: string, to: string): Deprecation => ({
  code: `mdx.${code}`,
  kind: 'mdx-prop',
  old: `<${tagName} ${from}="…">`,
  replacement: `<${tagName} ${to}="…">`,
  rewrite: { type: 'rename-prop', tag: tagName, from, to },
  fix: `Rename the ${from} prop of <${tagName}> to ${to}.`,
})

export const DEPRECATIONS: readonly Deprecation[] = [
  // ── syntext.json: one home for the look (appearance) ────────────────────
  config('colors-primary', 'colors.primary', 'appearance.accent', { type: 'move-key', from: 'colors.primary', to: ['appearance.accent'] },
    'Move colors.primary to appearance.accent.', { requiresV2: true, note: `${V2_NOTE} v1 also painted parameter names with colors.primary; appearance.accent derives every accent token instead.` }),
  config('colors-accent', 'colors.accent', 'themeOverrides.colors.light.accent-strong and themeOverrides.colors.dark.accent-strong',
    { type: 'move-key', from: 'colors.accent', to: ['themeOverrides.colors.light.accent-strong', 'themeOverrides.colors.dark.accent-strong'] },
    'Move colors.accent to themeOverrides.colors.light.accent-strong and themeOverrides.colors.dark.accent-strong.'),
  config('colors-background', 'colors.background', 'themeOverrides.colors.light.bg-page and themeOverrides.colors.dark.bg-page',
    { type: 'move-key', from: 'colors.background', to: ['themeOverrides.colors.light.bg-page', 'themeOverrides.colors.dark.bg-page'] },
    'Move colors.background to themeOverrides.colors.light.bg-page and themeOverrides.colors.dark.bg-page.'),
  config('fonts-heading', 'fonts.heading', 'appearance.fonts.heading', { type: 'move-key', from: 'fonts.heading', to: ['appearance.fonts.heading'] },
    'Move fonts.heading to appearance.fonts.heading.', { requiresV2: true, note: V2_NOTE }),
  config('fonts-display', 'fonts.display', 'appearance.fonts.heading', { type: 'move-key', from: 'fonts.display', to: ['appearance.fonts.heading'] },
    'Move fonts.display to appearance.fonts.heading.', { requiresV2: true, note: V2_NOTE }),
  config('fonts-body', 'fonts.body', 'appearance.fonts.body', { type: 'move-key', from: 'fonts.body', to: ['appearance.fonts.body'] },
    'Move fonts.body to appearance.fonts.body.', { requiresV2: true, note: V2_NOTE }),
  config('fonts-mono', 'fonts.mono', 'appearance.fonts.mono', { type: 'move-key', from: 'fonts.mono', to: ['appearance.fonts.mono'] },
    'Move fonts.mono to appearance.fonts.mono.', { requiresV2: true, note: V2_NOTE }),
  config('features-navStyle', 'features.navStyle', 'appearance.layout.header ("split" → "tabs", "single" → "simple")',
    { type: 'move-key', from: 'features.navStyle', to: ['appearance.layout.header'], values: { split: 'tabs', single: 'simple' } },
    'Replace features.navStyle with appearance.layout.header: "split" becomes "tabs", "single" becomes "simple".', { requiresV2: true, note: V2_NOTE }),
  config('features-sidebarStyle', 'features.sidebarStyle', 'appearance.layout.nav ("collapsible" → "chevrons", "flat" → "plain")',
    { type: 'move-key', from: 'features.sidebarStyle', to: ['appearance.layout.nav'], values: { collapsible: 'chevrons', flat: 'plain' } },
    'Replace features.sidebarStyle with appearance.layout.nav: "collapsible" becomes "chevrons", "flat" becomes "plain".', { requiresV2: true, note: V2_NOTE }),
  config('features-codeBlockStyle', 'features.codeBlockStyle', 'appearance.components.code ("pill" → "dark", "panel" → "inset")',
    { type: 'move-key', from: 'features.codeBlockStyle', to: ['appearance.components.code'], values: { pill: 'dark', panel: 'inset' } },
    'Replace features.codeBlockStyle with appearance.components.code: "pill" becomes "dark", "panel" becomes "inset".', { requiresV2: true, note: V2_NOTE }),
  config('features-shellWidth', 'features.shellWidth', 'appearance.width', { type: 'move-key', from: 'features.shellWidth', to: ['appearance.width'] },
    'Move features.shellWidth to appearance.width (same values).', { requiresV2: true, note: V2_NOTE }),
  config('features-themeToggle', 'features.themeToggle', 'appearance.toggle', { type: 'move-key', from: 'features.themeToggle', to: ['appearance.toggle'] },
    'Move features.themeToggle to appearance.toggle.', { requiresV2: true, note: V2_NOTE }),
  config('layout-nav-collapsible', 'appearance.layout.nav: "collapsible"', 'appearance.layout.nav: "chevrons"',
    { type: 'set-value', path: 'appearance.layout.nav', from: 'collapsible', to: 'chevrons' },
    'Change appearance.layout.nav from "collapsible" to "chevrons" (folding is appearance.layout.groups in every preset).'),
  config('layout-home', 'appearance.layout.home', 'nothing (the home blocks follow the preset)', { type: 'remove-key', path: 'appearance.layout.home' },
    'Delete appearance.layout.home; from 27 November 2026 the home blocks follow the preset.', { requiresV2: true, neverFails: true, reportedByRenderer: true, note: 'Also read from project settings and organization themes; there too it is ignored with a warning after the cut-off, never an error.' }),
  config('features-codeLanguageTabs', 'features.codeLanguageTabs', 'nothing (use features.codeLanguageSelector)', { type: 'remove-key', path: 'features.codeLanguageTabs' },
    'Delete features.codeLanguageTabs; it never changed anything. features.codeLanguageSelector picks the control.'),
  config('features-parameterStyle', 'features.parameterStyle', 'nothing', { type: 'remove-key', path: 'features.parameterStyle' },
    'Delete features.parameterStyle; it never changed anything.'),

  // ── syntext.json: one name per concept ──────────────────────────────────
  config('language', 'language', 'locale', { type: 'move-key', from: 'language', to: ['locale'] }, 'Rename language to locale.'),
  config('og-image', 'ogImage (top level)', 'seo.ogImage', { type: 'move-key', from: 'ogImage', to: ['seo.ogImage'] }, 'Move the top-level ogImage to seo.ogImage.'),
  config('redirect-source', 'redirects[].source', 'redirects[].from', { type: 'move-key', from: 'redirects[].source', to: ['redirects[].from'] }, 'Rename source to from in each redirect.'),
  config('redirect-destination', 'redirects[].destination', 'redirects[].to', { type: 'move-key', from: 'redirects[].destination', to: ['redirects[].to'] }, 'Rename destination to to in each redirect.'),
  config('i18n-source-locale', 'i18n.sourceLocale', 'i18n.defaultLocale', { type: 'move-key', from: 'i18n.sourceLocale', to: ['i18n.defaultLocale'] }, 'Rename i18n.sourceLocale to i18n.defaultLocale.'),
  config('i18n-locale', 'i18n.locale', 'i18n.defaultLocale', { type: 'move-key', from: 'i18n.locale', to: ['i18n.defaultLocale'] }, 'Rename i18n.locale to i18n.defaultLocale.'),
  config('i18n-target-locales', 'i18n.targetLocales', 'i18n.locales', { type: 'move-key', from: 'i18n.targetLocales', to: ['i18n.locales'] }, 'Rename i18n.targetLocales to i18n.locales.'),
  config('file-name', 'syntext.config.json', 'syntext.json', { type: 'rename-file', from: 'syntext.config.json', to: 'syntext.json' }, 'Rename syntext.config.json to syntext.json.'),
  config('unknown-key', 'a key syntext.json does not define', 'the closest valid key, or nothing',
    { type: 'manual', hint: 'Rename the key to the suggestion in the message, or delete it.' }, 'Rename the key to the suggested one, or delete it.'),

  // ── Frontmatter ─────────────────────────────────────────────────────────
  fm('noIndex', 'noIndex', 'noindex', { type: 'rename-frontmatter-key', from: 'noIndex', to: 'noindex' }, 'Rename noIndex to noindex.'),
  fm('fullWidth', 'fullWidth: true', 'layout: full-width', { type: 'frontmatter-flag-to-value', from: 'fullWidth', to: 'layout', value: 'full-width' },
    'Replace fullWidth: true with layout: full-width (delete fullWidth: false).'),
  fm('home', 'home (index page frontmatter)', 'the home components in index.mdx (<Hero title>, <SectionCards>, <LatestUpdates>…)',
    { type: 'home-to-mdx', file: 'index' },
    'Convert the generated home to components: Appearance › Convert home to content, or `stx migrate`. The generated home stops on 27 November 2026.',
    { requiresV2: true, neverFails: true, reportedByRenderer: true, note: 'home-as-content.md. `home: false` is not deprecated: it opts the index in to showing its own content.' }),
  fm('implicit-home', 'an index page that shows the generated docs home (no home frontmatter)', 'the home components in index.mdx, or home: false',
    { type: 'home-to-mdx', file: 'index' },
    'Convert the generated home to components (Appearance › Convert home to content, or `stx migrate`), or add home: false to show only the page. The generated home stops on 27 November 2026.',
    { requiresV2: true, neverFails: true, reportedByRenderer: true, note: 'Doc engine v2 index pages without `home` frontmatter that do not use the home components yet.' }),
  fm('unknown-key', 'a frontmatter key Syntext does not read', 'the closest valid key, or nothing',
    { type: 'manual', hint: 'Rename the key to the suggestion in the message, or delete it.' }, 'Rename the key to the suggested one, or delete it.'),

  // ── MDX tags ────────────────────────────────────────────────────────────
  tag('caution', '<Caution>', '<Warning>', { type: 'rename-tag', from: 'Caution', to: 'Warning' }, 'Rename <Caution> to <Warning>; they always rendered the same.'),
  tag('callout-type', '<Callout type="…">', '<Note>, <Info>, <Tip>, <Warning> or <Danger>',
    { type: 'tag-from-prop', tag: 'Callout', prop: 'type', map: { note: 'Note', info: 'Info', tip: 'Tip', warning: 'Warning', caution: 'Warning', danger: 'Danger' } },
    'Replace <Callout type="X"> with the named callout, e.g. <Callout type="tip"> becomes <Tip>.',
    { note: 'v1 rendered <Callout> as an unstyled box. It now renders as the named callout its type selects; an unknown type stays unstyled.' }),

  // ── MDX props ───────────────────────────────────────────────────────────
  prop('update-label', 'Update', 'label', 'title'),
  prop('endpoint-url', 'Endpoint', 'url', 'path'),
  prop('searchbar-hint', 'SearchBar', 'hint', 'kbd'),
  prop('playground-base-url', 'Playground', 'base-url', 'baseUrl'),
  prop('playground-auth-label', 'Playground', 'auth-label', 'authLabel'),
  prop('playground-key-label', 'Playground', 'key-label', 'keyLabel'),
]

const BY_CODE = new Map(DEPRECATIONS.map((d) => [d.code, d]))

export function findDeprecation(code: string): Deprecation | undefined {
  return BY_CODE.get(code)
}

export const DEPRECATION_CODES = DEPRECATIONS.map((d) => d.code)
