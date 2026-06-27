import { join } from 'node:path'

const CONFIG_NAMES = ['syntext.json', 'syntext.yaml', 'syntext.yml', 'stx.json', 'stx.yaml', 'stx.yml']

/**
 * Resolve the documentation source root directory.
 * Checks for `.syntext/` or `.stx/` subfolder first (for docs embedded in app repos),
 * then falls back to the given root directory itself (standalone docs repos).
 */
export async function resolveDocsRoot(rootDir: string): Promise<{ docsRoot: string; nested: boolean }> {
  // Check .syntext/ first
  const syntextDir = join(rootDir, '.syntext')
  if (await hasConfig(syntextDir)) {
    return { docsRoot: syntextDir, nested: true }
  }

  // Check .stx/ shorthand
  const stxDir = join(rootDir, '.stx')
  if (await hasConfig(stxDir)) {
    return { docsRoot: stxDir, nested: true }
  }

  // Fall back to root (standalone docs repo)
  return { docsRoot: rootDir, nested: false }
}

async function hasConfig(dir: string): Promise<boolean> {
  for (const name of CONFIG_NAMES) {
    if (await Bun.file(join(dir, name)).exists()) return true
  }
  return false
}
