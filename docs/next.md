# Where to pick up

Written 10 September 2026, against `2c8fd7f`. The evidence behind each of these
is in `packages/game-formats/FORMAT.md`; this is the short version and what to
do next.

Ordered by what is blocking the milestone, not by how interesting it is.

---

## 1. Interiors leak, and the character falls out of the world

**The one still blocking "you can walk the village and enter every building".**

A room's collision is one floor quad with walls standing on it, and the walls do
not close it. Walking 64 directions out of a doorway:

| map | walks that fall off the floor |
|---|---|
| `M01M04` | 9 of 64, at either character radius |
| `M01M08` | 20 of 64, now the character is thin enough to reach the gap |

The fat radius was plugging some of these, which is why they surfaced together
when it was fixed. They are not caused by it.

**Next:** an engine rule against stepping off into nothing — if the spot a step
lands on has no ground under it at all, refuse the step, the way `step` already
refuses to walk into a wall. It belongs in `packages/sim/src/character.ts`.

Take care of two things. Outdoors a drop with ground below it is a legitimate
fall and must stay one, so the rule is "no ground anywhere below", not "ground
lower than here". And the village already falls once in 64 walks, so a rule that
is too eager will change the exterior as well; the harness has a walkability
test that will notice.

**To see it:** `apps/game/test/travel.test.ts` has the shape of the probe.

---

## 2. Sprite frames carry a stray mound

Every frame drawn has a small mound above the character — a hat, or the top of a
head, detached from the figure. In a room with fifteen characters it reads as
debris floating over the cast.

Cutting is **half fixed**: a frame is `width x height / 2` bytes of pixels with
eight more between it and the next, and reading it as a grid of rows put every
other frame half a width out. That is done, and the village's characters come
out whole instead of halved.

**The lead, and it came from looking rather than counting.** Heads sit at a
different offset from bodies. The horizontal centre of a head runs 21.4, 19.1,
15.1, 11.1 across the first four frames — a steady sideways slide. The pitch
that flattens it to zero, on three characters independently, is **660 bytes**;
the parser uses 648, which leaves 0.38 to 0.47 pixels a frame.

**Next:** confirm 660 by eye, and if it holds, make it the reading.

```sh
pnpm build
node tools/shot/serve.mjs rom/<your>.nds          # APP=game for the game
```

- the game: `?sprite=1&cut=,660` — the inn, `&map=M01M02`, is the crowded test
- the explorer: any `.spr`, which is the better surface — a candidate can be
  judged against a dozen characters at once
- either: `[` `]` start by a byte · `;` `'` by a row · `,` `.` pitch ·
  `-` `=` height · `9` `\` odd frames only · `0` reset

The odd-frame key is for a specific suspicion: a frame occupies 41.5 rows,
measured three ways, and half a row is eight bytes — sixteen pixels. If frames
really are spaced by a half row, every odd frame begins mid-row. Try `8`, `-8`.

**Do not** reach for another statistic. Six were tried and every one chose a cut
that renders wrong; they are listed in `FORMAT.md` so they are not tried again.

**Parked until this is right:** whether `standingFrame`'s facing table is 180°
out. A wrongly cut frame cannot be judged by eye, so there is no point.

---

## 3. A field's collision does not reach its own doorways

19.2% of field doorways stand over their own collision, against 87-100% for
every other kind of map. The road east out of the village is one of the misses:
the game puts the character on the nearest walkable ground and says so on the
status line.

What a field actually uses for walkable ground is **not in any file read here**.
Ruled out and written up: scale, translation, `.bats`, `.dat`, the sub-archives,
the drawn terrain standing in for collision, and collision shared between
archives.

**Next:** this one wants the emulator, not more parsing. `CLAUDE.md` puts that
work outside what is done here.

---

## 4. The Hero is a stand-in

`chooseFigure` picks a character out of the parts library; which parts make the
Hero is unknown. Unchanged for a while and not blocking anything.

---

## Not defects, but worth doing

- **A doorway costs about three seconds**, because the cartridge is walked again
  for the map behind it. Caching the catalogue across loads is the obvious fix
  and the largest quality-of-life win left.
- **A foothold for the disassembly**, if that session ever happens: the ARM9 is
  BLZ-compressed, 638,216 bytes at ROM offset `0x4000`, decompressing to
  1,000,984, and carries the sprite loader's own path strings —
  `/data/ani/d_%c%03d.spr` at `0x20ef20b`, `data/chara_sub/%s.chr` at
  `0x20efdc4`. Nothing has been disassembled and no behaviour is claimed.

---

## How to check nothing has broken

```sh
npx biome check .
npx tsc --build
npx vitest run                                     # 695 unit tests
MINSTREL_TEST_ROM=rom/<your>.nds npx vitest run    # 115 more, against a cartridge
```

The cartridge tests are seconds each and slower again under load; they carry
their own timeout for that reason. Run them on their own if they wobble.
