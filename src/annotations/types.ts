/**
 * Common annotation schema for all languages.
 * Parsed from `@stx` comments in source code.
 */
export type StxAnnotation = {
  group: string // Logical grouping (e.g., "Authentication", "Users")
  title?: string // Override display title
  description?: string // Markdown description
  params?: ParamAnnotation[]
  returns?: ReturnAnnotation
  examples?: ExampleAnnotation[]
  since?: string // Version when introduced
  deprecated?: string | boolean // Deprecation notice
  internal?: boolean // Hidden from public docs
  see?: string[] // Cross-references
}

export type ParamAnnotation = {
  name: string
  type: string
  description?: string
  required?: boolean
  default?: string
}

export type ReturnAnnotation = {
  type: string
  description?: string
}

export type ExampleAnnotation = {
  title?: string
  language?: string
  code: string
}

/**
 * Represents a parsed code symbol with its annotation.
 */
export type AnnotatedSymbol = {
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'method' | 'property'
  name: string
  annotation: StxAnnotation
  signature: ParsedSignature
  sourceFile: string
  sourceLine: number
}

export type ParsedSignature = {
  name: string
  params: SignatureParam[]
  returnType?: string
  generics?: string[]
  modifiers?: string[] // export, async, static, etc.
}

export type SignatureParam = {
  name: string
  type: string
  optional?: boolean
  defaultValue?: string
  rest?: boolean
}

/**
 * Represents a generated MDX page from annotations.
 */
export type GeneratedPage = {
  slug: string
  title: string
  group: string
  content: string
  symbols: AnnotatedSymbol[]
}

/**
 * Hash for drift detection.
 */
export type SignatureHash = {
  symbolName: string
  sourceFile: string
  hash: string
  annotation: StxAnnotation
}
