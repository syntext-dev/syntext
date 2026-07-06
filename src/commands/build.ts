import { Command } from 'commander'
import { join, dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import chalk from 'chalk'
import ora from 'ora'
import { loadConfig, configFileExists } from '../lib/config'
import { loadCredentials } from '../lib/credentials'
import { resolveDocsRoot } from '../lib/resolve-docs-root'

type ExportManifest = {
  version: number
  files: Array<{ path: string; contentType: string; content: string }>
}

/**
 * Extract a gzipped JSON export bundle into the output directory,
 * preserving relative paths. Returns file count and total bytes written.
 */
export async function extractExportBundle(
  bundle: Uint8Array,
  outputDir: string,
): Promise<{ fileCount: number; totalBytes: number }> {
  const manifest = JSON.parse(Buffer.from(Bun.gunzipSync(new Uint8Array(bundle))).toString('utf-8')) as ExportManifest

  let totalBytes = 0
  for (const file of manifest.files) {
    // Guard against path traversal in bundle entries
    if (file.path.includes('..') || file.path.startsWith('/')) {
      throw new Error(`Unsafe path in export bundle: ${file.path}`)
    }
    const content = Buffer.from(file.content, 'base64')
    const fullPath = join(outputDir, file.path)
    await mkdir(dirname(fullPath), { recursive: true })
    await Bun.write(fullPath, content)
    totalBytes += content.length
  }

  return { fileCount: manifest.files.length, totalBytes }
}

export const buildCommand = new Command('build')
  .description('Build documentation on the Syntext backend and download the static site for self-hosting')
  .option('-d, --dir <dir>', 'Documentation directory', '.')
  .option('-o, --output <dir>', 'Output directory for the built site', 'dist')
  .option('--token <token>', 'Auth token (for CI, overrides login)')
  .option('--json', 'Output result as JSON')
  .action(async (options) => {
    const baseDir = resolve(process.cwd(), options.dir)
    const { docsRoot: rootDir } = await resolveDocsRoot(baseDir)
    const spinner = options.json ? null : ora('Preparing build...').start()

    try {
      if (!(await configFileExists(rootDir))) {
        throw new Error('No syntext.json found in this directory. Run `stx init` to create a new documentation project.')
      }

      const config = await loadConfig(rootDir)
      const token = options.token ?? (await loadCredentials())?.token

      if (!token) {
        throw new Error('Not authenticated. Run `stx login` first, or pass --token.')
      }

      const projectId = config.projectId
      if (!projectId) {
        throw new Error('No projectId in syntext.json. Run `stx connect <projectId>` to link this directory to a project.')
      }

      const apiUrl = process.env.SYNTEXT_API_URL ?? 'https://api.syntext.dev'

      // Collect source files (same set as deploy)
      if (spinner) spinner.text = 'Collecting source files...'

      const sourceFiles: Array<{ path: string; content: Buffer }> = []

      const configNames = ['syntext.json', 'syntext.yaml', 'syntext.yml', 'stx.json', 'stx.yaml', 'stx.yml']
      for (const name of configNames) {
        const configPath = join(rootDir, name)
        const configFile = Bun.file(configPath)
        if (await configFile.exists()) {
          sourceFiles.push({ path: name, content: Buffer.from(await configFile.arrayBuffer()) })
          break
        }
      }

      const docsJsonFile = Bun.file(join(rootDir, 'docs.json'))
      if (await docsJsonFile.exists()) {
        sourceFiles.push({ path: 'docs.json', content: Buffer.from(await docsJsonFile.arrayBuffer()) })
      }

      const docsDir = join(rootDir, 'docs')
      const docsGlob = new Bun.Glob('**/*')
      for await (const file of docsGlob.scan({ cwd: docsDir })) {
        const content = await Bun.file(join(docsDir, file)).arrayBuffer()
        sourceFiles.push({ path: `docs/${file}`, content: Buffer.from(content) })
      }

      const publicDir = join(rootDir, 'public')
      const publicGlob = new Bun.Glob('**/*')
      try {
        for await (const file of publicGlob.scan({ cwd: publicDir })) {
          const content = await Bun.file(join(publicDir, file)).arrayBuffer()
          sourceFiles.push({ path: `public/${file}`, content: Buffer.from(content) })
        }
      } catch {
        // public/ dir doesn't exist — that's fine
      }

      for (const specName of ['openapi.json', 'openapi.yaml', 'openapi.yml']) {
        const specFile = Bun.file(join(rootDir, specName))
        if (await specFile.exists()) {
          sourceFiles.push({ path: specName, content: Buffer.from(await specFile.arrayBuffer()) })
        }
      }

      if (sourceFiles.length === 0) {
        throw new Error('No source files found. Make sure you have a docs/ directory.')
      }

      // Upload source files for server-side compilation in export mode
      if (spinner) spinner.text = `Uploading ${sourceFiles.length} source files...`

      const formData = new FormData()
      formData.append('export', 'true')
      for (const file of sourceFiles) {
        formData.append('files', new Blob([file.content]), file.path)
        formData.append('paths', file.path)
      }

      const res = await fetch(`${apiUrl}/v1/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        throw new Error((err as { error?: { message?: string } }).error?.message ?? `Build failed (${res.status})`)
      }

      const { data } = await res.json() as { data: { buildId: string } }

      // Wait for the server-side build to complete
      if (spinner) spinner.text = 'Building on server...'
      const buildResult = await waitForBuild(apiUrl, token, projectId, data.buildId, spinner)

      if (buildResult.status !== 'deployed') {
        throw new Error(buildResult.error || 'Build failed on server')
      }

      // Download and extract the export bundle
      if (spinner) spinner.text = 'Downloading built site...'

      const bundleRes = await fetch(`${apiUrl}/v1/projects/${projectId}/builds/${data.buildId}/export`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!bundleRes.ok) {
        const err = await bundleRes.json().catch(() => ({ error: { message: `HTTP ${bundleRes.status}` } }))
        throw new Error((err as { error?: { message?: string } }).error?.message ?? `Download failed (${bundleRes.status})`)
      }

      const bundle = new Uint8Array(await bundleRes.arrayBuffer())
      const outputDir = resolve(process.cwd(), options.output)
      const { fileCount, totalBytes } = await extractExportBundle(bundle, outputDir)

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          buildId: data.buildId,
          output: options.output,
          files: fileCount,
          bytes: totalBytes,
          pages: buildResult.pageCount,
          duration: buildResult.durationMs,
        }))
      } else {
        spinner?.succeed(chalk.green('Build complete!'))
        console.log('')
        console.log(`  ${chalk.dim('Build:')}    ${data.buildId.slice(0, 8)}`)
        console.log(`  ${chalk.dim('Output:')}   ${chalk.cyan(options.output + '/')}`)
        console.log(`  ${chalk.dim('Files:')}    ${fileCount} (${Math.round(totalBytes / 1024)} KB)`)
        console.log(`  ${chalk.dim('Pages:')}    ${buildResult.pageCount}`)
        console.log(`  ${chalk.dim('Duration:')} ${buildResult.durationMs}ms`)
        console.log(`\n  ${chalk.dim('Serve it with any static host, e.g.')} npx serve ${options.output}\n`)
      }
    } catch (err) {
      if (process.env.STX_DEBUG) console.error((err as Error).stack)
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (err as Error).message }))
      } else {
        spinner?.fail(chalk.red('Build failed'))
        console.error(`\n  ${(err as Error).message}\n`)
      }
      process.exit(1)
    }
  })

async function waitForBuild(
  apiUrl: string,
  token: string,
  projectId: string,
  buildId: string,
  spinner: ReturnType<typeof ora> | null,
): Promise<{ status: string; pageCount?: number; durationMs?: number; error?: string }> {
  const maxWait = 180_000 // 3 minutes
  const pollInterval = 2_000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    const res = await fetch(`${apiUrl}/v1/projects/${projectId}/builds/${buildId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      await Bun.sleep(pollInterval)
      continue
    }

    const { data: build } = await res.json() as {
      data: { status: string; pageCount: number | null; durationMs: number | null; error: string | null }
    }

    if (spinner) {
      const statusMap: Record<string, string> = {
        queued: 'Queued...',
        uploading: 'Uploading...',
        cloning: 'Preparing source...',
        parsing: 'Parsing documentation...',
        compiling: 'Compiling pages...',
        deploying: 'Packaging files...',
      }
      spinner.text = statusMap[build.status] || `Status: ${build.status}`
    }

    if (build.status === 'deployed') {
      return {
        status: 'deployed',
        pageCount: build.pageCount || undefined,
        durationMs: build.durationMs || undefined,
      }
    }

    if (build.status === 'failed') {
      return { status: 'failed', error: build.error || 'Build failed' }
    }

    await Bun.sleep(pollInterval)
  }

  return { status: 'failed', error: 'Build timed out after 3 minutes' }
}
