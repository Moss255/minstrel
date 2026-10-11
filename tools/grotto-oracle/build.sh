#!/bin/sh
# Build the grotto floor oracle: the decomp's own FloorMapGenerator.cpp and
# FloorMap.cpp, compiled for this machine. Nothing of the decomp is kept here;
# the two files are copied from it at build time and changed in two places,
# each as the binary has it (see README.md).
#
#   tools/grotto-oracle/build.sh [path to dqix-decomp]
#   build/grotto-oracle 0 12345 1     # one floor: seed, floor
#   build/grotto-oracle 1 2000        # the checksum the tests hold
set -eu
here=$(cd "$(dirname "$0")" && pwd)
decomp=${1:-$HOME/Projects/dqix-decomp}
out=$here/build
rm -rf "$out" && mkdir -p "$out/include/Grotto/Main" "$out/src"
cp "$decomp/include/Grotto/Main/FloorMapGenerator.h" "$decomp/include/Grotto/Main/FloorMap.h" "$out/include/Grotto/Main/"
cp "$decomp/src/Grotto/Main/FloorMapGenerator.cpp" "$decomp/src/Grotto/Main/FloorMap.cpp" "$out/src/"
cp -r "$here/stub/." "$out/include/"
python3 - "$out/src/FloorMapGenerator.cpp" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
# RoutineK's four unset locals: the caller's r4..r7 (Calculate, 0x020905e4-0x02090604).
s = s.replace("    int u4, u5, u6, u7;", "    int u4 = g_floor, u5 = 0x0213d000, u6 = 1, u7 = 0;")
s = s.replace("#include <globaldefs.h>", "#include <globaldefs.h>\nextern int g_floor;", 1)
# RandRange's remainder by zero is 0, as _s32_div_f (0x0200cf44) answers it.
s = s.replace("    return minimum + (rand() % (maximum - minimum + 1));",
              "    int r = rand();\n    int d = maximum - minimum + 1;\n    return minimum + (d == 0 ? 0 : r % d);")
open(p, "w").write(s)
PY
cp "$decomp/include/Grotto/Main/DetailedTreasureMapData.h" "$decomp/include/Grotto/Main/TreasureMapMetadata.h" "$out/include/Grotto/Main/"
# The regular map's details: Populate and its US helpers, cut out by their own
# lines, and RandATRangeModular — nothing else of the file.
python3 - "$decomp/src/Grotto/Main/DetailedTreasureMapData.cpp" "$decomp/src/Grotto/Main/TreasureMapDataStructs.cpp" "$out/src/details.cpp" <<'PY'
import sys
src = open(sys.argv[1]).read().split("\n")
def block(start):
    i = next(n for n, line in enumerate(src) if line.startswith(start))
    j = i
    while src[j] != "}":
        j += 1
    return "\n".join(src[i:j + 1])
first = next(n for n, line in enumerate(src) if line.startswith("void DetailedTreasureMapData::RegularMapData::GenerateUnknownData"))
last = next(n for n in range(first, len(src)) if src[n].startswith("#elif defined(jpn)"))
usa = "\n".join(line for line in src[first:last] if not line.startswith("extern"))
# The cut ends inside the file's own `#if defined(usa)`; close it.
if usa.count("#if") > usa.count("#endif"):
    usa += "\n#endif"
structs = open(sys.argv[2]).read().split("\n")
k = next(n for n, line in enumerate(structs) if line.startswith("unsigned int RandATRangeModular"))
modular = "\n".join(structs[k:k + 4])
out = '#include "details-prelude.h"\n' + block("void DetailedTreasureMapData::RegularMapData::Populate") + "\n" + usa + "\n" + modular + "\n"
open(sys.argv[3], "w").write(out)
PY
g++ -std=c++17 -O1 -Dusa -I"$out/include" -o "$out/grotto-oracle" "$here/main.cpp" "$out/src/FloorMapGenerator.cpp" "$out/src/FloorMap.cpp" "$out/src/details.cpp"
echo "built $out/grotto-oracle"
