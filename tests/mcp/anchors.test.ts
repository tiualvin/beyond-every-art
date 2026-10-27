import { describe, expect, it } from 'vitest'

import {
  compareAnchors,
  markAnchors,
  restoreAnchors,
} from '../../lib/mcp/anchors'
import type { EditorState } from '../../lib/mcp/markdown'

const text = (value: string, format = 0) => ({
  type: 'text',
  version: 1,
  text: value,
  format,
  mode: 'normal',
  style: '',
  detail: 0,
})

const heading = (children: unknown[], anchor?: string) => ({
  type: 'heading',
  tag: 'h2',
  version: 1,
  children,
  ...(anchor ? { $: { anchor } } : {}),
})

const state = (...children: unknown[]) =>
  ({
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  }) as unknown as EditorState

describe('markAnchors', () => {
  it('ends each heading that keeps an anchor with {#anchor}, and leaves the rest', () => {
    const marked = markAnchors(
      state(heading([text('Pros', 1)], 'pros-1'), heading([text('Native')])),
    )
    expect(marked.root.children[0].children).toEqual([
      text('Pros', 1),
      text(' {#pros-1}'),
    ])
    expect(marked.root.children[1].children).toEqual([text('Native')])
  })

  it('returns the same state when no heading keeps one', () => {
    const plain = state(heading([text('Native')]))
    expect(markAnchors(plain)).toBe(plain)
  })
})

describe('restoreAnchors', () => {
  it('moves the suffix back onto the node, from plain or formatted text', () => {
    const restored = restoreAnchors(
      state(
        heading([text('Pros {#pros}')]),
        heading([text('Cons', 1), text(' {#cons-1}')]),
      ),
    )
    expect(restored.root.children[0]).toMatchObject({
      children: [text('Pros')],
      $: { anchor: 'pros' },
    })
    expect(restored.root.children[1]).toMatchObject({
      children: [text('Cons', 1)],
      $: { anchor: 'cons-1' },
    })
  })

  it('refuses a suffix that is not an anchor this site can keep', () => {
    expect(() =>
      restoreAnchors(state(heading([text('Pros {#not ok}')]))),
    ).toThrow(/not an anchor this site can keep/)
    expect(() =>
      restoreAnchors(state(heading([text('Pros {#"><b>}')]))),
    ).toThrow(/not an anchor this site can keep/)
  })

  it('refuses one anchor on two headings', () => {
    expect(() =>
      restoreAnchors(
        state(heading([text('A {#same}')]), heading([text('B {#same}')])),
      ),
    ).toThrow(/on two headings, "A" and "B"/)
  })

  it('leaves headings without a suffix exactly as they were', () => {
    const plain = state(heading([text('Native')]))
    expect(restoreAnchors(plain)).toBe(plain)
  })
})

describe('compareAnchors', () => {
  it('names what a revision kept, removed and added', () => {
    expect(
      compareAnchors(
        state(heading([text('A')], 'a'), heading([text('B')], 'b')),
        state(heading([text('A')], 'a'), heading([text('C')], 'c')),
      ),
    ).toEqual({ kept: ['a'], removed: ['b'], added: ['c'] })
  })
})
