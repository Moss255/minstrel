# Scene review — direction and animation, against the let's play

Written 26 September 2026. What to go through, in what order, and how, to
correct the slice's scenes where they are staged or animated differently from
the game. The tool is the scene browser (`?scenes=1`, or the backquote key —
see `docs/regions.md`); the reference is the two let's play videos in
`evidence/`.

## How to review one scene

1. Open the game with `?scenes=1`, type the scene's number, press **Play**.
2. Open the video at the time given below. The times are from contact sheets
   at one frame every 30 seconds, so they are good to about half a minute —
   and **a time marked `?` is placed by stage and place, not seen**. The first
   look at that scene fixes it; write it back here.
3. Step through both. Pause and **+1** hold the scene on a frame.
4. Write down what differs as one of these, which is how it will be fixed:

| kind | what it looks like |
|---|---|
| **facing** | someone looks the wrong way, or turns when they should not |
| **motion** | the wrong pose or animation, or none where there is one |
| **position** | someone stands or walks to the wrong place |
| **camera** | the shot is framed, angled or cut differently |
| **missing** | a character, a model or an effect is not there |
| **timing** | right things, wrong moment |

A note like `22510 · 1:12 in · motion: Hexagoon lands with no drop` is enough
to start from. The scene's frame counter is on the browser's bottom line.

## Side by side, many at once

`tools/compare/compare.mjs` takes an index — one line a moment, `scene video
time m101|f250 label` — and writes a page of pairs: the let's play's top
screen at that time beside ours at that moment of that scene, played with
`?scene=` and held with `?until=`. Pick the video's time while the same
message is up and the pair lines up exactly. See the tool's own header;
keep the index in `evidence/`, which is not committed.

```
22510  angel-falls-4  36:20  m101  trapped running away
```

## What the footage covers

| video | covers |
|---|---|
| `dq9-lp-ep1.mp4` | 0:00–4:40 the opening film, the title, character creation · 4:45 the narration · 5:10–9:45 the prologue's first visit to Angel Falls with Aquila, and its first fight · 9:50–10:31 the fly-home over the Observatory · 10:32–16:00 the Observatory and Apus Major · then Angel Falls again |
| `dq9-lp-angel-falls.mp4` | 0:00–12:00 the prologue in Angel Falls as a guardian, with Aquila · 12:00–14:30 the Observatory and Yggdrasil · 15:00–17:30 the fall · 18:00 the opening after it · 18:00–30:00 Erinn, the mayor, the inn · 31:00 Ivor joins · 32:00–39:30 the first fights |
| `dq9-lp-angel-falls-4.mp4` | 0:00–7:30 the field with Ivor · 7:30–10:00 the landslide · 15:30–16:30 into the Hexagon · 17:00–20:00 back at the inn with Erinn · 22:30–35:00 the Hexagon's floors · 36:00 Patty under the rubble · 36:30–38:00 Hexagoon · 40:00–45:00 Patty back at the inn |

Parts 2 and 3 are not in the folder; there may be a short gap before part 4.
**Nothing covers stage 2.6 or 2.7** — after Patty's return: the night, the
Starlight Express, Stella and leaving for Stornway. That wants footage first.

## The scenes, by how much there is to get wrong

Measured by playing each scene with its lines read at once and counting what
it asks for: **camera** calls (the `300`s), **motion** (poses and turns),
**walk** (placing and moving characters), **fx** (effect models). None of
these scenes calls an engine function the host has not got, so what there is
to correct is how well what is read is played, not what is missing.

### First: the staged scenes

Where direction and animation carry the scene. In story order.

| scene | map | stage | video, about | camera | motion | walk | fx | what it is |
|---|---|---|---|---|---|---|---|---|
| 21520 | M01 | 1.1 | ep1 7:30–9:45 ? | 45 | 61 | 40 | 6 | a set battle won in the prologue — the most staged scene in the slice |
| 21510 | X01 | 1.1 | ep1 10:32–16:00 ? | 27 | 18 | 16 | 3 | the Observatory, early in the prologue |
| 21592 | M01 | 1.2 | angel-falls 0:00–5:00 ? | 27 | 14 | 10 | | entering Angel Falls at 1.2 |
| 21593 | M01 | 1.3 | angel-falls 11:30–12:00 ? | 26 | 15 | 22 | 2 | hands on to `X01M05`, `21597` |
| 21595 | M01 | 1.3 | angel-falls 8:00–12:00 ? | 28 | 25 | 29 | 4 | |
| 21597 | X01 | 1.3 | angel-falls 12:00 ? | 13 | 6 | 8 | | arriving in `X01M05`, handed on from `21593` |
| 21594 | X01 | 1.4 | angel-falls 12:00–14:30 ? | 29 | 19 | 12 | 1 | |
| 22590 | M01 | 2.1 | angel-falls 18:00–19:30 | 63 | 51 | 42 | | the opening after the fall — Ivor's gang |
| 2350 | S01 | 2.2 | angel-falls-4 7:30–10:00 | 20 | 18 | 17 | | talking to Ivor at the landslide |
| 22591 | S01 | 2.2 | angel-falls-4 about 10:00 ? | 28 | 10 | 7 | | Ivor leaves the party |
| 2400 | M01 | 2.3 | angel-falls-4 17:00–20:00 ? | 9 | 17 | 12 | | entering Angel Falls at 2.3 |
| 2530 | D01 | 2.4 | angel-falls-4 about 24:30 ? | 19 | 1 | 1 | | the statue's switch — camera only |
| 22510 | D01 | 2.4 | angel-falls-4 36:00–36:30 | 68 | 27 | 23 | 7 | Patty freed, Hexagoon arrives — **reported: dust** |
| 2555 | D01 | 2.4 | angel-falls-4 38:00–39:30 ? | 11 | 9 | 7 | | handed on after the fight |
| 2600 | M01 | 2.5 | angel-falls-4 40:00–45:00 ? | 38 | 18 | 11 | | entering Angel Falls at 2.5 — Patty back |

### Then: the short scenes, in batches

One or two camera calls and a handful of motions: mostly a check that people
face whom they speak to and stand in the right pose. Quick, and best done in
a run through each place.

| where | stage | video, about | scenes |
|---|---|---|---|
| the Observatory | 1.1–1.4 | ep1 10:32–16:00, angel-falls 12:00–14:30 ? | 1130, 1140, 1150, 1160, 1170, 1600, 1610, 1515, 1620, 21591 |
| Angel Falls, the prologue | 1.2–1.3 | ep1 16:00 on, angel-falls 0:00–12:00 ? | 1310, 1320, 1330, 1340, 1370, 1380, 1390, 1350, 1360, 1410 |
| Angel Falls, after the fall | 2.1–2.3 | angel-falls 19:00–31:00, angel-falls-4 17:00–20:00 | 2110, 2120, 2140, 2200, 2210, 2220, 2222, 2230, 2240, 2250, 2360, 2370, 2410, 2420, 2430, 2440, 2450 |
| the pass | 2.2 | angel-falls-4 7:30–10:00 | 2300, 2320, 22592 |
| the Hexagon | 2.4 | angel-falls-4 15:30–38:00 | 2500 (the ghostly figure — **reported**), 2510, 2520, 2535, 2550 |
| Angel Falls, Patty home | 2.4–2.5 | angel-falls-4 40:00–45:00 | 2560, 2570, 2620 |

`1330` and `1340` in the prologue have 19 and 22 motions for few camera calls
— worth a closer look than the rest of their batch.

### Not yet: after Patty's return

Stage 2.6 and 2.7 — no footage covers them. When there is some: `2700`,
`2720`, `2730`, `2750`, `2760`, `2800`, `22594` in Angel Falls; `2810`,
`2820`, `22595` (78 camera calls, the most of any) at the pass; `2900` at
Stornway; `2930`, `2940` at the Quester's Rest.

### Not the slice's

Twelve more come up as reachable from 1.1 — `13100`, `15310`, `24590`,
`51220`, `51230`, `51231`, `51610`, `53140`, `53150`, `53170`, `53171`,
`53182`, `53250` — because their records' spans run from the start of the
game to its end. They belong to other places and other chapters, and wait for
footage of those.
