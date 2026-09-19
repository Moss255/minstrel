# CLAUDE.md

Project conventions. Read this before doing anything in this repo.

## What this is

Two things sharing a set of parsers:

1. **`apps/game`** — a browser-based reimplementation of a Nintendo DS JRPG in TypeScript. It reads assets from the user's own ROM at runtime. It is **not** an emulator and **not** a recompilation; the engine is original code, only data comes from the ROM.
2. **`apps/explorer`** — a general-purpose, browser-based asset explorer for *any* DS ROM. Browse the filesystem, preview models and audio, export to glTF. Fully client-side.

The explorer is not a side project. It's what keeps the parser packages honest and general, and it's the artefact that will attract contributors.

Codename: `minstrel`. Do not use the game's real name in code, filenames, package names, commit messages, or the README.

Full strategy and milestones live in `docs/PLAN.md`. This file is the operational layer.

---

## Hard rules

These are not stylistic preferences. Violating them causes real damage.

### 1. Never commit ROM-derived content

No ROM files, no extracted assets, no extracted data tables, no memory dumps, no golden files containing raw bytes from the ROM.

If a task seems to require committing extracted data, stop and ask. The answer is almost always "generate it at runtime and cache it locally instead."

`.gitignore` covers the common cases but is not a substitute for judgement.

### 2. Never invent format details

This is the most important rule in the file.

When writing a parser for an undocumented format, **do not guess struct layouts, field offsets, magic numbers, or enum values.** Plausible-looking invented offsets are worse than no parser: they produce code that appears to work, fails on real data, and takes days to debug.

Instead:

- Parse only fields whose meaning is confirmed by observed bytes or by published documentation.
- Record the evidence in the package's `FORMAT.md` — what was observed, in which file, at which offset.
- Leave unknown regions explicitly named `unknown_0x18` and carry them through as opaque bytes. Do not silently skip them.
- If a field's meaning is inferred rather than confirmed, mark it `// INFERRED:` with the reasoning.

For well-documented formats (NitroFS, NSBMD/NSBTX/NSBCA), published references exist and should be cited in `FORMAT.md`. Cite them; don't recall them.

### 3. Ask before adding dependencies

This project has few and should keep it that way. Binary parsing, fixed-point math, and DS rendering are all things we write ourselves deliberately.

---

## Stack

| | |
|---|---|
| Runtime | Node 22+ |
| Package manager | pnpm (workspaces) |
| Language | TypeScript, `strict: true`, no implicit `any` |
| Bundler | Vite |
| Tests | Vitest |
| Lint/format | Biome |
| Target | Browser first; parsers must also run in Node |

No build step for workspace packages — the bundler consumes TypeScript source directly. Import across packages by package name (`@minstrel/nitrofs`), never by relative path across package roots.

---

## Package boundaries

```
packages/
  nitrofs/ nitro-comp/ nitro-gfx/ nitro-snd/ nitro-gltf/  ← MIT, game-agnostic
  game-formats/                                            ← MIT, title-specific
  fixed/ tables/ script/ audio/ sim/ render/               ← GPL, engine
apps/
  game/  explorer/  devtools/
tools/
  inventory/  harness/
```

**Rules, not conventions, and nothing checks them for you. They are held by
review, so a change that crosses one of these lines has to be caught by
reading it:**

- Parser packages may depend on each other and on nothing else in the repo. They take bytes and return structured data. No engine imports, no DOM, no WebGL.
- `render` may import from `sim`. **`sim` may never import from `render`.**
- Anything in `sim` must run headless.

### The `nitro-*` packages are game-agnostic

They must work on **any** DS ROM and must never contain a reference to this specific title — no game code checks, no hardcoded paths, no title-specific special cases. Anything title-specific goes in `game-formats`.

This is not aspirational. `apps/explorer` is a general-purpose DS asset explorer, and it's the test: if a change to a `nitro-*` package would break the explorer on an unrelated ROM, the change belongs elsewhere.

When you encounter a format quirk, ask whether it's a *DS* quirk or a *this-game* quirk. DS quirks go in `nitro-*` with a note in `FORMAT.md`. Game quirks go in `game-formats`.

### The `nitro-*` packages are browser-safe

They run in a Worker in the browser as well as in Node. Therefore:

- **No Node built-ins.** No `fs`, no `path`, no `Buffer`. Callers do their own I/O.
- Public APIs take `Uint8Array` / `ArrayBuffer` / `DataView` and return plain structured data.
- **Use `subarray`, not `slice`.** A DS ROM is ~128MB; views are free, copies are not. Never hold multiple copies of the ROM.
- Parsing must be interruptible or chunked where it could take more than a frame. The explorer and the game both run it off the main thread.
- No `TextDecoder` assumptions about encoding — DS text encodings are game-specific and belong in `game-formats`.

If a change requires crossing one of these boundaries, that's a design problem — raise it rather than working around it.

---

## Code conventions

### Fixed-point in simulation

All gameplay math is fixed-point, matching DS SDK conventions (`fx32` ≈ 1.19.12, `fx16` ≈ 1.3.12). Floats are for rendering only.

```ts
type Fx32 = number & { readonly __fx32: unique symbol };
```

Use `Math.imul` for 32-bit multiply and `>>>` for unsigned shift. Never let a float enter a gameplay calculation — it silently breaks RNG reproducibility, and the divergence surfaces months later.

### No per-frame allocation in hot paths

Flat `Float32Array` scratch buffers and object pools. No allocating vectors or matrices inside a frame. GC pauses show up as visible hitches.

### Simulation determinism

- Fixed 60Hz simulation tick; rendering is uncapped and decoupled.
- No rendering setting may reach `sim`. Entity activation lives in `sim` at fixed radii; visibility lives in `render`. Draw distance must never affect what gets ticked.
- No `Date.now()`, no `Math.random()`, no iteration over unordered collections in simulation code.

### Derived game logic

Battle formulas, RNG, stat curves and AI are **translated from the original**, not invented. When implementing one:

- Cite the source (decomp function name, or the reference implementation) in a comment.
- Add a golden test with known input/output pairs.
- If the original's behaviour is unknown, say so rather than approximating silently.

---

## Testing

### Fixtures must be synthetic

Test fixtures cannot contain ROM data. Build minimal valid structures in code — a synthetic NitroFS image with three files, a hand-constructed NSBMD chunk — and test parsers against those. This is more work than dumping a real file, and it's non-negotiable.

### Integration tests are local-only

Tests that need a real ROM are gated behind an env var and skipped by default:

```ts
const romPath = process.env.MINSTREL_TEST_ROM;
describe.skipIf(!romPath)('integration', () => { /* ... */ });
```

They are skipped unless the variable is set, and their fixtures are never
committed.

### Every parser package needs

- Round-trip tests where the format allows
- Malformed-input tests — truncated files, bad magic, out-of-range offsets. Parsers must throw clearly, never return garbage.
- A `FORMAT.md` documenting what's known and what isn't

---

## Scope

Current target is Slice 1 (see `docs/PLAN.md` §6). The out-of-scope list there is a contract, not a wishlist:

no character creation · no vocations · no alchemy · no grottoes · no multiplayer · no party recruitment.

Equipment drawn on the Hero and Ivor was brought into the slice on 15 September 2026, at the owner's word.

If a task drifts toward any of these, stop and flag it.

---

## Things Claude Code cannot do here

Some of this project is human work with GUI tools. Don't attempt or simulate it:

- Running the emulator (melonDS, BizHawk) and interactive debugging
- Ghidra analysis
- Anything requiring the ROM to be inspected by eye

When a task depends on findings from that work, ask for the findings rather than guessing them.
