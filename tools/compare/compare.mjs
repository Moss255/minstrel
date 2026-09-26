/**
 * Side by side: a let's play's frame and this engine's, at the same moment of
 * the same scene, for as many moments as an index names — one page to scroll.
 *
 * The index is a text file, one comparison a line, `#` for comments:
 *
 *   22510  angel-falls-4  36:05  m101  Patty pinned, Hexagoon on its way
 *   22590  angel-falls    18:02  f1
 *
 * - the scene, by number — the game plays it with `?scene=`, as the scene
 *   browser would, so the index never has to know a stage or a flag
 * - the video: `angel-falls-4` is `evidence/dq9-lp-angel-falls-4.mp4`; a path
 *   works too
 * - the time in it, `mm:ss` or `h:mm:ss`, with a fraction if wanted
 * - the moment of the scene to match: `m101` holds it once message 101 is up,
 *   `f250` at its frame 250 — see `?until=` in `docs/regions.md`
 * - anything after that is a label
 *
 * The video's frame is cut to the DS's top screen, which every video in
 * `evidence/` has at the same place; the engine's is shot at the same 4:3 with
 * its overlays hidden, so only the scene is compared.
 *
 * Use:
 *
 *   pnpm build
 *   APP=game node tools/shot/serve.mjs rom/your.nds       # terminal 1
 *   node tools/compare/compare.mjs evidence/compare.txt   # terminal 2
 *   # then open out/compare/index.html
 *
 * `--port=8765` if the server is elsewhere; `--wait=9000` for how long the
 * engine is given to reach the moment. Needs `ffmpeg` on the path. Nothing it
 * writes is committed: `evidence/` and `out/` are both ignored.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const args = process.argv.slice(2)
const flag = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const indexPath = resolve(args.find((a) => !a.startsWith('--')) ?? 'evidence/compare.txt')
const port = flag('port', '8765')
const wait = Number(flag('wait', '9000'))
const out = join(root, 'out/compare')

/** Where the DS's top screen is in the let's play's 1280 × 720: 818 × 614, from (8, 9). */
const TOP_SCREEN = 'crop=818:614:8:9'
/** Both sides at the DS's own 4:3, three and three-quarter times its size. */
const WIDTH = 960
const HEIGHT = 720

/** Seconds, from `mm:ss`, `h:mm:ss` or plain seconds. */
function seconds(time) {
  return time
    .split(':')
    .map(Number)
    .reduce((sum, part) => sum * 60 + part, 0)
}

function videoOf(name) {
  if (existsSync(name)) return resolve(name)
  const named = join(root, 'evidence', `dq9-lp-${name}.mp4`)
  if (existsSync(named)) return named
  throw new Error(`no video "${name}" — neither a path nor evidence/dq9-lp-${name}.mp4`)
}

function run(command, commandArgs) {
  const done = spawnSync(command, commandArgs, { encoding: 'utf8' })
  if (done.status !== 0) {
    throw new Error(`${command} failed: ${(done.stderr || done.stdout || '').trim().slice(-400)}`)
  }
  return done.stdout
}

const lines = readFileSync(indexPath, 'utf8')
  .split('\n')
  .map((line) => line.replace(/#.*$/, '').trim())
  .filter(Boolean)
const wanted = lines.map((line, i) => {
  const [scene, video, time, moment, ...label] = line.split(/\s+/)
  if (!/^\d+$/.test(scene ?? '') || !video || !time || !/^[mf]\d+$/.test(moment ?? '')) {
    throw new Error(`line ${i + 1} is not "scene video time m101|f250 [label]": ${line}`)
  }
  return { scene: Number(scene), video, time, moment, label: label.join(' ') }
})

mkdirSync(out, { recursive: true })
const rows = []
for (const [i, want] of wanted.entries()) {
  const name = `${String(i + 1).padStart(2, '0')}-ev${want.scene}-${want.moment}`
  const lp = join(out, `${name}-lp.png`)
  const ours = join(out, `${name}-ours.png`)
  console.log(`${name} — ${want.video} ${want.time}`)
  let trouble = ''
  try {
    run('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      String(seconds(want.time)),
      '-i',
      videoOf(want.video),
      '-frames:v',
      '1',
      '-vf',
      `${TOP_SCREEN},scale=${WIDTH}:${HEIGHT}:flags=neighbor`,
      lp,
    ])
  } catch (error) {
    trouble += `video: ${error.message} `
  }
  const url = `http://localhost:${port}/?rom=/rom.nds&scene=${want.scene}&until=${want.moment}`
  let said = ''
  try {
    said = run('node', [
      join(root, 'tools/shot/screenshot.mjs'),
      url,
      ours,
      String(WIDTH),
      String(HEIGHT),
      `--wait=${wait}`,
      // Only the scene is compared: the debug lines and the map go.
      `--eval=${['#overlay', '#status', '#minimap'].map((id) => `document.querySelector('${id}')?.style.setProperty('display','none')`).join(';')}`,
      '--wait=300',
    ])
      .split('\n')
      .find((line) => line.startsWith('after driving'))
      ?.replace(/^after driving: /, '')
  } catch (error) {
    trouble += `engine: ${error.message}`
  }
  rows.push({ ...want, name, said: said ?? '', trouble: trouble.trim() })
}

const esc = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Side by side</title>
<style>
body { margin: 0; padding: 16px; background: #0b0d14; color: #e8e6e1; font: 14px/1.4 system-ui, sans-serif; }
h1 { font-size: 18px; margin: 0 0 12px; }
.row { margin: 0 0 28px; }
.head { margin: 0 0 6px; }
.head b { font-family: ui-monospace, monospace; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pair figure { margin: 0; }
.pair img { width: 100%; image-rendering: pixelated; display: block; border: 1px solid #333; }
.pair figcaption { color: #9a98a0; font-size: 12px; margin-top: 3px; }
.bad { color: #ff8a80; }
</style>
<h1>Side by side — ${esc(indexPath.replace(`${root}/`, ''))}, ${rows.length} moments</h1>
${rows
  .map(
    (row) => `<div class="row">
  <div class="head"><b>ev${row.scene} · ${esc(row.moment)}</b> ${esc(row.label)}</div>
  <div class="pair">
    <figure><img src="${row.name}-lp.png" alt=""><figcaption>let's play · ${esc(row.video)} ${esc(row.time)}</figcaption></figure>
    <figure><img src="${row.name}-ours.png" alt=""><figcaption>ours · ${esc(row.said)}</figcaption></figure>
  </div>
  ${row.trouble ? `<div class="bad">${esc(row.trouble)}</div>` : ''}
</div>`,
  )
  .join('\n')}`,
)
console.log(`→ ${rows.length} moments · open out/compare/index.html`)
