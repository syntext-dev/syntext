import { join } from 'node:path'
import { SOURCE_EXTENSIONS, UNSUPPORTED_EXTENSIONS } from './languages'

export type ScanResult = {
  /** Absolute paths of source files the CLI can parse locally. */
  files: string[]
  /**
   * Warnings about files a hosted build would parse but this CLI cannot, so an
   * author is never left reading "0 annotations" as "no annotations here".
   */
  warnings: string[]
}

/** Paths that are never worth scanning for annotations. */
function isIgnored(relPath: string): boolean {
  return relPath.includes('.test.') || relPath.includes('.spec.') || relPath.includes('node_modules')
}

/**
 * Scan source directories for annotatable files.
 *
 * `stx check` and `stx generate` both call this instead of keeping their own
 * extension lists. They previously kept two different ones — `generate` scanned
 * `.cs`/`.kt`/`.kts` and `check` did not — so C# and Kotlin symbols got
 * generated pages that drift detection then never inspected.
 */
export async function scanSourceFiles(rootDir: string, srcDirs: string[]): Promise<ScanResult> {
  const files: string[] = []
  const unsupportedCounts = new Map<string, number>()

  for (const srcDir of srcDirs) {
    const fullSrcDir = join(rootDir, srcDir)

    for (const ext of SOURCE_EXTENSIONS) {
      const glob = new Bun.Glob(`**/*.${ext}`)
      try {
        for await (const file of glob.scan({ cwd: fullSrcDir })) {
          if (isIgnored(file)) continue
          files.push(join(fullSrcDir, file))
        }
      } catch {
        // Directory doesn't exist — nothing to scan.
      }
    }

    // Count files in languages the backend parses but the CLI does not, so we
    // can say so out loud rather than silently reporting zero symbols.
    for (const [ext, label] of Object.entries(UNSUPPORTED_EXTENSIONS)) {
      const glob = new Bun.Glob(`**/*.${ext}`)
      try {
        for await (const file of glob.scan({ cwd: fullSrcDir })) {
          if (isIgnored(file)) continue
          unsupportedCounts.set(label, (unsupportedCounts.get(label) ?? 0) + 1)
        }
      } catch {
        // Directory doesn't exist.
      }
    }
  }

  const warnings = [...unsupportedCounts.entries()].map(
    ([label, count]) =>
      `${count} ${label} file${count === 1 ? '' : 's'} skipped: the stx CLI has no local ${label} annotation parser. ` +
      `A hosted build parses ${label}, so local results are incomplete.`,
  )

  return { files, warnings }
}
