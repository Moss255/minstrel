/**
 * Taking the roof off.
 *
 * The game does not solve a building standing between the camera and the party
 * by moving the camera. It removes the building: roofs come off as you walk in,
 * and the near-side walls of a room are simply not drawn. Pulling the camera
 * forward instead — which is what a chase camera usually does — gives a very
 * different picture, because indoors there is nowhere to pull it to.
 *
 * The test below is deliberately about *geometry between two points*, not about
 * what a roof is. Nothing on the cartridge marks a piece as a roof, and a rule
 * that guessed from a name or a height would be inventing one.
 */

/** An axis-aligned box in world units. */
export interface Box {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly maxX: number
  readonly maxY: number
  readonly maxZ: number
}

type Vec3 = readonly [number, number, number]

/**
 * How far along the segment from `from` to `to` a box is entered and left, or
 * `undefined` if the segment misses it. The usual slab test, clamped to the
 * segment so a box behind the eye or beyond the focus does not count.
 */
function span(box: Box, from: Vec3, to: Vec3): { enter: number; leave: number } | undefined {
  const low = [box.minX, box.minY, box.minZ]
  const high = [box.maxX, box.maxY, box.maxZ]
  let enter = 0
  let leave = 1
  for (let axis = 0; axis < 3; axis++) {
    const start = from[axis] as number
    const delta = (to[axis] as number) - start
    const lo = low[axis] as number
    const hi = high[axis] as number
    if (Math.abs(delta) < 1e-9) {
      // Parallel to this pair of planes: either inside them for the whole
      // segment, or outside them for all of it.
      if (start < lo || start > hi) return undefined
      continue
    }
    const first = (lo - start) / delta
    const second = (hi - start) / delta
    enter = Math.max(enter, Math.min(first, second))
    leave = Math.min(leave, Math.max(first, second))
    if (enter > leave) return undefined
  }
  return { enter, leave }
}

/**
 * Whether a piece stands between the camera and what it is looking at.
 *
 * The discriminating condition is that the segment **leaves** the box again
 * before it reaches the focus. A roof passes that: the line enters it, comes
 * out underneath, and then has open air down to the character. The ground the
 * character is standing on does not, because the segment ends inside its box —
 * which is what stops this rule from deleting the terrain the moment the camera
 * looks across a hill.
 *
 * `clearance` is how much open space there has to be past the piece, in world
 * units. Without it a wall the character is pressed against would flicker as
 * the exit point crossed the focus.
 */
export function occludes(box: Box, eye: Vec3, focus: Vec3, clearance = 0.25): boolean {
  const hit = span(box, eye, focus)
  if (!hit) return false
  const length = Math.hypot(focus[0] - eye[0], focus[1] - eye[1], focus[2] - eye[2])
  if (length < 1e-6) return false
  return hit.leave < 1 - clearance / length
}

/** The indices of the pieces standing in the way, given each piece's bounds. */
export function occluders(
  boxes: readonly Box[],
  eye: Vec3,
  focus: Vec3,
  clearance = 0.25,
): number[] {
  const hidden: number[] = []
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    if (box && occludes(box, eye, focus, clearance)) hidden.push(i)
  }
  return hidden
}

/** Anything with a position — a vertex, whatever else it carries. */
export interface Positioned {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** A shape as occlusion needs it: where its corners are, and its triangles. */
export interface Triangles<V extends Positioned = Positioned> {
  readonly vertices: readonly V[]
  readonly indices: readonly number[]
}

/**
 * A shape's triangles in chunks, by where they are: each goes to the square of
 * side `cell`, on the ground plane, that its middle falls in. A chunk is the
 * numbers of its triangles — triangle `t` is `indices[3t]` to `indices[3t + 2]`.
 *
 * **Why.** A map's shapes are its material groups, not its objects: the
 * village's windows are one shape spanning eight units of a sixteen-unit map,
 * its grass another. Hiding what stands in the way a shape at a time took every
 * window in the village away for the one house between the camera and the
 * character — 27 of the village's 149 shapes span more than a quarter of it.
 *
 * **Chunks decide what is hidden; they are not drawn on their own.** A shape
 * with a chunk in the way is drawn without that chunk's triangles — see
 * {@link keepTriangles} — so there are as many pieces to draw as there are
 * shapes. Drawn as pieces of their own the village's 792 chunks were five
 * times the draw calls, and the frame rate showed it.
 */
export function cellsOf(geometry: Triangles, cell: number): number[][] {
  if (!(cell > 0)) throw new RangeError(`a chunk's side must be positive, not ${cell}`)
  const { vertices, indices } = geometry
  const chunks = new Map<string, number[]>()
  for (let t = 0; 3 * t + 2 < indices.length; t++) {
    const a = vertices[indices[3 * t] as number]
    const b = vertices[indices[3 * t + 1] as number]
    const c = vertices[indices[3 * t + 2] as number]
    if (!a || !b || !c) continue
    const key = `${Math.floor((a.x + b.x + c.x) / 3 / cell)},${Math.floor((a.z + b.z + c.z) / 3 / cell)}`
    const chunk = chunks.get(key)
    if (chunk) chunk.push(t)
    else chunks.set(key, [t])
  }
  return [...chunks.values()]
}

/** The box around some of a shape's triangles, by their numbers. */
export function boxOfTriangles(geometry: Triangles, triangles: readonly number[]): Box {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const t of triangles) {
    for (let k = 0; k < 3; k++) {
      const v = geometry.vertices[geometry.indices[3 * t + k] as number]
      if (!v) continue
      if (v.x < minX) minX = v.x
      if (v.y < minY) minY = v.y
      if (v.z < minZ) minZ = v.z
      if (v.x > maxX) maxX = v.x
      if (v.y > maxY) maxY = v.y
      if (v.z > maxZ) maxZ = v.z
    }
  }
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

/** A shape's triangle list without the triangles of some of its chunks. */
export function keepTriangles(
  indices: readonly number[],
  chunks: readonly (readonly number[])[],
  hidden: readonly number[],
): number[] {
  const gone = new Uint8Array(Math.floor(indices.length / 3))
  for (const chunk of hidden) for (const t of chunks[chunk] ?? []) gone[t] = 1
  const kept: number[] = []
  for (let t = 0; t < gone.length; t++) {
    if (gone[t]) continue
    kept.push(indices[3 * t] as number, indices[3 * t + 1] as number, indices[3 * t + 2] as number)
  }
  return kept
}

/**
 * The chunks to leave out: each one in the way **whose whole shape is in the
 * way too**, and none of a shape marked `exempt` — the sky.
 *
 * Asking of the shape as well keeps what shapes alone got right. The ground
 * the character stands on is never in the way, because the line to them ends
 * inside its box; a chunk of it on a hillock between the camera and the
 * character would be, and asked alone it would leave a hole. So the chunks
 * hidden are always among the ones hiding whole shapes would have hidden —
 * only fewer of them.
 */
export function occludedChunks(
  shapes: readonly Box[],
  chunks: readonly Box[],
  shapeOf: readonly number[],
  eye: Vec3,
  focus: Vec3,
  clearance = 0.25,
  exempt: readonly boolean[] = [],
): number[] {
  const inTheWay = shapes.map((box, i) => !exempt[i] && occludes(box, eye, focus, clearance))
  const hidden: number[] = []
  for (let i = 0; i < chunks.length; i++) {
    const shape = shapeOf[i]
    const box = chunks[i]
    if (shape === undefined || !box || !inTheWay[shape]) continue
    if (occludes(box, eye, focus, clearance)) hidden.push(i)
  }
  return hidden
}

/**
 * Whether a point has something over its head.
 *
 * This is what decides indoors from outdoors, and it is worth doing properly.
 * A map's footprint is the obvious proxy — a room is smaller than a village —
 * but map sizes are a continuum, so any threshold cuts through the middle of it
 * and misclassifies both ways. Whether there is a roof above you is the thing
 * the camera actually cares about, and it is a fact about the geometry rather
 * than a number someone picked.
 *
 * A piece counts only if its *underside* is above the head: terrain whose box
 * reaches up into a hill still has its floor below the feet, so the ground
 * never reads as a ceiling.
 */
export function covered(boxes: readonly Box[], at: Vec3, headroom: number): boolean {
  const ceiling = (at[1] as number) + headroom
  for (const box of boxes) {
    if (box.minY < ceiling) continue
    if ((at[0] as number) < box.minX || (at[0] as number) > box.maxX) continue
    if ((at[2] as number) < box.minZ || (at[2] as number) > box.maxZ) continue
    return true
  }
  return false
}
