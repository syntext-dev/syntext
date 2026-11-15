/**
 * The API spec and protocol schema files an upload must carry: the OpenAPI
 * specs `syntext.json` declares (or the conventional root filenames) and the
 * GraphQL / gRPC / AsyncAPI schemas the hosted build searches for.
 */
import { join } from 'node:path'
import type { SyntextConfig } from './config'

/**
 * Every OpenAPI spec path a deploy must upload, derived from the `openapi`
 * config rather than a fixed filename list.
 *
 * Accepts all three documented forms — a single path, a list of paths, or
 * entries pairing a path with a URL prefix — and falls back to the conventional
 * root filenames when the config declares nothing, so projects that relied on
 * `openapi.json` sitting at the root keep working.
 *
 * Paths are returned relative to the project root, with any leading `./`
 * stripped, because that is the shape the upload bundle expects.
 */
export function collectSpecPaths(config: SyntextConfig, _rootDir: string): string[] {
  return collectSpecs(config).paths
}

/**
 * Spec paths plus whether they were declared in config.
 *
 * The distinction matters: a spec the config names but that is absent is a
 * mistake worth failing on, whereas the conventional root filenames are only
 * candidates — most projects have none of them, and that is normal.
 */
export function collectSpecs(config: SyntextConfig): { paths: string[]; declared: boolean } {
  const normalize = (p: string) => p.replace(/^\.\//, '').trim()
  const spec = config.openapi

  const declared: string[] = []
  if (typeof spec === 'string') {
    declared.push(spec)
  } else if (Array.isArray(spec)) {
    for (const entry of spec) {
      if (typeof entry === 'string') declared.push(entry)
      else if (entry && typeof entry.path === 'string') declared.push(entry.path)
    }
  }

  if (declared.length > 0) {
    // De-duplicate: two prefixes may legitimately share one spec file.
    return { paths: [...new Set(declared.map(normalize).filter(Boolean))], declared: true }
  }

  // Nothing declared — keep the historical convention. These are candidates, so
  // their absence is expected rather than an error.
  return { paths: ['openapi.json', 'openapi.yaml', 'openapi.yml'], declared: false }
}

/**
 * Directories and extensions the build pipeline searches for protocol schemas.
 * Mirrors `findFileByExtension` in the backend build worker — if that list
 * changes, this must change with it, or the schema is uploaded but never found
 * (or worse, found by the build but never uploaded).
 */
const SCHEMA_DIRS = ['', 'api/', 'spec/', 'docs/', 'proto/', 'schema/']
const SCHEMA_EXTENSIONS = ['.graphql', '.gql', '.proto', 'asyncapi.yaml', 'asyncapi.yml', 'asyncapi.json']

/**
 * Protocol schema files (GraphQL, gRPC, AsyncAPI) the build would look for.
 *
 * Same failure mode as the OpenAPI bug: the build searches several directories,
 * but a deploy only uploaded docs/ and public/. A .proto in proto/ or a schema
 * in schema/ never reached the build, so the reference pages it would have
 * generated were silently absent.
 *
 * Returns paths relative to the project root. Files already covered by the
 * docs/ upload are skipped (unless `skipDocs` is false), since they are uploaded anyway.
 */
export async function collectSchemaPaths(
  rootDir: string,
  readdirFn: (dir: string) => Promise<string[]>,
  /** False when docs/ is not uploaded wholesale (pages at the project root). */
  skipDocs = true,
): Promise<string[]> {
  const found: string[] = []
  for (const dir of SCHEMA_DIRS) {
    let entries: string[]
    try {
      entries = await readdirFn(join(rootDir, dir))
    } catch {
      continue // directory does not exist — expected for most projects
    }
    for (const entry of entries) {
      if (!SCHEMA_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue
      const rel = `${dir}${entry}`
      // docs/ is uploaded wholesale already.
      if (skipDocs && rel.startsWith('docs/')) continue
      found.push(rel)
    }
  }
  return [...new Set(found)]
}
