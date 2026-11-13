// Copied from syntext-backend src/modules/appearance/values.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Allowed values for every appearance switch (doc engine v2).
 *
 * Any switch combines with any preset. Values come from the preset generator
 * (`spec_docs/doc-engine-v2/presets/README.md`); a value added here must also
 * get CSS in the renderer before it ships.
 */

export const LAYOUT_SWITCHES = {
  shell: ['bordered', 'sheet', 'enterprise', 'minimal', 'floating', 'grid', 'focus'],
  header: ['command', 'pill', 'tabs', 'mega', 'simple', 'island', 'index', 'path'],
  nav: ['tree', 'pills', 'mono', 'chevrons', 'plain', 'dock', 'chapters', 'overlay'],
  toc: ['progress', 'pills', 'dots', 'rule', 'plain', 'float', 'ruler', 'ticks'],
  groups: ['collapsible', 'open'],
} as const

export const COMPONENT_SWITCHES = {
  callout: ['labelcol', 'tag', 'strip', 'box', 'soft', 'float', 'cell', 'sidenote'],
  steps: ['rail', 'cards', 'prompt', 'procedure', 'list', 'stack', 'cells', 'margin'],
  code: ['dark', 'light', 'inset', 'navy', 'plain', 'float', 'cell', 'bleed'],
  cards: ['bordered', 'tile', 'outline', 'accent', 'plain', 'bento', 'cell', 'rows'],
  tabs: ['underline', 'pill', 'mono', 'boxed', 'text', 'segment', 'cells'],
  api: ['spec', 'card', 'term', 'boxed', 'plain', 'split', 'grid', 'stacked'],
} as const

export type LayoutKey = keyof typeof LAYOUT_SWITCHES
export type ComponentKey = keyof typeof COMPONENT_SWITCHES
export type LayoutValues = { [K in LayoutKey]: (typeof LAYOUT_SWITCHES)[K][number] }
export type ComponentValues = { [K in ComponentKey]: (typeof COMPONENT_SWITCHES)[K][number] }

export const MODES = ['light', 'dark', 'system'] as const
export const DENSITIES = ['comfortable', 'compact'] as const
export const RADII = ['none', 'small', 'medium', 'large'] as const
export const WIDTHS = ['contained', 'full'] as const
export const SIZES = [15, 16, 17] as const

export type Mode = (typeof MODES)[number]
export type Density = (typeof DENSITIES)[number]
export type Radius = (typeof RADII)[number]
export type Width = (typeof WIDTHS)[number]
export type Size = (typeof SIZES)[number]

/**
 * Old or alternative spellings, normalised to the canonical value.
 * `nav: "collapsible"` was Atlas's chevron tree before folding existed in
 * every preset (`layout.groups`); it keeps working as `chevrons`.
 */
export const VALUE_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'layout.nav': { collapsible: 'chevrons' },
}

export const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
