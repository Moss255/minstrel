import { effectOf, songAt, songNames, songOf } from '@minstrel/audio'
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

/** Play a jingle by its index among the music archive's sequences; the music waits for it. */
export async function playJingle(rom: Uint8Array, index: number): Promise<boolean> {
  const sdat = bgmArchive(rom)
  const song = sdat ? songAt(sdat, index) : undefined
  if (!song) return false
  await music.jingle(song)
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
