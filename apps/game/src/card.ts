/**
 * The title card that closes the slice — **ours, all of it**.
 *
 * The slice plan ends it so: Hexagoon beaten, Patty rescued, and a cut to a
 * title card before Stornway. The trigger records say when: Patty's thanks
 * after the fight, `ev02550`, go on outside to `ev02555` — "See ya, sweetie!
 * And thanks a bunch for your help!" — whose own record moves the story to
 * 2.5, step 1, the first stage past the slice. What the card says and how it
 * looks are ours; the game carries on here, it has no card.
 */

/** The first stage past the slice: reaching it closes the slice. */
export const SLICE_END = { major: 2, minor: 5 } as const

/** Whether moving the story to `stage` closes the slice. */
export function closesTheSlice(stage: { major: number; minor: number } | undefined): boolean {
  return stage?.major === SLICE_END.major && stage.minor === SLICE_END.minor
}

/** The card's words. */
export const CARD = {
  title: 'Angel Falls & the Hexagon',
  line: 'Patty is safe, and the road to Stornway lies open.',
  end: 'The end of the first slice',
  prompt: 'f to carry on',
} as const
