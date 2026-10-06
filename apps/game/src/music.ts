import { effectOf, type JingleTiming, songAt, songNames, songOf } from '@minstrel/audio'
import { Music } from '@minstrel/audio/player'
import { scanCartridge } from '@minstrel/cartridge'
import { readSdat, type Sdat } from '@minstrel/nitro-snd'
import workletUrl from './music-worklet.ts?worker&url'

/**
 * The cartridge's sound on the page: `bgm.sdat` for the music and the
 * jingles, `se_norm.sdat` for the field's effects, and the worklet that plays
 * them. Which track plays where is the map index's: each map names a
 * sequence by index (`MapEntry.music`, INFERRED in `game-formats`), and the
 * battle and boss stages name theirs. `?bgm=BG_001` plays a track by name
 * instead, for listening; `b` stops and starts the music. The events'
 * effects and jingles are read: `726` and `720` in `event.ts`. The menus'
 * sounds are not, so `?se=n` sounds effect archive `n` on load, for finding
 * them by ear.
 */

/** Where the music archive is on the cartridge. */
export const BGM_ARCHIVE = '/data/sound/bgm.sdat'
/** Where the field's effect archive is. */
export const EFFECTS_ARCHIVE = '/data/sound/se_norm.sdat'
/**
 * Where the battle's are: `se_btl.sdat`, which a battle mounts as 101 for
 * the field's 100 (`func_0205ea20`, overlay 0 `0x02164028`).
 */
export const BATTLE_ARCHIVE = '/data/sound/se_btl.sdat'
/** The battle's own sequence archive in it — the one the presenter's sounds are from (`+0xb4`). */
export const BATTLE_SOUNDS = 101
/**
 * The field's sequence archive in `se_norm.sdat`, which boot mounts as 100
 * (`func_0205ea20`, `main_18` at `0x0205ea20`): what a line's `<SE_n>` asks
 * entry 14 of, through `func_0205eaa0` → `func_0203ac40(se, [se+0xb4], n)`.
 */
export const FIELD_EFFECTS = 100

/**
 * A line's `<ME_n>` timing — `func_0209c840`, see `JingleTiming`: the music
 * fades out over 20 frames, the jingle starts 800 ms after the asking, and
 * the music comes back 500 ms after it ends, over 30 frames.
 */
export const TEXT_JINGLE: JingleTiming = { fade: 20 / 60, delay: 0.8, after: 0.5, back: 30 / 60 }

export const music = new Music(workletUrl)

const archives = new Map<string, { rom: Uint8Array; sdat: Sdat }>()

/** A sound archive, read once: its tables only, the file left in place. */
function archiveAt(rom: Uint8Array, path: string): Sdat | undefined {
  const known = archives.get(path)
  if (known?.rom === rom) return known.sdat
  const leafName = path.slice(path.lastIndexOf('/') + 1)
  for (const leaf of scanCartridge(rom, { pathFilter: path })) {
    if (!leaf.path.toLowerCase().endsWith(leafName)) continue
    try {
      const sdat = readSdat(leaf.bytes)
      archives.set(path, { rom, sdat })
      return sdat
    } catch {
      return undefined
    }
  }
  return undefined
}

/** The music archive — 36 MB, its tables only read. */
export function bgmArchive(rom: Uint8Array): Sdat | undefined {
  return archiveAt(rom, BGM_ARCHIVE)
}

/** Sound one of the field's effects by its archive index, the first variant of it. */
export async function playEffect(rom: Uint8Array, index: number, slot?: number): Promise<boolean> {
  const sdat = archiveAt(rom, EFFECTS_ARCHIVE)
  const song = sdat ? effectOf(sdat, index, slot) : undefined
  if (!song) return false
  await music.effect(song)
  return true
}

/**
 * **Sound a battle sound**: sequence `index` of sequence archive `archive` in
 * `se_btl.sdat` (`func_0203ac40` → `func_020be7a8`, INFERRED
 * `NNS_SndArcPlayerStartSeqArc`). The battle's own sounds are archive 101; an
 * action's, the archive its `69` names. Each read once.
 */
export async function playBattleSound(
  rom: Uint8Array,
  archive: number,
  index: number,
): Promise<boolean> {
  const key = `${archive}:${index}`
  let song = battleSongs.get(key)
  if (!battleSongs.has(key)) {
    const sdat = archiveAt(rom, BATTLE_ARCHIVE)
    song = sdat ? effectOf(sdat, archive, index) : undefined
    battleSongs.set(key, song)
  }
  if (!song) return false
  await music.effect(song)
  return true
}
const battleSongs = new Map<string, ReturnType<typeof effectOf>>()

/** Play a track by its index among the music archive's sequences — a map's; its name, or undefined when there is none. */
export async function playTrack(rom: Uint8Array, index: number): Promise<string | undefined> {
  const sdat = bgmArchive(rom)
  const record = sdat?.sequences[index]
  const song = sdat ? songAt(sdat, index) : undefined
  if (!song || !record) return undefined
  const name = record.name ?? `#${index}`
  await music.play(name, song)
  return name
}

/**
 * Play a jingle by its index among the music archive's sequences; the music
 * waits for it. **The index is the game's own request id**: `bgm.sdat`'s
 * sequence 50 is `ME_001`, so `<ME_n>`'s `n + 49` names `ME_00n` (read 4
 * October 2026, `func_020bd454`, the INFO list indexed directly).
 */
export async function playJingle(
  rom: Uint8Array,
  index: number,
  timing?: JingleTiming,
): Promise<boolean> {
  const sdat = bgmArchive(rom)
  const song = sdat ? songAt(sdat, index) : undefined
  if (!song) return false
  await music.jingle(song, timing)
  return true
}

/** The tracks there are to play, by name. */
export function bgmNames(rom: Uint8Array): string[] {
  const sdat = bgmArchive(rom)
  return sdat ? songNames(sdat) : []
}

/** Play a track by name; false when the archive or the track is not there. */
export async function playBgm(rom: Uint8Array, name: string): Promise<boolean> {
  const sdat = bgmArchive(rom)
  const song = sdat ? songOf(sdat, name) : undefined
  if (!song) return false
  await music.play(name, song)
  return true
}
