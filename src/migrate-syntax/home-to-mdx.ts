// Copied from syntext-backend src/services/v2/home-to-mdx.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The generated docs home as MDX (home-as-content.md): the home components that
 * draw what the preset's home drew, so a site converts with no visible change.
 *
 * Pure and self-contained (no imports but types) so the CLI's `stx migrate`
 * can copy this file as is: `homeToMdx` and `convertIndexSource` plus the tests
 * beside them are the contract.
 *
 * - With `home` frontmatter: each listed block becomes its component, authored
 *   items become children; blocks the author left out stay out.
 * - Without (the implicit home): the components the preset's layout drew, empty,
 *   so they fill themselves from the same site data.
 * - Blocks are written in the order the layout drew them, which is how the
 *   generated home ordered them whatever the frontmatter's order.
 */

/** The eight home layouts (`appearance.layout.home`, the preset's header by default). */
export type HomeMigrationLayout = 'command' | 'pill' | 'tabs' | 'mega' | 'simple' | 'island' | 'index' | 'path'

/** What the conversion needs to know about the site (the build's render snapshot has all of it). */
export type HomeMigrationSite = {
  layout: HomeMigrationLayout
  siteName: string
  /** The index page's `title`, else the site name is used. */
  title?: string
  /** The index page's `description`, else syntext.json `description`. */
  description?: string
  /** The assistant is on: the search box asks as well. */
  assistant: boolean
  /** What the site has, so auto-filled blocks with nothing to show are not written. */
  has: { changelog: boolean; api: boolean; cli: boolean }
  /** Hero links the `simple` home drew: its first quickstart page and GitHub. */
  quickstart?: { title: string; href: string }
  githubUrl?: string
  /** The changelog page's path, for the `simple` home's Changelog link. */
  changelogHref?: string
}

type Link = { label: string; href?: string }
type Kind = 'hero' | 'quickstart' | 'cards' | 'api' | 'sdks' | 'changelog' | 'popular' | 'commands' | 'support'

/** The blocks each layout drew, in its order (components/home.ts `lay*`). `ask` is the hero's search box. */
const ORDER: Record<HomeMigrationLayout, Kind[]> = {
  command: ['hero', 'quickstart', 'cards', 'sdks', 'changelog'],
  pill: ['hero', 'cards', 'sdks', 'popular', 'support'],
  tabs: ['hero', 'commands', 'changelog', 'cards', 'sdks'],
  mega: ['hero', 'api', 'popular', 'changelog', 'support'],
  simple: ['hero', 'support', 'cards', 'sdks', 'changelog'],
  island: ['hero', 'cards', 'sdks', 'changelog'],
  index: ['hero', 'cards', 'sdks', 'changelog', 'quickstart'],
  path: ['hero', 'quickstart', 'cards', 'sdks', 'changelog'],
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const links = (v: unknown): Link[] => arr(v).filter(isRecord).flatMap((l) => (str(l.label) ? [{ label: str(l.label)!, ...(str(l.href) ? { href: str(l.href) } : {}) }] : []))

/** An attribute value in double quotes (MDX JSX attribute). */
const attr = (name: string, v: string | undefined) => (v === undefined ? '' : ` ${name}="${v.replace(/\\/g, '\\\\').replace(/"/g, '&quot;').replace(/\n/g, '\\n')}"`)
/** Markdown link text and URL, escaped. */
const md = (l: Link) => (l.href ? `[${l.label.replace(/([[\]])/g, '\\$1')}](${l.href.replace(/[()\s]/g, encodeURIComponent)})` : l.label)
const linkList = (ls: Link[]) => ls.map((l) => `- ${md(l)}`).join('\n')

export type HomeToMdxResult = { mdx: string; warnings: string[] }

/** The home components for an index page's `home` frontmatter (undefined: the implicit home). */
export function homeToMdx(home: unknown, site: HomeMigrationSite): HomeToMdxResult {
  const warnings: string[] = []
  const h = isRecord(home) ? home : undefined
  if (home !== undefined && home !== null && !h) warnings.push('home: expected an object; converted as the preset\'s own home.')
  const hero = isRecord(h?.hero) ? h!.hero as Record<string, unknown> : {}
  const listed = Array.isArray(h?.blocks) ? (h!.blocks as unknown[]).filter(isRecord) : undefined
  const block = (type: string) => listed?.find((b) => b.type === type)
  const has = (type: string) => !listed || listed.some((b) => b.type === type)

  const ask = block('ask')
  if (ask && (str(ask.question) || str(ask.answer))) warnings.push('home ask: the example answer card has no component and is left out.')
  if (site.layout === 'island') warnings.push('The Orbit home\'s Agent tile has no component and is left out; the header keeps the Agent link.')

  const out: string[] = []
  for (const kind of ORDER[site.layout]) {
    const b = block(kind === 'hero' ? '' : kind)
    switch (kind) {
      case 'hero': {
        const title = str(hero.title) ?? site.title ?? site.siteName
        const description = str(hero.description) ?? site.description
        // The frames' fixed headlines (Paper, Margin) are what the generated home showed.
        const headline = site.layout === 'pill' ? 'How can we help?' : site.layout === 'path' ? 'What are you building?' : title
        // The kickers the generated home drew over its headline.
        const eyebrow = site.layout === 'path' ? title : site.layout === 'index' ? 'Documentation' : site.layout === 'island' ? site.siteName : undefined
        const install = str(hero.install)
        const mode = site.assistant && has('ask') ? 'both' : 'search'
        const suggestions = arr(ask?.suggestions).map(str).filter((x): x is string => !!x).slice(0, 4)
        // Without authored suggestions the generated box offered the most read pages, where the layout draws chips.
        const chips = !suggestions.length && ['command', 'pill', 'tabs', 'island', 'mega'].includes(site.layout) ? ' suggestions="popular"' : ''
        const placeholder = str(ask?.placeholder)
        const search = `  <SearchBar${mode === 'search' ? '' : attr('mode', mode)}${attr('placeholder', placeholder)}${suggestions.length ? ` suggestions={[${suggestions.map((s) => JSON.stringify(s)).join(', ')}]}` : chips} />`
        // Only the simple home drew links under its title.
        const actions = site.layout === 'simple'
          ? (links(hero.actions).length ? links(hero.actions) : [
              ...(site.quickstart ? [{ label: site.quickstart.title, href: site.quickstart.href }] : []),
              ...(site.githubUrl ? [{ label: 'GitHub', href: site.githubUrl }] : []),
              ...(site.changelogHref && site.has.changelog && has('changelog') ? [{ label: 'Changelog', href: site.changelogHref }] : []),
            ])
          : []
        if (site.layout !== 'simple' && links(hero.actions).length) warnings.push('home hero.actions: this preset\'s home did not show them; they are written as the hero\'s buttons.')
        const allActions = actions.length ? actions : links(hero.actions)
        out.push(`<Hero${attr('title', headline)}${attr('description', description)}${attr('eyebrow', eyebrow)}${attr('install', install)}>\n${search}${allActions.length ? `\n\n  ${allActions.map(md).join(' ')}` : ''}\n</Hero>`)
        break
      }
      case 'quickstart': {
        // Grid's Start column showed the install command instead of the quickstart when there was one.
        if (!has('quickstart') || (site.layout === 'index' && str(hero.install))) break
        const steps = arr(b?.steps).filter(isRecord).filter((s) => str(s.title))
        const t = attr('title', str(b?.title))
        out.push(steps.length
          ? `<QuickStart${t}>\n${steps.map((s) => `  <Step${attr('title', str(s.title))}${attr('href', str(s.href))}>${str(s.description) ? `\n    ${str(s.description)}\n  ` : ''}</Step>`).join('\n')}\n</QuickStart>`
          : `<QuickStart${t} />`)
        break
      }
      case 'cards': {
        if (!has('cards')) break
        const items = arr(b?.items).filter(isRecord).filter((c) => str(c.title))
        const t = attr('title', str(b?.title))
        out.push(items.length
          ? `<SectionCards${t}>\n${items.map((c) => `  <Card${attr('title', str(c.title))}${attr('href', str(c.href))}>${links(c.links).length ? `\n\n${linkList(links(c.links)).replace(/^/gm, '  ')}\n\n  ` : ''}</Card>`).join('\n')}\n</SectionCards>`
          : `<SectionCards${t} />`)
        break
      }
      case 'api': {
        if (!has('api')) break
        const items = arr(b?.items).filter(isRecord).filter((c) => str(c.title))
        if (!items.length && !site.has.api) {
          // Atlas's product grid showed the section cards on a site with no API reference.
          if (has('cards')) out.push('<SectionCards />')
          break
        }
        out.push(items.length
          ? `<ApiGroups${attr('title', str(b?.title))}>\n${items.map((c) => `  <Card${attr('title', str(c.title))}${attr('href', str(c.href))}>${str(c.description) || links(c.links).length ? `\n\n  ${str(c.description) ?? ''}${links(c.links).length ? `\n\n${linkList(links(c.links)).replace(/^/gm, '  ')}` : ''}\n\n  ` : ''}</Card>`).join('\n')}\n</ApiGroups>`
          : '<ApiGroups />')
        break
      }
      case 'sdks': {
        // An SDKs section is already one of the auto-filled section cards; only authored SDKs are written.
        const items = links(b?.items)
        if (items.length) out.push(`<SdkList${attr('title', str(b?.title))}>\n\n${linkList(items)}\n\n</SdkList>`)
        break
      }
      case 'changelog': {
        if (!has('changelog') || (!site.has.changelog && !b)) break
        if (arr(b?.items).length) warnings.push('home changelog items: written entries are not kept; <LatestUpdates> reads the changelog page\'s <Update> entries.')
        out.push(`<LatestUpdates${attr('title', str(b?.title))}${attr('href', str(b?.href))} />`)
        break
      }
      case 'popular': {
        if (!has('popular')) break
        const items = links(b?.items)
        out.push(items.length ? `<PopularPages${attr('title', str(b?.title))}>\n\n${linkList(items)}\n\n</PopularPages>` : '<PopularPages />')
        break
      }
      case 'commands': {
        if (!has('commands') || (!site.has.cli && !b)) break
        const items = arr(b?.items).filter(isRecord).filter((q) => str(q.cmd))
        const cell = (s: string) => s.replace(/\|/g, '\\|')
        out.push(items.length
          ? `<CommandList>\n\n| Command | Description |\n| --- | --- |\n${items.map((q) => `| ${str(q.href) ? `[\`${cell(str(q.cmd)!)}\`](${str(q.href)})` : `\`${cell(str(q.cmd)!)}\``} | ${cell(str(q.description) ?? '')} |`).join('\n')}\n\n</CommandList>`
          : '<CommandList />')
        break
      }
      case 'support': {
        const s = block('support')
        const cta = isRecord(s?.cta) ? s!.cta as Record<string, unknown> : {}
        if (!s || !str(s.title)) break
        out.push(`<SupportCard${attr('title', str(s.title))}${attr('cta', str(cta.label))}${attr('href', str(cta.href))}>\n  ${(str(s.text) ?? '').replace(/<br\s*\/?>/g, ' ')}\n</SupportCard>`)
        break
      }
    }
  }
  // Grid drew the changelog and the Start column side by side.
  if (site.layout === 'index') {
    const i = out.findIndex((x) => x.startsWith('<LatestUpdates'))
    const j = out.findIndex((x) => x.startsWith('<QuickStart'))
    if (i >= 0 && j === i + 1) out.splice(i, 2, `<Columns cols={2}>\n<Column>\n\n${out[i]}\n\n</Column>\n<Column>\n\n${out[j]}\n\n</Column>\n</Columns>`)
  }
  return { mdx: `${out.join('\n\n')}\n`, warnings }
}

/** Split `---\nYAML\n---\nbody`. */
function splitFrontmatter(source: string): { yaml: string; body: string } | undefined {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  return m ? { yaml: m[1]!, body: source.slice(m[0].length) } : undefined
}

/** The YAML without the top-level `home:` key and its indented value. */
function dropTopKey(yaml: string, key: string): string {
  const lines = yaml.split('\n')
  const out: string[] = []
  let skipping = false
  for (const line of lines) {
    if (new RegExp(`^${key}\\s*:`).test(line)) { skipping = true; continue }
    if (skipping && (/^\s/.test(line) || line.trim() === '')) {
      if (line.trim() === '') { skipping = false; out.push(line) }
      continue
    }
    skipping = false
    out.push(line)
  }
  return out.join('\n').replace(/\n+$/, '')
}

/**
 * An index page's source with its generated home written as components: `home`
 * removed from the frontmatter, `layout: wide` (the generated home's frame,
 * which ignored `layout`) in place of any `layout`, and the components before the existing body
 * (which the generated home drew below its blocks).
 */
export function convertIndexSource(source: string, home: unknown, site: HomeMigrationSite): HomeToMdxResult & { source: string } {
  const r = homeToMdx(home, site)
  const fm = splitFrontmatter(source)
  // The generated home ignored `layout` and drew its own full-width frame: `layout: wide` is that frame.
  let yaml = fm ? dropTopKey(dropTopKey(fm.yaml, 'home'), 'layout') : ''
  yaml = `${yaml}${yaml ? '\n' : ''}layout: wide`
  const body = (fm ? fm.body : source).replace(/^\s+/, '')
  return { ...r, source: `---\n${yaml}\n---\n\n${r.mdx}${body ? `\n${body}` : ''}` }
}
