import { describe, expect, it } from 'vitest'

import {
  parseArgs,
  sourceStorage,
  UsageError,
} from '../../scripts/process-publication'

describe('process-publication parseArgs', () => {
  it('reads a source in R2 by key', () => {
    expect(
      parseArgs([
        '--publication',
        'spring-2027',
        '--source-key',
        'publication-sources/spring-2027.pdf',
      ]),
    ).toEqual({
      publication: 'spring-2027',
      source: { kind: 'r2', key: 'publication-sources/spring-2027.pdf' },
      create: false,
      force: undefined,
      dryRun: false,
    })
  })

  it('reads a sample, with or without a page count', () => {
    expect(parseArgs(['--publication', 's', '--sample']).source).toEqual({
      kind: 'sample',
      pages: 8,
    })
    expect(
      parseArgs(['--publication', 's', '--sample', '3', '--create']),
    ).toMatchObject({ source: { kind: 'sample', pages: 3 }, create: true })
  })

  it('reads which pages to redraw', () => {
    expect(
      parseArgs(['--publication', 's', '--sample', '--pages', '2,4-5']).force,
    ).toEqual([2, 4, 5])
    expect(parseArgs(['--publication', 's', '--sample', '--all']).force).toBe(
      'all',
    )
  })

  it('needs a publication and exactly one source', () => {
    expect(() => parseArgs(['--sample'])).toThrow(UsageError)
    expect(() => parseArgs(['--publication', 's'])).toThrow(/exactly one/)
    expect(() =>
      parseArgs(['--publication', 's', '--sample', '--source-file', 'a.pdf']),
    ).toThrow(/exactly one/)
  })

  it('creates a publication for the sample only', () => {
    // A real issue is created in the admin, where an editor names it.
    expect(() =>
      parseArgs(['--publication', 's', '--source-file', 'a.pdf', '--create']),
    ).toThrow(/only goes with --sample/)
  })

  it('refuses what it does not understand rather than ignoring it', () => {
    expect(() =>
      parseArgs(['--publication', 's', '--sample', '--force']),
    ).toThrow(/Unknown argument/)
    expect(() => parseArgs(['--publication', '--sample'])).toThrow(
      /needs a value/,
    )
    expect(() =>
      parseArgs(['--publication', 's', '--sample', '--pages', '0']),
    ).toThrow(/--pages/)
    expect(() =>
      parseArgs(['--publication', 's', '--sample', '--all', '--pages', '2']),
    ).toThrow(/not both/)
    expect(() => parseArgs(['--publication', 's', '--sample', '0'])).toThrow(
      /Unknown argument|page count/,
    )
  })
})

describe('sourceStorage', () => {
  it('reads the media bucket’s credentials', () => {
    expect(
      sourceStorage({
        S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        S3_BUCKET: 'media',
        S3_ACCESS_KEY_ID: 'id',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toEqual({
      endpoint: 'https://example.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'media',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
    })
  })

  it('names what is missing, and nothing else', () => {
    expect(() => sourceStorage({ S3_BUCKET: 'media' })).toThrow(
      /S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/,
    )
  })
})
