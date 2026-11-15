import { describe, it, expect } from 'bun:test'
import { cssContentErrors, cssUrls, decodeText, headHtmlErrors, isAllowedCssUrl, jsContentErrors } from './custom-code-rules'

const ONLY = '(head.html may contain only <meta>, <link>, <script>, <noscript> and <style>)'

describe('decodeText', () => {
  it('should decode UTF-8 text', () => {
    expect(decodeText(new TextEncoder().encode('a{} /* € */'))).toBe('a{} /* € */')
  })

  it('should refuse a NUL byte or invalid UTF-8', () => {
    expect(decodeText(new Uint8Array([0x61, 0x00, 0x62]))).toBeNull()
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x61]))).toBeNull()
  })
})

describe('isAllowedCssUrl', () => {
  it('should allow https, relative, fragments and data images and fonts', () => {
    for (const u of ['https://cdn.x/a.woff2', 'fonts/a.woff2', '../img/a.png', '/img/a.png', '#grad', 'data:image/png;base64,AA', 'data:font/woff2;base64,AA', 'data:application/font-woff;base64,AA', 'data:application/x-font-ttf;base64,AA', ''])
      expect(isAllowedCssUrl(u)).toBe(true)
  })

  it('should refuse http, protocol-relative and other schemes', () => {
    for (const u of ['http://x/a.png', '//x/a.png', 'data:text/html,<b>', 'ftp://x/a', 'javascript:alert(1)'])
      expect(isAllowedCssUrl(u)).toBe(false)
  })
})

describe('cssUrls', () => {
  it('should find quoted and bare url() targets and @import strings', () => {
    expect(cssUrls(`a{background:url("a.png")} b{background:URL( 'b.png' )} c{background:url(c.png)} @import "d.css"; @import 'e.css';`))
      .toEqual(['a.png', 'b.png', 'c.png', 'd.css', 'e.css'])
  })
})

describe('cssContentErrors', () => {
  it('should pass ordinary CSS', () => {
    expect(cssContentErrors('@import url("https://fonts.x/a.css"); body{background:url(img/a.png) #fff}')).toEqual([])
  })

  it('should refuse closing tags, case-insensitively', () => {
    expect(cssContentErrors('</STYLE> </body>')).toEqual(['CSS must not contain </style>', 'CSS must not contain </head> or </body>'])
  })

  it('should refuse expression(), script URLs, behavior and -moz-binding', () => {
    expect(cssContentErrors('a{width:Expression (1)}')).toEqual(['CSS must not use expression()'])
    expect(cssContentErrors('a{x:VBScript:1}')).toEqual(['CSS must not contain javascript: or vbscript: URLs'])
    expect(cssContentErrors('a{behavior: url(#x)}')).toEqual(['CSS must not use behavior or -moz-binding'])
    expect(cssContentErrors('a{-moz-binding:url(#x)}')).toEqual(['CSS must not use behavior or -moz-binding'])
  })

  it('should refuse url() and @import targets that are not https, relative or data images and fonts, naming the first (as the hosted build)', () => {
    expect(cssContentErrors('a{background:url(http://x/a.png)} @import "//x/b.css";')).toEqual([
      'CSS may load only https:// URLs (found "http://x/a.png")',
    ])
    expect(cssContentErrors('@import "//x/b.css";')).toEqual(['CSS may load only https:// URLs (found "//x/b.css")'])
  })

  it('should report a repeated problem once', () => {
    expect(cssContentErrors('a{background:url(http://x)} b{background:url(http://x)}')).toHaveLength(1)
  })
})

describe('jsContentErrors', () => {
  it('should refuse </script>, </head> and </body>', () => {
    expect(jsContentErrors('x()')).toEqual([])
    expect(jsContentErrors('"</ScRiPt>" "</head>"')).toEqual(['JavaScript must not contain </script>', 'JavaScript must not contain </head> or </body>'])
  })
})

describe('headHtmlErrors', () => {
  it('should allow meta, link, script, noscript and style', () => {
    const html = `<!-- analytics -->
<meta name="theme-color" content="#000">
<link rel="preconnect" href="https://fonts.x">
<link rel="icon" href="/favicon.svg">
<script src="https://cdn.x/a.js" defer></script>
<script>window.x = 1</script>
<noscript></noscript>
<style>body{color:red}</style>`
    expect(headHtmlErrors(html)).toEqual([])
  })

  it('should refuse other elements, naming each once', () => {
    expect(headHtmlErrors('<base href="/"><title>x</title><title>y</title>')).toEqual([`<base> is not allowed ${ONLY}`, `<title> is not allowed ${ONLY}`])
    expect(headHtmlErrors('<noscript><img src="a.png"></noscript>')).toEqual([`<img> is not allowed ${ONLY}`])
  })

  it('should ignore elements inside comments and script bodies', () => {
    expect(headHtmlErrors('<!-- <base href="/"> --><script>document.body.append("<div>")</script>')).toEqual([])
  })

  it('should refuse </head>, </body>, </html>, <body and <html', () => {
    for (const h of ['</head>', '</body>', '</HTML>', '<body class="x">', '<html>'])
      expect(headHtmlErrors(h)).toEqual(['head.html must not contain </head>, <body> or <html>'])
  })

  it('should refuse blocked meta http-equiv values', () => {
    expect(headHtmlErrors('<meta http-equiv="Refresh" content="0;url=x">')).toEqual(['<meta http-equiv="refresh"> is not allowed'])
    expect(headHtmlErrors("<meta http-equiv='set-cookie'>")).toEqual(['<meta http-equiv="set-cookie"> is not allowed'])
    expect(headHtmlErrors('<meta http-equiv=content-security-policy-report-only>')).toEqual(['<meta http-equiv="content-security-policy-report-only"> is not allowed'])
    expect(headHtmlErrors('<meta http-equiv="X-UA-Compatible" content="IE=edge">')).toEqual([])
  })

  it('should allow only https or relative script src and link href', () => {
    expect(headHtmlErrors('<script src="http://x/a.js"></script><link rel="stylesheet" href="//x/a.css">')).toEqual([
      '<script src> may load only https:// URLs (found "http://x/a.js")',
      '<link href> may load only https:// URLs (found "//x/a.css")',
    ])
    expect(headHtmlErrors('<script src="data:text/javascript,x()"></script>')).toEqual(['<script src> may load only https:// URLs (found "data:text/javascript,x()")'])
  })

  it('should check style bodies with the CSS rules', () => {
    expect(headHtmlErrors('<style>a{width:expression(1)}</style>')).toEqual(['CSS must not use expression()'])
  })

  it('should check an unclosed script body', () => {
    expect(headHtmlErrors('<script>x()')).toEqual([])
  })
})
