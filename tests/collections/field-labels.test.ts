import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { Apps } from '../../collections/Apps'
import { Media } from '../../collections/Media'
import { Pages } from '../../collections/Pages'
import { Posts } from '../../collections/Posts'

const collections = [Apps, Media, Pages, Posts]

function urlFields(fields: Field[]): Array<{ name: string; label?: unknown }> {
  return fields.flatMap((field) => {
    const nested = 'fields' in field ? urlFields(field.fields) : []
    const current =
      'name' in field && field.name.endsWith('URL')
        ? [
            {
              name: field.name,
              ...('label' in field && { label: field.label }),
            },
          ]
        : []
    return [...current, ...nested]
  })
}

describe('Payload collection field labels', () => {
  it('renders URL as one initialism in every URL field label', () => {
    const fields = collections.flatMap((collection) =>
      urlFields(collection.fields),
    )

    expect(fields).toHaveLength(6)
    for (const field of fields) {
      expect(field.label, `${field.name} label`).toMatch(/ URL$/)
    }
  })
})
