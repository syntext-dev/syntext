import type { StxAnnotation, ParamAnnotation, ExampleAnnotation } from './types'

/**
 * Parse @stx annotation block from a comment string.
 * Supports:
 *   @stx group "GroupName"
 *   @stx title "Title"
 *   @stx description "Markdown description"
 *   @stx param name {type} Description
 *   @stx returns {type} Description
 *   @stx example [title]
 *   @stx since v1.0
 *   @stx deprecated [message]
 *   @stx internal
 *   @stx see symbolName
 */
export function parseAnnotationBlock(comment: string): StxAnnotation | null {
  const lines = comment.split('\n').map((l) => l.replace(/^[\s*/]+/, '').trim())

  // Must have at least one @stx directive
  const stxLines = lines.filter((l) => l.startsWith('@stx'))
  if (stxLines.length === 0) return null

  const annotation: StxAnnotation = { group: 'Default' }
  let currentExample: ExampleAnnotation | null = null
  let inDescription = false
  let descLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('@stx group')) {
      annotation.group = extractQuotedOrRest(line, '@stx group')
      inDescription = false
    } else if (line.startsWith('@stx title')) {
      annotation.title = extractQuotedOrRest(line, '@stx title')
      inDescription = false
    } else if (line.startsWith('@stx description')) {
      const inline = extractQuotedOrRest(line, '@stx description')
      if (inline) {
        descLines.push(inline)
      }
      inDescription = true
    } else if (line.startsWith('@stx param')) {
      inDescription = false
      const param = parseParam(line)
      if (param) {
        if (!annotation.params) annotation.params = []
        annotation.params.push(param)
      }
    } else if (line.startsWith('@stx returns')) {
      inDescription = false
      const rest = line.slice('@stx returns'.length).trim()
      const typeMatch = rest.match(/^\{([^}]+)\}\s*(.*)/)
      if (typeMatch) {
        annotation.returns = { type: typeMatch[1], description: typeMatch[2] || undefined }
      } else {
        annotation.returns = { type: rest }
      }
    } else if (line.startsWith('@stx example')) {
      inDescription = false
      if (currentExample) {
        if (!annotation.examples) annotation.examples = []
        annotation.examples.push(currentExample)
      }
      const title = extractQuotedOrRest(line, '@stx example') || undefined
      currentExample = { title, code: '' }
    } else if (line.startsWith('@stx since')) {
      inDescription = false
      annotation.since = extractQuotedOrRest(line, '@stx since')
    } else if (line.startsWith('@stx deprecated')) {
      inDescription = false
      const msg = extractQuotedOrRest(line, '@stx deprecated')
      annotation.deprecated = msg || true
    } else if (line.startsWith('@stx internal')) {
      inDescription = false
      annotation.internal = true
    } else if (line.startsWith('@stx see')) {
      inDescription = false
      const ref = extractQuotedOrRest(line, '@stx see')
      if (ref) {
        if (!annotation.see) annotation.see = []
        annotation.see.push(ref)
      }
    } else if (line.startsWith('@stx')) {
      inDescription = false
      // Unknown directive, skip
    } else if (currentExample && !line.startsWith('@')) {
      // Accumulate example code
      if (currentExample.code) currentExample.code += '\n'
      currentExample.code += line
    } else if (inDescription && !line.startsWith('@')) {
      descLines.push(line)
    }
  }

  // Finalize
  if (currentExample) {
    if (!annotation.examples) annotation.examples = []
    annotation.examples.push(currentExample)
  }

  if (descLines.length > 0) {
    annotation.description = descLines.join('\n').trim()
  }

  return annotation
}

function extractQuotedOrRest(line: string, prefix: string): string {
  const rest = line.slice(prefix.length).trim()
  // Try quoted string
  const quoted = rest.match(/^"([^"]*)"/)
  if (quoted) return quoted[1]
  const singleQuoted = rest.match(/^'([^']*)'/)
  if (singleQuoted) return singleQuoted[1]
  return rest
}

function parseParam(line: string): ParamAnnotation | null {
  const rest = line.slice('@stx param'.length).trim()
  // Format: name {type} description
  // or: name {type} [optional] description
  const match = rest.match(/^(\w+)\s*\{([^}]+)\}\s*(.*)/)
  if (!match) {
    // Simpler format: name - description
    const simple = rest.match(/^(\w+)\s*-?\s*(.*)/)
    if (simple) return { name: simple[1], type: 'unknown', description: simple[2] || undefined, required: true }
    return null
  }

  const name = match[1]
  const type = match[2]
  let description = match[3]
  let required = true
  let defaultValue: string | undefined

  if (description.startsWith('[optional]')) {
    required = false
    description = description.slice('[optional]'.length).trim()
  }
  if (description.startsWith('[default:')) {
    const defMatch = description.match(/^\[default:\s*([^\]]+)\](.*)/)
    if (defMatch) {
      defaultValue = defMatch[1].trim()
      description = defMatch[2].trim()
      required = false
    }
  }

  return { name, type, description: description || undefined, required, default: defaultValue }
}
