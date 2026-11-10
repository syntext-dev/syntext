import { describe, it, expect } from 'bun:test'
import { DASHBOARD_URL, apiKeysUrl, billingUrl, projectsUrl } from './dashboard-urls'

describe('dashboard-urls', () => {
  it('should point billing at the account billing page, not the legacy /settings/billing', () => {
    expect(billingUrl()).toBe('https://app.syntext.dev/billing')
  })

  it('should point the projects list at /projects', () => {
    expect(projectsUrl()).toBe('https://app.syntext.dev/projects')
  })

  it('should build the project API-keys settings URL', () => {
    expect(apiKeysUrl('proj_123')).toBe('https://app.syntext.dev/projects/proj_123/settings/api-keys')
  })

  it('should encode an unusual project id', () => {
    expect(apiKeysUrl('a/b c')).toBe(`${DASHBOARD_URL}/projects/a%2Fb%20c/settings/api-keys`)
  })
})
