# vesper

Two things sharing a set of Nintendo DS parsers:

- **`apps/game`** — a browser reimplementation of a DS JRPG in TypeScript, reading assets from the user's own cartridge dump at runtime. Not an emulator and not a recompilation: the engine is original code, only data comes from the cartridge.
- **`apps/explorer`** — a general-purpose, fully client-side browser explorer for *any* DS cartridge.

Neither app exists yet. What does exist is the parser layer underneath them.

## Status

Early. M0 (extraction and inventory) is complete; M1 (renderer and model viewer)
is most of the way there.

- [`docs/findings.md`](docs/findings.md) — what has been established about the
  cartridge's formats, by what evidence, and what is still unknown.
- [`docs/M0-inventory.md`](docs/M0-inventory.md) and
  [`docs/M1-renderer.md`](docs/M1-renderer.md) — milestone status.

| package | licence | what it does |
|---|---|---|
| [`@vesper/nitrofs`](packages/nitrofs) | MIT | cartridge header, FAT/FNT, overlay tables, NARC archives |
| [`@vesper/nitro-comp`](packages/nitro-comp) | MIT | LZ77, Huffman, run-length and BLZ decompression |
| [`@vesper/l5-gpc`](packages/l5-gpc) | MIT | GPC2, a Level-5 archive container |
| [`@vesper/nitro-gfx`](packages/nitro-gfx) | MIT | NSBMD models, NSBTX textures, NSBCA animation, the display list |
| [`@vesper/nitro-snd`](packages/nitro-snd) | MIT | SDAT sound archives |
| [`@vesper/game-formats`](packages/game-formats) | MIT | title-specific formats: the bitmap font, the tagged record tables, the collision mesh, the map manifest, the map index |
| [`@vesper/fixed`](packages/fixed) | GPL-3.0+ | fixed-point arithmetic; no float reaches gameplay |
| [`@vesper/sim`](packages/sim) | GPL-3.0+ | headless simulation: the world, collision, the character controller |
| [`@vesper/render`](packages/render) | GPL-3.0+ | the camera, and how the DS's framing extends to other screens |
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

The list offers each map as one entry as well as its individual models: a map
archive holds a dozen loose files and a `.bmdj` beside them saying which of them
the map is made of, so picking the map draws the whole scene.

Drag to orbit, wheel to zoom, `W` for wireframe, `R` for reference mode. On a
map, `G` puts a character on the collision mesh and WASD walks it; `[` and `]`
resize it, and the overlay reports its height as a fraction of the map's own
houses — how large a person is against a building is the one part of the scale
that is not in the data. The figure is
a stand-in: a character on this cartridge is assembled from parts sharing one
rig, and which parts make the Hero is not yet known. The
cartridge is read in your browser and nothing is uploaded.

The camera never shows *less* of the world than the hardware did: on a wide
screen the vertical framing is held and the view widens; on a tall one the
horizontal framing is held and it heightens.

It also frames like the game does: pulled back and raised, the character small
and low, and — walking under a roof — tucked in, tilted further down, and with
whatever stands between it and the character no longer drawn. That last part is
geometric rather than a guess about which piece is a roof, and the property it
has to satisfy is that it never removes the ground you are standing on, checked
over 485 maps from eight angles each.

**Reference mode** renders at the DS's own 256×192 and 5-bit colour, then scales
that up by a whole number so each hardware pixel stays a visible block. It is
the validation tool: a 1080p render with 8-bit colour hides exactly the
differences that are worth catching. It matches the hardware's resolution and
colour depth, not its rasterisation rules — toon shading and edge marking are
not implemented.

A map is assembled from its manifest and its pieces are **placed**: a doorway is
modelled at its own origin and moved to the building it belongs to, and its
collision follows the model it is attached to. Unplaced, all ten of a village's
doorways stack in mid-air at the map's centre with their collision boxes on top
of each other.

Models are posed, textured and animated. Bones and render commands are read;
each vertex is placed by the matrix its display list bound it to, taken from the
stack as it stood when that shape was drawn and scaled by the model's position
scale; blended vertices are composed with the named node's inverse bind
transform; and each shape is drawn with the texture its material actually binds,
read from the file rather than guessed from the material's name. Pick an animation from the archive beside the model, scrub the frame,
or let it run. See
[`packages/nitro-gfx/FORMAT.md`](packages/nitro-gfx/FORMAT.md) for the format
and [`docs/findings.md`](docs/findings.md) for the evidence.

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
