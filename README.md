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
| [`@vesper/nitro-comp`](packages/nitro-comp) | MIT | LZ10 decompression |
| `tools/inventory` | MIT | CLI that catalogues a cartridge |
| `tools/harness` | MIT | integration tests against a real cartridge, local-only |

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

```sh
pnpm inventory path/to/your.nds                 # header, hashes, what's inside
pnpm inventory path/to/your.nds --deep          # recurse into archives, decompress
pnpm inventory path/to/your.nds --tree
pnpm inventory path/to/your.nds --kind model --limit 20
pnpm inventory path/to/your.nds --json out/catalogue.json
pnpm inventory path/to/your.nds --extract /data/sound/bgm.sdat --out out
```

Everything it prints or writes is derived from your cartridge. `out/` is
gitignored; keep it that way.

To run the integration tests, point them at your own dump. They are skipped by
default and never run in CI.

```sh
VESPER_TEST_ROM=rom/your.nds pnpm test
```

## Layout

```
packages/
  nitrofs/        NitroFS, NARC, cartridge header      MIT, game-agnostic
  nitro-comp/     Nintendo compression                 MIT, game-agnostic
tools/
  inventory/      cartridge cataloguing CLI
  harness/        local-only integration tests
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
