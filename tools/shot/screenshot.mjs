import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME =
  process.env.CHROME ??
  ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync) ??
  (() => {
    throw new Error('no Chrome found; set CHROME to its path')
  })()
const rest = process.argv.slice(2)
const url = rest[0]
const out = rest[1]
const width = Number(rest[2] ?? 1280)
const height = Number(rest[3] ?? 800)
/**
 * Drive the page before the shot, so the game can be looked at somewhere other
 * than where it starts.
 *
 * `--hold=w:120` holds a key for that many frames — the game reads keys, not
 * key events, so a press has to stay down while the simulation ticks. Several
 * may be given and they run in order. `--drag=200,0` turns the camera by
 * dragging that far. `--wait=ms` waits.
 *
 * Without any of these the tool behaves exactly as it did.
 */
const script = rest.filter((a) => a.startsWith('--'))

const profile = mkdtempSync(join(tmpdir(), 'minstrel-chrome-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--no-first-run',
    'about:blank',
  ],
  // Its own process group, so every process it starts can be stopped with it.
  { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
)
chrome.stderr.on('data', () => {})

/**
 * Chrome and its profile go with this process, however it ends: done, failed,
 * or stopped by `timeout` or Ctrl+C. Left behind, each run's Chrome keeps
 * running and each profile keeps its caches in the temporary folder — enough,
 * over a day's runs, to fill it.
 */
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
    targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
    if (targets.length) break
  } catch {}
  await sleep(250)
}
const page = targets.find((t) => t.type === 'page')
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

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url })

const started = Date.now()
let title = ''
while (Date.now() - started < 180000) {
  const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
  title = r.result?.result?.value ?? ''
  if (title.startsWith('ready') || title === 'failed') break
  await sleep(500)
}
const overlay = await send('Runtime.evaluate', {
  expression:
    'document.querySelector("#overlay").textContent + "\\n---\\n" + document.querySelector("#status").textContent',
  returnByValue: true,
})
console.log('title:', title)
console.log(overlay.result?.result?.value ?? '')
// One more frame, then whatever driving was asked for, then capture.
await sleep(600)

/** A key the page can see: the game reads `key`, so that is what must match. */
const keyEvent = (type, key) =>
  send('Input.dispatchKeyEvent', {
    type,
    key,
    code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  })

/**
 * `--trace` prints where the character is and what the status says after each
 * step that changed either, so one run shows a whole sequence, not its end.
 */
const trace = script.includes('--trace')
let traced = ''
const where = async () =>
  (
    await send('Runtime.evaluate', {
      expression:
        'document.querySelector("#overlay").textContent.split("\\n")[0] + " || " + document.querySelector("#status").textContent',
      returnByValue: true,
    })
  ).result?.result?.value ?? ''

for (const [index, step] of script.entries()) {
  if (trace && index > 0) {
    const now = await where()
    if (now !== traced) console.log(`trace ${index}: ${now}`)
    traced = now
  }
  // Split on the first `=` only: a value may be `=` itself.
  const at = step.indexOf('=')
  const name = at < 0 ? step.slice(2) : step.slice(2, at)
  const value = at < 0 ? '' : step.slice(at + 1)
  if (name === 'wait') {
    await sleep(Number(value))
  } else if (name === 'hold') {
    const [key, frames] = value.split(':')
    await keyEvent('keyDown', key)
    await sleep(Number(frames ?? 60) * 16)
    await keyEvent('keyUp', key)
    await sleep(120)
  } else if (name === 'drag') {
    const [dx, dy] = value.split(',').map(Number)
    const from = { x: Math.round(width / 2), y: Math.round(height / 2) }
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...from,
      button: 'left',
      clickCount: 1,
    })
    for (let i = 1; i <= 10; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: from.x + Math.round((dx * i) / 10),
        y: from.y + Math.round(((dy ?? 0) * i) / 10),
        button: 'left',
      })
      await sleep(16)
    }
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: from.x + dx,
      y: from.y + (dy ?? 0),
      button: 'left',
      clickCount: 1,
    })
    await sleep(200)
  }
}
if (script.length > 0) {
  const after = await send('Runtime.evaluate', {
    expression:
      'document.querySelector("#overlay").textContent.split("\\n")[0] + " || " + document.querySelector("#status").textContent',
    returnByValue: true,
  })
  console.log('after driving:', (after.result?.result?.value ?? '').split('\n')[0])
  await sleep(300)
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('wrote', out)
ws.close()
process.exit(0)
