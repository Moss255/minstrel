# vesper

Two things sharing a set of Nintendo DS parsers:

- **`apps/game`** — a browser reimplementation of a DS JRPG in TypeScript, reading assets from the user's own cartridge dump at runtime. Not an emulator and not a recompilation: the engine is original code, only data comes from the cartridge.
- **`apps/explorer`** — a general-purpose, fully client-side browser explorer for *any* DS cartridge.

Neither app exists yet. What does exist is the parser layer underneath them.

## Status

Early. Working through M0 of `docs/PLAN.md` — see [`docs/M0-inventory.md`](docs/M0-inventory.md) for where that stands.

| package | licence | what it does |
|---|---|---|
| [`@vesper/nitrofs`](packages/nitrofs) | MIT | cartridge header, FAT/FNT, overlay tables, NARC archives |
| [`@vesper/nitro-comp`](packages/nitro-comp) | MIT | LZ77 and Huffman decompression |
| [`@vesper/l5-gpc`](packages/l5-gpc) | MIT | GPC2, a Level-5 archive container |
| [`@vesper/nitro-gfx`](packages/nitro-gfx) | MIT | NSBMD models and the geometry display list |
| [`@vesper/nitro-snd`](packages/nitro-snd) | MIT | SDAT sound archives |
| [`@vesper/game-formats`](packages/game-formats) | MIT | title-specific formats: the bitmap font |
| `tools/inventory` | MIT | CLIs that catalogue and extract a cartridge |
| `tools/harness` | MIT | integration tests against a real cartridge, local-only |
| `tools/shot` | MIT | headless screenshot of a model, for verifying by eye |
| `apps/viewer` | GPL-3.0+ | browser model viewer |

The `nitro-*` packages are game-agnostic and browser-safe: no Node built-ins, no
DOM, no WebGL, and no reference to any particular title. They take
`Uint8Array` and return structured data, using views rather than copies so a
128 MiB cartridge costs one allocation.

Each has a `FORMAT.md` recording what is confirmed, by what evidence, and what
is deliberately left as opaque bytes.

## Requirements

Node 22+ and pnpm. No build step — the bundler and Node both consume the
TypeScript sources directly.

```sh
pnpm install
pnpm test         # unit tests, synthetic fixtures only
pnpm typecheck
pnpm lint
```

## Using it

You supply your own cartridge dump. This repository contains none, and never
will — no cartridge files, no extracted assets, no data tables, no test fixtures
built from real bytes. Every test fixture is constructed in code.

Catalogue what a cartridge holds:

```sh
pnpm inventory path/to/your.nds                 # header, hashes, what's inside
pnpm inventory path/to/your.nds --deep          # recurse into archives, decompress
pnpm inventory path/to/your.nds --tree
pnpm inventory path/to/your.nds --kind model --limit 20
pnpm inventory path/to/your.nds --json out/catalogue.json
```

Or unpack the whole thing to disk:

```sh
pnpm extract path/to/your.nds --dry-run         # report, write nothing
pnpm extract path/to/your.nds --out out
pnpm extract path/to/your.nds --out out --filter /data/map/
```

`extract` mirrors the cartridge filesystem into `out/files/`, replacing every
archive — NARC or GPC2 — with a directory of its members, recursively, and
decompressing as it goes, so a model that was an LZ10 stream inside a NARC
inside the cartridge ends up as a plain `.nsbmd` on disk. A member whose codec
is not identified is written with a `.gpc-codecN` suffix so its bytes are kept
without being passed off as decoded content. `out/system/` gets the ARM binaries and
overlays, and `out/manifest.json` records where each output file came from,
including the original name bytes of any name that had to be escaped.

Everything these print or write is derived from your cartridge. `out/` is
gitignored; keep it that way.

To run the integration tests, point them at your own dump. They are skipped by
default and never run in CI.

```sh
VESPER_TEST_ROM=rom/your.nds pnpm test
```

## Looking at models

```sh
pnpm dev        # then open the viewer and drop in your own dump
```

Drag to orbit, wheel to zoom, `W` for wireframe. The cartridge is read in your
browser and nothing is uploaded.

Models that use a single matrix render correctly today. Skinned models — 766 of
the reference cartridge's 6,889 — decode correctly but are positioned wrongly,
because the bone transforms in a model's render commands are not applied yet.
Textures are not read yet either. See
[`packages/nitro-gfx/FORMAT.md`](packages/nitro-gfx/FORMAT.md).

## Layout

```
packages/
  nitrofs/        NitroFS, NARC, cartridge header      MIT, game-agnostic
  nitro-comp/     Nintendo compression                 MIT, game-agnostic
  l5-gpc/         GPC2, a Level-5 container            MIT, game-agnostic
  nitro-gfx/      NSBMD models, display lists          MIT, game-agnostic
  nitro-snd/      SDAT sound archives                  MIT, game-agnostic
  game-formats/   title-specific formats               MIT
tools/
  inventory/      cartridge cataloguing CLI
  harness/        local-only integration tests
  shot/           headless render verification
apps/
  viewer/         browser model viewer
docs/
```

Parser packages depend on each other and on nothing else in the repository.

## Conventions

See [`CLAUDE.md`](CLAUDE.md). The two that matter most:

1. **Never commit cartridge-derived content.** Not assets, not tables, not
   golden files of raw bytes.
2. **Never invent format details.** Parse only fields confirmed by observed
   bytes or published documentation; record the evidence in `FORMAT.md`; carry
   unknown regions through as named opaque bytes rather than skipping them.
