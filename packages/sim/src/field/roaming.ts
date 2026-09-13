import { FX32_ONE, type Fx32, fx32, mul } from '@minstrel/fixed'
import type { BattleRng } from '../battle/rng.ts'
import { type CharacterShape, type CharacterState, step } from '../character.ts'
import { type CollisionWorld, groundBelow } from '../collision.ts'

/**
 * Monsters roaming the field, tick by tick: where they turn up, how they
 * wander, and which one the Hero walks into. Headless and deterministic — the
 * same world, hero and numbers give the same field.
 *
 * **Read:** which monsters roam a map's zone and how often each (`encfld`),
 * and how fast each goes (`fld_mondata`, INFERRED) — the caller hands them in
 * as {@link RoamerKind}s.
 *
 * **Ours, all of it, and said so:** how many roam at once, how near and how far
 * from the Hero they turn up and vanish, how they wander — a heading of
 * sixteen, held a while, now and then standing still, turned about at a wall —
 * how close counts as walking into one, and the calm after a battle. The
 * game's own spawning is in its code, not its data.
 *
 * Headings are sixteen fixed directions, their sines and cosines rounded to
 * `fx32` once, as the Hero's own walking takes its direction from the camera's.
 */

export const HEADINGS = 16

const DIRECTIONS: readonly (readonly [Fx32, Fx32])[] = Array.from({ length: HEADINGS }, (_, i) => {
  const angle = (i * 2 * Math.PI) / HEADINGS
  return [
    fx32(Math.round(Math.sin(angle) * FX32_ONE)),
    fx32(Math.round(Math.cos(angle) * FX32_ONE)),
  ]
})

/** Which way a heading faces, in radians: the direction `(sin f, cos f)`, the Hero's own convention. */
export function headingAngle(heading: number): number {
  return (heading * 2 * Math.PI) / HEADINGS
}

/** A monster that roams a zone: its number, its weight among the zone's, and its speed per tick. */
export interface RoamerKind {
  readonly number: number
  readonly weight: number
  readonly speed: Fx32
}

export interface Roamer {
  readonly id: number
  readonly number: number
  readonly state: CharacterState
  /** Which of the {@link HEADINGS} it faces. */
  readonly heading: number
  readonly moving: boolean
  /** Ticks until it chooses again. */
  readonly turnIn: number
  readonly speed: Fx32
}

export interface Roaming {
  readonly roamers: readonly Roamer[]
  readonly nextId: number
  /** Ticks until one may turn up. */
  readonly spawnIn: number
  /** Ticks during which walking into one starts nothing. */
  readonly calm: number
}

export interface RoamRules {
  /** The most roaming at once. */
  readonly most: number
  /** How near and how far from the Hero one turns up. */
  readonly near: Fx32
  readonly far: Fx32
  /** Past this from the Hero, one is gone. */
  readonly vanish: Fx32
  /** Within this of the Hero, the Hero has walked into it. */
  readonly touch: Fx32
  /** Ticks between one turning up and the next. */
  readonly spawnEvery: number
  /** Ticks a heading is held, at the least; as long again at the most. */
  readonly turnEvery: number
  readonly shape: CharacterShape
}

export function startRoaming(calm = 0): Roaming {
  return { roamers: [], nextId: 1, spawnIn: 0, calm }
}

/** The field with a calm on it: nobody can be walked into for this many ticks. */
export function calmFor(roaming: Roaming, ticks: number): Roaming {
  return { ...roaming, calm: Math.max(roaming.calm, ticks) }
}

const distance2 = (a: { x: Fx32; z: Fx32 }, b: { x: Fx32; z: Fx32 }) => {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

function pick(kinds: readonly RoamerKind[], rng: BattleRng): RoamerKind | undefined {
  const total = kinds.reduce((sum, k) => sum + Math.max(0, k.weight), 0)
  if (total <= 0) return undefined
  let roll = rng.below(total)
  for (const kind of kinds) {
    roll -= Math.max(0, kind.weight)
    if (roll < 0) return kind
  }
  return undefined
}

/**
 * One tick of the field: everyone moves a step; whoever is too far is gone;
 * the one the Hero has walked into, if any and no calm is on, is taken out and
 * handed back; and one more turns up when it is time and there is room.
 */
export function tickRoaming(
  roaming: Roaming,
  world: CollisionWorld,
  kinds: readonly RoamerKind[],
  hero: { readonly x: Fx32; readonly y: Fx32; readonly z: Fx32 },
  rng: BattleRng,
  rules: RoamRules,
): { roaming: Roaming; touched: Roamer | undefined } {
  const moved = roaming.roamers.map((r) => {
    let { heading, moving, turnIn } = r
    turnIn--
    if (turnIn <= 0) {
      heading = rng.below(HEADINGS)
      moving = rng.below(4) !== 0
      turnIn = rules.turnEvery + rng.below(rules.turnEvery)
    }
    const [sx, sz] = DIRECTIONS[heading] as readonly [Fx32, Fx32]
    const dx = moving ? mul(sx, r.speed) : fx32(0)
    const dz = moving ? mul(sz, r.speed) : fx32(0)
    const stepped = step(world, r.state, dx, dz, rules.shape)
    if (moving && stepped.hitWall) {
      heading = (heading + HEADINGS / 2) % HEADINGS
      turnIn = rules.turnEvery
    }
    const state: CharacterState = {
      x: stepped.x,
      y: stepped.y,
      z: stepped.z,
      fallSpeed: stepped.fallSpeed,
      grounded: stepped.grounded,
    }
    return { ...r, state, heading, moving, turnIn }
  })

  const vanish = rules.vanish * rules.vanish
  const kept = moved.filter((r) => distance2(r.state, hero) <= vanish)

  let touched: Roamer | undefined
  if (roaming.calm <= 0) {
    const touch = rules.touch * rules.touch
    const at = kept.findIndex((r) => distance2(r.state, hero) <= touch)
    if (at >= 0) touched = kept.splice(at, 1)[0]
  }

  let spawnIn = roaming.spawnIn - 1
  let nextId = roaming.nextId
  if (spawnIn <= 0 && kept.length < rules.most) {
    spawnIn = rules.spawnEvery
    const kind = pick(kinds, rng)
    if (kind) {
      const [sx, sz] = DIRECTIONS[rng.below(HEADINGS)] as readonly [Fx32, Fx32]
      const reach = fx32(rules.near + rng.below(Math.max(1, rules.far - rules.near)))
      const x = fx32(hero.x + mul(sx, reach))
      const z = fx32(hero.z + mul(sz, reach))
      const hit = groundBelow(world, x, z, fx32(world.bounds.maxY + FX32_ONE))
      if (hit && hit.slope >= rules.shape.maxSlope) {
        kept.push({
          id: nextId++,
          number: kind.number,
          state: { x, y: hit.y, z, fallSpeed: fx32(0), grounded: true },
          heading: rng.below(HEADINGS),
          moving: true,
          turnIn: rules.turnEvery,
          speed: kind.speed,
        })
      }
    }
  }

  return {
    roaming: { roamers: kept, nextId, spawnIn, calm: Math.max(0, roaming.calm - 1) },
    touched,
  }
}
