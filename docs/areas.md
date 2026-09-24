# The areas, one at a time

Phase 3's log — `docs/beyond-the-slice.md`, "The world". Content scales area
by area in story order, each one a checkpoint, and this is where each
checkpoint's result goes.

**The 74 areas are the unit, not the 669 maps.** A map archive is usually one
building; an area is a place with a name, a cast, triggers and a story.

## What a checkpoint is

Four things are already measured for every area on the cartridge, headlessly,
by tests that run in seconds:

| | |
|---|---|
| it loads | `apps/game/test/maps.test.ts` — all 669 map archives through the game's own loader |
| it walks | `apps/game/test/walk-coverage.test.ts` — flooded from where the game stands you |
| it talks | `apps/game/test/talk-coverage.test.ts` — every character asked, in every area |
| it plays its events | `apps/game/test/event-coverage.test.ts` — every engine function each event wants |

So a checkpoint is not "does it work" — that is known before anyone looks. A
checkpoint is **somebody looking at the area and saying whether it is right**,
which is what `tools/witness` is for and what the phase's own sentence asks
of Phase 1. The run gives one page of every view; the work is reading it.

```sh
node tools/witness/witness.mjs C01 --stage=3.1 --talk=10
```

What comes back is recorded below as: how long, how many views, what was
wrong, and what was done or written down about it.

**Expect the first few to send work back to Phase 1.** The plan says so, and
the point of going in story order is that the earliest areas are the ones a
player meets first, so a fault found there is worth the most.

## Stornway — `C01`

The first area past the slice: the slice closes on a title card *before*
Stornway, so this is where the game continues.

**24 September 2026.** `--stage=3.1 --talk=10`, **67 views in about eleven
minutes: 0 failed, 0 worth a look, 8 the game guessed.** The eight are
`pickLine` saying no trigger names a character at 3.1, which is the tool
working; Stornway's own chapter lines mostly do not cover that stage.

Read through, it is largely right, and some of it is better than expected:

- The gate, the walls and the braziers stand; the mini-map names Stornway and
  marks the inn. The castle's throne room comes up with its carpet and
  banners, and hides two wall chunks so the Hero stays visible.
- The gate guard answers **"State your business, wanderer."**
- `ev20780` frames a close-up of Princess Simona and the Hero for "Hero hands
  Princess Simona the little key" — a scene camera doing exactly what a scene
  camera should, which is the §5 bone-camera work paying off.
- `ev20770` puts Hamish outside his door under the bunting, in frame.

**One view is wrong, and the witness could not tell.** `ev03030` — a child's
"Chaaarge! Take that, you no-good Wight Knight!" — plays with **the camera
inside a wall**. The text is right, nothing failed, the map is named, and the
page reports no concern, because nothing there knows what geometry looks like
from the inside. See `docs/still-open.md`.

That is the checkpoint earning its keep in the way the plan predicted: an
area that passes every headless measure and still has something a person can
see is wrong.

**Chased the same day, and it was not the camera.** `?probe=1` puts the
scene's camera and the real one on `window`; the scene asks for a close shot
of the Hero and `aimAtShot` places the eye exactly where it should be. A wall
stands between, and nothing hides it, because `occludedChunks` vetoes every
chunk of a shape the focus is inside — which is right for the ground and
wrong for a wall somebody is against.

Underneath that was something larger: `FollowCamera.actualDistance` is
documented as "how far back it actually sits, after anything in the way", and
**nothing ever reduced it**. That pull-in is now built (`clearDistance`), it
is inert in ordinary play, and `ev03030` shows the Hero instead of a wall —
though still from 0.28 behind them, which is not a good shot. See
`docs/still-open.md`.

## Still to do

The areas in story order after Stornway, as far as the story is read:
Zere (`M02`), Coffinwell (`M03`), Alltrades Abbey (`X02`), Dourbridge (`M08`),
Porth Llaffan (`M05`), Bloomingdale (`F10`), Gleeba (`C02`), Batsureg
(`M10`), Upover (`M13`), Wormwood Creek (`M12`), Gittingham Palace (`C04`).

`pnpm inventory --regions` lists every place with the code that loads it, and
`docs/regions.md` says how to go to one.
