import type { StxAnnotation, ParamAnnotation, ReturnAnnotation, ExampleAnnotation } from './types'

/**
 * Parse conventional doc comments (JSDoc, Javadoc, PHPDoc, etc.) into StxAnnotation.
 * This handles standard @param, @returns, @deprecated, @example, @since, @see tags
 * that are already present in most codebases.
 *
 * Returns null if the comment has no meaningful content.
 */
export function parseConventionalComment(comment: string): StxAnnotation | null {
  const lines = comment.split('\n').map((l) => l.replace(/^[\s*/]+/, '').trim())
  const nonEmpty = lines.filter((l) => l.length > 0)

  if (nonEmpty.length === 0) return null

  const annotation: StxAnnotation = { group: 'Default' }
  const descLines: string[] = []
  const params: ParamAnnotation[] = []
  const examples: ExampleAnnotation[] = []
  const seeRefs: string[] = []
  let returns: ReturnAnnotation | undefined
  let currentExample: ExampleAnnotation | null = null
  let inExample = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // @param {type} name - description (JSDoc style)
    const jsDocParam = line.match(/^@param\s+\{([^}]+)\}\s+(\[?)(\w+)\]?\s*[-–—]?\s*(.*)/)
    if (jsDocParam) {
      inExample = false
      params.push({
        name: jsDocParam[3],
        type: jsDocParam[1],
        description: jsDocParam[4] || undefined,
        required: jsDocParam[2] !== '[',
      })
      continue
    }

    // @param name {type} description (alternate order)
    const altParam = line.match(/^@param\s+(\w+)\s+\{([^}]+)\}\s*[-–—]?\s*(.*)/)
    if (altParam) {
      inExample = false
      params.push({
        name: altParam[1],
        type: altParam[2],
        description: altParam[3] || undefined,
        required: true,
      })
      continue
    }

    // @param name - description (no type, common in JS)
    const simpleParam = line.match(/^@param\s+(\[?)(\w+)\]?\s*[-–—]?\s*(.*)/)
    if (simpleParam) {
      inExample = false
      params.push({
        name: simpleParam[2],
        type: 'any',
        description: simpleParam[3] || undefined,
        required: simpleParam[1] !== '[',
      })
      continue
    }

    // @returns/@return {type} description
    const returnMatch = line.match(/^@returns?\s+\{([^}]+)\}\s*[-–—]?\s*(.*)/)
    if (returnMatch) {
      inExample = false
      returns = { type: returnMatch[1], description: returnMatch[2] || undefined }
      continue
    }

    // @returns/@return description (no type)
    const returnSimple = line.match(/^@returns?\s+(.+)/)
    if (returnSimple && !returnMatch) {
      inExample = false
      returns = { type: 'unknown', description: returnSimple[1] }
      continue
    }

    // @deprecated [message]
    if (line.startsWith('@deprecated')) {
      inExample = false
      const msg = line.slice('@deprecated'.length).trim()
      annotation.deprecated = msg || true
      continue
    }

    // @since version
    if (line.startsWith('@since')) {
      inExample = false
      annotation.since = line.slice('@since'.length).trim()
      continue
    }

    // @see reference
    if (line.startsWith('@see')) {
      inExample = false
      const ref = line.slice('@see'.length).trim()
      if (ref) seeRefs.push(ref)
      continue
    }

    // @example
    if (line.startsWith('@example')) {
      if (currentExample) examples.push(currentExample)
      const title = line.slice('@example'.length).trim() || undefined
      currentExample = { title, code: '' }
      inExample = true
      continue
    }

    // @throws/@exception {type} description — store in description for now
    if (line.match(/^@(?:throws|exception)/)) {
      inExample = false
      continue
    }

    // @internal / @private / @hidden — mark as internal
    if (line.match(/^@(?:internal|private|hidden|ignore)$/)) {
      inExample = false
      annotation.internal = true
      continue
    }

    // @category / @group / @module — use as group
    const groupMatch = line.match(/^@(?:category|group|module)\s+(.+)/)
    if (groupMatch) {
      inExample = false
      annotation.group = groupMatch[1]
      continue
    }

    // Skip other @tags we don't understand
    if (line.startsWith('@')) {
      inExample = false
      continue
    }

    // Content accumulation
    if (inExample && currentExample) {
      if (currentExample.code) currentExample.code += '\n'
      currentExample.code += line
    } else if (!line.startsWith('@')) {
      descLines.push(line)
    }
  }

  // Finalize example
  if (currentExample) examples.push(currentExample)

  // Build annotation
  const description = descLines.join('\n').trim()
  if (description) annotation.description = description
  if (params.length > 0) annotation.params = params
  if (returns) annotation.returns = returns
  if (examples.length > 0) {
    annotation.examples = examples.map((e) => ({
      ...e,
      code: e.code.trim(),
    })).filter((e) => e.code.length > 0)
    if (annotation.examples.length === 0) delete annotation.examples
  }
  if (seeRefs.length > 0) annotation.see = seeRefs

  // Must have at least a description or params to be useful
  if (!annotation.description && !annotation.params?.length && !annotation.returns) {
    return null
  }

  return annotation
}

/**
 * Parse Python-style docstring (Google, NumPy, or reST formats) into StxAnnotation.
 */
export function parsePythonDocstring(docstring: string): StxAnnotation | null {
  const lines = docstring.split('\n')
  const annotation: StxAnnotation = { group: 'Default' }
  const descLines: string[] = []
  const params: ParamAnnotation[] = []
  let returns: ReturnAnnotation | undefined
  const examples: ExampleAnnotation[] = []

  let section: 'description' | 'args' | 'returns' | 'raises' | 'examples' | 'attributes' | 'yields' = 'description'
  let currentExample: ExampleAnnotation | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length

    // Google-style section headers
    if (trimmed === 'Args:' || trimmed === 'Arguments:' || trimmed === 'Parameters:') {
      section = 'args'
      continue
    }
    if (trimmed === 'Returns:' || trimmed === 'Return:') {
      section = 'returns'
      continue
    }
    if (trimmed === 'Raises:' || trimmed === 'Exceptions:') {
      section = 'raises'
      continue
    }
    if (trimmed === 'Example:' || trimmed === 'Examples:') {
      section = 'examples'
      if (currentExample) examples.push(currentExample)
      currentExample = { code: '' }
      continue
    }
    if (trimmed === 'Attributes:') {
      section = 'attributes'
      continue
    }
    if (trimmed === 'Yields:') {
      section = 'yields'
      continue
    }
    if (trimmed === 'Note:' || trimmed === 'Notes:' || trimmed === 'Todo:' || trimmed === 'Warning:') {
      section = 'description'
      continue
    }

    // NumPy-style section headers (underlined with dashes)
    if (i + 1 < lines.length && lines[i + 1].trim().match(/^-{3,}$/)) {
      if (trimmed === 'Parameters') { section = 'args'; i++; continue }
      if (trimmed === 'Returns') { section = 'returns'; i++; continue }
      if (trimmed === 'Raises') { section = 'raises'; i++; continue }
      if (trimmed === 'Examples') { section = 'examples'; i++; if (currentExample) examples.push(currentExample); currentExample = { code: '' }; continue }
      if (trimmed === 'Attributes') { section = 'attributes'; i++; continue }
      // Unknown section, skip
      section = 'description'
      i++
      continue
    }

    // reST-style :param name: description
    const restParam = trimmed.match(/^:param\s+(\w+)\s*:\s*(.*)/)
    if (restParam) {
      params.push({ name: restParam[1], type: 'any', description: restParam[2] || undefined, required: true })
      continue
    }

    // reST-style :type name: type
    const restType = trimmed.match(/^:type\s+(\w+)\s*:\s*(.*)/)
    if (restType) {
      const existing = params.find((p) => p.name === restType[1])
      if (existing) existing.type = restType[2]
      continue
    }

    // reST-style :returns: description
    const restReturn = trimmed.match(/^:returns?\s*:\s*(.*)/)
    if (restReturn) {
      returns = { type: 'unknown', description: restReturn[1] || undefined }
      continue
    }

    // reST-style :rtype: type
    const restRtype = trimmed.match(/^:rtype\s*:\s*(.*)/)
    if (restRtype) {
      if (returns) returns.type = restRtype[1]
      else returns = { type: restRtype[1] }
      continue
    }

    // Content by section
    switch (section) {
      case 'description':
        descLines.push(trimmed)
        break
      case 'args': {
        // Google style: name (type): description  OR  name: description
        const argMatch = trimmed.match(/^(\w+)\s*\(([^)]+)\)\s*:\s*(.*)/)
        if (argMatch) {
          params.push({
            name: argMatch[1],
            type: argMatch[2],
            description: argMatch[3] || undefined,
            required: !argMatch[2].includes('optional'),
          })
        } else {
          const simpleArg = trimmed.match(/^(\w+)\s*:\s*(.*)/)
          if (simpleArg && indent <= 8) {
            params.push({ name: simpleArg[1], type: 'any', description: simpleArg[2] || undefined, required: true })
          } else if (params.length > 0 && indent > 4 && trimmed) {
            // Continuation of previous param description
            const last = params[params.length - 1]
            if (last.description) last.description += ' ' + trimmed
            else last.description = trimmed
          }
        }
        break
      }
      case 'returns': {
        if (trimmed && !returns) {
          const typeDesc = trimmed.match(/^(\w[\w\[\], |]+)\s*:\s*(.*)/)
          if (typeDesc) {
            returns = { type: typeDesc[1], description: typeDesc[2] || undefined }
          } else if (/^[\w\[\]<>, |]+$/.test(trimmed)) {
            // Bare type name (NumPy style: type on its own line)
            returns = { type: trimmed }
          } else {
            returns = { type: 'unknown', description: trimmed }
          }
        } else if (trimmed && returns && !returns.description) {
          returns.description = trimmed
        }
        break
      }
      case 'examples': {
        if (currentExample) {
          // Skip >>> prompts for cleaner output
          const code = trimmed.replace(/^>>>\s*/, '')
          if (currentExample.code) currentExample.code += '\n'
          currentExample.code += code
        }
        break
      }
      case 'raises':
      case 'attributes':
      case 'yields':
        break
    }
  }

  // Finalize
  if (currentExample) examples.push(currentExample)

  const description = descLines.join('\n').trim()
  if (description) annotation.description = description
  if (params.length > 0) annotation.params = params
  if (returns) annotation.returns = returns
  if (examples.length > 0) {
    annotation.examples = examples.map((e) => ({ ...e, code: e.code.trim() })).filter((e) => e.code.length > 0)
    if (annotation.examples.length === 0) delete annotation.examples
  }

  if (!annotation.description && !annotation.params?.length && !annotation.returns) {
    return null
  }

  return annotation
}

/**
 * Parse Go-style doc comments (plain text before a declaration).
 * Go convention: first sentence is the summary, rest is description.
 * No @tags — just plain English.
 */
export function parseGoDocComment(comment: string, symbolName: string): StxAnnotation | null {
  const lines = comment.split('\n').map((l) => l.replace(/^\/\/\s?/, '').trim())
  const text = lines.join('\n').trim()

  if (!text) return null

  // Go convention: doc comment starts with the symbol name
  // "FunctionName does X and Y" → title is inferred from the function name
  const annotation: StxAnnotation = { group: 'Default' }

  // Check if starts with "Deprecated:" prefix
  if (text.startsWith('Deprecated:')) {
    annotation.deprecated = text.slice('Deprecated:'.length).trim() || true
  }

  annotation.description = text

  return annotation
}

/**
 * Parse Rust doc comments (/// or //!) into StxAnnotation.
 * Rust conventions: markdown content, # headings for sections.
 */
export function parseRustDocComment(comment: string): StxAnnotation | null {
  const lines = comment.split('\n').map((l) => l.replace(/^\/\/[/!]\s?/, '').trim())
  const annotation: StxAnnotation = { group: 'Default' }
  const descLines: string[] = []
  const params: ParamAnnotation[] = []
  const examples: ExampleAnnotation[] = []
  let returns: ReturnAnnotation | undefined
  let section: 'description' | 'arguments' | 'returns' | 'examples' | 'panics' | 'errors' | 'safety' = 'description'
  let currentExample: ExampleAnnotation | null = null
  let inCodeBlock = false

  for (const line of lines) {
    // Code block fences
    if (line.startsWith('```')) {
      if (inCodeBlock && currentExample) {
        examples.push(currentExample)
        currentExample = null
        inCodeBlock = false
        continue
      }
      if (section === 'examples' || line.includes('rust') || line.includes('no_run') || line.includes('ignore')) {
        inCodeBlock = true
        const lang = line.slice(3).replace(/,.*$/, '').trim() || 'rust'
        currentExample = { language: lang === 'no_run' || lang === 'ignore' ? 'rust' : lang, code: '' }
        continue
      }
      // Code block in description
      inCodeBlock = !inCodeBlock
      descLines.push(line)
      continue
    }

    if (inCodeBlock && currentExample) {
      if (currentExample.code) currentExample.code += '\n'
      currentExample.code += line
      continue
    }

    // Section headers
    if (line === '# Arguments' || line === '# Parameters') { section = 'arguments'; continue }
    if (line === '# Returns') { section = 'returns'; continue }
    if (line === '# Examples' || line === '# Example') { section = 'examples'; continue }
    if (line === '# Panics') { section = 'panics'; continue }
    if (line === '# Errors') { section = 'errors'; continue }
    if (line === '# Safety') { section = 'safety'; continue }

    switch (section) {
      case 'description':
        descLines.push(line)
        break
      case 'arguments': {
        // * `name` - description
        const argMatch = line.match(/^\*\s+`(\w+)`\s*[-–—:]\s*(.*)/)
        if (argMatch) {
          params.push({ name: argMatch[1], type: 'unknown', description: argMatch[2] || undefined, required: true })
        }
        break
      }
      case 'returns': {
        if (line && !returns) {
          returns = { type: 'unknown', description: line }
        } else if (line && returns) {
          returns.description = (returns.description || '') + ' ' + line
        }
        break
      }
      case 'examples':
        // Code blocks in examples section handled above
        break
      case 'panics':
      case 'errors':
      case 'safety':
        break
    }
  }

  if (currentExample) examples.push(currentExample)

  const description = descLines.join('\n').trim()
  if (description) annotation.description = description
  if (params.length > 0) annotation.params = params
  if (returns) annotation.returns = returns
  if (examples.length > 0) {
    annotation.examples = examples.map((e) => ({ ...e, code: e.code.trim() })).filter((e) => e.code.length > 0)
    if (annotation.examples.length === 0) delete annotation.examples
  }

  if (!annotation.description && !annotation.params?.length && !annotation.returns) {
    return null
  }

  return annotation
}

/**
 * Parse C# XML documentation comments into StxAnnotation.
 * Handles <summary>, <param>, <returns>, <example>, <remarks>, etc.
 */
export function parseCSharpXmlDoc(comment: string): StxAnnotation | null {
  const annotation: StxAnnotation = { group: 'Default' }
  const params: ParamAnnotation[] = []

  // Extract <summary>
  const summaryMatch = comment.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) {
    annotation.description = stripXmlTags(summaryMatch[1]).trim()
  }

  // Extract <remarks> — append to description
  const remarksMatch = comment.match(/<remarks>([\s\S]*?)<\/remarks>/)
  if (remarksMatch) {
    const remarks = stripXmlTags(remarksMatch[1]).trim()
    if (remarks) {
      annotation.description = (annotation.description || '') + '\n\n' + remarks
      annotation.description = annotation.description.trim()
    }
  }

  // Extract <param name="x">description</param>
  const paramRegex = /<param\s+name="(\w+)">([\s\S]*?)<\/param>/g
  let paramMatch
  while ((paramMatch = paramRegex.exec(comment)) !== null) {
    params.push({
      name: paramMatch[1],
      type: 'unknown',
      description: stripXmlTags(paramMatch[2]).trim() || undefined,
      required: true,
    })
  }

  // Extract <returns>
  const returnsMatch = comment.match(/<returns>([\s\S]*?)<\/returns>/)
  if (returnsMatch) {
    annotation.returns = { type: 'unknown', description: stripXmlTags(returnsMatch[1]).trim() }
  }

  // Extract <example>
  const exampleRegex = /<example>([\s\S]*?)<\/example>/g
  let exMatch
  const examples: ExampleAnnotation[] = []
  while ((exMatch = exampleRegex.exec(comment)) !== null) {
    const codeMatch = exMatch[1].match(/<code>([\s\S]*?)<\/code>/)
    if (codeMatch) {
      examples.push({ language: 'csharp', code: codeMatch[1].trim() })
    } else {
      examples.push({ code: stripXmlTags(exMatch[1]).trim() })
    }
  }

  // Extract <exception cref="Type">
  // (stored for reference but not directly mapped)

  // Extract <seealso cref="X"/>
  const seeRefs: string[] = []
  const seeRegex = /<see(?:also)?\s+cref="([^"]+)"\s*\/?>/g
  let seeMatch
  while ((seeMatch = seeRegex.exec(comment)) !== null) {
    seeRefs.push(seeMatch[1])
  }

  if (params.length > 0) annotation.params = params
  if (examples.length > 0) annotation.examples = examples
  if (seeRefs.length > 0) annotation.see = seeRefs

  if (!annotation.description && !annotation.params?.length && !annotation.returns) {
    return null
  }

  return annotation
}

function stripXmlTags(text: string): string {
  return text
    .replace(/<see\s+cref="([^"]+)"\s*\/>/g, '`$1`')
    .replace(/<paramref\s+name="([^"]+)"\s*\/>/g, '`$1`')
    .replace(/<typeparamref\s+name="([^"]+)"\s*\/>/g, '`$1`')
    .replace(/<c>(.*?)<\/c>/g, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/\n\s*\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
}
