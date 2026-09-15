import { songNames, songOf } from '@minstrel/audio'
import { Music } from '@minstrel/audio/player'
import { scanCartridge } from '@minstrel/cartridge'
import { readSdat, type Sdat } from '@minstrel/nitro-snd'
import workletUrl from './music-worklet.ts?worker&url'

/**
 * The cartridge's music on the page: `bgm.sdat`, and the worklet that plays a
 * track out of it. Which track plays where is not read — `mapbgm.bin` was
 * looked at and is not it (`docs/M0-inventory.md`, "Audio") — so a track is
 * chosen by name: `?bgm=BG_001`, or the `b` key.
 */

/** Where the music archive is on the cartridge. */
export const BGM_ARCHIVE = '/data/sound/bgm.sdat'

export const music = new Music(workletUrl)

let archive: { rom: Uint8Array; sdat: Sdat } | undefined

/** The music archive, read once: its tables only, the 36 MB left in place. */
export function bgmArchive(rom: Uint8Array): Sdat | undefined {
  if (archive?.rom === rom) return archive.sdat
  for (const leaf of scanCartridge(rom, { pathFilter: BGM_ARCHIVE })) {
    if (!leaf.path.toLowerCase().endsWith('bgm.sdat')) continue
    try {
      const sdat = readSdat(leaf.bytes)
      archive = { rom, sdat }
      return sdat
    } catch {
      return undefined
    }
  }
  return undefined
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
