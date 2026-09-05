import { u8 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'
import { blend, identity, type Mat4, multiply } from './matrix.ts'
import type { NodeTransform } from './node.ts'

/**
 * The render commands — a model's "SBC", the byte-code that drives the DS
 * geometry engine's matrix stack and issues its shapes.
 *
 * An opcode's low five bits select the operation and its top three bits add
 * optional parameters. The parameter counts below were fitted against the
 * reference cartridge rather than assumed: every one of its 8,804 models parses
 * to a clean `End` under them, and no other combination tried does.
 *
 * | opcode | operation | parameters |
 * |---|---|---|
 * | `0x00` | no-op | 0 |
 * | `0x01` | end | 0 |
 * | `0x02` | node visibility | 1 |
 * | `0x03` | restore matrix | 1 |
 * | `0x04` | bind material | 1, +1 per flag bit |
 * | `0x05` | draw shape | 1 |
 * | `0x06` | node transform | 3, +1 per flag bit |
 * | `0x07` | billboard | 1 |
 * | `0x08` | billboard about Y | 1 |
 * | `0x09` | blend matrices | 2, then 3 per term |
 * | `0x0A` | call display list | 1 |
 * | `0x0B` | scale by the model's position scale | 0 |
 * | `0x0C` | environment map | 1 |
 * | `0x0D` | projection map | 1 |
 */

export const RenderOp = {
  Nop: 0x00,
  End: 0x01,
  Visibility: 0x02,
  RestoreMatrix: 0x03,
  Material: 0x04,
  Shape: 0x05,
  NodeDescription: 0x06,
  Billboard: 0x07,
  BillboardY: 0x08,
  NodeMix: 0x09,
  CallDisplayList: 0x0a,
  PositionScale: 0x0b,
  EnvironmentMap: 0x0c,
  ProjectionMap: 0x0d,
} as const

/** Number of matrix stack slots the geometry engine provides. */
export const MATRIX_STACK_SIZE = 32

export interface RenderCommand {
  readonly offset: number
  /** Full opcode byte, flag bits included. */
  readonly opcode: number
  /** Low five bits: the operation. */
  readonly op: number
  readonly params: readonly number[]
}

function paramCount(data: Uint8Array, at: number, opcode: number): number {
  const op = opcode & 0x1f
  const flags = opcode & 0xe0
  switch (op) {
    case RenderOp.Nop:
    case RenderOp.End:
    case RenderOp.PositionScale:
      return 0
    case RenderOp.Visibility:
    case RenderOp.RestoreMatrix:
    case RenderOp.Shape:
    case RenderOp.Billboard:
    case RenderOp.BillboardY:
    case RenderOp.CallDisplayList:
    case RenderOp.EnvironmentMap:
    case RenderOp.ProjectionMap:
      return 1
    case RenderOp.Material:
      return 1 + (flags & 0x20 ? 1 : 0) + (flags & 0x40 ? 1 : 0)
    case RenderOp.NodeDescription:
      return 3 + (flags & 0x20 ? 1 : 0) + (flags & 0x40 ? 1 : 0)
    case RenderOp.NodeMix:
      // destination, term count, then a stack id, node id and weight per term.
      return 2 + 3 * u8(data, at + 2, 'nodeMix.count')
    default:
      throw new NitroGfxError(`render command 0x${opcode.toString(16)} is not known`, at)
  }
}

/** Parse a render command stream, stopping at its `End`. */
export function readRenderCommands(
  data: Uint8Array,
  start: number,
  limit: number,
): RenderCommand[] {
  const commands: RenderCommand[] = []
  let at = start
  while (at < limit) {
    const opcode = u8(data, at, 'renderCommand')
    const count = paramCount(data, at, opcode)
    if (at + 1 + count > limit) {
      throw new NitroGfxError('render command runs past the end of its section', at)
    }
    const params: number[] = []
    for (let i = 0; i < count; i++) params.push(u8(data, at + 1 + i, 'renderCommand.param'))
    commands.push({ offset: at, opcode, op: opcode & 0x1f, params })
    at += 1 + count
    if ((opcode & 0x1f) === RenderOp.End) return commands
  }
  throw new NitroGfxError('render commands ended without an End opcode', at)
}

/**
 * Resolve the matrix stack a model's render commands build.
 *
 * A node-description command names a node and its parent, so a node's world
 * transform is its parent's composed with its own local one; the command's flag
 * bits say which stack slot to leave the result in. A blend command mixes
 * several stack slots by weight.
 *
 * Weights are eighths of a unit: two terms of `0x80` sum to `0x100`, which is
 * one. Blending matrices componentwise is what the hardware does — it is not a
 * proper interpolation of rotations, and for the small angles between adjacent
 * bones that is exactly the intent.
 */
export function resolveMatrices(
  commands: readonly RenderCommand[],
  nodes: readonly NodeTransform[],
): Mat4[] {
  const stack: Mat4[] = Array.from({ length: MATRIX_STACK_SIZE }, () => identity())
  const world: Mat4[] = nodes.map(() => identity())
  const seen = new Set<number>()

  for (const command of commands) {
    switch (command.op) {
      case RenderOp.NodeDescription: {
        const nodeId = command.params[0] as number
        const parentId = command.params[1] as number
        const node = nodes[nodeId]
        if (!node) break

        const parent = seen.has(parentId) ? (world[parentId] as Mat4) : identity()
        const result = multiply(parent, node.local)
        world[nodeId] = result
        seen.add(nodeId)

        // With the 0x20 flag the fourth parameter names a stack slot to store
        // the result in; the 0x40 flag's parameter is not identified.
        if ((command.opcode & 0x20) !== 0) {
          const slot = command.params[3]
          if (slot !== undefined && slot < MATRIX_STACK_SIZE) stack[slot] = result
        }
        break
      }
      case RenderOp.NodeMix: {
        const destination = command.params[0] as number
        const terms = command.params[1] as number
        const sources: Mat4[] = []
        const weights: number[] = []
        for (let i = 0; i < terms; i++) {
          const slot = command.params[2 + i * 3] as number
          const weight = command.params[4 + i * 3] as number
          sources.push((stack[slot] ?? identity()) as Mat4)
          weights.push(weight / 256)
        }
        if (destination < MATRIX_STACK_SIZE) {
          stack[destination] = blend(sources, weights)
        }
        break
      }
      default:
        break
    }
  }

  return stack
}
