import type { Field, SelectField } from 'payload'
import { describe, expect, it } from 'vitest'

import { AppWaitlist } from '../../collections/AppWaitlist'
import { Apps } from '../../collections/Apps'
import { adminOnly } from '../../access/roles'
import { APPS_PATH, appPath } from '../../lib/seo/site'

function field(fields: Field[], name: string): Field | undefined {
  return fields.find((f) => 'name' in f && f.name === name)
}

function optionValues(f: Field | undefined): string[] {
  const options = (f as SelectField | undefined)?.options ?? []
  return options.map((option) =>
    typeof option === 'string' ? option : option.value,
  )
}

describe('Apps collection', () => {
  it('publishes through drafts, so nothing reaches the page by accident', () => {
    expect(Apps.versions).toBeTruthy()
    expect(Apps.access?.read).toBeTruthy()
  })

  /**
   * The regression that produced this test: a select field called `status`
   * and Payload's drafts `_status` column both generate `enum_apps_status`.
   * The migration then typed the field with the draft enum and defaulted it
   * to a value that enum does not contain, and refused to apply.
   */
  it('does not name a field `status`, which collides with drafts', () => {
    expect(field(Apps.fields, 'status')).toBeUndefined()

    const stage = field(Apps.fields, 'stage') as SelectField | undefined
    expect(stage).toBeDefined()
    // The editor-facing word is still "Status"; only the column differs.
    expect(stage?.label).toBe('Status')
  })

  it('offers exactly the four stages the frontend renders', () => {
    // The page maps each of these to a label and a badge style; a fifth value
    // added here without one would fall back to `concept` in the query layer.
    expect(optionValues(field(Apps.fields, 'stage'))).toEqual([
      'concept',
      'in_development',
      'coming_soon',
      'available',
    ])
  })

  it('offers exactly the four plates the drawing component implements', () => {
    expect(optionValues(field(Apps.fields, 'plate'))).toEqual([
      'reader',
      'colouring',
      'year',
      'echo',
    ])
  })

  it('starts an app at concept, the claim that promises least', () => {
    const stage = field(Apps.fields, 'stage') as SelectField | undefined
    expect(stage?.defaultValue).toBe('concept')
    expect(stage?.required).toBe(true)
  })

  it('keeps the slug unique and indexed, since the route resolves on it', () => {
    const slug = field(Apps.fields, 'slug')
    expect(slug).toMatchObject({ required: true, unique: true, index: true })
  })
})

describe('AppWaitlist collection', () => {
  it('is closed to everyone; the server action writes with overrideAccess', () => {
    // An open `create` would expose an unauthenticated POST /api/app-waitlist
    // and a way to probe whether an address is already waiting on something.
    expect(AppWaitlist.access?.create).toBe(adminOnly)
    expect(AppWaitlist.access?.read).toBe(adminOnly)
    expect(AppWaitlist.access?.update).toBe(adminOnly)
    expect(AppWaitlist.access?.delete).toBe(adminOnly)
  })

  it('records the pair, not just the address', () => {
    // One person can wait on several apps, which is why this is a separate
    // collection from the single-row-per-address newsletter signups.
    const email = field(AppWaitlist.fields, 'email')
    const app = field(AppWaitlist.fields, 'app')

    expect(email).toMatchObject({ required: true, index: true })
    expect(app).toMatchObject({ required: true, index: true })
    expect(email).not.toMatchObject({ unique: true })
  })

  it('guards duplicate pairs before validation rather than after the write', () => {
    expect(AppWaitlist.hooks?.beforeValidate).toHaveLength(1)
  })
})

describe('app paths', () => {
  it('carries the trailing slash, like every other route the site serves', () => {
    expect(APPS_PATH).toBe('/apps/')
    expect(appPath('dapple')).toBe('/apps/dapple/')
  })
})
