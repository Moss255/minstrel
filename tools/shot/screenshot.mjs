import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME =
  process.env.CHROME ??
  ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync) ??
  (() => {
    throw new Error('no Chrome found; set CHROME to its path')
  })()
const url = process.argv[2]
const out = process.argv[3]
const width = Number(process.argv[4] ?? 1280)
const height = Number(process.argv[5] ?? 800)

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
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
chrome.stderr.on('data', () => {})

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
// One more frame, then capture.
await sleep(600)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('wrote', out)
ws.close()
chrome.kill()
process.exit(0)
