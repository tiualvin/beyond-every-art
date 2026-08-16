// `@types/node` describes a Node release; this project runs a specific one.
//
// Dependabot offered 26.2.0 while every runtime here is Node 20 — `.nvmrc`,
// all four Dockerfile stages, all three CI jobs, and the `engines` floor. Types
// that far ahead of the runtime accept `node:` APIs added after Node 20, which
// then compile cleanly and throw in production. That is the failure the CI
// workflow already warns about in another form: something that "passed here and
// broke the Docker build".
//
// So the major is held level with the runtime rather than moved forward, and
// this test is what notices when the two drift apart — in either direction. If
// the runtime is upgraded, this fails and the types follow it up.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

function read(file: string): string {
  return readFileSync(resolve(root, file), 'utf8')
}

const packageJson = JSON.parse(read('package.json')) as {
  devDependencies: Record<string, string>
  engines: { node: string }
}

/** The leading major in a version or range, e.g. `20` from `^20.19.9`. */
function major(version: string): number {
  const match = /(\d+)/.exec(version)
  expect(match, `no major version in ${version}`).not.toBeNull()
  return Number(match![1])
}

describe('@types/node tracks the Node this project runs', () => {
  const runtime = major(read('.nvmrc').trim())

  it('matches .nvmrc', () => {
    expect(major(packageJson.devDependencies['@types/node']!)).toBe(runtime)
  })

  it('matches the engines floor and every CI job', () => {
    expect(major(packageJson.engines.node)).toBe(runtime)
    for (const line of read('.github/workflows/ci.yml').matchAll(
      /node-version:\s*(\d+)/g,
    )) {
      expect(Number(line[1])).toBe(runtime)
    }
  })

  it('matches every stage of the Dockerfile', () => {
    const images = [...read('Dockerfile').matchAll(/FROM node:(\d+)/g)]
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) expect(Number(image[1])).toBe(runtime)
  })
})
