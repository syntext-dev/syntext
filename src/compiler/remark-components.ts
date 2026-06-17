import type { Root, RootContent } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

type MdxJsxAttribute = {
  type: 'mdxJsxAttribute'
  name: string
  value: string | { type: string; value: string } | null
}

export type MdxJsxFlowElement = {
  type: 'mdxJsxFlowElement'
  name: string | null
  attributes: MdxJsxAttribute[]
  children: RootContent[]
}

function getAttr(node: MdxJsxFlowElement, name: string): string | undefined {
  const attr = node.attributes.find(
    (a) => a.type === 'mdxJsxAttribute' && a.name === name
  )
  if (!attr) return undefined
  if (typeof attr.value === 'string') return attr.value
  if (attr.value && typeof attr.value === 'object' && 'value' in attr.value) {
    return attr.value.value
  }
  return undefined
}

function getAttrExpression(node: MdxJsxFlowElement, name: string): string | undefined {
  const attr = node.attributes.find(
    (a) => a.type === 'mdxJsxAttribute' && a.name === name
  )
  if (!attr) return undefined
  if (typeof attr.value === 'object' && attr.value && attr.value.type === 'mdxJsxAttributeValueExpression') {
    return (attr.value as { value: string }).value
  }
  return typeof attr.value === 'string' ? attr.value : undefined
}

function childrenToHtml(children: RootContent[], processor: any): string {
  // Simple text extraction from children - paragraphs and text nodes
  const parts: string[] = []
  for (const child of children) {
    if (child.type === 'paragraph') {
      const textParts = (child as any).children?.map((c: any) => {
        if (c.type === 'text') return c.value
        if (c.type === 'inlineCode') return `<code>${escapeHtml(c.value)}</code>`
        if (c.type === 'strong') return `<strong>${(c.children || []).map((t: any) => t.value || '').join('')}</strong>`
        if (c.type === 'emphasis') return `<em>${(c.children || []).map((t: any) => t.value || '').join('')}</em>`
        if (c.type === 'link') return `<a href="${escapeHtml(c.url)}">${(c.children || []).map((t: any) => t.value || '').join('')}</a>`
        return ''
      }) || []
      parts.push(`<p>${textParts.join('')}</p>`)
    } else if (child.type === 'code') {
      const lang = (child as any).lang || ''
      const code = escapeHtml((child as any).value || '')
      parts.push(`<pre><code class="language-${lang}">${code}</code></pre>`)
    } else if (child.type === 'text') {
      const trimmed = (child as any).value?.trim()
      if (trimmed) parts.push(trimmed)
    }
  }
  return parts.join('\n')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderCallout(node: MdxJsxFlowElement): string {
  const type = getAttr(node, 'type') || 'info'
  const title = getAttr(node, 'title')
  const content = childrenToHtml(node.children, null)

  const icons: Record<string, string> = {
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
    tip: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  }

  const icon = icons[type] || icons.info
  const titleHtml = title ? `<div class="stx-callout-title">${icon}<span>${escapeHtml(title)}</span></div>` : `<div class="stx-callout-title">${icon}</div>`

  return `<div class="stx-callout stx-callout--${type}">${titleHtml}<div class="stx-callout-content">${content}</div></div>`
}

function renderTabs(node: MdxJsxFlowElement): string {
  const itemsRaw = getAttrExpression(node, 'items')
  let items: string[] = []

  if (itemsRaw) {
    // Parse array expression like ["npm", "yarn", "pnpm"]
    try {
      items = JSON.parse(itemsRaw.replace(/'/g, '"'))
    } catch {
      // Try eval-style parsing for simple arrays
      const match = itemsRaw.match(/\[([^\]]*)\]/)
      if (match) {
        items = match[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
      }
    }
  }

  // Collect Tab children
  const tabChildren = node.children.filter(
    (c) => (c as any).type === 'mdxJsxFlowElement' && (c as any).name === 'Tab'
  ) as unknown as MdxJsxFlowElement[]

  // If no explicit items, use tab indices
  if (items.length === 0) {
    items = tabChildren.map((_, i) => `Tab ${i + 1}`)
  }

  const id = `tabs-${Math.random().toString(36).slice(2, 8)}`

  const buttons = items
    .map((label, i) => `<button class="stx-tab-button${i === 0 ? ' active' : ''}" data-tab="${id}-${i}" onclick="this.parentElement.parentElement.querySelectorAll('.stx-tab-button').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.parentElement.parentElement.querySelectorAll('.stx-tab-panel').forEach(p=>p.classList.remove('active'));this.parentElement.parentElement.querySelector('[data-panel=\\'${id}-${i}\\']').classList.add('active')">${escapeHtml(label)}</button>`)
    .join('')

  const panels = tabChildren
    .map((tab, i) => {
      const content = childrenToHtml(tab.children, null)
      return `<div class="stx-tab-panel${i === 0 ? ' active' : ''}" data-panel="${id}-${i}">${content}</div>`
    })
    .join('')

  return `<div class="stx-tabs"><div class="stx-tabs-header">${buttons}</div>${panels}</div>`
}

function renderCodeGroup(node: MdxJsxFlowElement): string {
  // Collect code blocks from children
  const codeBlocks: Array<{ lang: string; code: string }> = []

  for (const child of node.children) {
    if (child.type === 'code') {
      codeBlocks.push({
        lang: (child as any).lang || 'text',
        code: (child as any).value || '',
      })
    }
  }

  const id = `cg-${Math.random().toString(36).slice(2, 8)}`

  const tabs = codeBlocks
    .map((block, i) => `<button class="stx-code-tab${i === 0 ? ' active' : ''}" data-tab="${id}-${i}" onclick="this.parentElement.parentElement.querySelectorAll('.stx-code-tab').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.parentElement.parentElement.querySelectorAll('.stx-code-panel').forEach(p=>p.classList.remove('active'));this.parentElement.parentElement.querySelector('[data-panel=\\'${id}-${i}\\']').classList.add('active')">${escapeHtml(block.lang)}</button>`)
    .join('')

  const panels = codeBlocks
    .map((block, i) => `<div class="stx-code-panel${i === 0 ? ' active' : ''}" data-panel="${id}-${i}"><pre><code class="language-${block.lang}">${escapeHtml(block.code)}</code></pre></div>`)
    .join('')

  return `<div class="stx-code-group"><div class="stx-code-group-header">${tabs}</div>${panels}</div>`
}

function renderSteps(node: MdxJsxFlowElement): string {
  const stepChildren = node.children.filter(
    (c) => (c as any).type === 'mdxJsxFlowElement' && (c as any).name === 'Step'
  ) as unknown as MdxJsxFlowElement[]

  const steps = stepChildren
    .map((step, i) => {
      const title = getAttr(step, 'title') || `Step ${i + 1}`
      const content = childrenToHtml(step.children, null)
      return `<div class="stx-step"><div class="stx-step-indicator"><span class="stx-step-number">${i + 1}</span><div class="stx-step-line"></div></div><div class="stx-step-content"><div class="stx-step-title">${escapeHtml(title)}</div><div class="stx-step-body">${content}</div></div></div>`
    })
    .join('')

  return `<div class="stx-steps">${steps}</div>`
}

function renderCard(node: MdxJsxFlowElement): string {
  const title = getAttr(node, 'title') || ''
  const href = getAttr(node, 'href')
  const icon = getAttr(node, 'icon')
  const content = childrenToHtml(node.children, null)

  const iconHtml = icon
    ? `<div class="stx-card-icon" data-icon="${escapeHtml(icon)}"></div>`
    : ''

  const inner = `${iconHtml}<div class="stx-card-body"><div class="stx-card-title">${escapeHtml(title)}</div><div class="stx-card-description">${content}</div></div>`

  if (href) {
    return `<a class="stx-card" href="${escapeHtml(href)}">${inner}</a>`
  }
  return `<div class="stx-card">${inner}</div>`
}

function renderCardGroup(node: MdxJsxFlowElement): string {
  const cols = getAttrExpression(node, 'cols') || '2'
  const cards = node.children
    .filter((c) => (c as any).type === 'mdxJsxFlowElement' && (c as any).name === 'Card')
    .map((card) => renderCard(card as unknown as MdxJsxFlowElement))
    .join('')

  return `<div class="stx-card-group" style="grid-template-columns: repeat(${cols}, 1fr)">${cards}</div>`
}

function renderAccordion(node: MdxJsxFlowElement): string {
  const title = getAttr(node, 'title') || 'Details'
  const content = childrenToHtml(node.children, null)
  const id = `acc-${Math.random().toString(36).slice(2, 8)}`

  return `<details class="stx-accordion" id="${id}"><summary class="stx-accordion-summary"><span class="stx-accordion-title">${escapeHtml(title)}</span><svg class="stx-accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="stx-accordion-content">${content}</div></details>`
}

function renderFrame(node: MdxJsxFlowElement): string {
  const caption = getAttr(node, 'caption') || ''
  const content = childrenToHtml(node.children, null)

  const captionHtml = caption
    ? `<figcaption class="stx-frame-caption">${escapeHtml(caption)}</figcaption>`
    : ''

  return `<figure class="stx-frame">${content}${captionHtml}</figure>`
}

function renderEmbed(node: MdxJsxFlowElement): string {
  const src = getAttr(node, 'src') || ''
  const title = getAttr(node, 'title') || ''
  const type = getAttr(node, 'type') || detectEmbedType(src)

  if (type === 'youtube') {
    const videoId = extractYouTubeId(src)
    return `<div class="stx-embed stx-embed--video"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${escapeHtml(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
  }

  if (type === 'loom') {
    const loomId = src.split('/').pop() || ''
    return `<div class="stx-embed stx-embed--video"><iframe src="https://www.loom.com/embed/${loomId}" title="${escapeHtml(title)}" allowfullscreen loading="lazy"></iframe></div>`
  }

  if (type === 'video') {
    return `<div class="stx-embed stx-embed--video"><video src="${escapeHtml(src)}" controls preload="metadata">${escapeHtml(title)}</video></div>`
  }

  // Generic iframe embed
  return `<div class="stx-embed"><iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}" loading="lazy" allowfullscreen></iframe></div>`
}

function detectEmbedType(src: string): string {
  if (/youtube\.com|youtu\.be/i.test(src)) return 'youtube'
  if (/loom\.com/i.test(src)) return 'loom'
  if (/\.(mp4|webm|ogg)$/i.test(src)) return 'video'
  return 'iframe'
}

function extractYouTubeId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/) 
  return match ? match[1] : url
}

const componentRenderers: Record<string, (node: MdxJsxFlowElement) => string> = {
  Callout: renderCallout,
  Tabs: renderTabs,
  CodeGroup: renderCodeGroup,
  Steps: renderSteps,
  Card: renderCard,
  CardGroup: renderCardGroup,
  Accordion: renderAccordion,
  Frame: renderFrame,
  Embed: renderEmbed,
}

// Dynamically merge protocol-specific component renderers
import { protocolComponentRenderers } from './protocol-components'
Object.assign(componentRenderers, protocolComponentRenderers)

export const remarkComponents: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'mdxJsxFlowElement', (node: any, index, parent) => {
      if (!node.name || !componentRenderers[node.name]) return
      if (index === undefined || !parent) return

      const renderer = componentRenderers[node.name]
      const html = renderer(node as MdxJsxFlowElement)

      // Replace the node with an HTML node
      ;(parent.children as any[])[index] = {
        type: 'html',
        value: html,
      }
    })
  }
}
