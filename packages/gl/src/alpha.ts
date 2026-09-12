/**
 * Which textures are drawn see-through rather than solid.
 *
 * A texture can carry more than on-or-off alpha — the DS's A3I5 and A5I3
 * formats keep three or five bits of it — and a map's soft shadows, water,
 * lit windows and shafts of light are drawn with it. A cut-out, a fence or a
 * leaf, is only ever clear or solid. Drawn solid, every shadow in the village
 * was a dark patch on the ground.
 *
 * **The threshold is read off the village, not picked.** Over its 181 map
 * textures the share of partly transparent pixels splits cleanly: 141 have
 * none at all, one has 2.3% — a cliff's antialiased edge — and the other 39
 * have 10% or more, every shadow, water, window, light, sky, fire and smoke
 * texture among them. Anything from 1% to 10% would divide them the same way.
 */
export const TRANSLUCENT_SHARE = 0.05

/** Alpha values, of 255, that count as neither clear nor solid: 5% to 95%. */
const CLEAR = 13
const SOLID = 243

/** The share of a texture's pixels, straight RGBA, that are partly transparent. */
export function translucentShare(pixels: Uint8Array): number {
  const count = Math.floor(pixels.length / 4)
  if (count === 0) return 0
  let partial = 0
  for (let i = 3; i < pixels.length; i += 4) {
    const alpha = pixels[i] as number
    if (alpha >= CLEAR && alpha < SOLID) partial++
  }
  return partial / count
}

/** Whether a texture is drawn see-through — see {@link TRANSLUCENT_SHARE}. */
export function isTranslucent(pixels: Uint8Array): boolean {
  return translucentShare(pixels) >= TRANSLUCENT_SHARE
}
