// "What we cover" says each swatch is a subject the publication writes about.
// Ghost's tag list does not agree: `featured` is a placement, and two posts
// carry it. These pin which tags the chart is allowed to call a subject.

import { describe, expect, it } from 'vitest'

import { isSubjectTag, WORKFLOW_TAG_SLUGS } from '../../lib/content/topics'

describe('isSubjectTag', () => {
  it('accepts the real subjects in the library', () => {
    for (const slug of [
      'palette',
      'studio-notes',
      'exhibitions',
      'studio-insider',
      'music',
      'art',
      'materials-science',
      'science-of-art-materials',
    ]) {
      expect(isSubjectTag(slug)).toBe(true)
    }
  })

  it('rejects a workflow tag', () => {
    expect(isSubjectTag('featured')).toBe(false)
  })

  it('rejects a workflow tag whatever its casing or padding', () => {
    // Slugs come from the database, and a hand-edited one can carry either.
    expect(isSubjectTag('Featured')).toBe(false)
    expect(isSubjectTag(' featured ')).toBe(false)
  })

  it('names every excluded slug in one place', () => {
    // A second list is how the chart and the reason for the chart drift apart.
    for (const slug of WORKFLOW_TAG_SLUGS) {
      expect(isSubjectTag(slug)).toBe(false)
    }
  })
})
