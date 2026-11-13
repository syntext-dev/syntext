// Copied from syntext-backend src/modules/site-config/parse.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * Reading and writing the site config file. syntext.json, syntext.yaml and
 * syntext.yml carry exactly the same schema; every reader in the backend goes
 * through here so YAML works wherever JSON does.
 */
import { parse as parseYaml, parseDocument } from 'yaml'

/** First one present wins (the build's order since YAML support landed). */
export const SITE_CONFIG_FILES = ['syntext.json', 'syntext.yaml', 'syntext.yml', 'syntext.config.json'] as const

export class SiteConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SiteConfigError'
  }
}

export const isYamlConfig = (name: string): boolean => name.endsWith('.yaml') || name.endsWith('.yml')

export function parseSiteConfigText(name: string, content: string): Record<string, unknown> {
  const yaml = isYamlConfig(name)
  let parsed: unknown
  try {
    parsed = yaml ? parseYaml(content) : JSON.parse(content)
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
    throw new SiteConfigError(`${name} is not valid ${yaml ? 'YAML' : 'JSON'}: ${reason}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SiteConfigError(`${name} must contain an object at the top level`)
  }
  return parsed as Record<string, unknown>
}

/**
 * Text for an edited config, in the file's own format. YAML keeps the
 * original document's comments: top-level keys are set in place, so comments
 * on untouched keys survive.
 */
export function serializeSiteConfig(name: string, original: string, config: Record<string, unknown>): string {
  if (!isYamlConfig(name)) return `${JSON.stringify(config, null, 2)}\n`
  const doc = parseDocument(original)
  const before = (doc.toJS() as Record<string, unknown> | null) ?? {}
  for (const key of Object.keys(before)) {
    if (!(key in config)) doc.delete(key)
  }
  for (const [key, value] of Object.entries(config)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(value)) doc.set(key, doc.createNode(value))
  }
  return doc.toString()
}
