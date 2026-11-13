/**
 * The page background (`--surface`) the v2 renderer draws for each preset and
 * mode, which the accent contrast check measures against. Copied from
 * syntext-backend `services/v2/tokens.ts` `presetVars(preset, mode)['--surface']`
 * (generated from the preset palettes); src/syntax/sync.test.ts compares them.
 */
import type { PresetName } from './presets'

export const PRESET_SURFACES: Readonly<Record<PresetName, { light: string; dark: string }>> = {
  workbench: { light: '#FFFFFF', dark: '#0B0B0D' },
  paper: { light: '#FFFFFF', dark: '#1C1A18' },
  console: { light: '#FAFBFA', dark: '#0A0C0B' },
  atlas: { light: '#FFFFFF', dark: '#111A25' },
  plain: { light: '#FFFFFF', dark: '#121110' },
  orbit: { light: '#FFFFFF', dark: '#10121A' },
  grid: { light: '#FFFFFF', dark: '#0A0A0A' },
  margin: { light: '#FCFCFB', dark: '#0F1012' },
}

/** As the backend's `appearanceContrast`: the preset surface, else white or black. */
export function pageBackground(preset: string, mode: 'light' | 'dark'): string {
  const s = (PRESET_SURFACES as Record<string, { light: string; dark: string } | undefined>)[preset]
  return s?.[mode] ?? (mode === 'dark' ? '#000000' : '#FFFFFF')
}
