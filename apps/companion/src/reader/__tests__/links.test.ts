import { classifyLink } from '../links'

const SITE = 'https://www.beyondeveryart.com'

describe('the link policy', () => {
  it.each([
    ['/an-essay-on-blue/', 'an-essay-on-blue'],
    ['https://www.beyondeveryart.com/an-essay-on-blue/', 'an-essay-on-blue'],
    ['https://beyondeveryart.com/an-essay-on-blue', 'an-essay-on-blue'],
    ['http://www.beyondeveryart.com/an-essay-on-blue/', 'an-essay-on-blue'],
    ['/caf%C3%A9-notes/', 'café-notes'],
  ])('opens %s in the app', (href, slug) => {
    expect(classifyLink(href, SITE)).toMatchObject({ kind: 'article', slug })
  })

  it.each([
    'https://www.beyondeveryart.com/journal/',
    'https://www.beyondeveryart.com/search/?q=blue',
    'https://www.beyondeveryart.com/tag/materials/',
    'https://www.beyondeveryart.com/',
    'https://example.com/an-essay-on-blue/',
    'mailto:editor@example.com',
  ])('sends %s to the system', (href) => {
    expect(classifyLink(href, SITE).kind).toBe('external')
  })

  it.each(['javascript:alert(1)', 'data:text/html,hi', '#section', '', '   '])(
    'follows %j nowhere',
    (href) => {
      expect(classifyLink(href, SITE)).toEqual({ kind: 'none' })
    },
  )

  it('tells a local website’s ports apart', () => {
    const local = 'http://localhost:3000'
    expect(classifyLink('http://localhost:3000/a-post/', local).kind).toBe(
      'article',
    )
    expect(classifyLink('http://localhost:4000/a-post/', local).kind).toBe(
      'external',
    )
  })
})
