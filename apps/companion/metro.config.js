// Metro, confined to this project. See resolution-guard.js for why the bound
// is a check on each resolution rather than `disableHierarchicalLookup`.

const path = require('node:path')

const { getDefaultConfig } = require('expo/metro-config')

const { PROJECT_ROOT, assertInsideProject } = require('./resolution-guard')

const config = getDefaultConfig(PROJECT_ROOT)

// Nothing above this directory is watched, so nothing above it can be bundled.
config.watchFolders = [PROJECT_ROOT]
config.resolver.nodeModulesPaths = [path.join(PROJECT_ROOT, 'node_modules')]
config.resolver.disableHierarchicalLookup = false

const upstream = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = upstream
    ? upstream(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)

  const files =
    resolution.type === 'sourceFile'
      ? [resolution.filePath]
      : resolution.type === 'assetFiles'
        ? resolution.filePaths
        : []
  for (const file of files) {
    assertInsideProject(file, moduleName, context.originModulePath)
  }
  return resolution
}

module.exports = config
