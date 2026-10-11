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
g++ -std=c++17 -O1 -I"$out/include" -o "$out/grotto-oracle" "$here/main.cpp" "$out/src/FloorMapGenerator.cpp" "$out/src/FloorMap.cpp"
echo "built $out/grotto-oracle"
