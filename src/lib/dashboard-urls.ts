/** Links into the Syntext dashboard (Dashboard 2.0 routes in apps/web). */
export const DASHBOARD_URL = 'https://syntext.dev'

/** Plans and invoices for the workspace. */
export function billingUrl(): string {
  return `${DASHBOARD_URL}/billing`
}

/** The projects list. API keys live under each project's Settings → API keys. */
export function projectsUrl(): string {
  return `${DASHBOARD_URL}/projects`
}

/** A project's Settings → API keys page. */
export function apiKeysUrl(projectId: string): string {
  return `${DASHBOARD_URL}/projects/${encodeURIComponent(projectId)}/settings/api-keys`
}
