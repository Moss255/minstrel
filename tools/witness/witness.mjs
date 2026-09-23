/**
 * The witness: one command, one page, an area seen.
 *
 * `docs/beyond-the-slice.md` sizes Phase 3 by how long it takes somebody to
 * satisfy themselves an area is right, seventy-four times over. Driving the
 * game by hand is an evening an area. This is the same look in a couple of
 * minutes: it stands in the map, walks through every doorway, plays every
 * event the triggers can reach, captures each one, and writes a single HTML
 * page with the pictures and the status lines under them.
 *
 * **What makes it fast is not the screenshots.** It is that Chrome starts once
 * and the cartridge is fetched once. `tools/shot` launches a browser and
 * re-reads 128 MiB for every picture, which is right for one picture and
 * hopeless for forty.
 *
 * It asks the page what is worth looking at — `window.__witness`, which the
 * game fills as it loads a map — rather than parsing the cartridge a second
 * time in Node. One set of parsers, one answer.
 *
 * Use:
 *
 *   pnpm build
 *   node tools/shot/serve.mjs rom/your.nds       # terminal 1, with APP=game
 *   node tools/witness/witness.mjs M01           # terminal 2
 *   # then open out/witness/M01/index.html
 *
 * Options: `--stage=2.2` opens at a story stage, `--time=night` forces the
 * hour, `--events=0` skips the scenes, `--size=1280x800`, `--port=8765`.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const area = (args.find((a) => !a.startsWith('--')) ?? 'M01').toUpperCase()
const flag = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`))
  return found === undefined ? fallback : found.slice(name.length + 3)
}
const stage = flag('stage', '')
const time = flag('time', '')
const wantEvents = flag('events', '1') !== '0'
const port = Number(flag('port', '8765'))
const [width, height] = flag('size', '960x600').split('x').map(Number)
const outDir = join('out', 'witness', area)

const CHROME =
  process.env.CHROME ??
  ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync) ??
  (() => {
    throw new Error('no Chrome found; set CHROME to its path')
  })()

const profile = mkdtempSync(join(tmpdir(), 'minstrel-witness-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9223',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--no-first-run',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
)
chrome.stderr.on('data', () => {})

let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  try {
    process.kill(-chrome.pid, 'SIGKILL')
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}
process.on('exit', cleanup)
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => process.exit(1))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let targets
for (let i = 0; i < 60; i++) {
  try {
    targets = await (await fetch('http://127.0.0.1:9223/json/list')).json()
    if (targets?.length) break
  } catch {}
  await sleep(250)
}
const page = targets?.find((t) => t.type === 'page')
if (!page) throw new Error('Chrome did not open a page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value

await send('Page.enable')
await send('Runtime.enable')

const base = `http://localhost:${port}/`
/**
 * `keep=1` puts the cartridge in the browser's own store, so every visit after
 * the first reads it from there instead of over the wire. That is the whole
 * trick: the first shot pays for the dump and the rest do not.
 */
const common = [`rom=/rom.nds`, 'keep=1', stage && `stage=${stage}`, time && `time=${time}`]
  .filter(Boolean)
  .join('&')

/** Go to one view and wait for the page to say it is ready, or to give up. */
async function visit(query) {
  await send('Page.navigate', { url: `${base}?${common}&${query}` })
  const started = Date.now()
  let title = ''
  while (Date.now() - started < 180000) {
    title = (await evaluate('document.title')) ?? ''
    if (title.startsWith('ready') || title === 'failed') break
    await sleep(400)
  }
  return title
}

/** The overlay's first line and the status line, which say where and what. */
const lines = async () =>
  (await evaluate(
    'document.querySelector("#overlay").textContent.split("\\n")[0] + "\\u241F" + document.querySelector("#status").textContent',
  )) ?? ''

mkdirSync(outDir, { recursive: true })
const shots = []
async function capture(name, label, query, settle = 900) {
  const title = await visit(query)
  await sleep(settle)
  const [where = '', status = ''] = (await lines()).split('␟')
  const file = `${name}.png`
  if (title === 'failed') {
    shots.push({ file: undefined, label, query, where, status, failed: true })
    console.log(`  ${label} — FAILED to load`)
    return
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, file), Buffer.from(shot.result.data, 'base64'))
  shots.push({ file, label, query, where, status })
  console.log(`  ${label} — ${status || where}`)
}

console.log(`witness ${area}${stage ? ` at ${stage}` : ''}${time ? ` (${time})` : ''}`)

// The map itself, first — and it is this visit that fills `__witness` and puts
// the cartridge in the browser's store for everything after it.
await capture('00-map', `${area} — where it starts`, `map=${area}`)
const plan = (await evaluate('JSON.stringify(window.__witness ?? null)')) ?? 'null'
const { doorways = [], events = [] } = JSON.parse(plan) ?? {}
console.log(`  ${doorways.length} doorways, ${events.length} events`)

let n = 1
for (const to of doorways) {
  await capture(
    `${String(n++).padStart(2, '0')}-door-${to}`,
    `through the door to ${to}`,
    `map=${area}&door=${to}`,
  )
}
if (wantEvents) {
  for (const event of events) {
    const name = `ev${String(event).padStart(5, '0')}`
    // Scenes open on a fade and take a moment to put their cast down, so this
    // waits longer than a map does before looking.
    await capture(
      `${String(n++).padStart(2, '0')}-${name}`,
      `${name} playing`,
      `map=${area}&event=${event}`,
      2500,
    )
  }
}

const esc = (t) =>
  String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const failed = shots.filter((s) => s.failed).length
const page$ = `<!doctype html>
<meta charset="utf-8">
<title>witness ${esc(area)}</title>
<style>
  :root { color-scheme: dark }
  body { margin: 0; padding: 24px; background: #14161a; color: #e6e8ec;
         font: 14px/1.5 ui-sans-serif, system-ui, sans-serif }
  h1 { font-size: 18px; margin: 0 0 4px }
  p.sub { margin: 0 0 24px; color: #9aa1ad }
  .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)) }
  figure { margin: 0; background: #1c1f25; border: 1px solid #2a2f38; border-radius: 8px; overflow: hidden }
  img { display: block; width: 100%; height: auto; background: #000 }
  figcaption { padding: 10px 12px }
  .label { font-weight: 600 }
  .where, .status { color: #9aa1ad; font-size: 12px; margin-top: 4px;
                    font-family: ui-monospace, monospace; word-break: break-word }
  .bad { color: #ff9b9b }
  .none { padding: 40px 12px; text-align: center; color: #ff9b9b }
</style>
<h1>witness · ${esc(area)}${stage ? ` · stage ${esc(stage)}` : ''}${time ? ` · ${esc(time)}` : ''}</h1>
<p class="sub">${shots.length} views${failed ? ` · <span class="bad">${failed} failed to load</span>` : ''} · ${esc(new Date().toISOString())}</p>
<div class="grid">
${shots
  .map(
    (s) => `  <figure>
    ${s.file ? `<img src="${esc(s.file)}" alt="${esc(s.label)}" loading="lazy">` : '<div class="none">did not load</div>'}
    <figcaption>
      <div class="label">${esc(s.label)}</div>
      <div class="where">${esc(s.where)}</div>
      <div class="status${/no |will not|failed|missing/i.test(s.status) ? ' bad' : ''}">${esc(s.status)}</div>
    </figcaption>
  </figure>`,
  )
  .join('\n')}
</div>
`
writeFileSync(join(outDir, 'index.html'), page$)
console.log(`\n${shots.length} views, ${failed} failed · open ${join(outDir, 'index.html')}`)
ws.close()
process.exit(failed > 0 ? 1 : 0)
