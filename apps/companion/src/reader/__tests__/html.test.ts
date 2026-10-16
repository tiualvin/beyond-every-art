import { htmlImageUrls, parseHtml, type HtmlNode } from '../html'

const BASE = 'https://www.beyondeveryart.com/a-migrated-post/'

const text = (nodes: HtmlNode[]): string =>
  nodes
    .map((node) => (node.type === 'text' ? node.text : text(node.children)))
    .join('')

const names = (nodes: HtmlNode[]): string[] =>
  nodes.flatMap((node) =>
    node.type === 'element' ? [node.name, ...names(node.children)] : [],
  )

describe('the HTML allow-list', () => {
  it('drops what runs, loads or submits, contents and all', () => {
    const nodes = parseHtml(
      '<p>kept</p><script>steal()</script><style>p{}</style>' +
        '<iframe src="https://x.example"><p>frame text</p></iframe>' +
        '<form><input value="x"><button>Send</button><p>inside a form</p></form>' +
        '<noscript>no script</noscript><svg><text>drawn</text></svg>',
      BASE,
    )
    expect(text(nodes)).toBe('kept')
    expect(names(nodes)).toEqual(['p'])
  })

  it('keeps only the attributes the renderer reads', () => {
    const [paragraph] = parseHtml(
      '<p class="x" style="color:red" onclick="steal()"><a href="/b/" style="x" onmouseover="y">b</a></p>',
      BASE,
    ) as [Extract<HtmlNode, { type: 'element' }>]
    expect(paragraph.attrs).toEqual({})
    expect(
      (paragraph.children[0] as Extract<HtmlNode, { type: 'element' }>).attrs,
    ).toEqual({
      href: 'https://www.beyondeveryart.com/b/',
    })
  })

  it('resolves relative links and images against the article', () => {
    const nodes = parseHtml(
      '<a href="../other/">x</a><img src="/content/images/a.jpg" alt="A">',
      BASE,
    )
    expect(nodes[0]).toMatchObject({
      attrs: { href: 'https://www.beyondeveryart.com/other/' },
    })
    expect(htmlImageUrls(nodes)).toEqual([
      'https://www.beyondeveryart.com/content/images/a.jpg',
    ])
  })

  it('turns a link it will not follow into its words', () => {
    const [link] = parseHtml(
      '<a href="javascript:steal()">words</a>',
      BASE,
    ) as [Extract<HtmlNode, { type: 'element' }>]
    expect(link.attrs).toEqual({})
    expect(text(link.children)).toBe('words')
  })

  it('drops an image with nowhere safe to load from', () => {
    const nodes = parseHtml(
      '<img src="javascript:x"><img src="data:image/png;base64,AAAA"><img>',
      BASE,
    )
    expect(names(nodes)).toEqual([])
  })

  it('unwraps an element it does not know, keeping its words', () => {
    const nodes = parseHtml(
      '<center><font color="red">old <b>markup</b></font></center>',
      BASE,
    )
    expect(names(nodes)).toEqual(['b'])
    expect(text(nodes)).toBe('old markup')
  })

  it('decodes entities', () => {
    expect(
      text(parseHtml('<p>Turner &amp; Constable, &ldquo;x&rdquo;</p>', BASE)),
    ).toBe('Turner & Constable, “x”')
  })

  it('survives markup that never closes', () => {
    expect(() =>
      parseHtml('<p><em>open <ul><li>one<li>two', BASE),
    ).not.toThrow()
    expect(text(parseHtml('<p><em>open <ul><li>one<li>two', BASE))).toContain(
      'two',
    )
  })
})
