// Copied from syntext-backend src/modules/appearance/presets.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The eight v2 layout presets. A preset is the starting value of every
 * appearance field; `appearance` in syntext.json overrides any of them.
 *
 * Values mirror `spec_docs/doc-engine-v2/presets/tokens.py`, the generator the
 * approved Figma designs were built from. Keep the two in step.
 */
import type { ComponentValues, LayoutValues, Mode, Radius, Size } from './values'

export type PresetName = 'workbench' | 'paper' | 'console' | 'atlas' | 'plain' | 'orbit' | 'grid' | 'margin'

export type PresetDefaults = {
  label: string
  fonts: { heading: string; body: string; mono: string }
  size: Size
  radius: Radius
  accent: string
  mode: Mode
  layout: LayoutValues
  components: ComponentValues
}

type Shell = [LayoutValues['shell'], LayoutValues['header'], LayoutValues['nav'], LayoutValues['toc']]
type Blocks = [ComponentValues['callout'], ComponentValues['steps'], ComponentValues['code'], ComponentValues['cards'], ComponentValues['tabs'], ComponentValues['api']]

function preset(label: string, font: string, mono: string, size: Size, radius: Radius, accent: string, mode: Mode, shell: Shell, blocks: Blocks): PresetDefaults {
  const [s, header, nav, toc] = shell
  const [callout, steps, code, cards, tabs, api] = blocks
  return {
    label,
    fonts: { heading: font, body: font, mono },
    size,
    radius,
    accent,
    mode,
    // The home follows the preset: its own header value (layout.home).
    layout: { shell: s, header, home: header, nav, toc, groups: 'collapsible' },
    components: { callout, steps, code, cards, tabs, api },
  }
}

export const V2_PRESETS: Readonly<Record<PresetName, PresetDefaults>> = {
  workbench: preset('Workbench', 'Geist', 'Geist Mono', 15, 'medium', '#E4512B', 'light',
    ['bordered', 'command', 'tree', 'progress'], ['labelcol', 'rail', 'dark', 'bordered', 'underline', 'spec']),
  paper: preset('Paper', 'Figtree', 'IBM Plex Mono', 16, 'large', '#0E7A63', 'light',
    ['sheet', 'pill', 'pills', 'pills'], ['tag', 'cards', 'light', 'tile', 'pill', 'card']),
  console: preset('Console', 'IBM Plex Sans', 'JetBrains Mono', 15, 'small', '#3DDC97', 'dark',
    ['bordered', 'tabs', 'mono', 'dots'], ['strip', 'prompt', 'inset', 'outline', 'mono', 'term']),
  atlas: preset('Atlas', 'Public Sans', 'Roboto Mono', 16, 'small', '#2457D6', 'light',
    ['enterprise', 'mega', 'chevrons', 'rule'], ['box', 'procedure', 'navy', 'accent', 'boxed', 'boxed']),
  plain: preset('Plain', 'Hanken Grotesk', 'Fira Code', 16, 'small', '#6D28D9', 'light',
    ['minimal', 'simple', 'plain', 'plain'], ['soft', 'list', 'plain', 'plain', 'text', 'plain']),
  orbit: preset('Orbit', 'Manrope', 'DM Mono', 16, 'large', '#4F46E5', 'light',
    ['floating', 'island', 'dock', 'float'], ['float', 'stack', 'float', 'bento', 'segment', 'split']),
  grid: preset('Grid', 'Inter Tight', 'IBM Plex Mono', 16, 'none', '#E11D48', 'light',
    ['grid', 'index', 'chapters', 'ruler'], ['cell', 'cells', 'cell', 'cell', 'cells', 'grid']),
  margin: preset('Margin', 'Instrument Sans', 'Red Hat Mono', 17, 'medium', '#0E7490', 'light',
    ['focus', 'path', 'overlay', 'ticks'], ['sidenote', 'margin', 'bleed', 'rows', 'text', 'stacked']),
}

export const PRESET_NAMES = Object.keys(V2_PRESETS) as PresetName[]
export const DEFAULT_V2_PRESET: PresetName = 'workbench'

/**
 * Ends the build log line of every build that rendered with v2
 * ("Appearance: paper preset (doc engine v2)"). services/v2-preview reads it
 * to tell a site already on v2 from a v1 one without reading its repository.
 */
export const V2_BUILD_LOG_MARKER = '(doc engine v2)'

export const isPresetName = (v: string): v is PresetName => Object.prototype.hasOwnProperty.call(V2_PRESETS, v)

/**
 * v1 theme names keep building, mapped onto a v2 preset plus the appearance
 * values that reproduce their look (customization.md, "theme values from v1").
 */
export const LEGACY_THEMES: Readonly<Record<string, { preset: PresetName; appearance: Record<string, unknown> }>> = {
  default: { preset: 'workbench', appearance: {} },
  gravv: { preset: 'workbench', appearance: { accent: '#077155', layout: { header: 'tabs' }, components: { code: 'inset' } } },
}
