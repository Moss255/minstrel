# Going somewhere without playing there

How to load any of the cartridge's places directly, at any point in the story,
with whatever party you like. This is how every sweep and screenshot in this
repository was taken.

## The short of it

```sh
APP=game node tools/shot/serve.mjs rom/your.nds        # serves apps/game/dist on :8765
```

```
http://localhost:8765/?rom=/rom.nds&keep=1&map=M13&stage=5.1
```

`?map=` is the whole trick: it opens a map archive directly and ignores the
story. `keep=1` puts the cartridge in the browser's own store so every load
after the first is instant.

Build the app first if you have not — `pnpm --filter @minstrel/game build`.

## The parameters

All of these are **ours**, for development. None is a thing the game has.

| | |
|---|---|
| `map=M13` | the map code — see "Finding a code" |
| `stage=5.1` | the story stage. **Set this.** See the warning below |
| `step=4` | the step within the stage |
| `flags=0,1` | story flags set |
| `door=F26` | arrive through the doorway that leads there, rather than at the default spot |
| `at=x,z` | stand at a world position, on the highest floor under it |
| `time=night` | force the hour |
| `party=0:0,11:3,21:10` | a party of created characters, `preset:vocation` each — see `docs/party-and-vocations.md` |
| `ivor=1` | open with Ivor along, as his call leaves him |
| `level=25` | put the Hero at a level, with the experience for it |
| `event=23198` | play a scene |
| `preset=7` | dress the Hero as a ready-made character |
| `save=1` | write a save where you stand. The church is otherwise the only way |
| `fight=z000a,z000a` | the monsters `p` fights |
| `bgm=BG_001`, `se=113` | play a track or an effect |

## Set the stage, or the place will be empty of words

**Which lines a character has depends on the chapter letter, and the letter
follows the story stage.** At the default — 2.1, where the slice sits — most
of the cartridge is silent: everybody answers "has nothing to say in chapter
B0". That is the system working, not a fault.

`stage=3.1` and later is where towns outside the slice talk. A town far from
its own chapter will also have `pickLine` saying it guessed, which
`tools/witness` shows in amber and does not count as trouble.

## Finding a code

```sh
node --experimental-strip-types tools/inventory/src/cli.ts rom/your.nds --regions
```

prints every map entry that names a region, with the code that loads it, the
label whoever built it wrote, and whether the index calls it indoors. Pipe it
wherever you like — **and do not commit it.** It is the cartridge's own text,
which rule 1 of `CLAUDE.md` keeps out of this repository; the tool exists so
the list can be made from your own dump whenever you want it instead.

The codes themselves are internal identifiers and carry no such weight, so a
few are worth knowing by heart:

| family | what it is |
|---|---|
| `M**` | towns and villages |
| `C**` | cities and castles |
| `F**` | the overworld, by region |
| `D**` | dungeons and caves |
| `S**` | story places — ships, passes, set pieces |
| `T**` | towers |
| `X**` | the story's own realms |
| `H**` | huts and small interiors |
| `B**` | grotto floors, assembled at runtime |
| `K**`, `F99` | the developers' own test maps |

A map's interiors are its code with a suffix: `M01M07` is a house in `M01`.
`?map=M01M07` opens it on its own, with no way out but a doorway.

## Two places that will not come up, and neither is a bug

- **`O00` and `O01` have no collision mesh**, so there is nowhere to stand the
  Hero and the map never appears. Whether they are meant to be walked at all
  is an open question — `docs/still-open.md`.
- **`M07` has a doorway to `M07M07`**, for which the cartridge holds no
  archive. Walking into it is refused and leaves you where you were.

Both were found by sweeping all 669 maps through the loader
(`apps/game/test/maps.test.ts`), which is also the fastest way to see whether
a place loads at all without opening a browser.

## Looking rather than driving

```sh
node tools/witness/witness.mjs M13 --stage=5.1
```

writes one page with the map, every doorway, every event its triggers reach,
and a conversation from each of several rooms — about three minutes for a
town. See `tools/witness/README.md`.
