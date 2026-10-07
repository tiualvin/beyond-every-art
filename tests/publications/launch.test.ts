import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  PUBLICATIONS_LAUNCHED,
  publicationRoutesOpen,
} from '../../lib/publications/launch'

describe('publicationRoutesOpen', () => {
  it('closes the routes to readers until launch', () => {
    expect(publicationRoutesOpen({ draft: false }, false)).toBe(false)
  })

  it('opens them to an editor previewing before launch', () => {
    expect(publicationRoutesOpen({ draft: true }, false)).toBe(true)
  })

  it('opens them to everyone after launch', () => {
    expect(publicationRoutesOpen({ draft: false }, true)).toBe(true)
    expect(publicationRoutesOpen({ draft: true }, true)).toBe(true)
  })
})

describe('the launch switch', () => {
  // Launching is the owner's decision (docs/PUBLICATION_SYSTEM.md, open
  // decision 8). This fails on the commit that flips it, so that commit has to
  // change this line too — and cannot pass review as an incidental edit.
  it('is off until the owner signs off the launch', () => {
    expect(PUBLICATIONS_LAUNCHED).toBe(false)
  })

  // A route added under /publication/ that forgets the gate is a public URL
  // nobody signed off. Every page there has to ask.
  it('is consulted by every page under /publication/', () => {
    const dir = resolve(import.meta.dirname, '../../app/(frontend)/publication')
    const pages: string[] = []
    const walk = (path: string): void => {
      for (const entry of readdirSync(path)) {
        const full = join(path, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'page.tsx' || entry === 'route.ts') pages.push(full)
      }
    }
    walk(dir)

    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      expect(readFileSync(page, 'utf8'), page).toContain(
        'publicationRoutesOpen(',
      )
    }
  })
})
