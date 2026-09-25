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
| its events exist | `apps/game/test/event-scripts-exist.test.ts` — 23 of the 512 events a trigger names have no script, and the shape of those 23 |

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
**nothing ever reduced it**. That pull-in is now built (`clearDistance`) and
is inert in ordinary play.

**Corrected, 25 September 2026: `ev03030` was never a wrong view.** It was
being played with `?map=C01`, and it does not happen in `C01` — its trigger
names `C01M16`, Stornway Castle. Played there it is a good shot: the Hero on
the floor of the hall, the armour stands either side, the line in the box.
The camera was inside a wall because the scene was standing its cast in
another map's geometry.

So the passage above is right about the *witness* — it reads the status line
and checks a map was drawn, and a view from inside a wall passes both — and
wrong about the area. Nothing here needed fixing. The pull-in it led to is
real work and stays, but it was not what this scene wanted, and the
floor-versus-script-`y` chase that followed was measuring the same mistake.
`?event=` plays a scene in whatever map is loaded and warns about nothing,
which is the thing to fix. See `docs/still-open.md`.

## Zere — `M02`

**25 September 2026.** `--stage=3.6 --talk=10`, **28 views in five minutes: 0
failed, 1 worth a look, 6 the game guessed** — and the same again at 6.1, on
which see below. Five minutes is the number the
plan asked Phase 3 to measure and had not: an area is minutes, not an evening.

Read through, the town is right. The Hero comes in under the gate's arch with
the fence and the path drawn, and the mini-map names Zere and marks its inn.
Petra's House is the best of it — a candle with its glow on the table, stools,
the bed, flowers by the window, and Petra answering **"Wheesht, Alanna! There
you go again, blethering about the old days."**

**The one worth a look is the cartridge's, not ours.** `ev03131` is named by a
trigger in `M02` and no `ev03131.gp2` exists anywhere; `ev03130` does. The
host says so and carries on, which is what should happen. Measured across the
cartridge afterwards: 512 events are named by a trigger and **23 have no
script**, 21 of them `R02`/`R03`/`R04` in exact triples — three parallel areas
whose scenes were cut together — leaving only `ev00003` and this one outside
the pattern. `apps/game/test/event-scripts-exist.test.ts` pins it.

**A thing that looks wrong and is not.** The status line says `indoors` on
arrival, and the map index says `M02` is an exterior. Both are right: `inside`
is whether there is a roof over the character's head, checked from the
geometry as they walk, and the Hero arrives standing under the gate's arch.

**Six of ten conversations were guesses** — "no such line covers 3.6, so the
first that does". The obvious reading is that 3.6 is the wrong stage for this
town, and **that was checked and is wrong.**

Zere was run again at **6.1**, its busiest stage, 36 of its 90 triggers. The
stage reached a different chapter — **`E0` against 3.6's `C0`** — so the input
genuinely varied, and the result was **28 views, 0 failed, 1 worth a look, 6
guessed**: the same numbers exactly. What changed is *which* six. Three of
them are the same characters at both stages (`n012a`, `n015a`, `n097a`) and
three are different.

So the guess rate is not a symptom of a badly chosen stage. It is a property
of the town: about six of ten of Zere's cast have no line naming them at any
one point in the story, and which six depends on where you ask. That also
means the stages picked for the other areas — earliest span with five or more
triggers — do not need re-deriving before those runs, which is worth knowing
before spending fifty minutes on them.

## Coffinwell — `M03`

**25 September 2026.** `--stage=4.1 --talk=10`, **55 views in twelve minutes:
0 failed, 0 worth a look, 7 the game guessed, 5 with the camera crowded.**

Twice Zere's views and more than twice its minutes, which is the first
evidence for the caveat put beside the five-minute figure in
`docs/beyond-the-slice.md`: an area's cost tracks its size. Coffinwell has 17
doorways to Zere's 9 and 207 triggers to its 90.

The town is right — the Hero comes in on a walled path under autumn trees,
the mini-map names Coffinwell and marks its inn, and the interiors are
furnished and lit. Nothing failed and nothing was blank.

### The camera can be pulled in until it is inside the Hero's head

**This is the first real fault the phase has found**, and it is ours rather
than the cartridge's.

`ev04010` is drawn at **20% of the distance the camera asked for**: the back
of the Hero's head fills the frame and Catarrhina, who is speaking, cannot be
seen at all. The line reads and nothing errors, which is exactly the class of
fault the headless checks pass and a person does not.

The cause is one line. `clearDistance` in `packages/render/src/occlusion.ts`
ends `return Math.max(0, nearest * wanted - margin)` — **the floor is zero**,
so when something stands close in front of the eye the camera is pulled the
whole way to the focus. It was written for `ev03030`, which turned out not to
need it at all (see Stornway above), and Coffinwell is where it first fires in
anger.

The five crowded shots put a number on where it stops being acceptable:

| scene | crowded to | usable |
|---|---|---|
| `ev04010` | 20% | **no** — head fills the frame |
| `ev04140` | 32% | not looked at |
| `ev24596` | 28% | not looked at |
| `ev04040` | 49% | not looked at |
| `ev04020` | 56% | **yes** — both speakers and the room in view |

So the fix is a floor, and what the floor should *be* is a judgement rather
than a reading: the pull-in is ours, and what the game does when a wall stands
this close has not been read. Two candidates, neither yet chosen — a minimum
tied to the person's height, below which the figure fills the view whatever
the scene wants; or leaving the wall to clip, which is what the engine did
before the pull-in existed and is not obviously worse than this.

## Alltrades Abbey — `X02`

**25 September 2026.** `--stage=6.1 --talk=10`, **18 views in three and a half
minutes: 0 failed, 0 worth a look, 8 the game guessed, 1 with the camera
crowded.**

The smallest area so far and the fastest: 7 pieces, 2 doorways, reached from
`F07`. **Its exterior has no cast at all** and all nine of its characters are
inside `X02M01`, which is the Abbey itself — so the vocation hall is where the
people are, as it should be.

Two things worth carrying forward:

- **Eight of nine conversations were guesses**, the highest rate yet, against
  Zere's six of ten and Coffinwell's seven of ten, and in a third chapter
  again (`F0`). Three areas now agree that the rate is a property of the place
  rather than of the stage chosen — see Zere.
- **The crowded camera is not only an events problem.** X02's one crowded shot
  is a *conversation*, `n017a #9` in `X02M01` at 31%. Coffinwell's five were
  all scenes. So a floor on `clearDistance` would fix both, and the fault is
  wider than the first area made it look.

## Still to do

The areas in story order after Zere, as far as the story is read:
Coffinwell (`M03`), Alltrades Abbey (`X02`), Dourbridge (`M08`),
Porth Llaffan (`M05`), Bloomingdale (`M09`), Gleeba (`C02`), Batsureg
(`M10`), Upover (`M13`), Wormwood Creek (`M12`), Gittingham Palace (`C04`).

**Bloomingdale is `M09`, not `F10` — corrected 25 September 2026.** The list
said `F10`, which has no trigger file, and the reason is that `F10` is not the
town: the index gives it the region "Bloomingdale" and the *label*
"Bloomingdale", which is how the overworld names a place you can see from
outside. The town is `M09`, labelled "Exterior" in the same region, with
`M09M01` Mayor's House, `M09M02` Workshop, `M09M03` Church and `M09M04`
Marion's House beneath it — and `triggerM09.bin` exists, with 155 triggers,
busiest at 9.1 of the story stages that are not the catch-all spans.

Twenty-three maps carry the Bloomingdale region across four area codes:
`M09` the town, `F10` and `F54` outside it, and `S12` — eleven triggers, all
at 9.4. So "an area" and "a region" are not the same unit, which is worth
holding on to for the areas still on this list.

A checkpoint wants the *town*. `M09` at 9.1 is the run to make.

**The rest of the list was then checked for the same fault, and is clean.**
Every one of the eleven codes is labelled "Exterior" in the index, has its own
`trigger<code>.bin`, and has sub-maps beneath it — Zere 7, Coffinwell 13,
Alltrades 2, Dourbridge 8, Porth Llaffan 6, Bloomingdale 16, Gleeba 19,
Batsureg 7, Upover 12, Wormwood Creek 11, Gittingham Palace 10. **Bloomingdale
is the only one whose region spans other area codes at all**, which is why it
was the one that went wrong and why the others can be taken at face value.

`pnpm inventory --regions` lists every place with the code that loads it, and
`docs/regions.md` says how to go to one.
