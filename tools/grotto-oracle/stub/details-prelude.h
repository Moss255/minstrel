#pragma once
// What DetailedTreasureMapData.cpp's regular-map functions reach for, and no more.
#include <cstring>
#include <cstdio>
#include "Grotto/Main/DetailedTreasureMapData.h"
int rand();
void srand(int seed);
struct TreasureMapLanguageDataOffsets {
    unsigned int bossRangesByQuality, bossIDsAndWeights, environs, prefixRangesByMonsterRank,
        prefixNames, floorRangesByQuality, unknown_18, startingMonsterRanksByQuality, mapLocations,
        seeminglyChestRanksByMonsterRank, localeRankRangesByFloorCount, localeNames,
        suffixRangesByBoss, suffixNames, grottoBossDrops, legacyBossDrops, legacyBossData;
};
struct GameResources { TreasureMapLanguageDataOffsets* pTMapLanguageOffsets; };
GameResources* func_ov017_0218b5b0();
class GameState { public: static GameState* GetInstance(); unsigned char* GetTreasureMapLanguageData(); };
inline void VectorizedMemset(void* dst, int value, unsigned int length) { memset(dst, value, length); }
inline void VectorizedInvertedMemcpy(const void* src, void* dst, unsigned int length) { memcpy(dst, src, length); }
inline void func_020a1df8(unsigned int) {}
inline void func_020a1e54(unsigned int) {}
inline int func_0200fb08(GameState*) { return 1; }            // English
inline const char* func_020e51cc(int) { return "Lv. "; }    // the game's string 1011, not read
unsigned int RandATRangeModular(unsigned int minimum, unsigned int maximum);
#define BINARY_READ_AND_ADVANCE(buffer, offset, dst, len) \
    (VectorizedInvertedMemcpy((buffer) + (offset), (dst), (len)), offset += (len))
#define TMAPLANGDATA_READ(offset, into, len) \
    BINARY_READ_AND_ADVANCE(GameState::GetInstance()->GetTreasureMapLanguageData(), offset, into, len)
static const unsigned char data_020e9074[] = { 4, 13, 11 };
static const unsigned char data_020e9077[] = { 4, 13, 11 };
static char data_020f1ad0[] = "%s%d";
static char data_020f1ad5[] = "%s %s";
static char data_020f1adb[] = "%s%d";
