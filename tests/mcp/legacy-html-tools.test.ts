import { describe, expect, it } from 'vitest'

import { mcpTools } from '../../lib/mcp/tools'
import { mcpRequest } from '../support/mcp-request'

// The tools that read and edit a migrated article's Ghost HTML, run against the
// real Posts config with only the database stubbed — see
// `tests/support/mcp-request.ts`. The HTML they write is put on the page with
// `dangerouslySetInnerHTML`, so most of what is here is what they refuse.

const legacyHTML =
  '<h2>Ancient purples</h2>\n' +
  '<p>Made from murex snails, Tyrian&nbsp;<em>purple</em> was “worth its weight” in silver.</p>\n' +
  '<figure class="kg-card kg-image-card"><img src="/api/media/file/murex.jpg" alt="A murex shell"><figcaption>Murex</figcaption></figure>\n' +
  '<h2>Later purples</h2>\n' +
  '<p>Mauveine replaced it, and Tyrian purple became a curiosity.</p>'

const migrated = {
  id: 1,
  _status: 'draft',
  content: null,
  legacyHTML,
  slug: 'most-expensive-colors-in-history',
  title: 'The Most Expensive Colors in History',
}

/** Another article, as its live row reads. */
const article = (slug: string, fields: Record<string, unknown> = {}) => ({
  id: slug.length,
  _status: 'published',
  publishedAt: '2026-01-15T09:00:00.000Z',
  slug,
  title: `About ${slug}`,
  ...fields,
})

const purple = article('purple-color-history')

async function call(
  name: string,
  args: Record<string, unknown>,
  req: Awaited<ReturnType<typeof mcpRequest>>['req'],
) {
  const tool = mcpTools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`No tool named ${name}`)
  const result = (await tool.handler(args, req, undefined as never)) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

/** One edit, against the migrated fixture, by an editor. */
async function edit(
  find: string,
  replace: string,
  options: Parameters<typeof mcpRequest>[1] = { posts: [purple] },
) {
  const stub = await mcpRequest(migrated, options)
  const attempt = call(
    'editLegacyHtml',
    { id: '1', edits: [{ find, replace }] },
    stub.req,
  )
  return { ...stub, attempt }
}

describe('readLegacyHtml', () => {
  it('reads the newest version under the key, as readArticleMarkdown does', async () => {
    const { req, payload } = await mcpRequest(migrated)

    await call('readLegacyHtml', { id: '1' }, req)

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        depth: 0,
        draft: true,
        overrideAccess: false,
        user: req.user,
      }),
    )
  })

  it('refuses an article that renders from its rich-text body, and names the tool that reads it', async () => {
    const { req } = await mcpRequest({
      ...migrated,
      content: {
        root: {
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Rewritten.' }],
            },
          ],
        },
      },
    })

    await expect(call('readLegacyHtml', { id: '1' }, req)).rejects.toThrow(
      /renders from its rich-text body[\s\S]*readArticleMarkdown/,
    )
  })

  it('finds text as a reader sees it, and returns it as it is stored', async () => {
    const { req } = await mcpRequest(migrated)

    const result = await call(
      'readLegacyHtml',
      { id: '1', query: 'tyrian purple' },
      req,
    )

    expect(result.totalMatches).toBe(2)
    const [first, second] = result.matches as Array<Record<string, unknown>>
    // Across a non-breaking space and an inline tag, and back as the exact
    // characters an edit has to name.
    expect(first).toMatchObject({
      occurrence: 1,
      heading: 'Ancient purples',
      html: 'Tyrian&nbsp;<em>purple',
      storedOccurrences: 1,
    })
    expect(legacyHTML.slice(first.offset as number)).toMatch(
      /^Tyrian&nbsp;<em>purple/,
    )
    expect(first.before).toMatch(/Made from murex snails, $/)
    expect(first.after).toMatch(/^<\/em> was/)
    expect(second).toMatchObject({
      occurrence: 2,
      heading: 'Later purples',
      html: 'Tyrian purple',
    })
  })

  it('matches curly quotes by straight ones', async () => {
    const { req } = await mcpRequest(migrated)

    const result = await call(
      'readLegacyHtml',
      { id: '1', query: '"worth its weight"' },
      req,
    )

    expect(result.matches).toEqual([
      expect.objectContaining({ html: '“worth its weight”' }),
    ])
  })

  it('pages through the stored HTML without cutting a tag', async () => {
    const { req } = await mcpRequest(migrated)
    const pages: string[] = []
    let offset: number | null = 0

    while (offset !== null) {
      const page: Record<string, unknown> = await call(
        'readLegacyHtml',
        // Longer than any one tag in the fixture: a tag longer than the
        // page is the one thing a page cuts through.
        { id: '1', limit: 80, offset },
        req,
      )
      expect(page.totalLength).toBe(legacyHTML.length)
      const html = page.html as string
      // A page never ends between a `<` and its `>`.
      expect(html.lastIndexOf('<')).toBeLessThanOrEqual(html.lastIndexOf('>'))
      pages.push(html)
      offset = page.nextOffset as number | null
    }

    expect(pages.join('')).toBe(legacyHTML)
  })
})

describe('editLegacyHtml', () => {
  it('wraps a phrase in a link to a live article, and changes nothing else', async () => {
    const { attempt, payload, current } = await edit(
      'Tyrian&nbsp;<em>purple</em> was',
      '<a href="https://www.beyondeveryart.com/purple-color-history/">Tyrian&nbsp;<em>purple</em></a> was',
    )

    const result = await attempt
    const options = payload.update.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(options).toMatchObject({
      collection: 'posts',
      draft: true,
      id: 1,
      overrideAccess: false,
    })
    // One field and a draft status: never `content`, the slug, the date or
    // the canonical URL.
    expect(Object.keys(options.data).sort()).toEqual(['_status', 'legacyHTML'])
    expect(options.data._status).toBe('draft')
    expect(current().legacyHTML).toBe(
      legacyHTML.replace(
        'Tyrian&nbsp;<em>purple</em> was',
        '<a href="https://www.beyondeveryart.com/purple-color-history/">Tyrian&nbsp;<em>purple</em></a> was',
      ),
    )

    expect(result.links).toEqual([
      {
        edit: 1,
        href: 'https://www.beyondeveryart.com/purple-color-history/',
        target: 'article',
        slug: 'purple-color-history',
        status: 'live',
        title: 'About purple-color-history',
        publishedAt: '2026-01-15T09:00:00.000Z',
      },
    ])
    const [snippet] = result.edits as Array<Record<string, string>>
    expect(snippet.before).toContain('snails, Tyrian&nbsp;<em>purple</em> was')
    expect(snippet.after).toContain(
      'snails, <a href="https://www.beyondeveryart.com/purple-color-history/">Tyrian',
    )
  })

  it('corrects a sentence', async () => {
    const { attempt, current } = await edit(
      'became a curiosity.',
      'became a curiosity by 1900.',
    )

    await attempt
    expect(current().legacyHTML).toContain('became a curiosity by 1900.</p>')
  })

  it('refuses an article that renders from its rich-text body, and names the tool that writes it', async () => {
    const { req, payload } = await mcpRequest({
      ...migrated,
      content: {
        root: {
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Rewritten.' }],
            },
          ],
        },
      },
    })

    await expect(
      call(
        'editLegacyHtml',
        { id: '1', edits: [{ find: 'silver', replace: 'gold' }] },
        req,
      ),
    ).rejects.toThrow(/updateArticleMarkdown/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it.each([
    // It is stored with an entity, and matching is exact.
    ['is not in the HTML', 'Tyrian purple was', /occurs 0 times/],
    ['occurs twice', 'Tyrian', /occurs 2 times/],
  ])('refuses a find that %s', async (_, find, message) => {
    const { attempt, payload } = await edit(find, 'x')

    await expect(attempt).rejects.toThrow(message)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('makes all of the edits or none of them', async () => {
    const { req, payload, current } = await mcpRequest(migrated)

    await expect(
      call(
        'editLegacyHtml',
        {
          id: '1',
          edits: [
            { find: 'in silver', replace: 'in gold' },
            { find: 'Mauveine', replace: '<script>x()</script>Mauveine' },
          ],
        },
        req,
      ),
    ).rejects.toThrow(/^Edit 2: adds <script>/m)
    expect(payload.update).not.toHaveBeenCalled()
    expect(current().legacyHTML).toBe(legacyHTML)
  })

  it('refuses edits that overlap', async () => {
    const { req, payload } = await mcpRequest(migrated)

    await expect(
      call(
        'editLegacyHtml',
        {
          id: '1',
          edits: [
            { find: 'weight” in silver', replace: 'weight” in gold' },
            { find: 'in silver.', replace: 'in silver, once.' },
          ],
        },
        req,
      ),
    ).rejects.toThrow(/Edits 1 and 2 overlap/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  describe('the markup an edit may add', () => {
    it.each([
      [
        'a script',
        '<script>alert(1)</script>Mauveine',
        /adds <script>, which is never accepted/,
      ],
      [
        'an iframe',
        '<iframe src="https://example.com/"></iframe>Mauveine',
        /adds <iframe>/,
      ],
      ['an object', '<object data="x"></object>Mauveine', /adds <object>/],
      ['an embed', '<embed src="x">Mauveine', /adds <embed>/],
      ['a style element', '<style>p{}</style>Mauveine', /adds <style>/],
      [
        'an event handler',
        '<em onclick="alert(1)">Mauveine</em>',
        /event handler \(`onclick`\)/,
      ],
      [
        'a style attribute',
        '<strong style="color:red">Mauveine</strong>',
        /style attribute/,
      ],
      [
        'a javascript: link',
        '<a href="javascript:alert(1)">Mauveine</a>',
        /javascript: href/,
      ],
      // Decoded before it is judged, as the browser decodes it.
      [
        'an encoded javascript: link',
        '<a href="&#106;avascript:alert(1)">Mauveine</a>',
        /javascript: href/,
      ],
      ['a data: link', '<a href="data:text/html,x">Mauveine</a>', /data: href/],
      [
        'a plaintext link',
        '<a href="http://example.com/">Mauveine</a>',
        /http: href/,
      ],
      [
        'a protocol-relative link',
        '<a href="//evil.example/">Mauveine</a>',
        /protocol-relative/,
      ],
      ['a comment', '<!-- note -->Mauveine', /adds an HTML comment/],
      [
        'an attribute other than rel',
        '<a href="/purple-color-history/" target="_blank">Mauveine</a>',
        /`target` on <a>/,
      ],
      [
        'any attribute on emphasis',
        '<em class="x">Mauveine</em>',
        /`class` on <em>/,
      ],
      ['an image', '<img src="/a.jpg" alt="">Mauveine', /adds <img>/],
      // A paragraph boundary inside an href is invisible to a parser and not to
      // the regex that splits a body for ads.
      [
        'a tag inside an href',
        `<a href='/purple-color-history/?</p><img/src=x/onerror=alert(1)>'>Mauveine</a>`,
        /href with "<"/,
      ],
    ])('refuses %s', async (_, replace, message) => {
      const { attempt, payload } = await edit('Mauveine', replace)

      await expect(attempt).rejects.toThrow(message)
      expect(payload.update).not.toHaveBeenCalled()
    })

    it('refuses an attribute slipped into an existing tag by a text edit', async () => {
      const { attempt } = await edit(
        'alt="A murex shell"',
        'alt="A murex shell" onerror="alert(1)"',
      )

      await expect(attempt).rejects.toThrow(/adds <img>/)
    })

    it.each([
      ['<em>', '<em>Mauveine</em>'],
      ['<strong>', '<strong>Mauveine</strong>'],
      ['<i> and <b>', '<i><b>Mauveine</b></i>'],
      [
        'an external https link with rel',
        '<a href="https://en.wikipedia.org/wiki/Mauveine" rel="noopener noreferrer">Mauveine</a>',
      ],
      ['a root-relative link', '<a href="/purple-color-history/">Mauveine</a>'],
    ])('accepts %s', async (_, replace) => {
      const { attempt, current } = await edit('Mauveine', replace)

      await attempt
      expect(current().legacyHTML).toContain(`<p>${replace} replaced it`)
    })

    it('keeps markup copied verbatim from find, comments included', async () => {
      const { req, current } = await mcpRequest({
        ...migrated,
        legacyHTML:
          '<!--kg-card-begin: html--><p>Lac dye.</p><!--kg-card-end: html-->',
      })

      await call(
        'editLegacyHtml',
        {
          id: '1',
          edits: [
            {
              find: '<!--kg-card-begin: html--><p>Lac dye.',
              replace: '<!--kg-card-begin: html--><p>Lac dye, from an insect.',
            },
          ],
        },
        req,
      )

      expect(current().legacyHTML).toBe(
        '<!--kg-card-begin: html--><p>Lac dye, from an insect.</p><!--kg-card-end: html-->',
      )
    })
  })

  describe('what an edit may not lose or leave broken', () => {
    it.each([
      [
        'an image',
        '<img src="/api/media/file/murex.jpg" alt="A murex shell">',
        '',
      ],
      [
        'a figure',
        '<figure class="kg-card kg-image-card"><img src="/api/media/file/murex.jpg" alt="A murex shell"><figcaption>Murex</figcaption></figure>',
        '<p>Murex</p>',
      ],
      ['a paragraph', '</h2>\n<p>Mauveine', '</h2>\nMauveine'],
    ])('refuses dropping %s', async (_, find, replace) => {
      const { attempt, payload } = await edit(find, replace)

      await expect(attempt).rejects.toThrow(/drops "<(img|figure|p)/)
      expect(payload.update).not.toHaveBeenCalled()
    })

    it.each([
      [
        'a tag left open',
        'Mauveine replaced',
        '<em>Mauveine replaced',
        /leaves <em> unclosed/,
      ],
      [
        'a stray end tag',
        'Mauveine replaced',
        'Mauveine</em> replaced',
        /"<\/em>", which the browser would throw away/,
      ],
      [
        'tags closed out of order',
        'Mauveine replaced',
        '<em><b>Mauveine</em></b> replaced',
        /throw away|unclosed/,
      ],
      [
        'a link inside a link',
        'Mauveine',
        '<a href="/purple-color-history/">Mau<a href="/purple-color-history/">veine</a></a>',
        /unclosed|throw away/,
      ],
      ['a literal <', 'Mauveine replaced', 'Mauveine < replaced', /write &lt;/],
    ])('refuses %s', async (_, find, replace, message) => {
      const { attempt, payload } = await edit(find, replace)

      await expect(attempt).rejects.toThrow(message)
      expect(payload.update).not.toHaveBeenCalled()
    })

    it('refuses an edit inside a script, which is code rather than text', async () => {
      const { req } = await mcpRequest({
        ...migrated,
        legacyHTML: '<p>Embed:</p><script>window.purple = "Tyrian"</script>',
      })

      await expect(
        call(
          'editLegacyHtml',
          { id: '1', edits: [{ find: '"Tyrian"', replace: '"Imperial"' }] },
          req,
        ),
      ).rejects.toThrow(/inside a <script>/)
    })

    it('does not refuse an edit for a fault the HTML already had', async () => {
      // Ghost left this list item unclosed. Fixing a word elsewhere is not
      // made to fix it too.
      const { req, current } = await mcpRequest({
        ...migrated,
        legacyHTML: '<ul><li>Murex<li>Lac</ul><p>Two dyes.</p>',
      })

      await call(
        'editLegacyHtml',
        { id: '1', edits: [{ find: 'Two dyes.', replace: 'Two red dyes.' }] },
        req,
      )

      expect(current().legacyHTML).toContain('Two red dyes.')
    })
  })

  describe('links to this site', () => {
    it('warns that a scheduled article answers 404 until its date', async () => {
      const { attempt } = await edit(
        'Mauveine',
        '<a href="/mauveine/">Mauveine</a>',
        {
          posts: [
            article('mauveine', { publishedAt: '2099-03-01T09:00:00.000Z' }),
          ],
        },
      )

      const result = await attempt
      expect(result.links).toEqual([
        expect.objectContaining({
          slug: 'mauveine',
          status: 'scheduled',
          publishedAt: '2099-03-01T09:00:00.000Z',
        }),
      ])
      expect(result.warnings).toEqual([
        expect.stringMatching(
          /scheduled for 2099-03-01T09:00:00.000Z[\s\S]*404/,
        ),
      ])
    })

    it.each([
      ['no article has the slug', '/no-such-article/', [], /not found/],
      [
        'the article has never been published',
        '/mauveine/',
        [article('mauveine', { _status: 'draft', publishedAt: null })],
        /never been published/,
      ],
      [
        'the address is not an article',
        '/tag/purple/',
        [],
        /not an article's address/,
      ],
    ])('refuses a link when %s', async (_, href, posts, message) => {
      const { attempt, payload } = await edit(
        'Mauveine',
        `<a href="${href}">Mauveine</a>`,
        { posts: [purple, ...posts] },
      )

      await expect(attempt).rejects.toThrow(message)
      expect(payload.update).not.toHaveBeenCalled()
    })

    it('checks nothing it cannot, and says the link goes elsewhere', async () => {
      const { attempt, payload } = await edit(
        'Mauveine',
        '<a href="https://en.wikipedia.org/wiki/Mauveine">Mauveine</a>',
      )

      const result = await attempt
      expect(result.links).toEqual([
        {
          edit: 1,
          href: 'https://en.wikipedia.org/wiki/Mauveine',
          target: 'external',
        },
      ])
      // The lookup for the article itself, and the live row for `readers` —
      // never one for the external address.
      for (const [args] of payload.find.mock.calls as unknown as Array<
        [{ where?: { slug?: unknown } }]
      >) {
        expect(JSON.stringify(args.where ?? {})).not.toContain('wikipedia')
      }
    })
  })

  describe('what the reply says, and what a dry run writes', () => {
    it('saves a draft over a live article, and says readers still see the published one', async () => {
      const { req, payload } = await mcpRequest(
        {
          ...migrated,
          _status: 'published',
          publishedAt: '2025-06-01T09:00:00.000Z',
        },
        { posts: [purple] },
      )

      const result = await call(
        'editLegacyHtml',
        { id: '1', edits: [{ find: 'in silver', replace: 'in gold' }] },
        req,
      )

      expect(payload.update).toHaveBeenCalledTimes(1)
      expect(payload.update.mock.calls[0][0]).toMatchObject({ draft: true })
      expect(result).toMatchObject({
        dryRun: false,
        readers: 'live',
        status: 'draft',
      })
      expect(result.note).toMatch(/readers still see the published version/)
      expect(result.note).toContain('publishArticle')

      // And the live row is as it was.
      const live = await payload.find({ draft: false })
      expect(live.docs[0]).toMatchObject({ _status: 'published', legacyHTML })
    })

    it('writes nothing on a dry run, and shows each edit before and after', async () => {
      const { req, payload, current } = await mcpRequest(migrated, {
        posts: [purple],
      })

      const result = await call(
        'editLegacyHtml',
        {
          id: '1',
          dryRun: true,
          edits: [
            {
              find: 'Tyrian&nbsp;<em>purple</em> was',
              replace:
                '<a href="https://www.beyondeveryart.com/purple-color-history/">Tyrian&nbsp;<em>purple</em></a> was',
            },
          ],
        },
        req,
      )

      expect(payload.update).not.toHaveBeenCalled()
      expect(current().legacyHTML).toBe(legacyHTML)
      expect(result).toMatchObject({ dryRun: true, readers: 'unpublished' })
      expect(result).not.toHaveProperty('note')
      expect(result.edits).toEqual([
        expect.objectContaining({
          edit: 1,
          before: expect.stringContaining('Tyrian&nbsp;<em>purple</em> was'),
          after: expect.stringContaining(
            '<a href="https://www.beyondeveryart.com/purple-color-history/">',
          ),
        }),
      ])
      expect(result.links).toEqual([
        expect.objectContaining({ status: 'live' }),
      ])
    })
  })

  it("refuses an author's key before trying, since legacyHTML takes an editor", async () => {
    const { attempt, payload } = await edit('in silver', 'in gold', {
      posts: [purple],
      role: 'author',
    })

    await expect(attempt).rejects.toThrow(
      /can be written only by an editor or an administrator/,
    )
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('refuses a dry run by an author too, rather than promising a save it would not make', async () => {
    const { req, payload } = await mcpRequest(migrated, { role: 'author' })

    await expect(
      call(
        'editLegacyHtml',
        {
          id: '1',
          dryRun: true,
          edits: [{ find: 'in silver', replace: 'in gold' }],
        },
        req,
      ),
    ).rejects.toThrow(/editor or an administrator/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('reports a save that did not carry the edits, rather than succeeding', async () => {
    // Payload keeps a field the user may not write and says nothing. The
    // field rule is asked first; this is what stands behind it.
    const { req, payload } = await mcpRequest(migrated, { posts: [purple] })
    payload.update.mockImplementationOnce(async () => migrated)

    await expect(
      call(
        'editLegacyHtml',
        { id: '1', edits: [{ find: 'in silver', replace: 'in gold' }] },
        req,
      ),
    ).rejects.toThrow(/came back unchanged/)
  })
})
