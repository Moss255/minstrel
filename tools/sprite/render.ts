import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scanCartridge } from '@minstrel/cartridge'
import { isSprite, readSprite } from '@minstrel/game-formats'
import { encodePng } from './png.ts'

/**
 * Render a sprite sheet to a PNG, on its own, so it can be looked at.
 *
 * ```sh
 * node tools/sprite/render.ts rom/your.nds n003a
 * node tools/sprite/render.ts --period rom/your.nds n003a        # the pitch, measured
 * node tools/sprite/render.ts --sweep=16:200:16 --pitch=664 rom/your.nds n003a
 * node tools/sprite/render.ts --start=144 --pitch=664 --height=32 rom/your.nds n003a
 * ```
 *
 * `--start`, `--pitch` and `--height` go to the parser, so a candidate cut is
 * judged through the same reading the game uses rather than a copy of it.
 * `--period` measures the block's own byte period, which is the pitch; it is
 * the one instrument here that answers rather than illustrates.
 *
 * Writes two images per sheet into `out/sprite/`, which `.gitignore` covers —
 * **these are cartridge pixels and must never be committed.**
 *
 * - `<name>.sheet.png` — the whole sheet, uncut, one row of pixels per row of
 *   the file, with the boundaries the parser currently cuts on drawn across it
 *   in red and every entirely empty row marked in green down the left edge.
 *   The empty rows are where the frames really end; where red and green
 *   disagree is the bug.
 * - `<name>.frames.png` — the frames as the parser hands them out, side by
 *   side with a one-pixel gap, so a mis-cut cell is obvious next to its
 *   neighbours.
 *
 * A checkerboard shows through transparent pixels, because a sprite that has
 * been cut wrong is mostly recognisable by where its *holes* are.
 *
 * This paid for itself on the first run. Three measurements had said the sheets
 * were broadly fine — "ink fills 96-100% of the cell", "1,031 of 1,264 divide
 * exactly", "frames whose ink is in one piece: 56%" — and one look showed
 * alternating frames sliced down the middle with their halves swapped, which is
 * a horizontal wrap and was never going to show up in a count of rows.
 */

const CHECK_A = [0x30, 0x30, 0x38, 0xff]
const CHECK_B = [0x22, 0x22, 0x2a, 0xff]
const CUT = [0xff, 0x40, 0x40, 0xff]
const EMPTY = [0x40, 0xff, 0x60, 0xff]

function canvas(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = ((x >> 2) + (y >> 2)) % 2 === 0 ? CHECK_A : CHECK_B
      rgba.set(shade, (y * width + x) * 4)
    }
  }
  return rgba
}

function put(rgba: Uint8Array, width: number, x: number, y: number, colour: ArrayLike<number>) {
  rgba.set(colour, (y * width + x) * 4)
}

/** Lay one decoded frame down at a spot, over whatever is already there. */
function blit(
  rgba: Uint8Array,
  width: number,
  atX: number,
  atY: number,
  image: { width: number; height: number; pixels: Uint8Array },
) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4
      if ((image.pixels[from + 3] as number) === 0) continue
      put(rgba, width, atX + x, atY + y, image.pixels.subarray(from, from + 4))
    }
  }
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

/**
 * Read a sheet's own header, bypassing the parser.
 *
 * `--sweep` exists to try starts the parser does not yet know how to choose, so
 * it cannot go through `readSprite`. Everything else here does.
 */
function rawSheet(data: Uint8Array) {
  const u16 = (at: number) => (data[at] as number) | ((data[at + 1] as number) << 8)
  const u32 = (at: number) => (u16(at) | (u16(at + 2) << 16)) >>> 0
  const frames = u16(0)
  const width = u16(4)
  const height = u16(6)
  const need = (frames * width * height) / 2
  let palAt = -1
  for (let at = 0x10; at + 4 + 32 <= data.length; at += 4) {
    if (u32(at) !== 16) continue
    let plausible = true
    for (let i = 0; i < 16; i++) if (u16(at + 4 + i * 2) & 0x8000) plausible = false
    if (plausible && at - need >= 0x10) {
      palAt = at
      break
    }
  }
  const palette: number[][] = []
  for (let i = 0; i < 16; i++) {
    const c = u16(palAt + 4 + i * 2)
    palette.push([
      Math.round((c & 31) * 255) / 31,
      Math.round(((c >> 5) & 31) * 255) / 31,
      Math.round(((c >> 10) & 31) * 255) / 31,
      i === 0 ? 0 : 255,
    ])
  }
  return { frames, width, height, palAt, palette, pitch: (width * height) / 2 + 8 }
}

/**
 * One band per candidate start, each band showing the same few frames.
 *
 * Scan down it for the band where every frame is a whole figure with clear air
 * above it. Six statistics have now been tried in place of this and every one
 * of them chose a band that looks wrong, so the eye is the instrument.
 *
 * A tick down the left of each band counts the candidates in fives, so a band
 * can be found again in the list the run prints.
 */
function sweepStarts(
  name: string,
  data: Uint8Array,
  lo: number,
  hi: number,
  step: number,
  overridePitch?: number,
  overrideHeight?: number,
) {
  const sheet = {
    ...rawSheet(data),
    ...(overridePitch ? { pitch: overridePitch } : {}),
    ...(overrideHeight ? { height: overrideHeight } : {}),
  }
  const show = Math.min(sheet.frames, 5)
  const starts: number[] = []
  for (let s = lo; s <= hi; s += step) {
    if (s + (sheet.frames - 1) * sheet.pitch + (sheet.width * sheet.height) / 2 > sheet.palAt) break
    starts.push(s)
  }
  const gap = 2
  const cellW = sheet.width + gap
  const bandH = sheet.height + gap
  const W = 6 + show * cellW
  const H = starts.length * bandH
  const rgba = canvas(W, H)
  starts.forEach((start, row) => {
    // a tick every fifth band, so the picture maps back to the printed list
    if (row % 5 === 0)
      for (let x = 0; x < 4; x++) put(rgba, W, x, row * bandH + 1, [0xff, 0xd0, 0x40, 0xff])
    for (let f = 0; f < show; f++) {
      const at = start + f * sheet.pitch
      for (let y = 0; y < sheet.height; y++) {
        for (let x = 0; x < sheet.width; x++) {
          const i = y * sheet.width + x
          const byte = data[at + (i >> 1)]
          if (byte === undefined) continue
          const v = i & 1 ? byte >> 4 : byte & 0x0f
          if (v === 0) continue
          put(rgba, W, 6 + f * cellW + x, row * bandH + y, sheet.palette[v] as number[])
        }
      }
    }
  })
  const big = zoomed(rgba, W, H, zoom)
  const file = join(outDir, `${name}.starts.png`)
  writeFileSync(file, encodePng(big.width, big.height, big.rgba))
  console.log(
    `${name}: pitch ${sheet.pitch}, ${starts.length} starts, top to bottom: ${starts.join(' ')}`,
  )
  console.log(`   -> ${file}`)
}

/**
 * The period of the sheet's own bytes, measured rather than assumed.
 *
 * The frame pitch is the lag at which the block most nearly repeats. Scoring is
 * over the positions where **either** copy has ink, so the transparent majority
 * cannot vote for every lag equally; a wrong lag disagrees about where the ink
 * is and scores badly.
 *
 * This is what settled the pitch at 664 on the village's 32x40 characters. It
 * is a measurement of the data, not another criterion for what a frame ought to
 * look like — the six of those that were tried all chose a cut that renders
 * wrong, and are listed in `FORMAT.md` so they are not tried again.
 */
function measurePeriod(name: string, data: Uint8Array) {
  const sheet = rawSheet(data)
  const nibble = (i: number) =>
    i & 1 ? (data[i >> 1] as number) >> 4 : (data[i >> 1] as number) & 0x0f
  const from = 0x10 * 2
  const to = sheet.palAt * 2
  const nominal = (sheet.width * sheet.height) / 2
  const scored: { lag: number; score: number }[] = []
  for (let lag = Math.max(16, nominal - 60); lag <= nominal + 90; lag++) {
    const shift = lag * 2
    let both = 0
    let either = 0
    for (let i = from; i + shift < to; i++) {
      const a = nibble(i)
      const b = nibble(i + shift)
      if (a === 0 && b === 0) continue
      either++
      if (a === b) both++
    }
    scored.push({ lag, score: either === 0 ? 0 : both / either })
  }
  scored.sort((a, b) => b.score - a.score)
  const block = sheet.palAt - 0x10
  console.log(
    `${name}: ${sheet.frames} frames of ${sheet.width}x${sheet.height}, ${block} bytes of block` +
      ` (${(block / sheet.frames).toFixed(2)} a frame)`,
  )
  console.log(
    `   period: ${scored
      .slice(0, 5)
      .map((c) => `${c.lag} (${c.score.toFixed(3)})`)
      .join(', ')}`,
  )
}

const args = process.argv.slice(2)
const zoom = Number(args.find((a) => a.startsWith('--zoom='))?.slice(7) ?? 3)
const columns = Number(args.find((a) => a.startsWith('--columns='))?.slice(10) ?? 4)
const range = args.find((a) => a.startsWith('--frames='))?.slice(9)
/** `--period` — measure the byte period of the block, which is the pitch. */
const period = args.includes('--period')
/** `--sweep=lo:hi:step` — one band per candidate start, to be judged by eye. */
const sweep = args.find((a) => a.startsWith('--sweep='))?.slice(8)
/** `--pitch=N` overrides the byte pitch, to test a different frame spacing. */
const pitchArg = Number(args.find((a) => a.startsWith('--pitch='))?.slice(8)) || undefined
/** `--height=N` overrides the rows in a frame, to test a shorter cell. */
const heightArg = Number(args.find((a) => a.startsWith('--height='))?.slice(9)) || undefined
/** `--start=N` overrides the byte the first frame begins at. */
const startArg = Number(args.find((a) => a.startsWith('--start='))?.slice(8)) || undefined
const rest = args.filter((a) => !a.startsWith('--'))
const romPath = rest[0]
const wanted = rest.slice(1)
if (!romPath || wanted.length === 0) {
  console.error(
    'usage: render.ts [--zoom=N] [--columns=N] [--period] [--sweep=lo:hi:step]\n        [--start=N] [--pitch=N] [--height=N] <rom.nds> <sprite name> […]',
  )
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
  if (period) {
    measurePeriod(name, bytes)
    continue
  }
  if (sweep) {
    const [lo, hi, step] = sweep.split(':').map(Number)
    sweepStarts(name, bytes, lo ?? 16, hi ?? 300, step ?? 16, pitchArg, heightArg)
    continue
  }

  // The cut overrides go to the parser too, so a candidate can be judged
  // through the same reading the game uses rather than a copy of it here.
  const sprite = readSprite(bytes, {
    ...(startArg === undefined ? {} : { start: startArg }),
    ...(pitchArg === undefined ? {} : { pitch: pitchArg }),
    ...(heightArg === undefined ? {} : { height: heightArg }),
  })
  const stride = sprite.width

  // Every frame back to back is the whole sheet, because the cuts are contiguous.
  const first = range ? Number(range.split('-')[0]) : 0
  const last = range ? Number(range.split('-')[1] ?? range.split('-')[0]) : sprite.frames - 1
  const decoded = Array.from({ length: last - first + 1 }, (_, i) => sprite.decode(first + i))
  const rows = decoded.reduce((n, d) => n + d.height, 0)

  const sheetW = stride + 2
  const sheet = canvas(sheetW, rows)
  let y = 0
  for (let f = 0; f < decoded.length; f++) {
    const image = decoded[f] as (typeof decoded)[number]
    blit(sheet, sheetW, 2, y, image)
    // the cut the parser makes, across the full width
    for (let x = 0; x < sheetW; x++) put(sheet, sheetW, x, y, CUT)
    y += image.height
  }
  // rows with no ink at all: where the sheet actually goes quiet
  y = 0
  for (const image of decoded) {
    for (let row = 0; row < image.height; row++) {
      let ink = false
      for (let x = 0; x < image.width && !ink; x++) {
        if ((image.pixels[(row * image.width + x) * 4 + 3] as number) !== 0) ink = true
      }
      if (!ink) put(sheet, sheetW, 0, y, EMPTY)
      y++
    }
  }
  // A sheet is one narrow column hundreds of rows tall, which is unreadable as
  // an image. Cut it into columns side by side instead.
  const perCol = Math.ceil(rows / columns)
  const wideW = columns * (sheetW + 3)
  const wide = canvas(wideW, perCol)
  for (let c = 0; c < columns; c++) {
    for (let row = 0; row < perCol; row++) {
      const src = c * perCol + row
      if (src >= rows) break
      for (let x = 0; x < sheetW; x++) {
        const from = (src * sheetW + x) * 4
        put(wide, wideW, c * (sheetW + 3) + x, row, sheet.subarray(from, from + 4))
      }
    }
  }
  const big = zoomed(wide, wideW, perCol, zoom)
  const sheetFile = join(outDir, `${name}.sheet.png`)
  writeFileSync(sheetFile, encodePng(big.width, big.height, big.rgba))

  const tallest = Math.max(...decoded.map((d) => d.height))
  const stripW = decoded.length * (stride + 1)
  const strip = canvas(stripW, tallest)
  decoded.forEach((image, f) => {
    blit(strip, stripW, f * (stride + 1), 0, image)
    for (let row = 0; row < tallest; row++)
      put(strip, stripW, f * (stride + 1) - 1 < 0 ? 0 : f * (stride + 1) - 1, row, CUT)
  })
  const bigStrip = zoomed(strip, stripW, tallest, zoom)
  const stripFile = join(outDir, `${name}.frames.png`)
  writeFileSync(stripFile, encodePng(bigStrip.width, bigStrip.height, bigStrip.rgba))

  console.log(
    `${name}: ${sprite.frames} frames, ${stride}x${sprite.height} nominal, ${rows} rows -> ${sheetFile} and ${stripFile}`,
  )
}
