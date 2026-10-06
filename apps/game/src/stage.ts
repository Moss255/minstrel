/**
 * **Where a battle is fought**: not where it starts, but on a map of its own —
 * a *stage*, one of the `B` archives — read from the game's code (US ARM9,
 * overlays 0 and 17) on 29 September 2026. `packages/game-formats/FORMAT.md`,
 * "Where a battle is fought", has the evidence; this is the engine's side.
 *
 * - **The ground names the stage**: the collision record under the encounter,
 *   read as 30000 + 100a + 10b + c (`func_0204bd7c`) — see {@link stageOfRecord}.
 * - **A set battle names its own**, `eventbattle.bin`'s `+0x28` (INFERRED;
 *   see `EventBattle.stage`), and 0 there leaves the ground's.
 * - **One the map list does not have is 30116**, "F01 - Field" (overlay 0,
 *   `0x021668e4` on) — see {@link stageToFight}.
 * - **Everyone stands on a staggered grid about the stage's origin**, the
 *   party on +z facing π, the monsters on −z facing 0 (`func_ov000_0216f74c`
 *   and the slot tables at `0x02183108`, `0x02183118`) — see {@link gridPlace}.
 *
 * Places here are the game's: fixed point, 4096 to one of the map's units.
 */

/** The stage a ground record naming nothing gives, and the one the game falls back to. */
export const STAGE_NONE = 30000
export const STAGE_FALLBACK = 30116

/**
 * The battle stage a collision record names: its first halfword's three
 * five-bit digits, low first, as 30000 + 100a + 10b + c (`func_0204bd7c`) —
 * the same digits the sky's regions read from 20000 (`skyRegionOf`).
 */
export function stageOfRecord(record: Uint8Array): number {
  const packed = (record[0] ?? 0) | ((record[1] ?? 0) << 8)
  return STAGE_NONE + (packed & 0x1f) * 100 + ((packed >> 5) & 0x1f) * 10 + ((packed >> 10) & 0x1f)
}

/**
 * The stage a battle is fought on: a set battle's own when it names one, else
 * the ground's; and **30116 for one the map list does not have, or none** —
 * as overlay 0 does before it switches to it (`0x021668e4`–`0x02166914`).
 * Western Stornway's field names 30103, which the list has no entry for, and
 * so is fought on Angel Falls' field.
 */
export function stageToFight(
  ground: number | undefined,
  set: number | undefined,
  listed: (id: number) => boolean,
): number {
  const named = set !== undefined && set !== 0 ? set : ground
  return named === undefined || named === STAGE_NONE || !listed(named) ? STAGE_FALLBACK : named
}

/**
 * The record a triangle of a map's collision names, when the map's
 * collision is several meshes laid end to end — as `createCollisionWorld`
 * lays them — each with its own trailing records, indexed by the triangle's
 * top seven bits.
 */
export function recordOfTriangle(
  meshes: readonly {
    readonly mesh: {
      readonly triangles: readonly { readonly attributes: number }[]
      readonly trailing: readonly Uint8Array[]
    }
  }[],
  triangle: number,
): Uint8Array | undefined {
  let first = 0
  for (const { mesh } of meshes) {
    const local = triangle - first
    if (local < mesh.triangles.length) {
      const attributes = mesh.triangles[local]?.attributes
      return attributes === undefined ? undefined : mesh.trailing[attributes >>> 25]
    }
    first += mesh.triangles.length
  }
  return undefined
}

/** The fighters' height over the stage's origin, `0xcc`, from overlay 0's templates (`0x021830e4`). */
export const FIGHTER_HEIGHT = 0xcc

/** π, as the game holds an angle: radians × 4096 (`0x3244`). */
const PI = 0x3244
/** The party's facing on the grid, π (`0x021830c0`), and the monsters', 0. */
export const PARTY_FACING = PI
export const MONSTER_FACING = 0

/** The party's grid slots, by how many fight (`0x02183108`, four bytes a count). */
export const PARTY_SLOTS: readonly (readonly number[])[] = [
  [58],
  [57, 59],
  [48, 58, 50],
  [56, 66, 67, 60],
]

/** The monsters' grid slots, by how many fight (`0x02183118`, eight bytes a count). */
export const MONSTER_SLOTS: readonly (readonly number[])[] = [
  [22],
  [21, 23],
  [29, 22, 32],
  [20, 12, 13, 24],
  [28, 11, 22, 14, 33],
  [20, 11, 12, 13, 14, 24],
  [20, 11, 12, 22, 13, 14, 24],
  [19, 10, 11, 12, 13, 14, 15, 25],
]

const f = Math.fround
/** `2.598 × 4096`, `−10.392 × 4096` and `1.299 × 4096`, as the game's floats (`0x462646e1`, `0xc72646e1`, `0x45a646e1`). */
const COLUMN_STEP = f(10641.7197265625)
const COLUMN_FIRST = f(-42566.87890625)
const ODD_ROW = f(5320.85986328125)

/**
 * **A grid slot's place** (`func_ov000_0216f74c`): column s mod 9, row s div
 * 9; x = 2.598 × column − 10.392, and 1.299 more on an odd row; z = 2.25 ×
 * row − 9. Computed as the game does, in 32-bit floats, and truncated to its
 * fixed point.
 */
export function gridPlace(slot: number): { readonly x: number; readonly z: number } {
  const row = Math.trunc(slot / 9)
  const column = slot % 9
  const across = f(f(f(column) * COLUMN_STEP) + COLUMN_FIRST)
  const x = Math.trunc(f(across + f(f(row % 2) * ODD_ROW)))
  const z = Math.trunc(f(f(f(f(row) * 3072) * 3) + -36864))
  return { x, z }
}

/** Where each of a side stands, by the table for how many there are — the last table's for more. */
export function placesOf(
  slots: readonly (readonly number[])[],
  count: number,
): { readonly x: number; readonly z: number }[] {
  if (count <= 0) return []
  const row = slots[Math.min(count, slots.length) - 1] ?? []
  return Array.from({ length: count }, (_, i) => gridPlace(row[i] ?? row[row.length - 1] ?? 0))
}

/**
 * Monsters whose width counts at 0.7 when more than one fights
 * (`func_ov000_021681f8`, `0xb33`): by their number, INFERRED to be the
 * monster data's — the function's own argument is not traced.
 */
const NARROW_IN_COMPANY: ReadonlySet<number> = new Set([0xbd, 0xbe, 0xbf, 0x110, 0x155])

/** The party's facings in its row, by how many (`0x02183158`): π, the ends turned in. */
const PARTY_ROW_FACINGS: readonly (readonly number[])[] = [
  [0x323d],
  [0x335c, 0x311e],
  [0x3570, 0x323d, 0x2f0a],
  [0x3570, 0x335c, 0x311e, 0x2f0a],
]

/** A place on the stage and a facing, the game's fixed point and radians × 4096. */
export interface StagePlace {
  readonly x: number
  readonly z: number
  readonly facing: number
}

/**
 * **The party's row** (`func_ov000_021675a0`): 1.5 apart (`0x1800`), centred,
 * the first on the +x end — x = (n − 1) × 0.75 − 1.5i — at z +2.5, each
 * turned by the table at `0x02183158`.
 */
export function partyRow(count: number): StagePlace[] {
  const facings = PARTY_ROW_FACINGS[Math.min(count, PARTY_ROW_FACINGS.length) - 1] ?? []
  return Array.from({ length: count }, (_, i) => ({
    x: ((count - 1) * 0x1800) / 2 - i * 0x1800,
    z: 0x2800,
    facing: facings[i] ?? PARTY_FACING,
  }))
}

/**
 * **The monsters' row** (`func_ov000_021677fc`): side by side from −x, each
 * as wide as {@link monsterExtent} makes it, at z −2.5, facing 0.
 */
export function monsterRow(
  bodies: readonly { kind: number; radius: number; height: number }[],
): StagePlace[] {
  const { widths, gap, width } = rowOf(bodies)
  let x = -width / 2
  return widths.map((w) => {
    const place = { x: Math.trunc(x + w / 2), z: -0x2800, facing: MONSTER_FACING }
    x += w + gap
    return place
  })
}

function rowOf(bodies: readonly { kind: number; radius: number; height: number }[]) {
  const n = bodies.length
  const widths = bodies.map((b) =>
    n > 1 && NARROW_IN_COMPANY.has(b.kind) ? (b.radius * 0xb33) >> 12 : b.radius,
  )
  const total = widths.reduce((sum, w) => sum + w, 0)
  const limit = 0x4000 + 0x199 * (n - 1)
  const gap =
    n <= 1
      ? 0
      : total + 0xb33 * (n - 1) < limit
        ? 0xb33
        : total > limit
          ? 0x199
          : Math.trunc((limit - total) / (n - 1))
  return { widths, gap, width: total + gap * Math.max(0, n - 1) }
}

/**
 * **The monsters' row, as far as the camera takes it** (`func_ov000_021677fc`):
 * each monster's width is its body's radius — × 0.7 for a few, in company —
 * and the gap between them 0.7, or less to keep the row within 4 + 0.1(n − 1),
 * down to 0.1 (`func_ov000_02167b5c`). The row's whole width, and its tallest
 * height + 0.5, are what the opening's shot frames (`0x02167b34`).
 */
export function monsterExtent(
  bodies: readonly { kind: number; radius: number; height: number }[],
): {
  readonly width: number
  readonly height: number
} {
  if (bodies.length === 0) return { width: 0, height: 0 }
  return {
    width: rowOf(bodies).width,
    height: Math.max(...bodies.map((b) => b.height)) + 0x800,
  }
}

/** The party's row as the camera takes it (`0x02167684`): 1.5 apart, and one more; 1.5 deep. */
export function partyExtent(count: number): { readonly width: number; readonly height: number } {
  return { width: Math.max(0, count - 1) * 0x1800 + 0x1000, height: 0x1800 }
}

/**
 * **A battle shot framing one side** (`func_ov000_0216d600`), in the stage's
 * own space: the eye on the stage's z axis, at (0, min(h, 2), ±d), looking at
 * (0, h, 0). d fits the side's width and height into the view — the larger of
 * width × cos a ÷ (sin a × 2.2) and height × cos a ÷ (sin a × 1.5), less 2.5,
 * and at least 6.5 (3 in the wide shot) — and h is half the height, at least
 * 1.2. `a` is the half-angle: 15° (a view of 30°), or 22° in the wide shot.
 * **Side 1 frames the monsters from +z**, over the party; side 0 frames the
 * party from −z. In map units, not fixed point; the sines and cosines are the
 * game's own 4096ths.
 */
export interface BattleShot {
  readonly eye: readonly [number, number, number]
  readonly target: readonly [number, number, number]
  /** The half-angle of the view, in degrees, as `Camera_SetFov` takes it. */
  readonly halfFov: number
}

export function sideShot(
  side: 0 | 1,
  extent: { readonly width: number; readonly height: number },
  wide: boolean,
  /** The shot's sub-mode 1 raises the eye by 1; 0, the opening's, does nothing. */
  mode: 0 | 1 = 0,
): BattleShot {
  const [s, c] = wide ? [0x5fe, 0xed6] : [0x424, 0xf74]
  const width = extent.width / 4096
  const height = extent.height / 4096
  const fit = Math.max(
    (width * c) / (s * 2.2) - 2.5,
    (height * c) / (s * 1.5) - 2.5,
    wide ? 3 : 6.5,
  )
  const h = Math.max(height / 2, 1.2)
  const z = side === 1 ? fit : -fit
  return {
    eye: [0, Math.min(h, 2) + (mode === 1 ? 1 : 0), z],
    target: [0, h, 0],
    halfFov: wide ? 22 : 15,
  }
}

/**
 * **The opening's shot, and each round's while commands are chosen**
 * (`func_ov000_0216118c` → `0216d600(cam, 1, wide, 0, 0, 0, 0, 1)`): the wide
 * side shot on the monsters — unless overlay 26 has a fixed shot for this
 * fight, whose eye and look-at stand in for the side shot's, the wide
 * half-angle kept (`0x0216d830`–`0x0216d880`). Side 1 keeps them as they are.
 * The fixed shot's are `fx32`; see `fixedShotFor` in `@minstrel/game-formats`.
 */
export function openingShot(
  extent: { readonly width: number; readonly height: number },
  fixed: { readonly eye: readonly number[]; readonly look: readonly number[] } | undefined,
): BattleShot {
  const wide = sideShot(1, extent, true)
  if (!fixed) return wide
  const at = (v: readonly number[]) =>
    [(v[0] ?? 0) / 4096, (v[1] ?? 0) / 4096, (v[2] ?? 0) / 4096] as const
  return { eye: at(fixed.eye), target: at(fixed.look), halfFov: wide.halfFov }
}

/** An orbit: the look-at's yaw, the eye's height over it and the distance, as the game's camera keeps it (`+0x70`). */
export interface Orbit {
  readonly yaw: number
  readonly height: number
  readonly distance: number
}

/** The orbit a shot's eye and look-at make: the eye is the look-at plus (0, h, √(d² − h²)) turned by the yaw. */
export function orbitOf(shot: BattleShot): Orbit {
  const dx = shot.eye[0] - shot.target[0]
  const dy = shot.eye[1] - shot.target[1]
  const dz = shot.eye[2] - shot.target[2]
  return { yaw: Math.atan2(dx, dz), height: dy, distance: Math.hypot(dx, dy, dz) }
}

/**
 * **The opening's ease** (`func_ov000_0216118c`, `0x0216f0d0`): the shot's
 * orbit is the end; the camera starts half a unit higher and 3 farther, and
 * each frame takes 5% of what is left of each — `0xf33`, 0.95, kept — until
 * all three are within `0x28` (about 0.01) of the end, and snaps there.
 */
export const EASE_KEEP = 0xf33 / 4096
const EASE_DONE = 0x28 / 4096

export function openingStart(end: Orbit): Orbit {
  return { yaw: end.yaw, height: end.height + 0.5, distance: end.distance + 3 }
}

export function easeOrbit(
  now: Orbit,
  end: Orbit,
): { readonly orbit: Orbit; readonly done: boolean } {
  let turn = end.yaw - now.yaw
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  const left = [turn, end.height - now.height, end.distance - now.distance]
  if (left.every((d) => Math.abs(d) < EASE_DONE)) return { orbit: end, done: true }
  const step = 1 - EASE_KEEP
  return {
    orbit: {
      yaw: now.yaw + turn * step,
      height: now.height + (left[1] as number) * step,
      distance: now.distance + (left[2] as number) * step,
    },
    done: false,
  }
}

/**
 * A camera the battle holds: what it looks at, in the stage's own space and
 * map units, and its orbit about that — the yaw now the world's, the eye
 * being the target plus (0, h, √(d² − h²)) turned by it.
 */
export interface BattleView {
  readonly target: readonly [number, number, number]
  readonly orbit: Orbit
  /** How much the distance changes a tick, map units (`+0x23c`): the close-ups pull in. */
  readonly pull: number
  /** How much the yaw turns a tick, radians (`+0x238`): the command camera's slow orbit. */
  readonly turn?: number
}

/** A close-up's pull, `−0x14` a tick. */
export const CLOSE_UP_PULL = -0x14 / 4096

/**
 * **The actor close-up** (`func_ov000_0216df00`), cut to, not eased: in a
 * frame on the fighter, along its own facing, so the eye stands in front of
 * it. L = max(h/2, 1); the distance 1.8h + 4 for a monster and `b`·h + 4 for
 * a party member, at least what fits L + 0.5 into the view; the look-at L up,
 * less `a` for a party member; the orbit's height max(L − 1.5, 0); pulling in
 * by 20/4096 a tick. `a` and `b` are the action script's — `default.bact`'s
 * sections give 0.21 and 1.1, a struck fighter's close-up 0 and 1.8. What a
 * monster adds from its object's `+0x18e` is not read, and not added.
 */
export function actorCloseUp(
  at: { readonly x: number; readonly z: number; readonly facing: number },
  height: number,
  party: boolean,
  a: number,
  b: number,
  halfFov: number,
  /** A monster's size, `+0x18e`, 1 when not given: its term is 1.5 and past it half the rest. */
  size = 1,
): BattleView {
  const look = Math.max(height / 2, 1)
  const radians = (halfFov * Math.PI) / 180
  const fitted = ((look + 0.5) * Math.cos(radians)) / Math.sin(radians)
  const term = size <= 1.5 ? size : 1.5 + (size - 1.5) / 2
  const distance = Math.max(party ? b * height + 4 : 1.8 * height + 4 + term, fitted)
  return {
    target: [at.x, party ? look - a : look, at.z],
    orbit: { yaw: at.facing, height: Math.max(look - 1.5, 0), distance },
    pull: CLOSE_UP_PULL,
  }
}

/** The least a pulling camera comes to (`0x0216d464`), map units. */
const NEAREST = 3

/** One tick of a view's pull, as `0x0216d464` applies it: never nearer than 3. */
export function pulled(view: BattleView): BattleView {
  const turn = view.turn ?? 0
  if (view.pull === 0 && turn === 0) return view
  const next =
    view.pull === 0
      ? view.orbit.distance
      : -view.pull >= view.orbit.distance
        ? 0
        : view.orbit.distance + view.pull
  let yaw = view.orbit.yaw + turn
  if (yaw >= 2 * Math.PI) yaw -= 2 * Math.PI
  return { ...view, orbit: { ...view.orbit, yaw, distance: Math.max(next, NEAREST) } }
}

/**
 * **The victory's shot** (`func_ov000_0216e3c4`, called only from overlay 23's
 * experience step, `0x021f04b8` — read 1 October 2026; it was first taken for
 * the camera while a command is chosen, which it is not), a cut: the middle
 * of the party — their places averaged, height and all — looked at from 1 up;
 * the distance 12 less how far that middle is from the stage's, and if that
 * is under 8, the middle drawn in by it over 8 and the distance 12; looking at
 * it 0.5 up; turning 14/4096 a tick for as long as it is up.
 *
 * **The yaw is −0.6 rad whatever the monsters' places.** The code takes the
 * angle to their middle (`FX_Atan2Idx`, −0x8000 to 0x8000), divides it by
 * 0xffff as a whole number — 0, always — shifts it up 12, and adds −0x999.
 */
export function victoryView(
  party: readonly { readonly x: number; readonly z: number }[],
): BattleView {
  const y = FIGHTER_HEIGHT / 4096
  const n = Math.max(1, party.length)
  let cx = party.reduce((sum, p) => sum + p.x, 0) / n
  let cz = party.reduce((sum, p) => sum + p.z, 0) / n
  let distance = 12 - Math.hypot(cx, y, cz)
  if (distance < 8) {
    cx *= distance / 8
    cz *= distance / 8
    distance = 12
  }
  return {
    target: [cx, 0.5, cz],
    orbit: { yaw: -0x999 / 4096 + 2 * Math.PI, height: 1, distance },
    pull: 0,
    turn: 0xe / 4096,
  }
}

/** The eye's height is capped at 5 (`func_ov000_0216f2b8`), map units. */
export const EYE_CEILING = 5
