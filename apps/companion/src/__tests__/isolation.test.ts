// The app resolves its dependencies from its own node_modules and nowhere else.
//
// It lives inside the website's repository without joining a workspace, and
// the website's React, @types/react and @types/node sit one directory above
// this project's root. See resolution-guard.js for how the bound is kept and
// why it is a check rather than `disableHierarchicalLookup`.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import metroConfig from '../../metro.config.js'
import { PROJECT_ROOT, isInsideProject } from '../../resolution-guard'

const inside = (file: string) =>
  path.relative(PROJECT_ROOT, file).split(path.sep)[0] !== '..'

describe('module resolution', () => {
  it('finds React in this project', () => {
    const react = require.resolve('react')
    expect(react.startsWith(path.join(PROJECT_ROOT, 'node_modules'))).toBe(true)
  })

  it('finds React Native in this project', () => {
    expect(inside(require.resolve('react-native'))).toBe(true)
  })

  it('refuses anything outside this project', () => {
    const borrowed = path.resolve(
      PROJECT_ROOT,
      '../../node_modules/react/index.js',
    )
    expect(isInsideProject(borrowed)).toBe(false)
    expect(isInsideProject(path.join(PROJECT_ROOT, 'src/app/index.tsx'))).toBe(
      true,
    )
  })

  it('cannot reach a package only the website depends on', () => {
    // `next` is the website's and not this app's. In a full checkout it exists
    // two directories up, and the guard refuses it; in CI's companion job the
    // root is not installed and it is simply not found. Either way: not here.
    expect(() => require.resolve('next')).toThrow()
  })

  it('keeps nested copies, which is why lookup is bounded rather than off', () => {
    // htmlparser2 needs entities 7; the top level holds an older major for
    // other packages. Hierarchical lookup is what finds the right one.
    const parser = path.join(PROJECT_ROOT, 'node_modules', 'htmlparser2')
    const entities = require.resolve('entities', { paths: [parser] })
    const nested = path.join(parser, 'node_modules', 'entities')
    expect(entities.startsWith(nested + path.sep)).toBe(true)
    const { version } = JSON.parse(
      readFileSync(path.join(nested, 'package.json'), 'utf8'),
    ) as { version: string }
    expect(version.split('.')[0]).toBe('7')
    expect(inside(entities)).toBe(true)
  })
})

describe('Metro', () => {
  const config = metroConfig as unknown as {
    watchFolders: string[]
    resolver: {
      nodeModulesPaths: string[]
      resolveRequest: (
        context: unknown,
        moduleName: string,
        platform: string | null,
      ) => unknown
    }
  }

  it('watches and resolves from this project only', () => {
    expect(config.watchFolders).toEqual([PROJECT_ROOT])
    expect(config.resolver.nodeModulesPaths).toEqual([
      path.join(PROJECT_ROOT, 'node_modules'),
    ])
  })

  it('rejects a resolution that escapes the project', () => {
    const escaped = path.resolve(PROJECT_ROOT, '../../node_modules/x/index.js')
    const context = {
      originModulePath: path.join(PROJECT_ROOT, 'src/app/index.tsx'),
      resolveRequest: () => ({ type: 'sourceFile', filePath: escaped }),
    }
    expect(() => config.resolver.resolveRequest(context, 'x', 'ios')).toThrow(
      /resolved outside apps\/companion/,
    )
  })
})

describe('TypeScript', () => {
  it('reads ambient types from this project only', () => {
    const tsconfig = JSON.parse(
      readFileSync(path.join(PROJECT_ROOT, 'tsconfig.json'), 'utf8'),
    ) as { compilerOptions: { typeRoots?: string[] } }
    expect(tsconfig.compilerOptions.typeRoots).toEqual([
      './node_modules/@types',
    ])
  })
})
