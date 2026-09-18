# Contributing

Thanks for looking. This page says what a contribution needs to be accepted,
and why. The short version: **never commit anything from the cartridge, never
invent a format, and write down the evidence.**

## What this is

Two things sharing a set of parsers: a general-purpose, client-side explorer
for any Nintendo DS cartridge (`apps/explorer`), and a browser reimplementation
of one DS JRPG (`apps/game`) that reads its assets from the user's own dump at
runtime. The engine is original code; only data comes from the cartridge.

The game is referred to by its codename, `minstrel`. **Do not use the game's
real name** in code, filenames, package names, commit messages or the README.

The parser packages (`packages/nitro-*`, `cartridge`, `l5-gpc`) are
game-agnostic and MIT; the explorer is what keeps them honest. The engine
packages and both apps are GPL-3.0-or-later. See [`LICENSE.md`](LICENSE.md).

## The three hard rules

These are in [`CLAUDE.md`](CLAUDE.md) as well, which is the file the tooling
reads; they apply to people just the same.

### 1. Nothing from the cartridge goes in the repository

No cartridge files, no extracted assets, no extracted tables, no memory dumps,
no golden files holding real bytes — not in code, not in tests, not in docs.
`.gitignore` covers `rom/`, `out/` and `evidence/`, but it is not a substitute
for judgement. If a change seems to need extracted data committed, it needs a
different design: generate it at runtime and cache it locally.

Test fixtures are **synthetic**: build a minimal valid structure in code — a
NitroFS image with three files, a hand-made sound bank — and test against
that. Tests that need a real cartridge are gated behind `MINSTREL_TEST_ROM`
and skipped by default; they never run in CI.

### 2. Nothing is invented about a format

A parser reads only fields whose meaning is confirmed by observed bytes or by
published documentation. Unknown regions are carried through as opaque bytes
under names like `unknown_0x18`, never skipped. A field whose meaning is
inferred is marked `// INFERRED:` with the reasoning, and the evidence goes in
the package's `FORMAT.md`: what was observed, in which file, at what offset,
how many of how many agree.

The same standard holds for the game's logic and its scripts: a reading of a
script function says what it is handed and what was measured (`apps/game/src/event.ts`
is the model), and a battle formula cites its source or says it is ours.
"Ours" is fine — much of the engine has to be — as long as it is *said*.

For documented formats (NitroFS, NSBMD/NSBTX/NSBCA, SDAT), cite the
reference; don't recall it from memory.

### 3. Ask before adding a dependency

The project has five dev dependencies — Biome, TypeScript, Vitest, Vite and
Node's types — and no runtime ones; binary parsing, fixed-point maths and DS
rendering are written here on purpose. Open an issue before adding one.

## Setting up

Node 22+ and pnpm. There is no build step for the packages; Node and Vite
read the TypeScript directly.

```sh
pnpm install
pnpm test         # unit tests, synthetic fixtures only
pnpm typecheck    # the parsers without DOM types, then gl, explorer and game
pnpm lint         # Biome; `pnpm format` fixes what it can
pnpm dev          # the game
pnpm dev:explorer # the explorer
```

With your own dump, the gated tests run too:

```sh
MINSTREL_TEST_ROM=rom/your.nds pnpm test
```

## Where things go

```
packages/
  nitrofs/ nitro-comp/ nitro-gfx/ nitro-snd/ l5-gpc/ cartridge/   MIT, game-agnostic
  game-formats/                                                    MIT, title-specific
  fixed/ script/ audio/ sim/ render/ world/ actor/ gl/             GPL, engine
apps/    game/ explorer/
tools/   inventory/ harness/ shot/ sprite/
docs/    findings, milestone notes, and next.md — where the work stands
```

- Parser packages depend on each other and on nothing else here: no engine
  imports, no DOM, no WebGL, no Node built-ins (`fs`, `path`, `Buffer`). They
  take `Uint8Array` and return plain data, using `subarray` rather than
  `slice` — a cartridge is 128 MiB and is never copied.
- A `nitro-*` package must work on **any** DS cartridge: no title checks, no
  hard-coded paths, no special cases. A quirk of this game goes in
  `game-formats`; a quirk of the DS goes in `nitro-*` with a note in
  `FORMAT.md`. The test is the explorer: if a change would break it on an
  unrelated cartridge, the change is in the wrong place.
- `render` may import from `sim`; `sim` never imports from `render`, and
  everything in `sim` runs headless.
- Gameplay maths is fixed-point (`fx32`); floats are for rendering only.
  No `Date.now()`, no `Math.random()`, no iteration over unordered
  collections in simulation code.

## Writing code here

Match the code around you: its comment density, its naming, its idiom. Two
habits are worth naming because they are unusual:

- **Comments say what was read and what is ours.** A reader should be able to
  tell, at any line that encodes a fact about the game, whether that fact was
  measured, read from a reference, or chosen. Numbers that were fitted by eye
  say so.
- **Every parser package has a `FORMAT.md`** with a table of what is known, by
  what evidence, and a section for what is not. A change to a parser is a
  change to its `FORMAT.md`.

Every parser needs round-trip tests where the format allows and
malformed-input tests — truncated files, bad magic, offsets out of range. A
parser throws clearly; it never returns garbage.

## Sending a change

1. One change per pull request, with the evidence in the description: what
   was observed, on how many files, and what was tried and disproved. A
   finding that turned out wrong is still worth writing down, in the
   package's `FORMAT.md` or `docs/findings.md`, so the next person does not
   repeat it.
2. `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
3. Nothing from a cartridge is in the diff — check the screenshots and the
   test fixtures as well as the code.
4. The commit message says what changed and why, in plain words; the first
   line under 72 characters.

By submitting a change you agree that it is licensed under the licence of
the package it lands in — MIT for the parsers and tools, GPL-3.0-or-later for
the engine and apps — and that you have the right to license it so.

## What to work on

[`docs/still-open.md`](docs/still-open.md) is the list. It keeps four kinds of
gap apart, and the first two are where help is worth most: a question the
cartridge has not answered yet (with the shape to search by and the witness
that would confirm a find, in [`docs/binaries.md`](docs/binaries.md)), and a
rule of ours standing in for the game's own. A finding against either is a
contribution whether or not any code comes with it — see below.

## Findings without code

Some of the most useful contributions are not code: a measurement from the
real game in an emulator, a table found in the binaries, a correction to a
reading. Open an issue with what you saw, where, and how it can be checked.
`docs/next.md` keeps a list of questions waiting on exactly that.

## Things that will not be merged

- Anything derived from the cartridge, however small.
- A parser field whose meaning was guessed.
- The game's real name, anywhere.
- A new dependency that was not discussed first.
- Work on what the current slice puts out of scope — the slice's plan says
  what that is, and a change that drifts toward it needs a conversation
  first.
