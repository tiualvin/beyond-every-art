// Every module this app loads comes from inside this directory.
//
// The app sits inside the website's repository without joining a workspace,
// and Node-style resolution walks up the tree: a dependency missing here would
// be found in the repository root's node_modules, where the website keeps its
// own React, @types/react and @types/node. That would build, and test, against
// whatever the website happens to pin — until the day the two disagreed.
//
// Metro (metro.config.js) and Jest (jest.resolver.js) both resolve as they
// normally would and then pass the answer through here, which refuses anything
// that landed outside this project.
//
// Why a check on the answer rather than `disableHierarchicalLookup`: the
// hoisted install keeps a package's own copy of a conflicting dependency in a
// nested node_modules — htmlparser2 needs entities 7 and the top level holds
// entities 4; expo-router needs react-is 19 and the top level holds 18. Turning
// hierarchical lookup off skips those nested copies and resolves the wrong
// major without an error. Bounding the lookup keeps them and still stops it at
// this directory. See docs/COMPANION_APP.md.

const fs = require('node:fs')
const path = require('node:path')

const PROJECT_ROOT = fs.realpathSync(__dirname)

/** Whether an absolute path is this project or something inside it. */
function isInsideProject(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return true
  let real = file
  try {
    real = fs.realpathSync(file)
  } catch {
    // A path that does not exist yet (a virtual module) is judged as written.
  }
  const relative = path.relative(PROJECT_ROOT, real)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Throws when a resolved path is outside this project. */
function assertInsideProject(file, request, from) {
  if (isInsideProject(file)) return
  throw new Error(
    `"${request}" resolved outside apps/companion, to ${file} (from ${from}). ` +
      'Add it to this project’s package.json instead of borrowing it from the ' +
      'repository root.',
  )
}

module.exports = { PROJECT_ROOT, assertInsideProject, isInsideProject }
