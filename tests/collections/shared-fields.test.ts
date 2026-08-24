// The field factories in `fields/`, and the collections that use them.
//
// These fields were written out once per collection before, and had drifted:
// three of the five slugs validated nothing, and the migration bookkeeping was
// readable by anyone with the public API. Both are the kind of mistake that
// reappears the moment somebody copies a field definition, so the rules are
// pinned here rather than left to review.

import type { Field, TextField, TextFieldSingleValidation } from 'payload'
import { describe, expect, it } from 'vitest'

import { Apps } from '../../collections/Apps'
import { Authors } from '../../collections/Authors'
import { Media } from '../../collections/Media'
import { Pages } from '../../collections/Pages'
import { Posts } from '../../collections/Posts'
import { Tags } from '../../collections/Tags'
import { ghostIdField } from '../../fields/ghost'
import { seoFields } from '../../fields/seo'
import { slugField } from '../../fields/slug'

/** Every collection whose documents are addressable by slug. */
const SLUGGED = [Posts, Pages, Apps, Tags, Authors]

/** Fields that used to be public and are now editor-only, by collection. */
const INTERNAL_FIELDS: Array<[string, Field[], string[]]> = [
  ['posts', Posts.fields, ['ghostID', 'ghostURL', 'migrationStatus']],
  ['pages', Pages.fields, ['ghostID']],
  ['media', Media.fields, ['ghostURL', 'migrationStatus']],
  ['tags', Tags.fields, ['ghostID']],
  ['authors', Authors.fields, ['ghostID']],
]

function fieldNamed(fields: Field[], name: string): Field | undefined {
  return fields.find((field) => 'name' in field && field.name === name)
}

/** Runs a slug field's validator the way Payload would. */
function validateSlug(field: TextField, value: string) {
  const validate = field.validate as TextFieldSingleValidation
  return validate(value, {} as Parameters<TextFieldSingleValidation>[1])
}

describe('slugField', () => {
  it('refuses a slug that would not survive being a URL segment', () => {
    expect(validateSlug(slugField(), 'My Tag!')).toContain('not a valid slug')
    expect(validateSlug(slugField(), 'an-essay-on-blue')).toBe(true)
  })

  // The distinction is deliberate: Posts and Pages live at the root and can
  // shadow an application route, everything else sits under a path prefix.
  it('applies the reserved-route list only where documents live at the root', () => {
    expect(validateSlug(slugField({ reserved: true }), 'journal')).toContain(
      'reserved',
    )
    expect(validateSlug(slugField(), 'journal')).toBe(true)
  })

  // `required` already reports an empty value; a second message is noise, and
  // a draft is allowed to be unfinished.
  it('says nothing about an empty value', () => {
    expect(validateSlug(slugField(), '')).toBe(true)
  })

  describe('the create-time default', () => {
    const runHook = (
      field: TextField,
      args: { data?: unknown; operation: string; value?: unknown },
    ) => {
      const hook = field.hooks?.beforeValidate?.[0]
      return hook?.(args as unknown as Parameters<typeof hook>[0])
    }

    it('derives an empty slug from the title', () => {
      expect(
        runHook(slugField(), {
          data: { title: 'Understanding Ultramarine' },
          operation: 'create',
        }),
      ).toBe('understanding-ultramarine')
    })

    it('reads the field it was told to, not always `title`', () => {
      expect(
        runHook(slugField({ from: 'name' }), {
          data: { name: 'Prussian Blue' },
          operation: 'create',
        }),
      ).toBe('prussian-blue')
    })

    // The importer supplies Ghost's own slug. Preserving it is the point of
    // the migration, so the default must never have an opinion about it.
    it('leaves a supplied slug alone', () => {
      expect(
        runHook(slugField(), {
          data: { title: 'Understanding Ultramarine' },
          operation: 'create',
          value: 'ghosts-own-slug',
        }),
      ).toBe('ghosts-own-slug')
    })

    // On update the slug is a live URL, and deriving a "better" one from an
    // edited title is how a published article silently changes address.
    it('never touches an existing document', () => {
      expect(
        runHook(slugField(), {
          data: { title: 'A Retitled Article' },
          operation: 'update',
          value: '',
        }),
      ).toBe('')
    })
  })

  it('is what every slugged collection actually uses', () => {
    for (const collection of SLUGGED) {
      const slug = fieldNamed(collection.fields, 'slug') as TextField

      expect(slug, `${collection.slug} has a slug field`).toBeDefined()
      expect(slug.unique, `${collection.slug} slug is unique`).toBe(true)
      expect(
        validateSlug(slug, 'My Tag!'),
        `${collection.slug} slug rejects malformed input`,
      ).toContain('not a valid slug')
    }
  })
})

describe('ghostIdField', () => {
  const autofill = ghostIdField({ autofill: true })
  const runHook = (field: TextField, args: Record<string, unknown>) => {
    const hook = field.hooks?.beforeValidate?.[0]
    return hook?.(args as unknown as Parameters<typeof hook>[0])
  }

  // It is the import's idempotency key, so it stays unique — but requiring it
  // meant inventing a Ghost ID for a page Ghost never had.
  it('is unique and no longer required', () => {
    expect(autofill.unique).toBe(true)
    expect(autofill.required).toBeUndefined()
  })

  it('mints a namespaced identifier for content authored here', () => {
    const minted = runHook(autofill, { operation: 'create' })

    expect(minted).toMatch(/^native:/)
    // A Ghost ObjectID is 24 hex characters; this can never be mistaken for one.
    expect(minted).not.toMatch(/^[a-f0-9]{24}$/)
  })

  it("leaves the importer's own identifier alone", () => {
    expect(
      runHook(autofill, {
        operation: 'create',
        value: '65f1a2b3c4d5e6f708192a3b',
      }),
    ).toBe('65f1a2b3c4d5e6f708192a3b')
  })

  it('does not autofill where the field is genuinely optional', () => {
    expect(ghostIdField().hooks?.beforeValidate).toBeUndefined()
  })
})

describe('migration bookkeeping', () => {
  // `GET /api/posts` used to hand an anonymous caller the publication's Ghost
  // ObjectIDs and per-document migration state. Nothing renders any of it.
  it.each(INTERNAL_FIELDS)(
    '%s keeps its migration fields off the public API',
    (_collection, fields, names) => {
      for (const name of names) {
        const field = fieldNamed(fields, name)

        expect(field, `${name} exists`).toBeDefined()
        expect(
          (field as { access?: { read?: unknown } }).access?.read,
          `${name} gates read`,
        ).toBeTypeOf('function')
      }
    },
  )

  // The opposite call, and the reason the rule above is not "gate everything
  // migration-shaped": `legacyHTML` is the published body itself.
  it('leaves legacyHTML readable, because it is what migrated pages render', () => {
    const legacy = fieldNamed(Posts.fields, 'legacyHTML') as {
      access?: { read?: unknown }
    }

    expect(legacy.access?.read).toBeUndefined()
  })
})

describe('seoFields', () => {
  it('offers a canonical override only where content can be republished', () => {
    const names = (fields: Field[]) =>
      fields.flatMap((field) => ('name' in field ? [field.name] : []))

    expect(names(seoFields({ canonical: true }))).toContain('canonicalURL')
    expect(names(seoFields())).not.toContain('canonicalURL')
  })

  it('is what the collections that carry SEO metadata actually use', () => {
    for (const collection of [Posts, Pages, Tags, Apps]) {
      expect(
        fieldNamed(collection.fields, 'metaTitle'),
        `${collection.slug} has metaTitle`,
      ).toBeDefined()
      expect(
        fieldNamed(collection.fields, 'metaDescription'),
        `${collection.slug} has metaDescription`,
      ).toBeDefined()
    }
  })
})
