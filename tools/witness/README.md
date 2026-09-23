# witness

One command, one page, an area seen.

`docs/beyond-the-slice.md` sizes Phase 3 not by how long an area takes to
*write* but by how long it takes somebody to satisfy themselves it is **right**
— seventy-four times over. Driving the game by hand to check a town is an
evening.

It stands in the map, walks through every doorway, plays every event the
triggers can reach, captures each one, and writes a single HTML page with the
pictures and the status lines under them. You scroll one page.

**Measured**, 24 September 2026, on a warm cache:

| area | views | time |
|---|---|---|
| C02, Gleeba | 32 | about 3 minutes |
| M01, Angel Falls | 59 | **7.2 minutes** |

Most of that is the pause after each scene — 2.5 seconds, to let a fade finish
and a cast be put down before looking. `--events=0` drops an area to well under
a minute when only the maps matter. So it is minutes rather than an evening,
which is what the phase gate asks for, but it is not instant and it is not
meant to run on every commit.

## Use

```sh
pnpm build
APP=game node tools/shot/serve.mjs rom/your.nds    # terminal 1
node tools/witness/witness.mjs C02                 # terminal 2
# then open out/witness/C02/index.html
```

**Several areas at once**, which is what a dip sample across the game wants —
they share the one browser and the one fetch of the cartridge, and get a
summary page of their own:

```sh
node tools/witness/witness.mjs --events=0 C01 D01 H01 M03 O00 R01 S02 T01
# then open out/witness/index.html
```

`--events=0` is usually right for a broad sample. What the witness tells you
that nothing else does is **whether maps render**; whether an area's *events*
want anything the host has not got is already answered exhaustively, for all
75 areas, in two seconds, by `apps/game/test/event-coverage.test.ts`. Paying
seven minutes an area to learn that again is the wrong trade.

| option | meaning |
|---|---|
| `--stage=2.2` | open at a story stage, so the cast and the triggers are that stage's |
| `--time=night` | force the hour |
| `--events=0` | maps and doorways only, no scenes — much faster |
| `--size=1280x800` | how big each picture is |
| `--port=8765` | where `serve.mjs` is listening |

`CHROME` in the environment overrides the browser binary, as with `tools/shot`.

It exits non-zero if anything failed to load **or is worth a look**, so it can
gate a change as well as inform a person.

## "Worth a look" is the part that earns its keep

A page that did not say *failed* has not thereby succeeded. The first run of
this tool reported `O00` as a good view: the map has no collision mesh, the
game stopped on its own title card, and nothing here noticed because the title
never said the word. **A witness that reports success on a blank page is worse
than no witness.**

So two things are checked besides loading:

- **The overlay names the map it should be showing.** It names one whenever one
  is up, so an overlay that does not is a view with no map in it. The code to
  expect is not always the area — a doorway lands in the map it leads to, and
  checking that against the source flagged every doorway on the first attempt.
- **The status line is read, not only shown.** It is the game's own account of
  what went wrong, in prose meant for a person, so `TROUBLE` is a list of the
  words it uses rather than a rule. Missing a phrase makes this quieter than it
  should be; anything added to the game's complaints belongs there too.

## Why it is not `tools/shot` in a loop

`tools/shot` launches a browser and fetches the whole cartridge for **every
picture**. That is right for one picture and hopeless for forty: the cartridge
is 128 MiB and reading it is most of the cost.

This starts Chrome **once** and passes `keep=1`, which puts the dump in the
browser's own store, so the first view pays for it and the rest read it from
there. The saving is the difference between "worth doing" and "not".

## Why it asks the page rather than reading the cartridge again

Which doorways a map has, and which events its triggers can reach, are things
the game works out as it loads. The witness asks for them —
`window.__witness`, which `apps/game/src/main.ts` fills each time a map opens.

The alternative is parsing triggers a second time, in another language, from
another copy of the parsers. That drifts, and the day it drifts the witness
starts lying about what it looked at. One set of parsers, one answer.

The hook is read-only: the map's code, the codes its doorways lead to, and the
event numbers its triggers name. It calls nothing and changes nothing, so it
cannot alter what a shot shows.

## What it does not do

- **It does not judge.** Nothing here knows what Gleeba is supposed to look
  like. It puts the evidence on one page; a person decides. That is the point —
  the done-when is "somebody can satisfy themselves", not "a test passes".
- **It does not compare against a let's play.** Frames lined up beside a
  recording is the next thing, and it wants the recording as input.
- **It does not walk.** Every view is a place the game can be *put* — a map, a
  doorway, a scene. Somewhere only reachable by walking is not covered; use
  `tools/shot`'s `--hold` for one of those.
- **It reads the triggers' events, not the conditions on them.** A scene that
  could never play at the stage you asked for is still captured. That is
  deliberate: the question is whether the engine can play it at all.
