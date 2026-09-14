/**
 * What a map's textures are named, and the one thing that can be read from it.
 *
 * This cartridge's map textures follow a naming convention: the map's own code,
 * then **three letters saying what the surface is**, then a number.
 * `m01m00wtr01` is water in map `M01M00`; `m01m00grs01` is grass beside it.
 *
 * The convention is not a guess. Across the 4,337 models under `/data/map`, the
 * three-letter tags come out as a vocabulary a level artist would recognise:
 *
 * | tag | count | | tag | count |
 * |---|---|---|---|---|
 * | `grd` ground | 3,694 | | `sdw` shadow | 868 |
 * | `wal` wall | 2,332 | | `dor` door | 739 |
 * | `clf` cliff | 2,124 | | **`wtr` water** | **726** |
 * | `grs` grass | 1,934 | | `hus` house | 694 |
 * | `tre` tree | 1,632 | | `sky` sky | 606 |
 * | `stn` stone | 1,451 | | `flw` flower | 452 |
 *
 * `hus` and `tre` also appear as **node** names in the same models, which is
 * how the village's houses and trees were found, so the vocabulary is shared
 * between the two and this is the same convention seen from another side.
 *
 * **What is read here is only the tag.** What each tag means to the game — which
 * are solid, which make a sound underfoot — is not established, and nothing
 * here claims it. Two are used: `wtr`, for not standing a character in the
 * sea, and `dok`, INFERRED to be poison marsh — see {@link isMarshTexture}.
 */

/** The three-letter tag in a map texture's name, if it has one. */
export function textureTag(name: string): string | undefined {
  return /([a-z]{3})\d\d$/.exec(name)?.[1]
}

/**
 * Whether a texture names water.
 *
 * 419 of the cartridge's 4,337 map models carry one. In the slice's village
 * they are two flat planes at a constant height across the middle of the map —
 * which is where a spawn that looks for the map's centre lands.
 */
export function isWaterTexture(name: string): boolean {
  return textureTag(name) === 'wtr'
}

/**
 * Whether a texture names poison marsh — INFERRED.
 *
 * Its tag is `dok`, and some tags are Japanese words — `iwa` rock, `zou`
 * statue, `kabe` wall — as *doku* is poison. Six textures carry it on the whole
 * cartridge: `d01dok01` and `d01dok02` on the Hexagon's own map, `D01`, where
 * the slice's poison marshes are — two flat layers of 13 and 31 triangles at
 * the ground's height, drawn as three purple patches beside the path up to
 * the hexagon — the same pair on `D14M04`, and
 * `F49`'s own two. See FORMAT.md, "Poison marsh".
 */
export function isMarshTexture(name: string): boolean {
  return textureTag(name) === 'dok'
}
