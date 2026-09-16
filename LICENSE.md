# Licence

minstrel is two things under two licences, package by package. Each
workspace package carries its own `LICENSE` file and names its licence in its
`package.json`; the texts are in [`LICENSES/`](LICENSES/).

## MIT — the parsers and tools

The packages that take bytes and return structured data, and the command-line
tools around them, are under the [MIT License](LICENSES/MIT.txt), so that
anyone writing a DS tool can use them without their own project's licence
being decided for them:

`@minstrel/nitrofs` · `@minstrel/nitro-comp` · `@minstrel/nitro-gfx` ·
`@minstrel/nitro-snd` · `@minstrel/l5-gpc` · `@minstrel/cartridge` ·
`@minstrel/game-formats` · `tools/inventory` · `tools/harness` · `tools/shot`
· `tools/sprite`

## GPL-3.0-or-later — the engine and the apps

The engine — simulation, rendering, audio, the script machine — and both
apps are under the
[GNU General Public License, version 3 or later](LICENSES/GPL-3.0-or-later.txt):

`@minstrel/fixed` · `@minstrel/sim` · `@minstrel/render` · `@minstrel/world`
· `@minstrel/actor` · `@minstrel/gl` · `@minstrel/audio` · `@minstrel/script`
· `apps/game` · `apps/explorer`

## What is not licensed here

Nothing from the game is in this repository, and nothing in it grants any
right to the game. The engine is original code; the data it draws, plays and
runs comes from the user's own cartridge dump at runtime and never leaves
their machine. See `CLAUDE.md`, hard rule 1, and [`CONTRIBUTING.md`](CONTRIBUTING.md).

The reference material cited in the packages' `FORMAT.md` files — GBATEK,
Gota7's *Nitro Studio 2* specifications, fincs's FeOS Sound System, melonDS —
is cited, not copied, and each is under its own licence.

## Copyright

Copyright (c) 2026 the minstrel authors. The authors are the people in the
repository's commit history (`git log --format='%an'`).

By contributing you agree that your contribution is licensed under the licence
of the package it lands in — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
