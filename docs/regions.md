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

**This table is also the specification for the debug menu** that
`docs/beyond-the-slice.md` defers — when that is built, this is the list it
collects. So keep it complete: a route added to `main.ts` and not added here
is one the menu will not know about.

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
| `vocation=0:1` | change party place 0 to vocation 1, as Alltrades would |
| `revoke=0` | revoke party place 0's current vocation — level 1, no experience, one more mark |
| `give=20005,22010:3` | put items in the bag, by id and count. `?bag=w,s:3` fills by item table instead |
| `patty=1` | open Patty's Party Planning Place. Her real way in is `<LUIDA>` on her own talk line at the Quester's Rest |
| `pot=1` | open the Krak Pot. Its real way in is `<RENKIN>` on the pot's own talk line in the Quester's Rest, which needs the story far enough along for it to be placed |
| `create=1` | **make the Hero before the map opens**, the seven creation screens in the game's own order, then enter. The game runs the same screens here — scene 21, from `main`'s game mode 3 — but reaches them through the Observatory prologue the slice cut, so the trigger is ours until that prologue is built |
| `make=1` | open the appearance *editor* — turns one knob on a character who already exists. The game has no equivalent; creation itself is a scene, reached by `?create=1` above or, for a recruit, through Patty |
| `look=0:sex=1,hair=7,build=2` | set a member's appearance knob by knob — see `docs/party-and-vocations.md` §3a. Several members with `;` between |
| `save=1` | write a save where you stand. The church is otherwise the only way |
| `fight=z000a,z000a` | the monsters `p` fights |
| `bgm=BG_001`, `se=113` | play a track or an effect |
| `probe=1` | put the scene camera, the real camera and the Hero's height over the floor on `window` as `__shot`, `__cam` and `__floor`. Off by default because it allocates every frame |
| `talk=12` | stand behind that cast member and talk to them |
| `wear=21002,20004` | those items into the bag and onto the Hero, to see them worn |
| `bag=w,s:3` | one of every item in those tables into the bag — `w` weapons, `s` shields and so on |
| `new=1` | start a new game past a kept save |
| `keep=1` | keep the cartridge in the browser's own store, so every load after the first is instant |
| `rom=/rom.nds` | fetch a cartridge from a URL instead of using the file picker |
| `lighting=night` | build the map's night lighting whatever the hour |
| `tempo=0.9` | multiply the music's tempo — a knob for judging by ear |
| `collision=1` | draw the collision mesh over the map; `c` toggles it |
| `fit=scale,x,y,z` | move and scale the collision, walked as well as drawn, to fit it over the room |
| `room=`, `world=`, `person=` | the three scales, each also movable by keys — see `n`/`m`, `g`/`h`, `j`/`i` |
| `pad=1` | show what a gamepad reports |
| `axes=0,1,2,3` | move the sticks to other axes |
| `lookbuttons=6,7` | read the look stick from two analog buttons |

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

`--recipes` is the same arrangement for the [alchemy
recipes](https://github.com/DQIX/wiki/wiki/Alchemy-Recipes): all 470 with
their ingredients named, tab-separated, printed and never written here.

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
