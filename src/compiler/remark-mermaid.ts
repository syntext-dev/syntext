import type { Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Remark plugin that transforms ```mermaid code blocks into
 * a client-side rendered diagram container. The Mermaid JS library
 * is loaded lazily on first encounter.
 */
export const remarkMermaid: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'code', (node: any, index, parent) => {
      if (node.lang !== 'mermaid') return
      if (index === undefined || !parent) return

      const escaped = node.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      const html = `<div class="stx-mermaid"><pre class="mermaid">${escaped}</pre></div>
<script>
if (!window.__stxMermaidLoaded) {
  window.__stxMermaidLoaded = true;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
  s.onload = function() { mermaid.initialize({ startOnLoad: true, theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default' }); };
  document.head.appendChild(s);
}
</script>`

      ;(parent.children as any[])[index] = { type: 'html', value: html }
    })
  }
}
