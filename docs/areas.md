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

## Dourbridge — `M08`

**25 September 2026.** `--stage=6.1 --talk=10`, **29 views in five minutes: 0
failed, 0 worth a look, 6 the game guessed, none crowded.**

22 pieces, 10 doorways, 9 characters all 2D, chapter `H0`. The cleanest
checkpoint so far — **no crowded camera at all**, which is worth as much as
Coffinwell's five: the fault is not everywhere, it belongs to particular
interiors where something stands close in front of the eye.

Its status line carries a phrase the earlier areas did not: **"3 stand in
another map"** — three of the nine cast are placed somewhere other than the
map they are listed in. Not looked into; noted because it is the kind of thing
that is easy to mistake for a fault later.

## Porth Llaffan — `M05`

**25 September 2026.** `--stage=7.1 --talk=10`, **32 views in six minutes: 0
failed, 0 worth a look, 8 the game guessed, 4 with the camera crowded.**

18 pieces, **14 collision meshes** — by far the most of any area so far, where
most have one or two — 10 doorways, 5 treasure, and only 3 characters on the
exterior. The fishing village is built out of many small pieces, which is
presumably why.

Its four crowded shots are **49%, 49%, 49% and 35%**, and they are the useful
half of the evidence for the floor: under the rule derived at Coffinwell the
three at 49% stay as they are and only the 35% is pulled back. A floor that
moved all four would have been too blunt, and this is the area that shows the
difference.

## Gleeba — `C02`

**25 September 2026.** `--stage=6.1 --talk=10`, **42 views in eight minutes: 0
failed, 0 worth a look, 4 the game guessed, 3 with the camera crowded.**

24 pieces, 11 doorways, 16 characters all 2D, chapter `K0`. **Four of ten
guessed is the lowest rate of any area so far** — against Zere's six,
Coffinwell's seven and Alltrades' eight of nine — so more of Gleeba's cast are
named by triggers and chosen the game's own way. Nothing about the town
explains it yet, and it is the first evidence that the 59% cartridge-wide
figure has a real spread behind it rather than being flat.

### A crowded camera can draw nothing at all, and the witness scores it fine

`ev20960` is crowded to **15%**, the worst seen, and the result is not a bad
shot but **a black frame**. The mini-map draws, the box reads "Serena: Oh,
sorry, I didn't see you there, I was in such a hurry…", the status says 6,727
vertices and 3,541 triangles were submitted and two chunks moved out of the
way — and the 3D view is empty. The camera is inside the geometry it was
pulled into.

**The witness called the area `0 worth a look`.** Its blank test is whether
the overlay names the area, and the overlay does; its trouble test reads the
status line, and the status is clean. So the one view on the page that is
plainly wrong is the one nothing flagged. This is the same limit `still-open.md`
records — a view of the inside of a wall passes both tests — met head on.

Two things follow. The camera floor already written raises this shot from 15%
to the floor and is worth more than it looked when the worst case was a view
of the Hero's hair. And **the witness wants a blank-frame test of its own**:
the page it writes is read by eye, but the summary line at the top is what
decides whether anyone reads it carefully, and it is currently blind to the
worst thing it captures.

## A blank-frame check, written after Gleeba, found two more

Gleeba's black frame was found by eye. That was luck, so the check the witness
lacks was written as a separate pass over the images already captured —
`out/witness/<area>/*.png`, sampling the middle-left band that the mini-map,
the status text and the message box all leave alone, and asking how dark and
how **flat** it is.

**Flatness is the signal, not darkness.** A blank view is not black: it comes
out a uniform grey of about 22. What distinguishes it is a spread of exactly
**0** between the lightest and darkest pixel in the band. Across the seven
areas swept, three images have it — and the witness scored every one of them
fine:

| view | cause |
|---|---|
| `C02/23-ev20960` | camera crowded to 15%, inside the geometry |
| `C02/37-talk-C02M09-10` | **the Hero has fallen out of the world** |
| `M03/51-talk-M03M03-4` | **the Hero has fallen out of the world** |

### `?talk=` can stand the Hero where there is no floor

Two of the three are the same fault and it is not the camera. Their status
lines read `C02M09 · 0.96, -6.51, -0.31 (falling)` and `M03M03 · 0.63, -6.39,
-0.31 (falling)` — the same `z`, both falling, both in a small interior of
four pieces and one collision mesh.

Reproduced exactly: `?map=C02M09` alone stands the Hero on the floor with
`under: 0`, and **`?map=C02M09&talk=10` puts them at `-0.31` with
`underfoot: null`** — no surface beneath them at all.

`standAndTalk` in `main.ts` is why. It takes the cast member's placement,
steps half of `TALK_REACH` back along their facing, and writes that `x` and
`z` into the Hero's state with the cast member's own `y` — **and never asks
whether there is floor there.** In a room small enough, behind a character is
outside the room.

It is the same shape of fault as `?event=` playing a scene in whatever map was
loaded: a development route with no guard, producing something that looks like
an engine bug. The fix is to put the Hero on the ground under that spot, or to
leave them where they are when there is none.

Not fixed during the sweep, with the camera floor, so that the areas remain
comparable with each other.

## Batsureg — `M10`

**25 September 2026.** `--stage=10.1 --talk=10`, **29 views in five and a half
minutes: 0 failed, 0 worth a look, 8 the game guessed, none crowded, none
blank.** 16 pieces, 9 collision meshes, 9 doorways, 3 characters outside,
chapter `J0`.

Clean on both of the new measures — the first area checked against the
blank-frame pass from the start, and it has nothing. Eight of ten guessed puts
it at the high end, with Alltrades and Porth Llaffan.

## Upover — `M13`

**25 September 2026.** `--stage=14.1 --talk=10`, **37 views in six and a half
minutes: 0 failed, 0 worth a look, 1 the game guessed, none crowded, none
blank.** 21 pieces, 14 doorways, 3 characters outside, chapter `N0`, reached
from `D16M02`.

**One of ten guessed, and that is the headline.** Every other area has run
between four and eight of ten; Upover's cast is almost entirely named by its
own triggers at 14.1, so nearly every line here is chosen the game's way
rather than fallen back to.

Set against Alltrades' eight of nine, the range across nine areas is now **1
in 10 to 8 in 9**, which settles something the 59% cartridge-wide figure could
not say on its own: the guessing is **not** evenly spread. Some areas are
almost fully read and some are almost entirely fallback, and the difference is
how many of the cast a trigger names. That is the lever, and it is per-area.

## Wormwood Creek — `M12`

**25 September 2026.** `--stage=7.1 --talk=10`, **31 views in five and a half
minutes: 0 failed, 0 worth a look, 8 the game guessed, 3 with the camera
crowded, none blank.** 13 pieces, 8 doorways, 9 characters of whom **1 stands
in another map**, chapter `J0`.

The map whose collision fault took the collisionless count from 197 to 196 —
see `docs/still-open.md` — reads and walks without complaint here. Its three
crowded shots join the tally for the floor.

## Gittingham Palace — `C04`

**25 September 2026.** `--stage=7.1 --talk=10`, **30 views in six minutes: 0
failed, 0 worth a look, and no conversations at all.** 23 pieces, 12 doorways,
2 treasure, reached from `F34`.

**It has no cast at 7.1** — the status reads `0 characters, 1 unclassified`.
So there was nobody to talk to, which is why it is the only area with no guess
rate: not a good score but no score. Whether the palace is genuinely empty at
this point in the story or 7.1 is the wrong stage for it is **not
established** — its triggers are busiest at 16.1, far later, and unlike the
line-picking question at Zere this one would really change what is on screen,
because the cast is placed by stage. Worth a second run at 16.1 before this
area is called checked.

`1 unclassified` is a phrase no other area produced. Not looked into.

## Bloomingdale — `M09`

**25 September 2026.** `--stage=9.1 --talk=10`, **39 views in eight minutes: 0
failed, 0 worth a look, 7 the game guessed, 7 with the camera crowded, 1
blank.** 22 pieces, 7 collision meshes, 16 doorways, 13 characters all 2D,
chapter `I0`, reached from `F10` — which is the overworld's Bloomingdale, and
confirms the correction above.

**Seven crowded shots, the most of any area**, at 23%, 30%, 37%, 44%, 44% and
two more.

### A blank frame the camera floor will not fix

`ev09100` comes out blank, and it is **not** the same fault as Gleeba's. The
numbers, probed:

| | wanted | distance | below the 0.579 floor? |
|---|---|---|---|
| Gleeba `ev20960` | 1.54 | **0.235** | yes — the floor fixes it |
| Bloomingdale `ev09100` | 4.56 | **1.686** | **no** — the floor does nothing |

So the claim made at Gleeba, that the floor is worth more than it looked
because the worst case is a blank screen, is **half right**: it fixes that
blank screen and not this one. Recorded because the floor is written and it
would be easy to assume the class is closed.

What is wrong here instead is the **shot's focus**. The eye is at y `−0.361`
and the focus at `−0.926`, while the Hero stands at `−0.229` on a floor of
`−0.241` — so the scene is aiming at a point **0.7 below the Hero's feet** and
looking down into it from 1.69 back. Whether the focus is a cast member placed
under the floor, or the shot's target is computed wrongly, is **not
established**.

**So blank frames have at least two causes**, and the flat-band check finds
both without knowing either — which is the argument for folding it into the
witness rather than keeping it as a side script.

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
