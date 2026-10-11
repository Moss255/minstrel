/**
 * **A grotto's floor, laid out by the game's own generator.** Translated from
 * the decomp's `FloorMapGenerator.cpp` and `FloorMap.cpp` (`src/Grotto/Main`,
 * marked complete: the C++ compiles to the US ARM9 byte for byte, `0x02090444`
 * to `0x02092a74`), read 11 October 2026, with the decomp's names kept.
 *
 * The floor is a 16 × 16 grid of tiles whatever its size, a tile a byte:
 *
 * | tile | what |
 * |---|---|
 * | 0 | floor |
 * | 1 | nothing — rock |
 * | 2 | corridor |
 * | 3 | rock where two partitions were cut apart |
 * | 4 | the way up |
 * | 5 | the way down |
 * | 6 | a chest |
 * | 8 | where a room's corridor joins it |
 *
 * and beside it a byte a tile saying which of its eight neighbours are rock
 * ({@link adjacency}).
 *
 * **What the game does with it** (`Zone3D::SwitchZone`, `ActiveGrottoClass`):
 * on entering a grotto's main floor, the floor is the zone's id modulo 20; its
 * width and height are each `10 + (seed + floor) % 5` up to floor 4, `12 + … % 4`
 * to 8, `14 + … % 3` to 12, and 16 after — the same rule for both, so every
 * floor is square; and the generator is seeded with the treasure map's own
 * seed plus the floor (`srand(seed + floor)`).
 *
 * Three things the C++ leaves to the machine, settled from the binary:
 * - `rand` is the C library's own (`0x02003d14`): `next · 0x41c64e6d + 12345`,
 *   bits 16 to 30 — and the generator's draws are the only ones between its
 *   `srand` and its end;
 * - `RandRange(a, a − 1)` — a partition three tiles across asks it — divides
 *   by zero, and the runtime's `_s32_div_f` (`0x0200cf44`) answers a remainder
 *   of 0: the draw is spent and the answer is `a`;
 * - `RoutineK`, the chests, reads four locals it never sets: the caller's
 *   r4 to r7 (`Calculate`, `0x020905e4`–`0x02090604`) — the floor, the
 *   generator, 1 and 0 — so on floor 3 its first hundred tries are thrown away.
 */

/** The generator's draws: the game's `rand`, with its own state. */
class Rand {
  private next = 0
  seed(value: number): void {
    this.next = value >>> 0
  }
  draw(): number {
    this.next = (Math.imul(this.next, 0x41c64e6d) + 0x3039) >>> 0
    return (this.next >>> 16) & 0x7fff
  }
}

/** Rock, as the generator tests for it: tiles 1 and 3. */
const rock = (tile: number) => tile === 1 || tile === 3

/** A point of the grid; 0, 0 is "none" for a join point. */
interface Point {
  x: number
  y: number
}

/** `BasicRectangle`: inclusive edges, in tiles. */
interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

interface Room {
  bounds: Rect
  /** Two per side: left 0–1, right 2–3, top 4–5, bottom 6–7. */
  joinPoints: Point[]
}

interface Partition {
  bounds: Rect
  /** Cut across already (`cutX`), or along (`cutY`): it is not cut the other way. */
  cutX: boolean
  cutY: boolean
  room: Room | undefined
}

const HORIZONTAL = 1
const VERTICAL = 2

interface Boundary {
  bounds: Rect
  leftOrTop: Partition
  rightOrBottom: Partition
  cutType: number
}

/** A floor as the generator leaves it. */
export interface GrottoFloor {
  readonly width: number
  readonly height: number
  /** The 16 × 16 tiles, row by row — see the module. */
  readonly tiles: Uint8Array
  /** For each tile, which neighbours are rock — see {@link adjacency}. */
  readonly adjacency: Uint8Array
  readonly up: Readonly<Point>
  /**
   * Which way the way up faces, as the game keeps it (`fpUpStairRotation`): `0`
   * where the tile south of it is open, else `0x1921` east, `0x3243` west,
   * `0x4b65` north — a quarter turn each, 4096 to the radian.
   */
  readonly upFacing: number
  readonly down: Readonly<Point>
  /** The chests, none on floors 1 and 2. */
  readonly chests: readonly Readonly<Point>[]
}

/**
 * A floor's width or height (`CalculateAndStoreFloorWidth`, `…Height`, through
 * `GetMapDimensionFromRange`): by the floor's band, from the seed and floor.
 */
export function floorSize(seed: number, floor: number): number {
  const range = (low: number, high: number) => low + ((seed + floor) % (high - low + 1))
  if (floor >= 0 && floor <= 4) return range(10, 14)
  if (floor >= 5 && floor <= 8) return range(12, 15)
  if (floor >= 9 && floor <= 12) return range(14, 16)
  return 16
}

/**
 * Lay out a floor of a grotto (`ActiveGrottoClass::CalculateFloorMap`): the
 * map's seed, a 16-bit number, and the floor, from 1.
 */
export function grottoFloor(seed: number, floor: number): GrottoFloor {
  const map = seed & 0xffff
  const size = floorSize(map, floor)
  const generator = new Generator(map, size, size)
  generator.calculate(floor)
  generator.computeAdjacency()
  return generator.result()
}

/**
 * Which of a tile's neighbours are rock, a bit each, the way
 * `ComputeSingleAdjacencyDataPoint` packs them: `0x80` north-west, `0x40`
 * north, `0x20` north-east, `0x10` east, `0x08` south-east, `0x04` south,
 * `0x02` south-west, `0x01` west — rock to the north, east, south or west
 * marks the two corners beside it too. Rock itself is `0xff`.
 */
export function adjacency(tiles: Uint8Array, x: number, y: number, before: number): number {
  const at = (dx: number, dy: number) => tiles[((y + dy) << 4) + x + dx] as number
  const self = at(0, 0)
  if (rock(self)) return 0xff
  // A tile of a kind outside 0, 2 and 4 to 8 is left as it was.
  if (self !== 0 && self !== 2 && ((self + 0xfc) & 0xff) > 4) return before
  let out = before
  out = rock(at(-1, -1)) ? out | 0x80 : out & ~0x80
  out = rock(at(1, -1)) ? out | 0x20 : out & ~0x20
  out = rock(at(1, 1)) ? out | 0x08 : out & ~0x08
  out = rock(at(-1, 1)) ? out | 0x02 : out & ~0x02
  out = rock(at(0, -1)) ? out | 0xe0 : out & ~0x40
  out = rock(at(1, 0)) ? out | 0x38 : out & ~0x10
  out = rock(at(0, 1)) ? out | 0x0e : out & ~0x04
  out = rock(at(-1, 0)) ? out | 0x83 : out & ~0x01
  return out & 0xff
}

class Generator {
  private readonly rand = new Rand()
  private readonly tiles = new Uint8Array(256).fill(1)
  private readonly adjacencyData = new Uint8Array(256).fill(0xff)
  private readonly partitions: Partition[] = []
  private readonly boundaries: Boundary[] = []
  private readonly rooms: Room[] = []
  private mainRoomAssigned = false
  private up: Point = { x: 0, y: 0 }
  private upFacing = 0
  private down: Point = { x: 0, y: 0 }
  private chests: Point[] = []

  constructor(
    private readonly seed: number,
    private readonly width: number,
    private readonly height: number,
  ) {
    // `Initialize`: one partition, zeroed, as all of them are.
    for (let i = 0; i < 16; i++) this.partitions.push(blankPartition())
    for (let i = 0; i < 16; i++) this.rooms.push(blankRoom())
  }

  result(): GrottoFloor {
    return {
      width: this.width,
      height: this.height,
      tiles: this.tiles,
      adjacency: this.adjacencyData,
      up: this.up,
      upFacing: this.upFacing,
      down: this.down,
      chests: this.chests,
    }
  }

  private writeTile(x: number, y: number, value: number): void {
    if (x >= 0 && y >= 0) this.tiles[(y << 4) + x] = value
  }

  private getTile(x: number, y: number): number {
    if (x < 0 || y < 0) return -1
    return this.tiles[(y << 4) + x] as number
  }

  private writeRectangle(
    left: number,
    top: number,
    width: number,
    height: number,
    value: number,
  ): void {
    if (left < 0 || top < 0 || width < 1 || height < 1) return
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) this.tiles[((top + y) << 4) + left + x] = value
    }
  }

  /** `RandRange`: a zero span spends its draw and answers the low end — see the module. */
  private randRange(minimum: number, maximum: number): number {
    if (minimum === maximum) return minimum
    const r = this.rand.draw()
    const span = maximum - minimum + 1
    return minimum + (span === 0 ? 0 : r % span)
  }

  /** `Calculate`. */
  calculate(floor: number): void {
    this.rand.seed(this.seed + floor)
    const first = this.partitions[0] as Partition
    first.bounds = { left: 1, top: 1, right: this.width - 2, bottom: this.height - 2 }
    this.partitionCount = 1
    this.routineF(first)
    for (let i = 0; i < this.partitionCount; i++) {
      if (this.routineC(this.partitions[i] as Partition, this.rooms[this.roomCount] as Room)) {
        this.roomCount++
      }
    }
    for (let i = 0; i < this.partitionCount; i++) this.reshapeRoom(this.partitions[i] as Partition)
    for (let i = 0; i < this.boundaries.length; i++) this.routineG(this.boundaries[i] as Boundary)
    for (let x = 0; x < this.width; x++) {
      this.writeTile(x, 0, 1)
      this.writeTile(x, this.height - 1, 1)
    }
    for (let y = 0; y < this.height; y++) {
      this.writeTile(0, y, 1)
      this.writeTile(this.width - 1, y, 1)
    }
    this.routineJ()
    if (floor > 2) this.routineK(floor)
  }

  private partitionCount = 1
  private roomCount = 0

  /** `RoutineF`: cut a partition in two, at random, and each half again, while there is room. */
  private routineF(part: Partition): void {
    if (this.partitionCount >= 15) return
    const next = this.partitions[this.partitionCount] as Partition
    let cut: Boundary | undefined
    if (part.cutY) cut = this.routineA(part, next)
    else if (part.cutX) cut = this.routineE(part, next)
    else if (this.rand.draw() % 2 !== 0) cut = this.routineE(part, next)
    else cut = this.routineA(part, next)
    if (!cut) return
    const nextIndex = this.partitionCount++
    this.boundaries.push(cut)
    if (this.rand.draw() % 2 !== 0) {
      this.routineF(part)
      this.routineF(this.partitions[nextIndex] as Partition)
    } else {
      this.routineF(this.partitions[nextIndex] as Partition)
      this.routineF(part)
    }
  }

  /** `RoutineE`: a cut along y, between columns — a vertical boundary. */
  private routineE(old: Partition, part: Partition): Boundary | undefined {
    const b = old.bounds
    if (b.right - b.left + 1 < 7) return undefined
    if (old.cutY) return undefined
    const cut = b.left + 3 + this.randRange(0, b.right - b.left - 6)
    for (let y = 0; y < b.bottom - b.top + 1; y++) this.writeTile(cut, b.top + y, 3)
    part.bounds = { left: cut + 1, top: b.top, right: b.right, bottom: b.bottom }
    b.right = cut - 1
    old.cutY = true
    return {
      bounds: { left: cut, top: b.top, right: cut, bottom: b.bottom },
      leftOrTop: old,
      rightOrBottom: part,
      cutType: VERTICAL,
    }
  }

  /** `RoutineA`: a cut along x, between rows — a horizontal boundary. */
  private routineA(old: Partition, part: Partition): Boundary | undefined {
    const b = old.bounds
    if (b.bottom - b.top + 1 < 7) return undefined
    if (old.cutX) return undefined
    const most = b.bottom - b.top + 1 - 6
    const cut = b.top + 3 + this.randRange(0, most - 1)
    for (let x = 0; x < b.right - b.left + 1; x++) this.writeTile(b.left + x, cut, 3)
    part.bounds = { left: b.left, top: cut + 1, right: b.right, bottom: b.bottom }
    b.bottom = cut - 1
    old.cutX = true
    return {
      bounds: { left: b.left, top: cut, right: b.right, bottom: cut },
      leftOrTop: old,
      rightOrBottom: part,
      cutType: HORIZONTAL,
    }
  }

  /** `RoutineC`: a room within a partition, a third of it in from each side at most. */
  private routineC(part: Partition, room: Room): boolean {
    const b = part.bounds
    const width = b.right - b.left + 1
    const height = b.bottom - b.top + 1
    if (width < 3 || height < 3) return false
    let left: number
    let top: number
    let right: number
    let bottom: number
    if (this.randRange(0, 1) !== 0) {
      left = this.randRange(b.left, b.left + div(width, 3))
      top = this.randRange(b.top, b.top + div(height, 3))
    } else {
      left = this.randRange(b.left + 1, b.left + div(width, 3))
      top = this.randRange(b.top + 1, b.top + div(height, 3))
    }
    if (this.randRange(0, 1) !== 0) {
      right = this.randRange(b.left + div(width, 3) * 2, b.right)
      bottom = this.randRange(b.top + div(height, 3) * 2, b.bottom)
    } else {
      right = this.randRange(b.left + div(width, 3) * 2, b.right - 1)
      bottom = this.randRange(b.top + div(height, 3) * 2, b.bottom - 1)
    }
    this.writeRectangle(left, top, right - left + 1, bottom - top + 1, 0)
    room.bounds = { left, top, right, bottom }
    part.room = room
    this.routineD(room)
    return true
  }

  /** `ReshapeRoom`: each edge of a room pushed out or worn in, tile by tile. */
  private reshapeRoom(part: Partition): void {
    const room = part.room as Room
    const r = room.bounds
    const halfWidth = div(r.right - r.left + 1, 2)
    const halfHeight = div(r.bottom - r.top + 1, 2)
    let topMargin: number
    let bottomMargin: number
    let leftMargin: number
    let rightMargin: number
    if (this.mainRoomAssigned || this.randRange(0, 15) !== 0) {
      topMargin = r.top - part.bounds.top
      bottomMargin = part.bounds.bottom - r.bottom
      leftMargin = r.left - part.bounds.left
      rightMargin = part.bounds.right - r.right
    } else {
      topMargin = r.top - 1
      bottomMargin = this.height - r.bottom - 1
      leftMargin = r.left - 1
      rightMargin = this.width - r.right - 1
      this.mainRoomAssigned = true
    }
    // The margins are `char`s, signed on this compiler; every one is small.
    topMargin = s8(topMargin)
    bottomMargin = s8(bottomMargin)
    leftMargin = s8(leftMargin)
    rightMargin = s8(rightMargin)

    for (let x = r.left; x <= r.right; x++) {
      const edge = this.getTile(x, r.top)
      if (rock(edge)) continue
      if (this.randRange(0, 1) !== 0) {
        const grow = this.randRange(0, topMargin) & 0xff
        for (let i = 0; i < grow; i++) {
          if (this.getTile(x, r.top - 1 - i) !== 8) this.writeTile(x, r.top - 1 - i, 0)
        }
      } else {
        if (edge === 8) continue
        const outer = this.getTile(x, r.top - 1)
        if (outer === 1 || outer === 8) continue
        const wear = this.randRange(0, halfHeight) & 0xff
        for (let i = 0; i < wear; i++) {
          const y = r.top + i
          if (this.getTile(x, y) === 8) break
          if (this.getTile(x, y + 1) === 1) break
          if (this.getTile(x + 1, y) !== 1 && this.getTile(x + 1, y + 1) === 1) break
          if (this.getTile(x - 1, y) !== 1 && this.getTile(x - 1, y + 1) === 1) break
          this.writeTile(x, y, 1)
        }
      }
    }

    for (let x = r.left; x <= r.right; x++) {
      const edge = this.getTile(x, r.bottom)
      if (rock(edge)) continue
      if (this.randRange(0, 1) !== 0) {
        const grow = this.randRange(0, bottomMargin) & 0xff
        for (let i = 0; i < grow; i++) {
          if (this.getTile(x, r.bottom + 1 + i) !== 8) this.writeTile(x, r.bottom + 1 + i, 0)
        }
      } else {
        if (edge === 8) continue
        const outer = this.getTile(x, r.bottom + 1)
        if (outer === 1 || outer === 8) continue
        const wear = this.randRange(0, halfHeight) & 0xff
        for (let i = 0; i < wear; i++) {
          const y = r.bottom - i
          if (this.getTile(x, y) === 8) break
          if (this.getTile(x, y - 1) === 1) break
          if (this.getTile(x + 1, y) !== 1 && this.getTile(x + 1, y - 1) === 1) break
          if (this.getTile(x - 1, y) !== 1 && this.getTile(x - 1, y - 1) === 1) break
          this.writeTile(x, y, 1)
        }
      }
    }

    for (let y = r.top; y <= r.bottom; y++) {
      const edge = this.getTile(r.left, y)
      if (rock(edge)) continue
      if (this.randRange(0, 1) !== 0) {
        const grow = this.randRange(0, leftMargin) & 0xff
        for (let i = 0; i < grow; i++) {
          if (this.getTile(r.left - 1 - i, y) !== 8) this.writeTile(r.left - 1 - i, y, 0)
        }
      } else {
        if (edge === 8) continue
        const outer = this.getTile(r.left - 1, y)
        if (outer === 1 || outer === 8) continue
        const wear = this.randRange(0, halfWidth) & 0xff
        for (let i = 0; i < wear; i++) {
          const x = r.left + i
          if (this.getTile(x, y) === 8) break
          if (this.getTile(x + 1, y) === 1) break
          if (this.getTile(x, y + 1) !== 1 && this.getTile(x + 1, y + 1) === 1) break
          if (this.getTile(x, y - 1) !== 1 && this.getTile(x + 1, y - 1) === 1) break
          this.writeTile(x, y, 1)
        }
      }
    }

    for (let y = r.top; y <= r.bottom; y++) {
      const edge = this.getTile(r.right, y)
      if (rock(edge)) continue
      if (this.randRange(0, 1) !== 0) {
        const grow = this.randRange(0, rightMargin) & 0xff
        for (let i = 0; i < grow; i++) {
          if (this.getTile(r.right + 1 + i, y) !== 8) this.writeTile(r.right + 1 + i, y, 0)
        }
      } else {
        if (edge === 8) continue
        // The game looks at (top + 1, y) here, not (right + 1, y), and so does this.
        const outer = this.getTile(r.top + 1, y)
        if (outer === 1 || outer === 8) continue
        const wear = this.randRange(0, halfWidth) & 0xff
        for (let i = 0; i < wear; i++) {
          const x = r.right - i
          if (this.getTile(x, y) === 8) break
          if (this.getTile(x - 1, y) === 1) break
          if (this.getTile(x, y + 1) !== 1 && this.getTile(x - 1, y + 1) === 1) break
          if (this.getTile(x, y - 1) !== 1 && this.getTile(x - 1, y - 1) === 1) break
          this.writeTile(x, y, 1)
        }
      }
    }
  }

  /** `RoutineG`: the two rooms either side of a boundary joined, four ways. */
  private routineG(boundary: Boundary): void {
    const first = boundary.leftOrTop.room as Room
    const second = boundary.rightOrBottom.room as Room
    const pairs =
      boundary.cutType === HORIZONTAL
        ? [
            [6, 4],
            [7, 4],
            [6, 5],
            [7, 5],
          ]
        : [
            [2, 0],
            [3, 0],
            [2, 1],
            [3, 1],
          ]
    for (const [a, b] of pairs) {
      const extend = this.randRange(0, 7) === 0
      this.routineH(
        first.joinPoints[a as number] as Point,
        second.joinPoints[b as number] as Point,
        boundary,
        extend,
      )
    }
  }

  /** `RoutineH`: one corridor across a boundary, an S or a Z, sometimes run on along it. */
  private routineH(p1: Point, p2: Point, boundary: Boundary, extend: boolean): void {
    if (p1.x === 0 || p1.y === 0 || p2.x === 0 || p2.y === 0) return
    const line = boundary.cutType === HORIZONTAL ? boundary.bounds.top : boundary.bounds.left
    // Along the boundary is x for a horizontal cut and y for a vertical one.
    const horizontal = boundary.cutType === HORIZONTAL
    if (boundary.cutType !== HORIZONTAL && boundary.cutType !== VERTICAL) return
    const write = (along: number, across: number) =>
      horizontal ? this.writeTile(along, across, 2) : this.writeTile(across, along, 2)
    const read = (along: number) =>
      horizontal ? this.getTile(along, line) : this.getTile(line, along)
    const a1 = horizontal ? p1.x : p1.y
    const c1 = horizontal ? p1.y : p1.x
    const a2 = horizontal ? p2.x : p2.y
    const c2 = horizontal ? p2.y : p2.x

    for (let c = c1 + 1; c < line + 1; c++) write(a1, c)
    for (let c = c2 - 1; c > line; c--) write(a2, c)
    if (a1 < a2) {
      for (let a = a1; a < a2 + 1; a++) write(a, line)
    } else if (a1 > a2) {
      for (let a = a2; a < a1 + 1; a++) write(a, line)
    }
    if (!extend) return
    const far = a1 < a2 ? a2 : a1
    const near = a1 < a2 ? a1 : a2
    for (let limit = far + 1; limit < 16; limit++) {
      if (rock(read(limit))) continue
      for (let a = far + 1; a < limit; a++) write(a, line)
      break
    }
    for (let limit = near - 1; limit >= 0; limit--) {
      if (rock(read(limit))) continue
      for (let a = near - 1; a > limit; a--) write(a, line)
      break
    }
  }

  /** The four neighbours of a tile, each 1 for rock and 0 for not (`REDUCE_TILEVALUE`). */
  private sides(x: number, y: number): [number, number, number, number] {
    const reduce = (t: number) => (rock(t) ? 1 : 0)
    return [
      reduce(this.getTile(x, y - 1)),
      reduce(this.getTile(x, y + 1)),
      reduce(this.getTile(x - 1, y)),
      reduce(this.getTile(x + 1, y)),
    ]
  }

  /** `RoutineJ`: the ways up and down, each in a room, not boxed in or in a corner. */
  private routineJ(): void {
    let upAttempts = 0
    let downAttempts = 0
    let upRoom = 0
    let x = 0
    let y = 0
    // The game keeps these between tries, in registers; after a hundred tries
    // it stops looking and goes on what the last try left in them.
    let north = 0
    let south = 0
    let west = 0
    let east = 0
    for (;;) {
      upRoom = this.randRange(0, this.roomCount - 1)
      const room = copyRoom(this.rooms[upRoom] as Room)
      x = this.randRange(room.bounds.left, room.bounds.right)
      y = this.randRange(room.bounds.top, room.bounds.bottom)
      if (upAttempts < 100) {
        ;[north, south, west, east] = this.sides(x, y)
        if (north && south && west && east) {
          upAttempts++
          continue
        }
        if ((north && east) || (north && west) || (south && east) || (south && west)) {
          upAttempts++
          continue
        }
        const around = adjacency(this.tiles, x, y, 0)
        if (UP_REFUSED.has(around)) {
          upAttempts++
          continue
        }
      }
      // What it faces, from the sides as last looked at (`fpUpStairRotation`).
      if (!south) this.upFacing = 0
      else if (!east) this.upFacing = 0x1921
      else if (!west) this.upFacing = 0x3243
      else if (!north) this.upFacing = 0x4b65
      this.writeTile(x, y, 4)
      this.up = { x, y }
      const upX = x
      const upY = y
      upAttempts = 0
      for (;;) {
        const downRoom = this.randRange(0, this.roomCount - 1)
        if (upRoom === downRoom && downAttempts < 25) {
          downAttempts++
          continue
        }
        const room = copyRoom(this.rooms[downRoom] as Room)
        x = this.randRange(room.bounds.left, room.bounds.right)
        y = this.randRange(room.bounds.top, room.bounds.bottom)
        if (downRoom === upRoom && x === upX && y === upY) continue
        break
      }
      ;[north, south, west, east] = this.sides(x, y)
      if (north && south && west && east) {
        upAttempts++
        continue
      }
      if ((north && east) || (north && west) || (south && east) || (south && west)) {
        upAttempts++
        continue
      }
      break
    }
    this.writeTile(x, y, 5)
    this.down = { x, y }
  }

  /** `RoutineK`: one to three chests, each on a room's floor — see the module for floor 3. */
  private routineK(floor: number): void {
    const count = this.randRange(1, 3)
    // The caller's registers, read as the locals the C++ never set.
    const u4 = floor === 1 || floor === 3 ? 1 : 0
    const u6 = 1
    let attempts = 0
    for (let chest = 0; chest < count; chest++) {
      for (;;) {
        const room = this.rooms[this.randRange(0, this.roomCount - 1)] as Room
        const x = this.randRange(room.bounds.left, room.bounds.right)
        const y = this.randRange(room.bounds.top, room.bounds.bottom)
        const tile = this.getTile(x, y)
        if (attempts < 100 && u4 && u6) {
          attempts++
          continue
        }
        if (tile === 6) continue
        if (tile === 4 || tile === 5) {
          attempts++
          continue
        }
        this.writeTile(x, y, 6)
        this.chests.push({ x, y })
        break
      }
    }
  }

  /** `RoutineD`: where a room's corridors join it — one or two a side, by its size. */
  private routineD(room: Room): void {
    const b = room.bounds
    if (b.left === 0 || b.top === 0 || b.right === 0 || b.bottom === 0) return
    const join = (i: number, x: number, y: number) => {
      room.joinPoints[i] = { x: s8(x), y: s8(y) }
    }
    if (b.right - b.left + 1 < 5) {
      join(4, this.randRange(b.left, b.right), b.top)
      join(6, this.randRange(b.left, b.right), b.bottom)
      this.markJoins(room, [4, 6])
    } else {
      const middle = s8(b.left + div(b.right - b.left + 1, 2) - 1)
      join(4, this.randRange(b.left, middle), b.top)
      join(5, this.randRange(middle + 1, b.right), b.top)
      join(6, this.randRange(b.left, middle), b.bottom)
      join(7, this.randRange(middle + 1, b.right), b.bottom)
      this.markJoins(room, [4, 5, 6, 7])
    }
    if (b.bottom - b.top + 1 < 5) {
      join(0, b.left, this.randRange(b.top, b.bottom))
      join(2, b.right, this.randRange(b.top, b.bottom))
      this.markJoins(room, [0, 2])
    } else {
      const middle = s8(b.top + div(b.bottom - b.top + 1, 2) - 1)
      join(0, b.left, this.randRange(b.top, middle))
      join(1, b.left, this.randRange(middle + 1, b.bottom))
      join(2, b.right, this.randRange(b.top, middle))
      join(3, b.right, this.randRange(middle + 1, b.bottom))
      this.markJoins(room, [0, 1, 2, 3])
    }
  }

  private markJoins(room: Room, which: readonly number[]): void {
    for (const i of which) {
      const p = room.joinPoints[i] as Point
      this.writeTile(p.x, p.y, 8)
    }
  }

  /** `ComputeAdjacencyData`: every inner tile of the 16 × 16 grid, then the floor's own edge as rock. */
  computeAdjacency(): void {
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        const at = (y << 4) + x
        this.adjacencyData[at] = adjacency(this.tiles, x, y, this.adjacencyData[at] as number)
      }
    }
    for (let y = 0; y < this.height; y++) {
      this.adjacencyData[y << 4] = 0xff
      this.adjacencyData[(y << 4) + this.width - 1] = 0xff
    }
    for (let x = 0; x < this.width; x++) {
      this.adjacencyData[x] = 0xff
      this.adjacencyData[((this.height - 1) << 4) + x] = 0xff
    }
  }
}

/** The way up is not put where its neighbours make one of these shapes (`RoutineJ`). */
const UP_REFUSED = new Set([0xea, 0xab, 0xae, 0xba, 0xa3, 0x8e, 0x3a, 0xe8, 0xb8, 0xe2, 0x8b, 0x2e])

/** C's `/` on ints: truncated toward zero. */
function div(a: number, b: number): number {
  return Math.trunc(a / b)
}

/** A value kept in a `char`, which this compiler makes signed. */
function s8(value: number): number {
  return (value << 24) >> 24
}

function blankRect(): Rect {
  return { left: 0, top: 0, right: 0, bottom: 0 }
}

function blankRoom(): Room {
  return { bounds: blankRect(), joinPoints: Array.from({ length: 8 }, () => ({ x: 0, y: 0 })) }
}

function blankPartition(): Partition {
  return { bounds: blankRect(), cutX: false, cutY: false, room: undefined }
}

/** `Room::CopyFrom`: the bounds and the join points. */
function copyRoom(room: Room): Room {
  return { bounds: { ...room.bounds }, joinPoints: room.joinPoints.map((p) => ({ ...p })) }
}
