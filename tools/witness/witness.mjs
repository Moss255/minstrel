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
/**
 * One area, or several. Several share the one browser and the one fetch of the
 * cartridge, which is what makes a dip sample across the game cheap rather
 * than an hour of relaunching.
 */
const areas = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase())
if (areas.length === 0) areas.push('M01')
const flag = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`))
  return found === undefined ? fallback : found.slice(name.length + 3)
}
const stage = flag('stage', '')
const time = flag('time', '')
const wantEvents = flag('events', '1') !== '0'
/** `--talk=0` skips the conversations; `--talk=6` caps how many are opened. */
const wantTalk = Number(flag('talk', '6'))
const port = Number(flag('port', '8765'))
const [width, height] = flag('size', '960x600').split('x').map(Number)

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

const esc = (t) =>
  String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * What the game says when something is wrong, in the words it uses. It is a
 * list rather than a rule because the status line is prose meant for a person.
 * Missing a phrase makes the witness quieter than it should be, so anything
 * added to the game's own complaints belongs here too.
 */
const TROUBLE = /\b(no |not |nowhere|will not|failed|missing|cannot|unread)/i

const STYLE = `<style>
  :root { color-scheme: dark }
  body { margin: 0; padding: 24px; background: #14161a; color: #e6e8ec;
         font: 14px/1.5 ui-sans-serif, system-ui, sans-serif }
  h1 { font-size: 18px; margin: 0 0 4px }
  p.sub { margin: 0 0 24px; color: #9aa1ad }
  a { color: #8fc0ff }
  .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)) }
  figure { margin: 0; background: #1c1f25; border: 1px solid #2a2f38; border-radius: 8px; overflow: hidden }
  img { display: block; width: 100%; height: auto; background: #000 }
  figcaption { padding: 10px 12px }
  .label { font-weight: 600 }
  .where, .status { color: #9aa1ad; font-size: 12px; margin-top: 4px;
                    font-family: ui-monospace, monospace; word-break: break-word }
  .bad { color: #ff9b9b }
  .ok { color: #9ae6a0 }
  .none { padding: 40px 12px; text-align: center; color: #ff9b9b }
  table { border-collapse: collapse; width: 100% }
  td, th { text-align: left; padding: 6px 12px 6px 0; border-bottom: 1px solid #2a2f38 }
</style>`

/** One area: the map, its doorways, its events, and a page of them. */
async function witness(area) {
  const outDir = join('out', 'witness', area)
  mkdirSync(outDir, { recursive: true })
  const shots = []

  /**
   * `expect` is the map code the overlay should be naming once this view has
   * settled — which is **not** always the area: a doorway lands in the map it
   * leads to, and checking that against the source was the first version's
   * bug, reporting every doorway as a concern.
   */
  async function capture(name, label, query, expect, settle = 900) {
    const title = await visit(query)
    await sleep(settle)
    const [where = '', status = ''] = (await lines()).split('\u241F')
    if (title === 'failed') {
      shots.push({ file: undefined, label, where, status, failed: true })
      console.log(`  ${label} — FAILED to load`)
      return
    }
    const file = `${name}.png`
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, file), Buffer.from(shot.result.data, 'base64'))
    // **A page that did not say "failed" has not thereby succeeded.** The
    // first run of this tool called O00 a good view: the map had no collision
    // mesh, the game stopped on its own title card, and nothing here noticed
    // because the title never said the word. A witness that reports success on
    // a blank page is worse than no witness, so two things are checked.
    //
    // The overlay's first line names the map whenever one is up, so an overlay
    // that does not mention the area means no map was drawn. And the status
    // line is the game's own account of what went wrong, so it is read for
    // trouble rather than only shown.
    const blank = !where.toUpperCase().includes(expect.toUpperCase())
    const wrong = TROUBLE.test(status)
    shots.push({ file, label, where, status, concern: blank || wrong })
    const note = blank ? ' — NO MAP DRAWN' : wrong ? ' — trouble' : ''
    console.log(`  ${label} — ${status || where}${note}`)
  }

  console.log(`witness ${area}${stage ? ` at ${stage}` : ''}${time ? ` (${time})` : ''}`)

  // The map itself, first — and it is this visit that fills `__witness` and,
  // on the very first area, puts the cartridge in the browser's own store.
  await capture('00-map', `${area} — where it starts`, `map=${area}`, area)
  const plan = (await evaluate('JSON.stringify(window.__witness ?? null)')) ?? 'null'
  const { doorways = [], events = [], cast = [] } = JSON.parse(plan) ?? {}
  console.log(`  ${doorways.length} doorways, ${events.length} events, ${cast.length} to talk to`)

  let n = 1
  for (const to of doorways) {
    await capture(
      `${String(n++).padStart(2, '0')}-door-${to}`,
      `through the door to ${to}`,
      `map=${area}&door=${to}`,
      to,
    )
  }
  if (wantEvents) {
    for (const event of events) {
      const name = `ev${String(event).padStart(5, '0')}`
      // Scenes open on a fade and take a moment to put their cast down, so
      // this waits longer than a map does before looking.
      await capture(
        `${String(n++).padStart(2, '0')}-${name}`,
        `${name} playing`,
        `map=${area}&event=${event}`,
        area,
        2500,
      )
    }
  }

  // **Talking is the verb the witness could not show.** The map, the doorways
  // and the events were all visible; whether a villager says anything, and
  // whether they look round when spoken to, was not. `?talk=` stands the Hero
  // behind them, so a speaker who turns has turned a half-circle to do it.
  for (const who of cast.slice(0, Math.max(0, wantTalk))) {
    await capture(
      `${String(n++).padStart(2, '0')}-talk-${who.id}`,
      `talking to ${who.name} #${who.id}`,
      `map=${area}&talk=${who.id}`,
      area,
      1400,
    )
  }

  const failed = shots.filter((s) => s.failed).length
  const concerns = shots.filter((s) => s.concern).length
  writeFileSync(
    join(outDir, 'index.html'),
    `<!doctype html>
<meta charset="utf-8">
<title>witness ${esc(area)}</title>
${STYLE}
<h1>witness · ${esc(area)}${stage ? ` · stage ${esc(stage)}` : ''}${time ? ` · ${esc(time)}` : ''}</h1>
<p class="sub">${shots.length} views${failed ? ` · <span class="bad">${failed} failed to load</span>` : ''}${concerns ? ` · <span class="bad">${concerns} worth a look</span>` : ''} · ${esc(new Date().toISOString())}</p>
<div class="grid">
${shots
  .map(
    (s) => `  <figure>
    ${s.file ? `<img src="${esc(s.file)}" alt="${esc(s.label)}" loading="lazy">` : '<div class="none">did not load</div>'}
    <figcaption>
      <div class="label">${esc(s.label)}</div>
      <div class="where">${esc(s.where)}</div>
      <div class="status${s.concern ? ' bad' : ''}">${esc(s.status)}</div>
    </figcaption>
  </figure>`,
  )
  .join('\n')}
</div>
`,
  )
  console.log(`  → ${shots.length} views, ${failed} failed, ${concerns} worth a look\n`)
  return {
    area,
    views: shots.length,
    failed,
    concerns,
    doorways: doorways.length,
    events: events.length,
  }
}

const results = []
for (const area of areas) results.push(await witness(area))

// A sample of areas gets a page of its own, so the question "does the pipeline
// hold outside the slice" is one scroll rather than one folder per area.
if (results.length > 1) {
  const bad = results.reduce((n, r) => n + r.failed, 0)
  const look = results.reduce((n, r) => n + r.concerns, 0)
  writeFileSync(
    join('out', 'witness', 'index.html'),
    `<!doctype html>
<meta charset="utf-8">
<title>witness · ${results.length} areas</title>
${STYLE}
<h1>witness · ${results.length} areas${stage ? ` · stage ${esc(stage)}` : ''}</h1>
<p class="sub">${results.reduce((n, r) => n + r.views, 0)} views · <span class="${bad ? 'bad' : 'ok'}">${bad} failed to load</span> · <span class="${look ? 'bad' : 'ok'}">${look} worth a look</span> · ${esc(new Date().toISOString())}</p>
<table>
<tr><th>area</th><th>views</th><th>doorways</th><th>events</th><th>failed</th><th>worth a look</th></tr>
${results
  .map(
    (r) =>
      `<tr><td><a href="${esc(r.area)}/index.html">${esc(r.area)}</a></td><td>${r.views}</td><td>${r.doorways}</td><td>${r.events}</td><td class="${r.failed ? 'bad' : 'ok'}">${r.failed}</td><td class="${r.concerns ? 'bad' : 'ok'}">${r.concerns}</td></tr>`,
  )
  .join('\n')}
</table>
`,
  )
  console.log(
    `${results.length} areas · ${bad} failed · ${look} worth a look · open out/witness/index.html`,
  )
}
ws.close()
process.exit(results.some((r) => r.failed > 0 || r.concerns > 0) ? 1 : 0)
