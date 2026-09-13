import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scanCartridge } from '@minstrel/cartridge'
import { isSprite, readSprite } from '@minstrel/game-formats'
import { encodePng } from './png.ts'

/**
 * Render a sprite sheet's frames to a PNG, so they can be looked at, and say
 * how each is built.
 *
 * ```sh
 * node tools/sprite/render.ts rom/your.nds n003a tsubo_02
 * node tools/sprite/render.ts --zoom=4 --frames=0-3 rom/your.nds n099a
 * ```
 *
 * Writes `<name>.frames.png` into `out/sprite/`, which `.gitignore` covers —
 * **these are cartridge pixels and must never be committed** — the frames side
 * by side as the parser puts them together, over a checkerboard so their holes
 * show, and prints each frame's parts: where each goes and how big it is.
 *
 * It once measured byte periods and swept candidate cuts, when a frame was
 * thought to be rows of one sheet. A frame is its parts — see `readSprite` —
 * and there is nothing left to cut.
 */

const CHECK_A = [0x30, 0x30, 0x38, 0xff]
const CHECK_B = [0x22, 0x22, 0x2a, 0xff]

function canvas(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgba.set(((x >> 2) + (y >> 2)) % 2 === 0 ? CHECK_A : CHECK_B, (y * width + x) * 4)
    }
  }
  return rgba
}

/** Nearest-neighbour, because these are pixels and should stay pixels. */
function zoomed(rgba: Uint8Array, width: number, height: number, by: number) {
  if (by === 1) return { rgba, width, height }
  const w = width * by
  const h = height * by
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = (Math.floor(y / by) * width + Math.floor(x / by)) * 4
      out.set(rgba.subarray(from, from + 4), (y * w + x) * 4)
    }
  }
  return { rgba: out, width: w, height: h }
}

const args = process.argv.slice(2)
const zoom = Number(args.find((a) => a.startsWith('--zoom='))?.slice(7) ?? 3)
const range = args.find((a) => a.startsWith('--frames='))?.slice(9)
const rest = args.filter((a) => !a.startsWith('--'))
const romPath = rest[0]
const wanted = rest.slice(1)
if (!romPath || wanted.length === 0) {
  console.error('usage: render.ts [--zoom=N] [--frames=a-b] <rom.nds> <sprite name> […]')
  process.exit(2)
}

const rom = new Uint8Array(readFileSync(romPath))
const outDir = join('out', 'sprite')
mkdirSync(outDir, { recursive: true })

for (const name of wanted) {
  let bytes: Uint8Array | undefined
  for (const leaf of scanCartridge(rom, { pathFilter: `/data/ani/${name}.spr` })) {
    if (leaf.path.toLowerCase().endsWith(`${name.toLowerCase()}.spr`)) bytes = leaf.bytes
  }
  if (!bytes || !isSprite(bytes)) {
    console.error(`${name}: no such sprite on this cartridge`)
    continue
  }
  const sprite = readSprite(bytes)
  const first = range ? Number(range.split('-')[0]) : 0
  const last = range ? Number(range.split('-')[1] ?? range.split('-')[0]) : sprite.frames - 1
  const decoded = Array.from({ length: last - first + 1 }, (_, i) => sprite.decode(first + i))
  const gap = 2
  const stripW = decoded.reduce((n, d) => n + d.width + gap, 0)
  const stripH = Math.max(...decoded.map((d) => d.height))
  const strip = canvas(stripW, stripH)
  let atX = 0
  for (const image of decoded) {
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const from = (y * image.width + x) * 4
        if ((image.pixels[from + 3] as number) === 0) continue
        strip.set(image.pixels.subarray(from, from + 4), (y * stripW + atX + x) * 4)
      }
    }
    atX += image.width + gap
  }
  const big = zoomed(strip, stripW, stripH, zoom)
  const file = join(outDir, `${name}.frames.png`)
  writeFileSync(file, encodePng(big.width, big.height, big.rgba))
  console.log(`${name}: ${sprite.frames} frames, ${sprite.colours} colours -> ${file}`)
  for (let f = first; f <= last; f++) {
    const frame = sprite.layout[f]
    if (!frame) continue
    const parts = frame.parts.map((p) => `${p.width}x${p.height} at ${p.x},${p.y}`).join(', ')
    console.log(`   frame ${f}: ${frame.width}x${frame.height} — ${parts}`)
  }
  for (const a of sprite.animations) {
    console.log(`   ${a.name}: ${a.steps.map((s) => `${s.frame}×${s.duration}`).join(' ')}`)
  }
}
