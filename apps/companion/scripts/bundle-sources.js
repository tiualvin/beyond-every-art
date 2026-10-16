// What went into an exported bundle, checked against where it was allowed to
// come from.
//
// The resolution guard (resolution-guard.js) stops Metro resolving outside this
// project, but Expo's CLI layers its own resolvers in front of anything a
// metro.config.js sets, so the guard is a check on the path most requests take
// rather than on every one. The source maps record every module that actually
// shipped, relative to this project, so a module from the repository root shows
// up as `/../../node_modules/...` and can be refused after the fact.
//
//   node scripts/bundle-sources.js dist
//
// Needs `expo export --dump-sourcemap`.

const fs = require('node:fs')
const path = require('node:path')

/** Sources in one source map that resolve outside the project root. */
function escapedSources(map) {
  return (map.sources ?? []).filter((source) => {
    if (typeof source !== 'string' || source.startsWith('\u0000')) return false
    // Normalised as a relative path: normalising `/../x` as an absolute one
    // would quietly clamp it to `/x`.
    const relative = path.posix.normalize(source.replace(/^\/+/, ''))
    return relative === '..' || relative.startsWith('../')
  })
}

/** Every `.map` file under a directory, recursively. */
function sourceMaps(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceMaps(file)
    return entry.name.endsWith('.map') ? [file] : []
  })
}

function main(dist) {
  const maps = sourceMaps(path.join(dist, '_expo', 'static', 'js'))
  if (maps.length === 0) {
    throw new Error(
      `No source maps under ${dist}; export with --dump-sourcemap.`,
    )
  }

  let escaped = 0
  for (const file of maps) {
    const outside = escapedSources(JSON.parse(fs.readFileSync(file, 'utf8')))
    for (const source of outside) console.error(`${file}: ${source}`)
    escaped += outside.length
  }

  if (escaped > 0) {
    throw new Error(
      `${escaped} bundled module(s) came from outside apps/companion.`,
    )
  }
  console.log(
    `${maps.length} bundle(s) checked: every module is from this project.`,
  )
}

if (require.main === module) {
  try {
    main(process.argv[2] ?? 'dist')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

module.exports = { escapedSources }
