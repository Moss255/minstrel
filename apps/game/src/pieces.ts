/**
 * **A map's pieces hidden and shown by the story** — trigger actions `149` and
 * `150` (`func_02061c04` cases 49 and 50, `0x02062d80`, `0x02062dfc`), read 11
 * October 2026. The piece of the map's group named by the action's argument
 * whose own id is the parameter's high half (`func_02019508`) has bit `0x4`
 * of its flags **set by `149`, cleared by `150`** (`func_02013380`), and a
 * piece with it set is neither drawn nor stood on (`func_02016874` passes it
 * over). The landslide on the road to Stornway, S01's piece 5, is one: shown
 * to 2.6, hidden from 2.7.
 *
 * Only a map's own group, 0, is kept here. A record naming a piece of a map
 * not loaded keeps it in the thread's bank for when it is (`func_0206ea8c`),
 * which is not built — the maps' own settings records set their pieces as
 * they are entered, which is where the cartridge does it.
 */
export const OP_PIECE_OFF = 149
export const OP_PIECE_ON = 150

/** A record's `149`/`150` on a map's hidden pieces, by their ids; whether any changed. */
export function hidePieces(
  off: Set<number>,
  actions:
    | readonly { readonly op: number; readonly arg: number; readonly params?: readonly number[] }[]
    | undefined,
): boolean {
  let changed = false
  for (const action of actions ?? []) {
    if ((action.op !== OP_PIECE_OFF && action.op !== OP_PIECE_ON) || action.arg !== 0) continue
    const id = ((action.params?.[0] ?? 0) >>> 16) & 0xffff
    const was = off.has(id)
    if (action.op === OP_PIECE_OFF) off.add(id)
    else off.delete(id)
    if (was !== off.has(id)) changed = true
  }
  return changed
}
