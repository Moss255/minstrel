import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Every development query parameter must be written down.**
 *
 * The routes in `?map=`, `?stage=`, `?create=` and the rest are how every
 * sweep and screenshot in this repository is taken, and `docs/regions.md` is
 * also the specification for the debug menu that `docs/beyond-the-slice.md`
 * defers. A parameter the code reads and no table lists is one that menu will
 * never know about; a row for a parameter the code no longer reads sends the
 * next person looking for something that is not there.
 *
 * Both have happened. `tools/shot/README.md` carried `sprite` and `cut` for a
 * while after both were removed from the app, and the table was found to have
 * drifted only by reading the source against it by hand. This does that
 * reading on every run instead.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Every `params.get('x')` under a source directory, by name.
 *
 * Matches any receiver whose name ends in `params`, which covers both the
 * `params` both apps use and a plain `searchParams`. **A parameter read
 * through a receiver named anything else is invisible to this**, so it is a
 * convention this leans on rather than a guarantee it enforces.
 */
function parametersRead(from: string): Set<string> {
  const found = new Set<string>()
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!entry.name.endsWith('.ts')) continue
      for (const [, , name] of readFileSync(path, 'utf8').matchAll(
        /(?:^|[^a-zA-Z0-9_])([a-zA-Z0-9_]*[pP]arams)\.get\('([a-zA-Z0-9_]+)'\)/g,
      )) {
        found.add(name as string)
      }
    }
  }
  walk(join(root, from))
  return found
}

/**
 * Every parameter named in the **first column** of the one table under a
 * heading.
 *
 * The first column only: the prose in a row's second column mentions other
 * parameters in passing — "`?bag=w,s:3` fills by item table instead" — and
 * counting those would let a parameter pass as documented on somebody else's
 * row. Under one heading only, because both files hold other tables whose
 * first column is backticked too, and those are not parameters.
 */
function parametersDocumented(file: string, heading: string): Set<string> {
  const lines = readFileSync(join(root, file), 'utf8').split('\n')
  const from = lines.indexOf(heading)
  if (from < 0) throw new Error(`${file} has no heading '${heading}'`)
  const found = new Set<string>()
  let inTable = false
  for (const line of lines.slice(from + 1)) {
    if (!line.startsWith('|')) {
      if (inTable) break
      continue
    }
    inTable = true
    const first = line.split('|')[1] ?? ''
    for (const [, name] of first.matchAll(/`([a-zA-Z0-9_]+)[=`]/g)) found.add(name as string)
  }
  return found
}

describe('the development query parameters are documented', () => {
  const cases = [
    {
      app: 'the game',
      src: 'apps/game/src',
      doc: 'docs/regions.md',
      heading: '## The parameters',
    },
    {
      app: 'the explorer',
      src: 'apps/explorer/src',
      doc: 'tools/shot/README.md',
      heading: '## Development query parameters',
    },
  ] as const

  for (const { app, src, doc, heading } of cases) {
    it(`${app}: every parameter the code reads has a row in ${doc}`, () => {
      const documented = parametersDocumented(doc, heading)
      const undocumented = [...parametersRead(src)].filter((name) => !documented.has(name))
      expect(undocumented, `add a row to ${doc} for: ${undocumented.join(', ')}`).toEqual([])
    })

    it(`${app}: every row in ${doc} names a parameter the code reads`, () => {
      const read = parametersRead(src)
      const stale = [...parametersDocumented(doc, heading)].filter((name) => !read.has(name))
      expect(stale, `${doc} documents what ${src} no longer reads: ${stale.join(', ')}`).toEqual([])
    })
  }

  it('finds the parameters at all, so a broken scan cannot pass as a clean one', () => {
    // Both directions above are satisfied by two empty sets, which is exactly
    // what a path that stopped resolving would produce.
    expect(parametersRead('apps/game/src').size).toBeGreaterThan(30)
    expect(parametersRead('apps/explorer/src').size).toBeGreaterThan(5)
    expect(parametersDocumented('docs/regions.md', '## The parameters').size).toBeGreaterThan(30)
    expect(
      parametersDocumented('tools/shot/README.md', '## Development query parameters').size,
    ).toBeGreaterThan(5)
  })
})
