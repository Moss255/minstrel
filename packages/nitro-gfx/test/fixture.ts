/**
 * Builds valid NSBMD containers in memory.
 *
 * Fixtures may not contain cartridge bytes, so every structure the parser is
 * tested against is constructed here from a description, implementing the
 * published layout independently of the reader.
 */

export interface FixtureShape {
  name: string
  /** A display list, already packed. */
  displayList: Uint8Array
}

export interface FixtureModel {
  name: string
  objects?: string[]
  materials?: string[]
  shapes?: FixtureShape[]
  /** fx32 position scale; defaults to 1.0. */
  upScale?: number
  /** Bounding box origin and extents, in fx16 units. */
  box?: [number, number, number, number, number, number]
}

const align4 = (n: number) => (n + 3) & ~3

class Writer {
  bytes: number[] = []
  get length(): number {
    return this.bytes.length
  }
  u8(v: number): this {
    this.bytes.push(v & 0xff)
    return this
  }
  u16(v: number): this {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff)
    return this
  }
  u32(v: number): this {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
    return this
  }
  raw(v: ArrayLike<number>): this {
    for (let i = 0; i < v.length; i++) this.bytes.push(v[i] as number)
    return this
  }
  name(text: string): this {
    for (let i = 0; i < 16; i++) this.bytes.push(i < text.length ? text.charCodeAt(i) & 0xff : 0)
    return this
  }
  padTo(n: number): this {
    while (this.bytes.length < n) this.bytes.push(0)
    return this
  }
  patch32(at: number, v: number): this {
    this.bytes[at] = v & 0xff
    this.bytes[at + 1] = (v >>> 8) & 0xff
    this.bytes[at + 2] = (v >>> 16) & 0xff
    this.bytes[at + 3] = (v >>> 24) & 0xff
    return this
  }
}

/**
 * Write a resource dictionary: header, patricia section, data items, names.
 *
 * The patricia nodes are filler — the parser steps over the section by its
 * declared size rather than interpreting it — but the size must be right, which
 * is what the reader validates.
 */
function writeDict(w: Writer, items: { name: string; data: number[] }[], itemSize: number): void {
  const count = items.length
  const patriciaSectionSize = 4 + 8 + count * 4
  const size = patriciaSectionSize + 4 + count * itemSize + count * 16

  w.u8(0).u8(count).u16(size)
  w.u16(8).u16(patriciaSectionSize).u32(0x0000017f)
  for (let i = 0; i < count; i++) w.u32(0)
  w.u16(itemSize).u16(4 + count * itemSize)
  for (const item of items) {
    if (item.data.length !== itemSize) throw new Error('fixture item size mismatch')
    w.raw(item.data)
  }
  for (const item of items) w.name(item.name)
}

function u32le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
}

/** Build a model body, returned as bytes to be placed inside an MDL0. */
function buildModelBody(model: FixtureModel): Uint8Array {
  const objects = model.objects ?? [model.name]
  const materials = model.materials ?? ['material0']
  const shapes = model.shapes ?? []

  // Object dictionary sits at +0x40; measure it, then the material and shape
  // sections follow.
  const objectDict = new Writer()
  writeDict(
    objectDict,
    objects.map((name, i) => ({ name, data: u32le(i) })),
    4,
  )

  // Render commands: one node-description per object, storing each into the
  // matrix stack slot of the same number, then the end opcode.
  const sbc = new Writer()
  objects.forEach((_, i) => {
    sbc
      .u8(0x26)
      .u8(i)
      .u8(i === 0 ? 0 : i - 1)
      .u8(0)
      .u8(i)
  })
  sbc.u8(0x01)

  const sbcOffset = align4(0x40 + objectDict.length)
  const materialOffset = align4(sbcOffset + sbc.length)
  // The material section: two u16 offsets to the texture-name and palette-name
  // dictionaries, then the material dictionary itself at +4.
  const materialDict = new Writer()
  writeDict(
    materialDict,
    materials.map((name, i) => ({ name: `Mat_${name}_`, data: u32le(i) })),
    4,
  )
  const textureDict = new Writer()
  writeDict(
    textureDict,
    materials.map((name, i) => ({ name, data: u32le(i) })),
    4,
  )
  const paletteDict = new Writer()
  writeDict(
    paletteDict,
    materials.map((name, i) => ({ name: `${name}_pl`, data: u32le(i) })),
    4,
  )
  const textureDictOffset = 4 + materialDict.length
  const paletteDictOffset = textureDictOffset + textureDict.length
  const materialSection = new Writer()
  materialSection.u16(textureDictOffset).u16(paletteDictOffset)
  materialSection.raw(materialDict.bytes)
  materialSection.raw(textureDict.bytes)
  materialSection.raw(paletteDict.bytes)

  const shapeOffset = align4(materialOffset + materialSection.length)

  // Shape section: a dictionary of offsets, then each shape's 16-byte header
  // and its display list.
  const shapeDict = new Writer()
  const shapeDictSize = 4 + 8 + shapes.length * 4 + 4 + shapes.length * 4 + shapes.length * 16
  let cursor = shapeDictSize
  const shapeOffsets: number[] = []
  for (const shape of shapes) {
    shapeOffsets.push(cursor)
    cursor = align4(cursor + 16 + shape.displayList.length)
  }
  writeDict(
    shapeDict,
    shapes.map((shape, i) => ({ name: shape.name, data: u32le(shapeOffsets[i] as number) })),
    4,
  )
  const shapeSection = new Writer()
  shapeSection.raw(shapeDict.bytes)
  shapes.forEach((shape, i) => {
    shapeSection.padTo(shapeOffsets[i] as number)
    shapeSection.u32(0).u32(0).u32(16).u32(shape.displayList.length)
    shapeSection.raw(shape.displayList)
  })

  const totalVertices = 0
  const body = new Writer()
  body.u32(0) // size, patched below
  body.u32(sbcOffset)
  body.u32(materialOffset)
  body.u32(shapeOffset)
  body.u32(0) // matrix offset, patched to the end below
  body.raw([0, 0, 0, objects.length, materials.length, shapes.length, 0, 0])
  const scale = Math.round((model.upScale ?? 1) * 4096)
  body.u32(scale)
  body.u32(Math.round(4096 / (model.upScale ?? 1)))
  body.u16(totalVertices).u16(0).u16(0).u16(0)
  const box = model.box ?? [0, 0, 0, 4096, 4096, 4096]
  for (const v of box) body.u16(v)
  body.u32(4096).u32(4096)
  body.padTo(0x40)
  body.raw(objectDict.bytes)
  body.padTo(sbcOffset)
  body.raw(sbc.bytes)
  body.padTo(materialOffset)
  body.raw(materialSection.bytes)
  body.padTo(shapeOffset)
  body.raw(shapeSection.bytes)

  const size = body.length
  body.patch32(0x00, size)
  body.patch32(0x10, size)
  return Uint8Array.from(body.bytes)
}

/** Build a complete NSBMD container holding the given models. */
export function buildNsbmd(models: FixtureModel[]): Uint8Array {
  const bodies = models.map(buildModelBody)

  const dictSize = 4 + 8 + models.length * 4 + 4 + models.length * 4 + models.length * 16
  let cursor = 8 + dictSize
  const offsets: number[] = []
  for (const body of bodies) {
    cursor = align4(cursor)
    offsets.push(cursor)
    cursor += body.length
  }
  const mdlSize = cursor

  const mdl = new Writer()
  mdl.raw([0x4d, 0x44, 0x4c, 0x30]) // 'MDL0'
  mdl.u32(mdlSize)
  writeDict(
    mdl,
    models.map((m, i) => ({ name: m.name, data: u32le(offsets[i] as number) })),
    4,
  )
  bodies.forEach((body, i) => {
    mdl.padTo(offsets[i] as number)
    mdl.raw(body)
  })
  mdl.padTo(mdlSize)

  const out = new Writer()
  out.raw([0x42, 0x4d, 0x44, 0x30]) // 'BMD0'
  out.u16(0xfeff).u16(2)
  out.u32(0) // file size, patched below
  out.u16(0x10).u16(1)
  out.u32(0x14)
  out.raw(mdl.bytes)
  out.patch32(0x08, out.length)
  return Uint8Array.from(out.bytes)
}

/** A packed display list drawing one triangle, for fixtures that need geometry. */
export function triangleList(): Uint8Array {
  const ONE = 1 << 12
  const bytes: number[] = []
  const push32 = (v: number) =>
    bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  // BEGIN_VTXS, VTX_16, VTX_16, VTX_16
  bytes.push(0x40, 0x23, 0x23, 0x23)
  push32(0)
  push32(0)
  push32(0)
  push32(ONE)
  push32(0)
  push32(0)
  push32(ONE)
  // END_VTXS plus padding no-ops.
  bytes.push(0x41, 0x00, 0x00, 0x00)
  return Uint8Array.from(bytes)
}
