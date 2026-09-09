/**
 * The smallest PNG writer that will do.
 *
 * This exists so a sprite sheet can be looked at instead of measured. Every
 * conclusion about the sheets so far has come from a statistic, and two of them
 * were wrong in ways a picture would have shown at once: "ink fills 96-100% of
 * the cell" counted a band of the neighbouring frame as ink.
 *
 * No dependency, because the project does not take one for binary work. The
 * deflate stream is **stored blocks only** — no compression at all — which is a
 * few lines instead of a few hundred and costs nothing here: these are small
 * images written to a local directory and then looked at.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Adler-32, which is what a zlib stream ends with. */
function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const byte of bytes) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

/** A zlib stream of stored deflate blocks, which are capped at 65535 bytes each. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = []
  for (let at = 0; at < raw.length || at === 0; at += 0xffff) {
    const size = Math.min(0xffff, raw.length - at)
    const last = at + size >= raw.length ? 1 : 0
    const head = new Uint8Array(5)
    head[0] = last
    head[1] = size & 0xff
    head[2] = size >> 8
    head[3] = ~size & 0xff
    head[4] = (~size >> 8) & 0xff
    blocks.push(head, raw.subarray(at, at + size))
  }
  const body = blocks.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(2 + body + 4)
  out[0] = 0x78
  out[1] = 0x01
  let at = 2
  for (const b of blocks) {
    out.set(b, at)
    at += b.length
  }
  new DataView(out.buffer).setUint32(at, adler32(raw))
  return out
}

/** RGBA, one byte a channel, row-major. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  // Each scanline is prefixed with its filter type, and 0 is "no filter".
  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8 // bits a channel
  ihdr[9] = 6 // truecolour with alpha
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
