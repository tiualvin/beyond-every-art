// Jest, confined to this project.
//
// `roots` keeps test discovery inside `src/`. `moduleDirectories` stays the
// ordinary `node_modules` lookup, and the resolver checks every answer: see
// resolution-guard.js for why an absolute `moduleDirectories` entry — the
// obvious way to stop Jest walking up to the repository root — would also stop
// it finding the nested copies this install depends on.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleDirectories: ['node_modules'],
  resolver: '<rootDir>/jest.resolver.js',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
}
