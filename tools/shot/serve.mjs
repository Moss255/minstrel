import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Which app to serve. Both take the same `?rom=` parameters, so either can be
// driven headlessly: `APP=game` to look at the village, the explorer otherwise.
const APP = process.env.APP ?? 'explorer'
const ROOT = resolve(here, `../../apps/${APP}/dist`)
const ROM = resolve(process.argv[2] ?? 'rom/rom.nds')
const PORT = Number(process.env.PORT ?? 8765)
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.nds': 'application/octet-stream',
}
createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/rom.nds') {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': statSync(ROM).size,
    })
    createReadStream(ROM).pipe(res)
    return
  }
  const p = join(ROOT, normalize(url.pathname === '/' ? '/index.html' : url.pathname))
  if (!p.startsWith(ROOT)) {
    res.writeHead(403).end()
    return
  }
  try {
    statSync(p)
  } catch {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' })
  createReadStream(p).pipe(res)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`)
  console.log(`  /rom.nds -> ${ROM}`)
})
