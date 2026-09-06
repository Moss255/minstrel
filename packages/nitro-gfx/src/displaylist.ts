import { u8, u32 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'
import { fx16ToFloat, fx32ToFloat, signExtend } from './fixed.ts'

/**
 * The DS geometry-engine display list.
 *
 * A display list is the packed form of the command stream the hardware's
 * geometry FIFO consumes: four command bytes, then each command's parameters in
 * order, four bytes each. A command byte of 0 is a no-op and takes none.
 *
 * Commands and their parameter counts are from GBATEK, "DS 3D Video"
 * (https://problemkaputt.de/gbatek.htm#ds3dvideo), which lists the geometry
 * command port for each. Only the commands that appear in model display lists
 * are interpreted; the rest are stepped over by their documented parameter
 * count so the stream stays in sync rather than desynchronising into garbage.
 */

/** Geometry commands, by their GBATEK port number. */
export const GeomCommand = {
  Nop: 0x00,
  MatrixMode: 0x10,
  MatrixPush: 0x11,
  MatrixPop: 0x12,
  MatrixStore: 0x13,
  MatrixRestore: 0x14,
  MatrixIdentity: 0x15,
  MatrixLoad4x4: 0x16,
  MatrixLoad4x3: 0x17,
  MatrixMultiply4x4: 0x18,
  MatrixMultiply4x3: 0x19,
  MatrixMultiply3x3: 0x1a,
  MatrixScale: 0x1b,
  MatrixTranslate: 0x1c,
  Color: 0x20,
  Normal: 0x21,
  TexCoord: 0x22,
  Vertex16: 0x23,
  Vertex10: 0x24,
  VertexXY: 0x25,
  VertexXZ: 0x26,
  VertexYZ: 0x27,
  VertexDiff: 0x28,
  PolygonAttr: 0x29,
  TexImageParam: 0x2a,
  PaletteBase: 0x2b,
  BeginVertices: 0x40,
  EndVertices: 0x41,
} as const

/**
 * Parameter counts, by command. From GBATEK's geometry command table.
 * `undefined` marks a command number the hardware does not define.
 */
const PARAM_COUNT: readonly (number | undefined)[] = (() => {
  const counts = new Array<number | undefined>(0x100).fill(undefined)
  counts[0x00] = 0
  counts[0x10] = 1
  counts[0x11] = 0
  counts[0x12] = 1
  counts[0x13] = 1
  counts[0x14] = 1
  counts[0x15] = 0
  counts[0x16] = 16
  counts[0x17] = 12
  counts[0x18] = 16
  counts[0x19] = 12
  counts[0x1a] = 9
  counts[0x1b] = 3
  counts[0x1c] = 3
  counts[0x20] = 1
  counts[0x21] = 1
  counts[0x22] = 1
  counts[0x23] = 2
  counts[0x24] = 1
  counts[0x25] = 1
  counts[0x26] = 1
  counts[0x27] = 1
  counts[0x28] = 1
  counts[0x29] = 1
  counts[0x2a] = 1
  counts[0x2b] = 1
  counts[0x30] = 1
  counts[0x31] = 1
  counts[0x32] = 1
  counts[0x33] = 1
  counts[0x34] = 32
  counts[0x40] = 1
  counts[0x41] = 0
  counts[0x50] = 1
  counts[0x60] = 1
  counts[0x70] = 3
  counts[0x71] = 2
  counts[0x72] = 1
  return counts
})()

/** Primitive kinds a `BEGIN_VTXS` can open. */
export const PrimitiveType = {
  Triangles: 0,
  Quads: 1,
  TriangleStrip: 2,
  QuadStrip: 3,
} as const

export interface Vertex {
  /** Model-space position, in floats. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Texture coordinates, in texels. */
  readonly s: number
  readonly t: number
  /** Vertex colour, 0..1 per channel. */
  readonly r: number
  readonly g: number
  readonly b: number
  /** Index of the matrix in the position stack that was current. */
  readonly matrixId: number
}

/** Triangulated geometry from one display list. */
export interface Geometry {
  readonly vertices: readonly Vertex[]
  /** Triangle indices into {@link Geometry.vertices}. */
  readonly indices: readonly number[]
  /** Distinct `MTX_RESTORE` ids seen, in first-use order. */
  readonly matrixIds: readonly number[]
  /**
   * Distinct `MTX_SCALE` values seen, in first-use order.
   *
   * On the reference cartridge this is always empty or a single value equal to
   * the model's `upScale`; it is reported so that can be checked rather than
   * assumed.
   */
  readonly scales: readonly number[]
}

/** How many indices a primitive run of `n` vertices contributes. */
function emitPrimitive(
  type: number,
  run: number[],
  indices: number[],
  what: string,
  offset: number,
): void {
  switch (type) {
    case PrimitiveType.Triangles:
      for (let i = 0; i + 2 < run.length; i += 3) {
        indices.push(run[i] as number, run[i + 1] as number, run[i + 2] as number)
      }
      break
    case PrimitiveType.Quads:
      for (let i = 0; i + 3 < run.length; i += 4) {
        const [a, b, c, d] = [run[i], run[i + 1], run[i + 2], run[i + 3]] as number[]
        indices.push(a as number, b as number, c as number)
        indices.push(a as number, c as number, d as number)
      }
      break
    case PrimitiveType.TriangleStrip:
      for (let i = 0; i + 2 < run.length; i++) {
        // Every other triangle is wound the other way; flip it back so the
        // whole strip has one consistent winding.
        if (i % 2 === 0) {
          indices.push(run[i] as number, run[i + 1] as number, run[i + 2] as number)
        } else {
          indices.push(run[i + 1] as number, run[i] as number, run[i + 2] as number)
        }
      }
      break
    case PrimitiveType.QuadStrip:
      for (let i = 0; i + 3 < run.length; i += 2) {
        const [a, b, c, d] = [run[i], run[i + 1], run[i + 2], run[i + 3]] as number[]
        // Quad strip order is a, b, d, c around the face.
        indices.push(a as number, b as number, d as number)
        indices.push(a as number, d as number, c as number)
      }
      break
    default:
      throw new NitroGfxError(`${what}: unknown primitive type ${type}`, offset)
  }
}

/**
 * The geometry engine's state where a display list begins.
 *
 * A model's render commands run before its shapes and leave the current matrix
 * set — a `RestoreMatrix` names the slot, and a `PositionScale` scales it by
 * the model's `upScale`. Neither is in the display list, so a caller that has
 * the render commands passes what they left behind. The defaults are what a
 * display list read on its own should assume.
 */
export interface DisplayListState {
  /** The matrix slot in effect before the list's own first `MTX_RESTORE`. */
  readonly matrixId?: number
  /** The scale in effect, likewise. */
  readonly scale?: number
}

/**
 * Interpret a display list into triangles.
 *
 * The interpreter tracks the geometry engine's vertex state — current colour,
 * texture coordinate, position, scale and matrix id — as the hardware does,
 * because the position commands are deliberately partial: `VTX_XY` sets only
 * two coordinates and keeps the third, and `VTX_DIFF` adds a small delta to
 * whatever came before.
 *
 * **`MTX_SCALE` is applied; the other matrix commands are only recorded.** The
 * scale is uniform and always the model's `upScale` — 126,616 of 126,616 on the
 * reference cartridge — so folding it into the positions as they are emitted is
 * the same thing the hardware does by folding it into the current matrix, and
 * it keeps the deferred bone transform free of it. `MTX_RESTORE` loads a stored
 * matrix and so drops the scale, exactly as on hardware; a list that restores
 * mid-shape re-applies `MTX_SCALE` immediately, and one that does not never
 * emits another vertex — 0 of 1,637,744 — so no vertex is ever left at the
 * wrong scale.
 *
 * A model's bone transforms come from its render commands, which live outside
 * the display list; a caller that has them can transform by `Vertex.matrixId`.
 * For a static model the identity is correct.
 */
export function runDisplayList(
  list: Uint8Array,
  what = 'display list',
  start: DisplayListState = {},
): Geometry {
  const vertices: Vertex[] = []
  const indices: number[] = []
  const matrixIds: number[] = []
  const scales: number[] = []

  // Geometry engine vertex state.
  let x = 0
  let y = 0
  let z = 0
  let s = 0
  let t = 0
  let r = 1
  let g = 1
  let b = 1
  let matrixId = start.matrixId ?? 0
  let scaleX = start.scale ?? 1
  let scaleY = scaleX
  let scaleZ = scaleX

  let primitive = -1
  let run: number[] = []

  const pushVertex = () => {
    if (primitive < 0) {
      // A position outside BEGIN/END is legal to the hardware but contributes
      // nothing; ignore it rather than corrupting the run.
      return
    }
    run.push(vertices.length)
    vertices.push({ x: x * scaleX, y: y * scaleY, z: z * scaleZ, s, t, r, g, b, matrixId })
  }

  let at = 0
  while (at + 4 <= list.length) {
    const commands = [
      u8(list, at, what),
      u8(list, at + 1, what),
      u8(list, at + 2, what),
      u8(list, at + 3, what),
    ]
    at += 4

    for (const command of commands) {
      const params = PARAM_COUNT[command]
      if (params === undefined) {
        throw new NitroGfxError(
          `${what}: command 0x${command.toString(16)} is not a geometry command`,
          at,
        )
      }
      if (at + params * 4 > list.length) {
        // A packed list is padded to a multiple of four commands, so trailing
        // no-ops that run off the end are normal and mean the list is finished.
        if (command === GeomCommand.Nop) return { vertices, indices, matrixIds, scales }
        throw new NitroGfxError(`${what}: command 0x${command.toString(16)} lacks parameters`, at)
      }
      const p0 = params > 0 ? u32(list, at, what) : 0
      const p1 = params > 1 ? u32(list, at + 4, what) : 0
      at += params * 4

      switch (command) {
        case GeomCommand.MatrixRestore:
          matrixId = p0 & 0x1f
          if (!matrixIds.includes(matrixId)) matrixIds.push(matrixId)
          // Restoring loads a stored matrix over the current one, so whatever
          // MTX_SCALE had done to it is gone.
          scaleX = 1
          scaleY = 1
          scaleZ = 1
          break
        case GeomCommand.MatrixScale:
          scaleX = fx32ToFloat(p0)
          scaleY = fx32ToFloat(u32(list, at - 8, what))
          scaleZ = fx32ToFloat(u32(list, at - 4, what))
          for (const value of [scaleX, scaleY, scaleZ]) {
            if (!scales.includes(value)) scales.push(value)
          }
          break
        case GeomCommand.Color: {
          // 5 bits per channel, blue in the high bits.
          r = (p0 & 0x1f) / 31
          g = ((p0 >>> 5) & 0x1f) / 31
          b = ((p0 >>> 10) & 0x1f) / 31
          break
        }
        case GeomCommand.TexCoord:
          // 1.11.4 fixed point, in texels.
          s = signExtend(p0 & 0xffff, 16) / 16
          t = signExtend((p0 >>> 16) & 0xffff, 16) / 16
          break
        case GeomCommand.Vertex16:
          x = fx16ToFloat(p0 & 0xffff)
          y = fx16ToFloat((p0 >>> 16) & 0xffff)
          z = fx16ToFloat(p1 & 0xffff)
          pushVertex()
          break
        case GeomCommand.Vertex10:
          // 4.6 fixed point in 10-bit fields: shift up to fx16's 4.12.
          x = signExtend(p0 & 0x3ff, 10) / 64
          y = signExtend((p0 >>> 10) & 0x3ff, 10) / 64
          z = signExtend((p0 >>> 20) & 0x3ff, 10) / 64
          pushVertex()
          break
        case GeomCommand.VertexXY:
          x = fx16ToFloat(p0 & 0xffff)
          y = fx16ToFloat((p0 >>> 16) & 0xffff)
          pushVertex()
          break
        case GeomCommand.VertexXZ:
          x = fx16ToFloat(p0 & 0xffff)
          z = fx16ToFloat((p0 >>> 16) & 0xffff)
          pushVertex()
          break
        case GeomCommand.VertexYZ:
          y = fx16ToFloat(p0 & 0xffff)
          z = fx16ToFloat((p0 >>> 16) & 0xffff)
          pushVertex()
          break
        case GeomCommand.VertexDiff: {
          // Three 10-bit signed deltas. GBATEK gives them as fractions of the
          // 4.12 vertex format, so a unit here is 1/8 of an fx16 unit.
          const dx = signExtend(p0 & 0x3ff, 10)
          const dy = signExtend((p0 >>> 10) & 0x3ff, 10)
          const dz = signExtend((p0 >>> 20) & 0x3ff, 10)
          x += dx / (1 << 15)
          y += dy / (1 << 15)
          z += dz / (1 << 15)
          pushVertex()
          break
        }
        case GeomCommand.BeginVertices:
          primitive = p0 & 3
          run = []
          break
        case GeomCommand.EndVertices:
          if (primitive >= 0) emitPrimitive(primitive, run, indices, what, at)
          primitive = -1
          run = []
          break
        default:
          // Every other command is state the display list sets for the
          // hardware — matrices, polygon attributes, texture parameters. They
          // are stepped over by their documented parameter count, which is what
          // keeps the stream in sync.
          break
      }
    }
  }

  // A list may end without an explicit END_VTXS; flush whatever is open.
  if (primitive >= 0) emitPrimitive(primitive, run, indices, what, at)

  return { vertices, indices, matrixIds, scales }
}
