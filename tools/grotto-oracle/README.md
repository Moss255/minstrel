# grotto-oracle

The game's own grotto floor generator, compiled for this machine, so that
`packages/sim/src/grotto/floor.ts` can be held to it. It is the decomp's
`FloorMapGenerator.cpp` and `FloorMap.cpp` (`~/Projects/dqix-decomp`, marked
complete: the C++ the US ARM9 was built from), copied in at build time — none of
it is kept here — with stub headers for what they include, and the game's `rand`
(`0x02003d14`).

Two things the C++ leaves to the machine are set as the binary has them:

- `RandRange(a, a - 1)` divides by zero, and the DS runtime's `_s32_div_f`
  (`0x0200cf44`) answers a remainder of 0;
- `RoutineK` reads four locals it never sets, which are the caller's r4 to r7 at
  the call (`Calculate`, `0x020905e4`–`0x02090604`): the floor, the generator,
  1 and 0.

```sh
tools/grotto-oracle/build.sh            # needs g++ and python3
tools/grotto-oracle/build/grotto-oracle 0 12345 1   # seed 12345, floor 1
tools/grotto-oracle/build/grotto-oracle 1 2000      # the tests' checksum
```

and the regular treasure map's details: `RegularMapData::Populate` and its US
helpers, cut out of `DetailedTreasureMapData.cpp` by their own lines, with
`RandATRangeModular`, reading a `tdata_<LG>.pac` named on the command line
(taken from your own cartridge; English word order, and the level's words, the
game's string 1011, stood in by `Lv. `):

```sh
tools/grotto-oracle/build/grotto-oracle 2 tdata_en.pac 1 50   # seed 1, quality 50
tools/grotto-oracle/build/grotto-oracle 3 tdata_en.pac 97     # checksum, seeds in steps of 97
```

Mode 1 hashes the floors of the seeds 131·n mod 65,536 for n below its argument,
floors 1 to 16; 65,536 gives every seed, and the port agreed on all of them on
11 October 2026.
