import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'

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
  const configPaths = [
    join(rootDir, 'syntext.json'),
    join(rootDir, 'syntext.yaml'),
    join(rootDir, 'syntext.yml'),
    join(rootDir, 'syntext.config.ts'),
    join(rootDir, 'syntext.config.js'),
    join(rootDir, 'syntext.config.json'),
  ]

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
