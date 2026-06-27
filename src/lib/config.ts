import { join } from 'node:path'
import { readFile, access } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'

const CONFIG_FILE_NAMES = [
  'syntext.json', 'syntext.yaml', 'syntext.yml',
  'stx.json', 'stx.yaml', 'stx.yml',
  'syntext.config.ts', 'syntext.config.js', 'syntext.config.json',
]

export type SyntextConfig = {
  name?: string
  projectId?: string
  theme?: string
  colors?: {
    primary?: string
    accent?: string
  }
  fonts?: {
    heading?: string
    body?: string
    mono?: string
  }
  navigation?: {
    tabs?: string[]
    sidebar?: SidebarOverride[]
  }
  logo?: {
    light?: string
    dark?: string
  }
  favicon?: string
  footer?: {
    links?: Array<{ label: string; href: string }>
    copyright?: string
    socials?: Array<{ platform: string; url: string }>
  }
  banner?: {
    text?: string
    dismissible?: boolean
    link?: { label: string; href: string }
  }
  customCSS?: string[]
  customJS?: string[]
  redirects?: Array<{ from: string; to: string; status?: number }>
  i18n?: {
    defaultLocale?: string
    locales?: Array<{ code: string; label: string; dir?: 'ltr' | 'rtl' }>
  }
  versioning?: {
    versions?: Array<{ label: string; branch?: string; tag?: string; default?: boolean }>
  }
}

export type SidebarOverride = {
  group: string
  pages: Array<string | { title: string; slug: string; icon?: string }>
}

export async function loadConfig(rootDir: string): Promise<SyntextConfig> {
  const configPaths = CONFIG_FILE_NAMES.map(f => join(rootDir, f))

  for (const configPath of configPaths) {
    try {
      const file = Bun.file(configPath)
      if (await file.exists()) {
        if (configPath.endsWith('.json')) {
          return JSON.parse(await readFile(configPath, 'utf-8'))
        }
        if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
          const content = await readFile(configPath, 'utf-8')
          return parseYaml(content) as SyntextConfig
        }
        // For TS/JS configs, import them
        const mod = await import(configPath)
        return mod.default ?? mod
      }
    } catch {
      continue
    }
  }

  // Return defaults
  return {
    name: 'Documentation',
    theme: 'default',
    colors: { primary: '#6366f1', accent: '#8b5cf6' },
  }
}

// Export for use in syntext init
export function defineConfig(config: SyntextConfig): SyntextConfig {
  return config
}

/**
 * Check if a config file exists in the given directory.
 */
export async function configFileExists(rootDir: string): Promise<boolean> {
  for (const file of CONFIG_FILE_NAMES) {
    try {
      await access(join(rootDir, file))
      return true
    } catch {
      continue
    }
  }
  return false
}
