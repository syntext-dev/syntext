// Copied from syntext-backend src/services/v2/starter-index.ts (doc engine v2). Keep in step: src/syntax/sync.test.ts compares the copies.
/**
 * The starter index.mdx for a new docs project (home-as-content.md): a short
 * home written with the home components, so a new site's home is content its
 * author can edit, not a generated page. The CLI's `stx init` writes its own
 * copy (apps/cli/src/commands/init.ts); keep the two in step.
 */

const yamlString = (s: string) => (/^[\w .,!?'()-]*$/.test(s) && !/^[\s'-]/.test(s) ? s : JSON.stringify(s))
const attr = (s: string) => s.replace(/"/g, '&quot;')

export function starterIndexMdx(o: { title: string; description?: string }): string {
  const description = o.description?.trim() || 'Guides and answers, in one place.'
  return `---
title: ${yamlString(o.title)}
description: ${yamlString(description)}
layout: wide
---

<Hero title="${attr(o.title)}" description="${attr(description)}">
  <SearchBar mode="both" />

  [Get started](/quickstart)
</Hero>

<SectionCards />

<LatestUpdates count={3} />
`
}
