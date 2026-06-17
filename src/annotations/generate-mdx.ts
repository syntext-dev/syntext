import type { AnnotatedSymbol, GeneratedPage, SignatureParam } from './types'

/**
 * Generate MDX pages from annotated symbols, grouped by annotation.group.
 */
export function generatePages(symbols: AnnotatedSymbol[], repoUrl?: string): GeneratedPage[] {
  // Filter internal symbols
  const publicSymbols = symbols.filter((s) => !s.annotation.internal)

  // Group by annotation.group
  const groups = new Map<string, AnnotatedSymbol[]>()
  for (const sym of publicSymbols) {
    const group = sym.annotation.group
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(sym)
  }

  const pages: GeneratedPage[] = []

  for (const [group, groupSymbols] of groups) {
    const slug = `api/${slugify(group)}`
    const title = group
    const content = generateGroupPage(group, groupSymbols, repoUrl)

    pages.push({ slug, title, group, content, symbols: groupSymbols })
  }

  return pages
}

function generateGroupPage(group: string, symbols: AnnotatedSymbol[], repoUrl?: string): string {
  let mdx = `---\ntitle: "${group}"\ndescription: "API reference for ${group}"\n---\n\n`

  for (const sym of symbols) {
    mdx += generateSymbolSection(sym, repoUrl)
    mdx += '\n---\n\n'
  }

  return mdx
}

function generateSymbolSection(sym: AnnotatedSymbol, repoUrl?: string): string {
  const { annotation, signature, kind } = sym
  const displayTitle = annotation.title || signature.name

  let mdx = `## ${displayTitle}\n\n`

  // Deprecated badge
  if (annotation.deprecated) {
    const msg = typeof annotation.deprecated === 'string' ? annotation.deprecated : 'This API is deprecated.'
    mdx += `<Callout type="warning" title="Deprecated">\n${msg}\n</Callout>\n\n`
  }

  // Since badge
  if (annotation.since) {
    mdx += `<span class="badge">Since ${annotation.since}</span>\n\n`
  }

  // Source link
  if (repoUrl) {
    const sourceLink = `${repoUrl}/blob/main/${sym.sourceFile}#L${sym.sourceLine}`
    mdx += `[View source](${sourceLink})\n\n`
  }

  // Description
  if (annotation.description) {
    mdx += `${annotation.description}\n\n`
  }

  // Signature
  mdx += generateSignatureBlock(sym)

  // Parameters table
  if (signature.params.length > 0 || (annotation.params && annotation.params.length > 0)) {
    mdx += `### Parameters\n\n`
    mdx += `| Name | Type | Required | Description |\n`
    mdx += `|------|------|----------|-------------|\n`

    // Use annotation params if available (richer info), fall back to signature
    const params = annotation.params || signature.params.map((p) => ({
      name: p.name,
      type: p.type,
      required: !p.optional,
      description: undefined as string | undefined,
      default: p.defaultValue,
    }))

    for (const p of params) {
      const req = p.required ? '**Yes**' : 'No'
      const desc = p.description || ''
      const def = p.default ? ` (default: \`${p.default}\`)` : ''
      mdx += `| \`${p.name}\` | \`${p.type}\` | ${req} | ${desc}${def} |\n`
    }
    mdx += '\n'
  }

  // Return type
  if (annotation.returns || signature.returnType) {
    const ret = annotation.returns || { type: signature.returnType!, description: undefined }
    mdx += `### Returns\n\n`
    mdx += `\`${ret.type}\``
    if (ret.description) mdx += ` — ${ret.description}`
    mdx += '\n\n'
  }

  // Examples
  if (annotation.examples && annotation.examples.length > 0) {
    mdx += `### Examples\n\n`
    for (const ex of annotation.examples) {
      if (ex.title) mdx += `**${ex.title}**\n\n`
      const lang = ex.language || inferLanguage(sym.sourceFile)
      mdx += `\`\`\`${lang}\n${ex.code.trim()}\n\`\`\`\n\n`
    }
  }

  // See also
  if (annotation.see && annotation.see.length > 0) {
    mdx += `### See Also\n\n`
    for (const ref of annotation.see) {
      mdx += `- [\`${ref}\`](#${slugify(ref)})\n`
    }
    mdx += '\n'
  }

  return mdx
}

function generateSignatureBlock(sym: AnnotatedSymbol): string {
  const { signature, kind } = sym
  const lang = inferLanguage(sym.sourceFile)

  let sig = ''
  const mods = signature.modifiers?.filter((m) => m !== 'export').join(' ') || ''

  switch (kind) {
    case 'function':
    case 'method': {
      const params = signature.params.map(formatParam).join(', ')
      const ret = signature.returnType ? `: ${signature.returnType}` : ''
      const generics = signature.generics ? `<${signature.generics.join(', ')}>` : ''
      sig = `${mods ? mods + ' ' : ''}function ${signature.name}${generics}(${params})${ret}`
      break
    }
    case 'class':
      sig = `${mods ? mods + ' ' : ''}class ${signature.name}`
      break
    case 'interface':
      sig = `${mods ? mods + ' ' : ''}interface ${signature.name}`
      break
    case 'type':
      sig = `type ${signature.name}`
      break
    case 'enum':
      sig = `enum ${signature.name}`
      break
  }

  return `\`\`\`${lang}\n${sig}\n\`\`\`\n\n`
}

function formatParam(p: SignatureParam): string {
  const rest = p.rest ? '...' : ''
  const opt = p.optional ? '?' : ''
  const def = p.defaultValue ? ` = ${p.defaultValue}` : ''
  return `${rest}${p.name}${opt}: ${p.type}${def}`
}

function inferLanguage(filePath: string): string {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript'
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript'
  if (filePath.endsWith('.py')) return 'python'
  if (filePath.endsWith('.go')) return 'go'
  return 'text'
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
