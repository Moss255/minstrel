export { checkRange, resourceName, u8, u16, u32 } from './bytes.ts'
export { type Dict, type DictEntry, readDict } from './dict.ts'
export {
  GeomCommand,
  type Geometry,
  PrimitiveType,
  runDisplayList,
  type Vertex,
} from './displaylist.ts'
export { NitroGfxError } from './errors.ts'
export { FX16_ONE, FX32_ONE, fx10ToFloat, fx16ToFloat, fx32ToFloat, signExtend } from './fixed.ts'
export { blend, identity, invertAffine, type Mat4, multiply, transformPoint } from './matrix.ts'
export { type NodeTransform, readNode } from './node.ts'
export {
  ANIMATION_STAMP,
  type Animation,
  type Axes,
  BASIS_ENTRY_SIZE,
  type BoneTrack,
  boneTrackSize,
  type Channel,
  type CurveHeader,
  isNsbca,
  NSBCA_MAGIC,
  type Nsbca,
  PIVOT_ENTRY_SIZE,
  type RotationChannel,
  readNsbca,
  rotationFromRef,
  sampleAnimation,
  sampleTrack,
} from './nsbca.ts'
export {
  isNsbmd,
  type Model,
  type ModelBounds,
  type ModelMaterial,
  type ModelObject,
  type ModelShape,
  measureBounds,
  type NitroBlock,
  NSBMD_MAGIC,
  type Nsbmd,
  poseGeometry,
  readNsbmd,
  textureNameForMaterial,
} from './nsbmd.ts'
export {
  isNsbtx,
  NSBTX_MAGIC,
  type PaletteInfo,
  readTex0,
  TEXTURE_FORMAT_NAMES,
  TextureFormat,
  type TextureInfo,
  type TextureSet,
  texelDataSize,
} from './nsbtx.ts'
export {
  inverseBindMatrices,
  MATRIX_STACK_SIZE,
  type RenderCommand,
  RenderOp,
  type ResolvedPose,
  readRenderCommands,
  resolveMatrices,
  resolvePose,
  resolveShapeMaterials,
} from './render.ts'
export { basisRotation, pivotRotation } from './rotation.ts'
