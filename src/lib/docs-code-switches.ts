/**
 * The three dashboard switches for custom code from your docs
 * (Integrations › Custom code), and the `stx check` warnings they decide:
 *
 * | switch    | label                    | default | covers                       |
 * | `css`     | CSS from your docs       | on      | `_syntext/*.css`, page `css:` |
 * | `head`    | Head tags from your docs | off     | `_syntext/head.html`          |
 * | `scripts` | Scripts from your docs   | off     | `_syntext/*.js`               |
 *
 * Off means the files are ignored, not deleted. Previews never apply
 * head.html or scripts, even when on; CSS still applies.
 *
 * When the project is linked, `stx check` reads the switches; any failure
 * falls back to the generic warnings, quietly.
 */
import { apiFetch } from './api'

export type DocsCodeSwitches = { css: boolean; head: boolean; scripts: boolean }
export type SwitchIssue = { file: string; message: string }

export const SWITCH_LABELS: Record<keyof DocsCodeSwitches, string> = {
  css: 'CSS from your docs',
  head: 'Head tags from your docs',
  scripts: 'Scripts from your docs',
}

const WHERE = 'Integrations › Custom code'

/** `_syntext/app.js runs only when "Scripts from your docs" is on in Integrations › Custom code (off by default), and never on previews`. */
export function runsOnlyWhenOn(name: string, which: 'head' | 'scripts'): string {
  return `_syntext/${name} runs only when "${SWITCH_LABELS[which]}" is on in ${WHERE} (off by default), and never on previews`
}

/** `_syntext/app.js is skipped: "Scripts from your docs" is off in Integrations › Custom code`. */
export function skippedWhenOff(subject: string, which: keyof DocsCodeSwitches): string {
  return `${subject} is skipped: "${SWITCH_LABELS[which]}" is off in ${WHERE}`
}

export type DocsCodeFiles = {
  /** Paths from the project root (`docs/_syntext/theme.css`), by kind. */
  css: string[]
  js: string[]
  head: string | null
  /** Pages with a valid `css:` value: the page path and the value. */
  pageCss: Array<{ file: string; value: string }>
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/**
 * The warnings for the files present. Without switches (not linked, or the
 * request failed): each head.html / `*.js` gets the generic warning. With
 * switches: a file under a switch that is off is reported as skipped; a
 * switch that is on says nothing.
 */
export function docsCodeWarnings(files: DocsCodeFiles, switches: DocsCodeSwitches | null): SwitchIssue[] {
  const out: SwitchIssue[] = []
  const gated: Array<{ path: string; which: 'head' | 'scripts' }> = [
    ...(files.head ? [{ path: files.head, which: 'head' as const }] : []),
    ...files.js.map((path) => ({ path, which: 'scripts' as const })),
  ]
  if (!switches) {
    for (const g of gated) out.push({ file: g.path, message: runsOnlyWhenOn(baseName(g.path), g.which) })
    return out
  }
  if (!switches.css) {
    for (const path of files.css) out.push({ file: path, message: skippedWhenOff(`_syntext/${baseName(path)}`, 'css') })
    for (const p of files.pageCss) out.push({ file: p.file, message: skippedWhenOff(`css "${p.value}"`, 'css') })
  }
  for (const g of gated) {
    if (!switches[g.which]) out.push({ file: g.path, message: skippedWhenOff(`_syntext/${baseName(g.path)}`, g.which) })
  }
  return out
}

export type SwitchDeps = { fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>; timeoutMs?: number }

/**
 * Read the switches from `GET /v1/projects/:id/custom-scripts`
 * (`data.docsCode`). Null on any failure: network, status, shape or a
 * revoked session (stored credentials are left alone).
 */
export async function fetchDocsCodeSwitches(apiUrl: string, projectId: string, token: string, deps: SwitchDeps = {}): Promise<DocsCodeSwitches | null> {
  try {
    const res = await apiFetch(
      `${apiUrl}/v1/projects/${encodeURIComponent(projectId)}/custom-scripts`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(deps.timeoutMs ?? 3000) },
      { fetchImpl: deps.fetchImpl, clearCredentials: async () => {} },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { data?: { docsCode?: Partial<Record<keyof DocsCodeSwitches, unknown>> } }
    const d = body.data?.docsCode
    if (!d || typeof d.css !== 'boolean' || typeof d.head !== 'boolean' || typeof d.scripts !== 'boolean') return null
    return { css: d.css, head: d.head, scripts: d.scripts }
  } catch {
    return null
  }
}
