import { escapedSources } from '../../scripts/bundle-sources'

describe('the exported-bundle check', () => {
  it('passes modules from this project', () => {
    expect(
      escapedSources({
        sources: [
          '/node_modules/react/index.js',
          '/src/app/_layout.tsx',
          '/node_modules/a/../b/index.js',
          '\u0000polyfill:external-require',
        ],
      }),
    ).toEqual([])
  })

  it('catches a module from the repository root', () => {
    expect(
      escapedSources({
        sources: [
          '/node_modules/react/index.js',
          '/../../node_modules/react/index.js',
        ],
      }),
    ).toEqual(['/../../node_modules/react/index.js'])
  })
})
