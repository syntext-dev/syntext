import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const TAGLINE = 'Write, preview and publish Syntext docs from your terminal'

function help(): string {
  const res = Bun.spawnSync(['bun', join(import.meta.dir, 'index.ts'), '--help'], { cwd: ROOT })
  expect(res.exitCode).toBe(0)
  return res.stdout.toString()
}

describe('stx', () => {
  it('should describe itself with the product line in --help', () => {
    expect(help()).toContain(`${TAGLINE}.`)
  })

  it('should report the same version as package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string }
    const res = Bun.spawnSync(['bun', join(import.meta.dir, 'index.ts'), '--version'], { cwd: ROOT })
    expect(res.stdout.toString().trim()).toBe(pkg.version)
  })

  it('should give the Homebrew formula the same line, within brew audit rules', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf-8')
    const desc = workflow.match(/desc "([^"]*)"/)?.[1]
    expect(desc).toBe(TAGLINE)
    // brew audit: at most 80 characters, no leading article, no trailing period, not the formula name.
    expect(desc!.length).toBeLessThanOrEqual(80)
    expect(desc).not.toMatch(/^(a|an|the)\b/i)
    expect(desc).not.toMatch(/\.$/)
    expect(desc).not.toMatch(/^stx\b/i)
  })
})
