import { poseGeometry } from '@minstrel/nitro-gfx'
import type { AssembledMap } from '@minstrel/world'
import type { Cast } from './cast.ts'

/**
 * Map pieces that slide aside as the story goes on — the statue on the
 * Hexagon's first floor, which stands in the way until its switch is pulled.
 *
 * A sliding piece is named as a door is, with `S` for `D`: a model,
 * `D01M01S1`, and its collision beside it as a resource of its own,
 * `D01A01S1` — eight triangles, a box, exactly under the model as the map
 * places it.
 *
 * **Where it stands is where the thing to examine on it stands** — INFERRED,
 * from one case. The spot `202`'s record from 2.4, step 5, stands on the
 * piece's middle, as the map places it, to 0.006 world units; its record
 * before that stands 0.431 to the left, in the middle of the path. So the piece
 * is drawn, and its collision stood, moved by however far that character now
 * stands from its record on the middle. Of the cartridge's 13 pieces named so,
 * it is the only one with a record on it; the rest are left where the map puts
 * them. No event moves it — `ev02530`, the switch's, only shakes the camera —
 * so however the game slides it is in code, and **the slide here is ours**:
 * {@link SLIDE_SPEED}, with the collision going along with it.
 */
export interface SlidingPiece {
  /** The piece's resource, `D01M01S1`. */
  readonly stem: string
  /** Which of the map's pieces it is. */
  readonly piece: number
  /** Which of the map's collision meshes is its own; undefined when there is none. */
  readonly mesh: number | undefined
  /** The character whose place it follows, by id. */
  readonly id: number
  /** Where that character's record on the piece's middle stands, in world units. */
  readonly home: { readonly x: number; readonly z: number }
}

/** A sliding piece as it stands now. */
export interface Slide extends SlidingPiece {
  /** How far from where the map places it the piece stands, in world units. */
  offset: { x: number; z: number }
  /** Where it is sliding to, likewise. */
  target: { x: number; z: number }
}

/** World units a second. Ours: how fast the game slides it is not read. */
export const SLIDE_SPEED = 0.5
/** How near a piece's middle a record must stand to be the one it follows, in world units. */
export const ON_THE_MIDDLE = 0.05

/** A sliding piece's collision, by name — `D01M01S1` to `D01A01S1` — or undefined when the name is not one. */
export function slideCollisionName(stem: string): string | undefined {
  const named = /^([A-Z]\d\d)M(\d\d)(S[0-9A-Z])$/i.exec(stem)
  return named ? `${named[1]}A${named[2]}${named[3]}` : undefined
}

/** The middle of a piece's footprint as the map places it, in world units. */
function middleOf(piece: AssembledMap['pieces'][number]): { x: number; z: number } {
  const { model, place, scale } = piece
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [index, shape] of model.shapes.entries()) {
    const posed = poseGeometry(model.geometry(shape), model.shapeMatrices[index] ?? model.matrices)
    for (const v of posed.vertices) {
      minX = Math.min(minX, place.x + v.x * scale)
      maxX = Math.max(maxX, place.x + v.x * scale)
      minZ = Math.min(minZ, place.z + v.z * scale)
      maxZ = Math.max(maxZ, place.z + v.z * scale)
    }
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
}

/**
 * The map's sliding pieces: each named so, with a record of this map's cast —
 * `records`, in world units — on its middle.
 */
export function slidingPieces(
  map: AssembledMap,
  records: readonly { readonly id: number; readonly x: number; readonly z: number }[],
): SlidingPiece[] {
  const found: SlidingPiece[] = []
  for (const [index, piece] of map.pieces.entries()) {
    const stem = piece.source ?? piece.model.name
    const collision = slideCollisionName(stem)?.toLowerCase()
    if (!collision) continue
    const middle = middleOf(piece)
    const on = records.find(
      (record) => Math.hypot(record.x - middle.x, record.z - middle.z) < ON_THE_MIDDLE,
    )
    if (!on) continue
    const mesh = map.meshes.findIndex((m) => m.source?.toLowerCase() === collision)
    found.push({
      stem,
      piece: index,
      mesh: mesh >= 0 ? mesh : undefined,
      id: on.id,
      home: { x: on.x, z: on.z },
    })
  }
  return found
}

/** Where a character of the cast stands, in world units, or undefined when they are not here. */
export function standingIn(cast: Cast, id: number): { x: number; z: number } | undefined {
  const placed = [...cast.members, ...cast.sprites2d, ...cast.spots].find(
    ({ placement }) => placement.id === id,
  )?.placement
  return placed && { x: placed.x, z: placed.z }
}

/**
 * Aim each piece at where its character now stands. One not here leaves its
 * piece where it is — nothing says where it would be.
 */
export function aimSlides(
  slides: readonly Slide[],
  at: (id: number) => { x: number; z: number } | undefined,
): void {
  for (const slide of slides) {
    const standing = at(slide.id)
    if (standing) slide.target = { x: standing.x - slide.home.x, z: standing.z - slide.home.z }
  }
}

/** The map's pieces, each standing where its character does already — as on arriving. */
export function startSlides(
  pieces: readonly SlidingPiece[],
  at: (id: number) => { x: number; z: number } | undefined,
): Slide[] {
  const slides = pieces.map((piece) => ({
    ...piece,
    offset: { x: 0, z: 0 },
    target: { x: 0, z: 0 },
  }))
  aimSlides(slides, at)
  for (const slide of slides) slide.offset = { ...slide.target }
  return slides
}

/** Slide each piece on towards its target by `seconds`. True when any moved, which is a map to redraw. */
export function moveSlides(slides: readonly Slide[], seconds: number): boolean {
  let moved = false
  for (const slide of slides) {
    const dx = slide.target.x - slide.offset.x
    const dz = slide.target.z - slide.offset.z
    const gap = Math.hypot(dx, dz)
    if (gap === 0) continue
    const by = SLIDE_SPEED * seconds
    slide.offset =
      gap <= by
        ? { ...slide.target }
        : { x: slide.offset.x + (dx / gap) * by, z: slide.offset.z + (dz / gap) * by }
    moved = true
  }
  return moved
}
