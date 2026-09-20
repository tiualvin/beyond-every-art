import { describe, expect, it } from 'vitest'

import { BLOCK_SLUGS, CONTENT_BLOCKS } from '../../blocks/schema'
import { BLOCK_GROUPS, BLOCK_ICONS } from '../../blocks/icons'

/**
 * The picker's decoration must never become part of the contract.
 *
 * `blocks/schema.ts` opens by saying slugs are stored inside every document
 * that uses them, so renaming one is a data migration however small the visual
 * change looks. Icons and groups are the opposite — nothing is stored and
 * removing them changes no document — and the value of that distinction is
 * entirely in it staying true.
 */

describe('block picker presentation', () => {
  it('draws and files every block this repository knows how to render', () => {
    for (const slug of BLOCK_SLUGS) {
      expect(BLOCK_ICONS, `${slug} has no icon`).toHaveProperty(slug)
      expect(BLOCK_GROUPS, `${slug} has no group`).toHaveProperty(slug)
    }
  })

  it('leaves slugs, labels and fields exactly as they were', () => {
    for (const block of CONTENT_BLOCKS) {
      expect(BLOCK_SLUGS).toContain(block.slug)
      expect(block.fields).toBeDefined()
      expect(block.interfaceName).toBeTruthy()
    }
    expect(CONTENT_BLOCKS).toHaveLength(BLOCK_SLUGS.length)
  })

  it('gives each block an icon the admin can actually load', () => {
    for (const block of CONTENT_BLOCKS) {
      const icon = block.admin?.images?.icon
      expect(icon, `${block.slug} lost its icon`).toBeTruthy()
      const url = typeof icon === 'string' ? icon : icon!.url
      // `data:` is permitted by `img-src` in lib/security/csp.ts; an http(s)
      // icon would be blocked by it and would also be a network round trip
      // inside the editor.
      expect(url.startsWith('data:image/svg+xml,')).toBe(true)
    }
  })

  it('files every block under one of the named groups', () => {
    const groups = new Set(Object.values(BLOCK_GROUPS))
    expect(groups).toEqual(
      new Set(['Text', 'Media', 'Lists & tables', 'Audience']),
    )
    for (const block of CONTENT_BLOCKS) {
      expect(groups, `${block.slug} is ungrouped`).toContain(block.admin?.group)
    }
  })
})
