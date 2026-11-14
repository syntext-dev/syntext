// Copied from syntext-backend src/modules/catalogue/frontmatter.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The page frontmatter keys the build actually reads.
 *
 * Readers: `workers/build.worker.ts`, `services/page-features.ts`
 * (`readPageFeatures`, `readEndpointFrontmatter`, ...), `services/seo-chrome.ts`
 * and `services/icon-chrome.ts`. Keys that frontmatter.mdx documents but nothing
 * reads (`type`, `date`, `backgroundSize`, `backgroundPosition`) are left out.
 */

export type FrontmatterKeySpec = {
  key: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'string[]' | 'object' | 'href' | 'icon'
  values?: string[]
  required?: boolean
  description: string
  /** For protocol keys: the `protocol` value the key is read under. */
  protocol?: 'rest' | 'websocket' | 'graphql' | 'grpc' | 'event'
  /** Where the renderer differs from the docs, or a limit worth knowing. */
  note?: string
  /** Deprecated key: what to write instead (registry in modules/deprecations). */
  deprecated?: string
}

export const FRONTMATTER_KEYS: readonly FrontmatterKeySpec[] = [
  // Core
  { key: 'title', type: 'string', required: true, description: 'Page title: browser tab, sidebar, SEO, and the h1 when the body has none.', note: 'Falls back to the file name when absent.' },
  { key: 'description', type: 'string', description: 'Meta description; also shown as a lead paragraph under a synthesised h1.' },
  { key: 'icon', type: 'icon', description: 'Icon beside the page in the sidebar. Unknown names show no icon.' },

  // Navigation
  { key: 'section', type: 'string', description: 'The section, and so the header tab, the page belongs to. Use a tab name verbatim.' },
  {
    key: 'category',
    type: 'enum',
    values: ['api', 'reference', 'sdk', 'client', 'library', 'changelog', 'releases', 'guide', 'tutorial'],
    description: 'Coarse alias for section, mapped to a built-in section. section wins when both are set.',
  },
  { key: 'sidebarTitle', type: 'string', description: 'Sidebar label used instead of title.' },
  { key: 'tag', type: 'string', description: 'Short badge beside the page in the sidebar, e.g. New or Beta. At most 20 characters.' },
  { key: 'sidebarPosition', type: 'number', description: 'Sort order within the section; lower sorts higher. Ignored for pages placed by syntext.json navigation.' },
  { key: 'hidden', type: 'boolean', description: 'Drop the page from the sidebar. It is still built and served.' },
  { key: 'draft', type: 'boolean', description: 'Drop the page from the sidebar and mark it noindex. It is still served.' },

  // Page features
  { key: 'toc', type: 'boolean', description: 'Show the on-this-page table of contents. Default true; ignored on endpoint pages.' },
  { key: 'sidebar', type: 'boolean', description: 'Show the left navigation sidebar. Default true.' },
  { key: 'hideRightSidebar', type: 'boolean', description: 'Drop the right-hand column; same as toc: false. Ignored on endpoint pages.' },
  { key: 'feedback', type: 'boolean', description: 'Show the "Was this page helpful?" widget. Default true.' },
  { key: 'editUrl', type: 'href', description: 'URL for an "Edit this page" link. No link appears unless set.' },

  // Layout (guide pages only)
  {
    key: 'layout',
    type: 'enum',
    values: ['default', 'centered', 'full-width', 'landing', 'wide'],
    description: 'Page structure: default three columns, centered single column, full-width, landing (sidebar kept, wider centred column), or wide (doc engine v2: the header, the body across the page, the footer; no sidebar, TOC or page foot, for a home built from the home components).',
    note: 'Guide pages only; API pages ignore it. wide is doc engine v2 only; v1 treats it as default.',
  },
  { key: 'fullWidth', type: 'boolean', description: 'Let the content span the full width.', note: 'Guide pages only. Same as layout: full-width.', deprecated: 'layout: full-width' },
  {
    key: 'background',
    type: 'string',
    description: 'Page background: a CSS colour or gradient.',
    note: 'Guide pages only. Also accepts an object { light, dark }, which is not documented.',
  },
  { key: 'backgroundImage', type: 'href', description: 'Background image URL for the page.', note: 'Guide pages only. backgroundSize and backgroundPosition are documented but not read.' },

  // SEO
  { key: 'ogImage', type: 'href', description: 'Open Graph image; absolute or site-relative. Overrides the site-wide image.' },
  { key: 'noindex', type: 'boolean', description: 'true excludes the page from search engines (noindex, nofollow).' },
  { key: 'noIndex', type: 'boolean', description: 'true excludes the page from search engines (noindex, nofollow).', deprecated: 'noindex' },
  { key: 'canonical', type: 'href', description: 'Canonical URL, replacing the generated one.' },

  // Language
  { key: 'lang', type: 'string', description: 'BCP-47 language tag for the page, e.g. ar-EG. Defaults to the site locale.' },
  { key: 'dir', type: 'enum', values: ['ltr', 'rtl'], description: 'Text direction, overriding what lang implies.' },

  // Access
  {
    key: 'audience',
    type: 'string[]',
    description: 'Audience tags allowed to see the page; a single string or a list. Gated pages leave navigation, search and AI for other visitors.',
    note: 'Documented in components/audience-gate.mdx and the audience-gating guide, not in frontmatter.mdx.',
  },

  // Docs home (doc engine v2)
  {
    key: 'home',
    type: 'object',
    description: 'Deprecated (generated home stops on 27 November 2026): the docs home built from blocks: { hero: { title, description, actions, install }, blocks: [{ type: quickstart | cards | api | sdks | changelog | popular | commands | ask | support, ... }] }. false opts the index in to rendering its own content. Write the home with the home components instead (<Hero title>, <SectionCards>, <LatestUpdates>…).',
    deprecated: 'the home components in the index page body (Appearance › Convert home to content)',
    note: 'Index page of doc engine v2 sites only; v1 sites ignore it. Validated by services/v2/home-frontmatter.ts: unknown block types and fields are dropped with a "did you mean" build warning.',
  },

  // API protocol
  {
    key: 'protocol',
    type: 'enum',
    values: ['rest', 'websocket', 'graphql', 'grpc', 'event'],
    description: 'Renders the page with the three-panel API layout and an endpoint bar. Any other value is ignored.',
  },
  { key: 'method', type: 'string', protocol: 'rest', description: 'HTTP method shown in the endpoint bar, e.g. POST.' },
  { key: 'endpoint', type: 'string', protocol: 'rest', description: 'Request path shown in the endpoint bar, e.g. /v1/users.' },
  { key: 'baseUrl', type: 'href', protocol: 'rest', description: 'Base URL for the "Try it" console.', note: 'Read but not documented in frontmatter.mdx.' },
  {
    key: 'servers',
    type: 'object',
    protocol: 'rest',
    description: 'List of { name, url } environments for the "Try it" console. Overrides syntext.json baseUrls.',
    note: 'Read but not documented in frontmatter.mdx. Only used when it lists more than one server.',
  },
  {
    key: 'auth',
    type: 'object',
    protocol: 'rest',
    description: 'How this endpoint authenticates, for Try it and the request samples: { type: bearer | basic | apiKey | oauth2 | openIdConnect, name, in: header | query | cookie, label, description, bearerFormat }, a list of alternatives, or none for a public endpoint. Overrides syntext.json auth. Nothing declared anywhere: no credential is shown.',
  },
  {
    key: 'requestLanguages',
    type: 'string[]',
    description: 'Languages of the generated request sample on this endpoint page, in tab order (curl, javascript, typescript, node, python, python-httpx, go, ruby, php, java, csharp, rust, swift, kotlin, http). Overrides syntext.json api.requestLanguages.',
    note: 'REST endpoint pages (protocol: rest), doc engine v2 only. Ignored when the page has its own <RequestExample> or example section.',
  },
  { key: 'event', type: 'string', protocol: 'websocket', description: 'Event name, e.g. order.created. Also read on event pages.' },
  { key: 'direction', type: 'string', protocol: 'websocket', description: 'Message direction, e.g. server-to-client.' },
  { key: 'operation', type: 'string', protocol: 'graphql', description: 'Operation kind: query, mutation or subscription. Defaults to query.' },
  { key: 'name', type: 'string', protocol: 'graphql', description: 'Operation name, e.g. createOrder.' },
  { key: 'service', type: 'string', protocol: 'grpc', description: 'gRPC service name, e.g. PaymentService.' },
  { key: 'rpc', type: 'string', protocol: 'grpc', description: 'RPC method name, e.g. CreatePayment.' },
  { key: 'channel', type: 'string', protocol: 'event', description: 'Channel or topic, e.g. orders.confirmed.' },
  { key: 'broker', type: 'string', protocol: 'event', description: 'Message broker, e.g. kafka.' },
]

const BY_KEY = new Map<string, FrontmatterKeySpec>(FRONTMATTER_KEYS.map((k) => [k.key, k]))

/** Look a frontmatter key up by its exact, case-sensitive name. */
export function findFrontmatterKey(key: string): FrontmatterKeySpec | undefined {
  return BY_KEY.get(key)
}
