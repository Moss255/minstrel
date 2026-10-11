#include "Grotto/Main/FloorMapGenerator.h"
#include <cstdio>

// The generator from the game, its rand, and one floor or a checksum over many.
static int toInt(const char* s) { int v = 0, neg = 0; if (*s == 45) { neg = 1; s++; } while (*s) v = v * 10 + (*s++ - 48); return neg ? -v : v; }
void* SafeAllocator::Allocate(unsigned int) { return 0; }
static unsigned int next_;
int rand() { next_ = next_ * 0x41c64e6du + 0x3039u; return (int)((next_ >> 16) & 0x7fff); }
void srand(int seed) { next_ = (unsigned int)seed; }
int g_floor;
static int dimension(int lo, int hi, int seed, int floor) { if (lo == hi) return lo; return lo + (seed + floor) % (hi - lo + 1); }
static int widthOf(int seed, int floor) {
  if (floor >= 0 && floor <= 4) return dimension(10, 14, seed, floor);
  if (floor >= 5 && floor <= 8) return dimension(12, 15, seed, floor);
  if (floor >= 9 && floor <= 12) return dimension(14, 16, seed, floor);
  return 16;
}
static unsigned char buffers[512];
static FloorMapGenerator gen;
int main(int argc, char** argv) {
  int mode = argc > 1 ? toInt(argv[1]) : 0;
  if (mode == 0) {
    int seed = toInt(argv[2]), floor = toInt(argv[3]);
    FloorMap map; map.Clear(); map.pMapData = buffers; map.pMapAdjacencyData = buffers + 256;
    int w = widthOf(seed, floor), h = widthOf(seed, floor);
    map.Initialize(w, h); gen.Initialize(); gen.pFloorMap = &map; gen.seed = seed; g_floor = floor;
    gen.Calculate(floor, 0); map.ComputeAdjacencyData();
    printf("w %d h %d up %d,%d down %d,%d chests %d", w, h, map.stairsUp.x, map.stairsUp.y, map.stairsDown.x, map.stairsDown.y, map.chestCount);
    for (int i = 0; i < map.chestCount; i++) printf(" %d,%d", map.chests[i].x, map.chests[i].y);
    printf("\n");
    for (int y = 0; y < 16; y++) { for (int x = 0; x < 16; x++) printf("%d", buffers[y * 16 + x]); printf("\n"); }
    for (int y = 0; y < 16; y++) { for (int x = 0; x < 16; x++) printf("%02x", buffers[256 + y * 16 + x]); printf("\n"); }
  } else {
    // A checksum over many seeds and floors: FNV-1a over both buffers and the stairs and chests.
    int seeds = toInt(argv[2]);
    unsigned int h = 2166136261u;
    for (int seed = 0; seed < seeds; seed++) for (int floor = 1; floor <= 16; floor++) {
      FloorMap map; map.Clear(); map.pMapData = buffers; map.pMapAdjacencyData = buffers + 256;
      int w = widthOf(seed * 131 % 65536, floor);
      int sd = seed * 131 % 65536;
      map.Initialize(w, w); gen.Initialize(); gen.pFloorMap = &map; gen.seed = sd; g_floor = floor;
      gen.Calculate(floor, 0); map.ComputeAdjacencyData();
      for (int i = 0; i < 512; i++) { h ^= buffers[i]; h *= 16777619u; }
      unsigned char extra[] = { (unsigned char)map.stairsUp.x, (unsigned char)map.stairsUp.y, (unsigned char)map.stairsDown.x, (unsigned char)map.stairsDown.y, (unsigned char)map.chestCount };
      for (unsigned char e : extra) { h ^= e; h *= 16777619u; }
      for (int i = 0; i < map.chestCount; i++) { h ^= (unsigned char)map.chests[i].x; h *= 16777619u; h ^= (unsigned char)map.chests[i].y; h *= 16777619u; }
    }
    printf("%u\n", h);
  }
}
