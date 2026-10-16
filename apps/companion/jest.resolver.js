// Jest's resolution, confined to this project. See resolution-guard.js.

const { assertInsideProject } = require('./resolution-guard')

module.exports = (request, options) => {
  const resolved = options.defaultResolver(request, options)
  assertInsideProject(resolved, request, options.basedir)
  return resolved
}
