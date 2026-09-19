import { checkRange, resourceName, u8, u16, u32 } from './bytes.ts'
import { readDict } from './dict.ts'
import { type Geometry, runDisplayList } from './displaylist.ts'
import { NitroGfxError } from './errors.ts'
import { fx16ToFloat, fx32ToFloat } from './fixed.ts'
import type { Mat4 } from './matrix.ts'
import { type NodeTransform, readNode } from './node.ts'
import { readTex0, type TextureSet } from './nsbtx.ts'
import {
  inverseBindMatrices,
  type RenderCommand,
  readRenderCommands,
  resolvePose,
  resolveShapeMaterials,
  resolveShapeStates,
} from './render.ts'

/**
 * NSBMD — the Nitro model container, stamp `BMD0`.
 *
 * References: the Nintendo DS file formats wiki (NSBMD, NSBTX) and GBATEK for
 * the geometry commands the display lists contain.
 *
 * Container:
 *
 *   0x00  char[4]  'BMD0'
 *   0x04  u16      byte-order mark, 0xFEFF
 *   0x06  u16      version
 *   0x08  u32      file size
 *   0x0C  u16      header size, 0x10
 *   0x0E  u16      block count
 *   0x10  u32[n]   block offsets
 *
 * Each block is a `char[4]` stamp and a `u32` size. `MDL0` holds models,
 * `TEX0` textures.
 */

export const NSBMD_MAGIC = 'BMD0'
const LITTLE_ENDIAN_BOM = 0xfeff

export interface NitroBlock {
  readonly stamp: string
  readonly offset: number
  readonly size: number
  readonly data: Uint8Array
}

/** A bone, as named in the model's object dictionary. */
export interface ModelObject {
  readonly name: string
  readonly index: number
}

export interface ModelMaterial {
  readonly name: string
  readonly index: number
  /**
   * The texture this material binds, or `undefined` if it binds none.
   *
   * **Read from the file, not guessed from the name.** The texture dictionary's
   * entries each carry a run of material indices, so the binding is exact; a
   * material's own name is usually unrelated to its texture's, which is why the
   * name heuristic this replaced resolved only 41% of them.
   */
  readonly texture: string | undefined
  /** The palette this material binds, read the same way. */
  readonly palette: string | undefined
  /**
   * The material's diffuse colour, each channel 0 to 1.
   *
   * From the `diffAmb` word at `+0x08` of the material record, `BGR555` in its
   * low fifteen bits. **The polygon is drawn in this colour, modulated by its
   * texture**, which is why a white texture can come out black: the round
   * shadow under a character is a white blob whose material's diffuse is
   * `(0, 0, 0)`.
   *
   * The offset is settled against the cartridge rather than assumed. Across
   * **47,953 materials** the low fifteen bits read `0x7FFF`, pure white, on
   * 47,871; eight are black and 74 are some other colour. Shifted four bytes
   * either way it collapses: `+4` is `specEmi`, zero on 47,919, and `+8` is
   * `polygonAttr`, never a plausible colour on any of them.
   */
  readonly diffuse: readonly [number, number, number]
  /**
   * Bit 15 of `diffAmb`: the hardware takes the vertex colour from the diffuse
   * rather than from the display list.
   *
   * **Set on all 47,953 materials on the cartridge**, so in practice the
   * diffuse always wins and a renderer may simply modulate by it. Carried
   * rather than assumed, because that is a fact about this cartridge and not
   * about the format.
   */
  readonly setVertexColour: boolean
}

/** One drawable piece of a model: a named display list. */
export interface ModelShape {
  readonly name: string
  readonly index: number
  /** The shape's display list bytes. */
  readonly displayList: Uint8Array
  /** Triangulated geometry, decoded on demand by {@link Model.geometry}. */
  readonly geometryOffset: number
  readonly geometrySize: number
}

/**
 * A model's declared axis-aligned bounds, resolved from the stored origin and
 * extents.
 *
 * **Do not rely on these to contain the geometry.** They are reported as
 * stored, but the relationship between the box's units and model space is not
 * established: across the reference cartridge's 6,889 models, no combination of
 * the model's position scale and box scale puts every vertex inside its own box
 * in more than 42% of cases. Something scales one or the other that has not
 * been identified. To frame or cull a model, measure its geometry with
 * {@link measureBounds} instead.
 */
export interface ModelBounds {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly maxX: number
  readonly maxY: number
  readonly maxZ: number
}

export interface Model {
  readonly name: string
  /** Eight bytes at +0x14 whose individual meanings are not established. */
  readonly unknownFlags: Uint8Array
  readonly numObjects: number
  readonly numMaterials: number
  readonly numShapes: number
  readonly numVertices: number
  readonly numSurfaces: number
  readonly numTriangles: number
  readonly numQuads: number
  /** Model-space scale to apply to decoded positions. */
  readonly upScale: number
  readonly downScale: number
  readonly bounds: ModelBounds
  readonly objects: readonly ModelObject[]
  readonly materials: readonly ModelMaterial[]
  /**
   * Texture names the material section references, in its own order.
   *
   * These are *not* index-parallel with {@link Model.materials}. Use
   * {@link ModelMaterial.texture} to go from a
   * material to its texture.
   */
  readonly textureNames: readonly string[]
  /** Palette names the material section references, in the same order. */
  readonly paletteNames: readonly string[]
  readonly shapes: readonly ModelShape[]
  /** The bones, with their local transforms. */
  readonly nodes: readonly NodeTransform[]
  /** The model's render commands, already parsed. Empty if they would not read. */
  readonly renderCommands: readonly RenderCommand[]
  /**
   * Why the render commands could not be read, when they could not.
   *
   * The model is still usable: its shapes decode, but every matrix is the
   * identity and no shape is bound to a material.
   */
  readonly renderCommandError: string | undefined
  /**
   * The matrix stack the render commands build, 32 slots.
   *
   * A vertex's `matrixId` indexes this. Models that use a single matrix leave
   * the stack at the identity and need no transform; skinned ones do not.
   */
  readonly matrices: readonly Mat4[]
  /**
   * Each node's bind-pose world transform, inverted.
   *
   * Pass these back to `resolveMatrices` alongside animated node transforms;
   * a blend needs them to undo the bind pose before applying the new one.
   */
  readonly inverseBind: readonly Mat4[]
  /**
   * The matrix stack as it stood when each shape was drawn, indexed by shape.
   * This, not `matrices`, is what a shape must be posed against.
   */
  readonly shapeMatrices: readonly (readonly Mat4[])[]
  /**
   * Resolve per-shape matrix stacks against a different set of node transforms
   * — an animation's, sampled for a frame. `shapeMatrices` is this for the
   * model's own bind pose.
   */
  pose(nodes: readonly NodeTransform[]): Mat4[][]
  /**
   * Material index each shape is drawn with, by shape index.
   *
   * A shape uses whichever material the render commands bound most recently
   * before issuing it.
   */
  readonly shapeMaterials: readonly (number | undefined)[]
  /** Decode one shape's display list into triangles, in model space. */
  geometry(shape: ModelShape | number): Geometry
  /**
   * Decode a shape and place each vertex by the matrix its display list bound
   * it to. This is what a skinned model needs; for a single-matrix model it is
   * the identity and returns the same geometry.
   */
  posedGeometry(shape: ModelShape | number): Geometry
}

export interface Nsbmd {
  readonly version: number
  readonly blocks: readonly NitroBlock[]
  readonly models: readonly Model[]
  /** Textures, when the container carries a `TEX0` block. */
  readonly textures: TextureSet | undefined
  block(stamp: string): NitroBlock | undefined
  model(name: string): Model | undefined
}

/**
 * Place each vertex by the matrix its display list bound it to.
 *
 * The matrices are the resolved stack — `Model.matrices` for the bind pose, or
 * the same stack resolved against animated node transforms for a posed frame.
 * A vertex whose slot no command wrote is left where the display list put it.
 */
export function poseGeometry(geometry: Geometry, matrices: readonly Mat4[]): Geometry {
  const vertices = geometry.vertices.map((v) => {
    const m = matrices[v.matrixId]
    if (!m) return v
    return {
      ...v,
      x:
        (m[0] as number) * v.x +
        (m[4] as number) * v.y +
        (m[8] as number) * v.z +
        (m[12] as number),
      y:
        (m[1] as number) * v.x +
        (m[5] as number) * v.y +
        (m[9] as number) * v.z +
        (m[13] as number),
      z:
        (m[2] as number) * v.x +
        (m[6] as number) * v.y +
        (m[10] as number) * v.z +
        (m[14] as number),
    }
  })
  return {
    vertices,
    indices: geometry.indices,
    matrixIds: geometry.matrixIds,
    scales: geometry.scales,
  }
}

/** Cheap check for the `BMD0` stamp; does not validate the body. */
export function isNsbmd(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x42 && data[1] === 0x4d && data[2] === 0x44 && data[3] === 0x30
  )
}

/**
 * Read a model's info header and its three dictionaries.
 *
 * Header layout, confirmed against the reference cartridge — every offset below
 * resolves inside the model and the last one lands exactly on its end:
 *
 *   +0x00  u32   model size
 *   +0x04  u32   offset to the render commands
 *   +0x08  u32   offset to the material section
 *   +0x0C  u32   offset to the shape section
 *   +0x10  u32   offset to the matrix section, and the model's end
 *   +0x14  u8[8] flags and counts; see `unknownFlags` and the note below
 *   +0x1C  fx32  up scale
 *   +0x20  fx32  down scale
 *   +0x24  u16   vertex count
 *   +0x26  u16   surface count
 *   +0x28  u16   triangle count
 *   +0x2A  u16   quad count
 *   +0x2C  fx16[3] bounding box origin
 *   +0x32  fx16[3] bounding box extents, added to the origin to give the far
 *                  corner — *not* a second corner. Reading them as a second
 *                  corner reproduces neither: on a model checked by hand,
 *                  origin + extent lands exactly on the geometry's far corner
 *                  on all three axes.
 *   +0x38  fx32  box scale
 *   +0x3C  fx32  its reciprocal, always exactly 1 / the above
 *   +0x38  fx32  unknown_0x38
 *   +0x3C  fx32  unknown_0x3c
 *   +0x40  ..    the object (bone) dictionary
 */
function readModel(mdl: Uint8Array, at: number, name: string): Model {
  checkRange(mdl, at, 0x40, `model '${name}' header`)
  const model = mdl.subarray(at)

  const size = u32(model, 0x00, 'model.size')
  const materialOffset = u32(model, 0x08, 'model.materialOffset')
  const shapeOffset = u32(model, 0x0c, 'model.shapeOffset')
  checkRange(model, 0, size, `model '${name}'`)

  // Counts come from the dictionaries, which are self-validating: each declares
  // its own total size, and that size must land exactly on the end of its name
  // table. The eight bytes at +0x14 include counts too, but which byte is which
  // has not been established, so they are carried through as `unknownFlags`
  // rather than guessed at.
  const objectDict = readDict(model, 0x40, `model '${name}' objects`)

  // The material section opens with two u16 offsets, to a texture-name and a
  // palette-name dictionary, and its own material dictionary follows at +4.
  // Reading the first offset instead yields the *texture* names, which look
  // enough like material names to pass unnoticed.
  const materialDict = readDict(model, materialOffset + 4, `model '${name}' materials`)
  const textureNameDict = readDict(
    model,
    materialOffset + u16(model, materialOffset, `model '${name}' texture dict offset`),
    `model '${name}' material textures`,
  )
  const paletteNameDict = readDict(
    model,
    materialOffset + u16(model, materialOffset + 2, `model '${name}' palette dict offset`),
    `model '${name}' material palettes`,
  )

  /**
   * Bind each material to the texture and palette that claim it.
   *
   * A texture-name dictionary entry is a `u16` offset and a `u8` count naming a
   * run of material indices, packed just before the material records and
   * relative to the material section. That is the file's own statement of which
   * materials use a texture, and it is exact: every index it names is in range
   * on all 8,804 models, no material is claimed twice, and 52,380 of 52,512 are
   * claimed at all.
   */
  const bind = (dict: ReturnType<typeof readDict>, what: string): (string | undefined)[] => {
    const out: (string | undefined)[] = []
    for (const entry of dict.entries) {
      const at = u16(entry.data, 0, `${what} run offset`)
      const count = u8(entry.data, 2, `${what} run count`)
      for (let i = 0; i < count; i++) {
        const index = u8(model, materialOffset + at + i, `${what} material index`)
        if (index < materialDict.entries.length) out[index] = entry.name
      }
    }
    return out
  }
  const materialTextures = bind(textureNameDict, 'texture')
  const materialPalettes = bind(paletteNameDict, 'palette')

  /**
   * A material's own record: its `diffAmb` word, and the diffuse colour in it.
   *
   * The dictionary entry is a `u32` offset, and the record begins **four bytes
   * before** where that offset lands — see {@link ModelMaterial.diffuse} for
   * what settles it. A record that will not fit is left at white, which is what
   * an unmodulated polygon already is.
   */
  const WHITE: readonly [number, number, number] = [1, 1, 1]
  const colourOf = (entry: {
    data: Uint8Array
  }): { diffuse: readonly [number, number, number]; setVertexColour: boolean } => {
    if (entry.data.length < 4) return { diffuse: WHITE, setVertexColour: false }
    const at = materialOffset + u32(entry.data, 0, 'material record offset') - 4 + 8
    if (at < 0 || at + 4 > model.length) return { diffuse: WHITE, setVertexColour: false }
    const word = u32(model, at, 'material diffAmb')
    const bgr = word & 0x7fff
    return {
      diffuse: [(bgr & 31) / 31, ((bgr >> 5) & 31) / 31, ((bgr >> 10) & 31) / 31],
      setVertexColour: ((word >>> 15) & 1) === 1,
    }
  }

  const shapeDict = readDict(model, shapeOffset, `model '${name}' shapes`)

  const shapes: ModelShape[] = shapeDict.entries.map((entry, index) => {
    const shapeAt = shapeOffset + u32(entry.data, 0, `shape[${index}] offset`)
    // Shape header: two unknown words, then the display list's offset (relative
    // to the shape) and size. Confirmed by arithmetic: offset + size lands on
    // the end of the shape section in every model checked.
    const listOffset = shapeAt + u32(model, shapeAt + 0x08, `shape[${index}] listOffset`)
    const listSize = u32(model, shapeAt + 0x0c, `shape[${index}] listSize`)
    checkRange(model, listOffset, listSize, `shape[${index}] display list`)
    return {
      name: entry.name,
      index,
      displayList: model.subarray(listOffset, listOffset + listSize),
      geometryOffset: listOffset,
      geometrySize: listSize,
    }
  })

  const originX = fx16ToFloat(u16(model, 0x2c, 'bounds.originX'))
  const originY = fx16ToFloat(u16(model, 0x2e, 'bounds.originY'))
  const originZ = fx16ToFloat(u16(model, 0x30, 'bounds.originZ'))
  const extentX = fx16ToFloat(u16(model, 0x32, 'bounds.extentX'))
  const extentY = fx16ToFloat(u16(model, 0x34, 'bounds.extentY'))
  const extentZ = fx16ToFloat(u16(model, 0x36, 'bounds.extentZ'))
  const bounds: ModelBounds = {
    minX: originX,
    minY: originY,
    minZ: originZ,
    maxX: originX + extentX,
    maxY: originY + extentY,
    maxZ: originZ + extentZ,
  }

  // Bones, then the render commands that arrange them.
  const objectSection = 0x40
  const nodes: NodeTransform[] = objectDict.entries.map((entry, index) => {
    const at = objectSection + u32(entry.data, 0, `object[${index}] offset`)
    return readNode(model, at, index, entry.name).node
  })
  // Render commands are supplementary to geometry: they arrange the matrix
  // stack and bind materials. A model whose stream cannot be read still has
  // usable shapes, so a failure here degrades rather than throws. Three effect
  // models on the reference cartridge use opcodes not identified here.
  let renderCommands: RenderCommand[] = []
  let renderCommandError: string | undefined
  try {
    renderCommands = readRenderCommands(
      model,
      u32(model, 0x04, 'model.renderCommandOffset'),
      materialOffset,
    )
  } catch (error) {
    renderCommandError = error instanceof Error ? error.message : String(error)
  }
  const inverseBind = inverseBindMatrices(renderCommands, nodes)
  const shapeStates = resolveShapeStates(renderCommands)
  const upScale = fx32ToFloat(u32(model, 0x1c, 'model.upScale'))
  const downScale = fx32ToFloat(u32(model, 0x20, 'model.downScale'))

  const readGeometry = (index: number): Geometry => {
    const shape = shapes[index]
    if (!shape) throw new NitroGfxError(`no shape ${index} in model '${name}'`)
    const state = shapeStates[index]
    return runDisplayList(shape.displayList, `model '${name}' shape '${shape.name}'`, {
      matrixId: state?.matrixId ?? 0,
      scale: upScale ** (state?.positionScales ?? 0),
    })
  }

  // The positions are stored small and scaled up as they are drawn; the node
  // matrices that place them are not scaled at all. `downScale` is the render
  // commands' own undo, sent after the shape — see `resolveShapeStates` — so it
  // never reaches a vertex, and nothing here applies it.
  const posed = (source: readonly NodeTransform[]): Mat4[][] => {
    const resolved = resolvePose(renderCommands, source, inverseBind)
    return shapes.map((_, index) => resolved.shapeStacks[index] ?? resolved.stack)
  }

  const shapeMatrices = posed(nodes)
  const matrices = resolvePose(renderCommands, nodes, inverseBind).stack
  const shapeMaterials = resolveShapeMaterials(renderCommands)

  return {
    name,
    numObjects: objectDict.entries.length,
    numMaterials: materialDict.entries.length,
    numShapes: shapeDict.entries.length,
    unknownFlags: model.subarray(0x14, 0x1c),
    numVertices: u16(model, 0x24, 'model.numVertices'),
    numSurfaces: u16(model, 0x26, 'model.numSurfaces'),
    numTriangles: u16(model, 0x28, 'model.numTriangles'),
    numQuads: u16(model, 0x2a, 'model.numQuads'),
    upScale,
    downScale,
    bounds,
    objects: objectDict.entries.map((e, index) => ({ name: e.name, index })),
    materials: materialDict.entries.map((e, index) => ({
      name: e.name,
      index,
      texture: materialTextures[index],
      palette: materialPalettes[index],
      ...colourOf(e),
    })),
    textureNames: textureNameDict.entries.map((e) => e.name),
    paletteNames: paletteNameDict.entries.map((e) => e.name),
    shapes,
    nodes,
    renderCommands,
    renderCommandError,
    matrices,
    shapeMatrices,
    inverseBind,
    shapeMaterials,
    geometry: (target) =>
      readGeometry(typeof target === 'number' ? target : shapes.indexOf(target)),
    posedGeometry: (target) => {
      const index = typeof target === 'number' ? target : shapes.indexOf(target)
      return poseGeometry(readGeometry(index), shapeMatrices[index] ?? matrices)
    },
    pose: posed,
  }
}

/** Parse an NSBMD container. Returns views into `data`; nothing is copied. */
/**
 * The texture a material names.
 *
 * A material carries no resolved texture reference: its `texImageParam` holds
 * only the repeat flags, with the VRAM offset left at zero for the loader to
 * fill in — every material on the reference cartridge reads `0x00030000`. The
 * binding is therefore by name.
 *
 * Materials are named `Mat_<texture>_` or `M_<texture>_<n>`, the trailing
 * number distinguishing materials that share a texture but differ in their
 * settings.
 */
export function textureNameForMaterial(materialName: string): string {
  let name = materialName
  // Two prefixes are used, `Mat_` and `M_`.
  if (name.startsWith('Mat_')) name = name.slice(4)
  else if (name.startsWith('M_')) name = name.slice(2)
  // The suffix is a bare underscore, or an underscore and a disambiguating
  // number when one texture is bound with different material settings.
  return name.replace(/_\d*$/, '')
}

/** Measure the actual bounds of decoded geometry. Reliable, unlike the declared box. */
export function measureBounds(geometries: readonly Geometry[]): ModelBounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const geometry of geometries) {
    for (const v of geometry.vertices) {
      if (v.x < minX) minX = v.x
      if (v.y < minY) minY = v.y
      if (v.z < minZ) minZ = v.z
      if (v.x > maxX) maxX = v.x
      if (v.y > maxY) maxY = v.y
      if (v.z > maxZ) maxZ = v.z
    }
  }
  if (minX > maxX) return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

export function readNsbmd(data: Uint8Array): Nsbmd {
  if (!isNsbmd(data)) {
    const stamp = Array.from(data.subarray(0, 4), (c) =>
      c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.',
    ).join('')
    throw new NitroGfxError(`not an NSBMD: stamp is '${stamp}'`, 0)
  }
  const bom = u16(data, 0x04, 'nsbmd.bom')
  if (bom !== LITTLE_ENDIAN_BOM) {
    throw new NitroGfxError(`nsbmd byte-order mark is 0x${bom.toString(16)}`, 0x04)
  }
  const version = u16(data, 0x06, 'nsbmd.version')
  const declaredSize = u32(data, 0x08, 'nsbmd.fileSize')
  if (declaredSize > data.length) {
    throw new NitroGfxError(
      `nsbmd declares ${declaredSize} bytes but only ${data.length} are present`,
      0x08,
    )
  }
  const image = data.subarray(0, declaredSize)
  const headerSize = u16(image, 0x0c, 'nsbmd.headerSize')
  const blockCount = u16(image, 0x0e, 'nsbmd.blockCount')

  const blocks: NitroBlock[] = []
  for (let i = 0; i < blockCount; i++) {
    const offset = u32(image, headerSize + i * 4, `nsbmd.blockOffset[${i}]`)
    checkRange(image, offset, 8, `nsbmd.block[${i}] header`)
    const stamp = resourceName(image, offset, 4)
    const size = u32(image, offset + 4, `nsbmd.block[${i}].size`)
    checkRange(image, offset, size, `nsbmd.block['${stamp}']`)
    blocks.push({ stamp, offset, size, data: image.subarray(offset, offset + size) })
  }

  const models: Model[] = []
  const mdl = blocks.find((b) => b.stamp === 'MDL0')
  if (mdl) {
    const dict = readDict(mdl.data, 0x08, 'MDL0')
    for (const entry of dict.entries) {
      models.push(readModel(mdl.data, u32(entry.data, 0, 'model offset'), entry.name))
    }
  }

  const tex0 = blocks.find((b) => b.stamp === 'TEX0')

  return {
    version,
    blocks,
    models,
    textures: tex0 ? readTex0(tex0.data) : undefined,
    block: (stamp) => blocks.find((b) => b.stamp === stamp),
    model: (name) => models.find((m) => m.name === name),
  }
}
