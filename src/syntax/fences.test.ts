import { describe, it, expect } from 'bun:test'
import { scanFences } from './fences'

const kinds = (src: string) => scanFences(src.split('\n')).map((l) => l.kind)

describe('scanFences', () => {
  it('should classify a simple backtick fence', () => {
    expect(kinds('a\n```js\nx\n```\nb')).toEqual(['text', 'open', 'code', 'close', 'text'])
  })

  it('should classify tilde fences and fences longer than three', () => {
    expect(kinds('~~~~\nx\n~~~~')).toEqual(['open', 'code', 'close'])
    expect(kinds('````mdx\n```bash\nx\n```\n````')).toEqual(['open', 'code', 'code', 'code', 'close'])
  })

  it('should not close a fence with a different char or a shorter run', () => {
    expect(kinds('```\n~~~\n```')).toEqual(['open', 'code', 'close'])
    expect(kinds('````\n```\n````')).toEqual(['open', 'code', 'close'])
  })

  it('should not close a fence with a line that carries an info string', () => {
    expect(kinds('```mdx\n```bash\n```')).toEqual(['open', 'code', 'close'])
  })

  it('should not close a fence with a closer indented 4+ spaces past the opener', () => {
    // The steps.mdx shape: an indented inner fence inside a ```mdx example.
    expect(kinds('```mdx\n<Step>\n    ```bash\n    stx dev\n    ```\n</Step>\n```')).toEqual([
      'open', 'code', 'code', 'code', 'code', 'code', 'close',
    ])
  })

  it('should allow a closer indented up to 3 spaces past the opener', () => {
    expect(kinds('```\nx\n   ```')).toEqual(['open', 'code', 'close'])
    expect(kinds('    ```bash\n    x\n    ```')).toEqual(['open', 'code', 'close'])
  })

  it('should record the opener indentation on every line of the fence', () => {
    const lines = scanFences('  ```bash\n  x\n  ```'.split('\n'))
    expect(lines).toEqual([
      { kind: 'open', indent: 2 },
      { kind: 'code', openIndent: 2 },
      { kind: 'close', openIndent: 2 },
    ])
  })

  it('should not treat a backtick run whose info string contains a backtick as a fence', () => {
    expect(kinds('``` a ` b\ntext')).toEqual(['text', 'text'])
  })

  it('should run an unclosed fence to the end of the document', () => {
    expect(kinds('```\nx\ny')).toEqual(['open', 'code', 'code'])
  })
})
