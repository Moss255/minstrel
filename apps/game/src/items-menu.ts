import { ITEM_KIND_EVERYDAY, ITEM_KIND_IMPORTANT } from '@minstrel/game-formats'
import type { Bag } from './bag.ts'
import { CARRIED_MOST, type Owner } from './inventory.ts'

/**
 * **The field menu's Items**, as overlay 2 lays it out (read 2 October 2026,
 * USA; FORMAT.md, "Who carries an item"): Everyday Items or Important Items
 * (`str_tm` 1002, 1003; `func_ov002_0215c52c`); for everyday items, whose —
 * each member, then the Bag (1101; `func_ov002_0215c72c`); their items; and on
 * one, Use, Transfer, Discard or Cancel (1201–1204, `func_ov002_0215cd98`).
 * Transfer asks to whom — the members and the Bag (1300, 1301) — then, for a
 * member, to which of their rows (1400): an empty one takes it, an occupied one
 * changes places (`func_ov002_02164748`).
 *
 * **Ours**: Organise Items (1102) and Treasure Maps (1004) are not offered;
 * an important item's own commands are not read, so it is listed only.
 */
export type ItemsWhere =
  | { readonly at: 'kinds' }
  | { readonly at: 'whose' }
  | { readonly at: 'list'; readonly owner: Owner | 'important' }
  | { readonly at: 'act'; readonly held: Held }
  | { readonly at: 'toWho'; readonly held: Held }
  | { readonly at: 'toWhere'; readonly held: Held; readonly to: number }

/** An item where it is: whose, which row, and what. */
export interface Held {
  readonly owner: Owner
  readonly slot: number
  readonly item: number
}

/** What the panel reads: the party's carried items and names, the bag, each item's kind. */
export interface ItemsView {
  readonly members: readonly { readonly name: string; readonly carried: readonly number[] }[]
  readonly bag: Bag
  readonly kindOf: (id: number) => number | undefined
}

/** `str_tm`'s words for the panel. */
export const ITEMS_WORDS = {
  everyday: 1002,
  important: 1003,
  bag: 1101,
  whatToDo: 1200,
  use: 1201,
  transfer: 1202,
  discard: 1203,
  cancel: 1204,
  toWho: 1300,
  toWhere: 1400,
  /** "…doesn't have any items." */
  carriesNone: 9050,
  /** "The bag is currently empty." */
  bagEmpty: 9065,
  /** "No important items held." */
  noImportant: 9109,
} as const

/** Our words for the panel's, where the game's are not to hand. */
export const ITEMS_LABELS: Readonly<Record<number, string>> = {
  [ITEMS_WORDS.everyday]: 'Everyday Items',
  [ITEMS_WORDS.important]: 'Important Items',
  [ITEMS_WORDS.bag]: 'Bag',
  [ITEMS_WORDS.use]: 'Use',
  [ITEMS_WORDS.transfer]: 'Transfer',
  [ITEMS_WORDS.discard]: 'Discard',
  [ITEMS_WORDS.cancel]: 'Cancel',
}

/** The actions on an item, in the game's order. */
export const ITEM_ACTS = ['use', 'transfer', 'discard', 'cancel'] as const

/** The bag's items a page shows: everyday ones (or with no record), or the important. */
export function bagPage(view: ItemsView, important: boolean): number[] {
  return [...view.bag.items.keys()].filter((id) => {
    const kind = view.kindOf(id)
    return important
      ? kind === ITEM_KIND_IMPORTANT
      : kind === ITEM_KIND_EVERYDAY || kind === undefined
  })
}

/** A row of the panel: its words — a `str_tm` number, a name, or an item and a count — or an empty slot. */
export type ItemsRow =
  | { readonly word: number }
  | { readonly name: string }
  | { readonly item: number; readonly count?: number }
  | { readonly empty: true }

/** The rows the panel shows where it is. */
export function itemsRows(where: ItemsWhere, view: ItemsView): ItemsRow[] {
  switch (where.at) {
    case 'kinds':
      return [{ word: ITEMS_WORDS.everyday }, { word: ITEMS_WORDS.important }]
    case 'whose':
    case 'toWho':
      return [...view.members.map((m) => ({ name: m.name })), { word: ITEMS_WORDS.bag }]
    case 'list': {
      if (where.owner === 'bag' || where.owner === 'important') {
        return bagPage(view, where.owner === 'important').map((item) => ({
          item,
          count: view.bag.items.get(item) ?? 0,
        }))
      }
      return (view.members[where.owner]?.carried ?? []).map((item) => ({ item }))
    }
    case 'act':
      return ITEM_ACTS.map((_, k) => ({ word: ITEMS_WORDS.use + k }))
    case 'toWhere': {
      // The receiver's eight rows, empty ones and all.
      const carried = view.members[where.to]?.carried ?? []
      return Array.from({ length: CARRIED_MOST }, (_, k) => {
        const item = carried[k]
        return item === undefined ? { empty: true as const } : { item }
      })
    }
  }
}

/** What choosing a row did. */
export interface ItemsTaken {
  /** Where the panel is after; undefined closes it. */
  readonly where: ItemsWhere | undefined
  readonly row: number
  readonly use?: Held
  readonly discard?: Held
  readonly transfer?: {
    readonly held: Held
    readonly to: { readonly owner: Owner; readonly slot: number }
  }
}

/** Take the row. */
export function chooseItems(where: ItemsWhere, row: number, view: ItemsView): ItemsTaken {
  switch (where.at) {
    case 'kinds':
      return row === 0
        ? { where: { at: 'whose' }, row: 0 }
        : { where: { at: 'list', owner: 'important' }, row: 0 }
    case 'whose': {
      const owner: Owner = row < view.members.length ? row : 'bag'
      return { where: { at: 'list', owner }, row: 0 }
    }
    case 'list': {
      if (where.owner === 'important') return { where, row }
      const rows = itemsRows(where, view)
      const chosen = rows[row]
      if (!chosen || !('item' in chosen)) return { where, row }
      return {
        where: { at: 'act', held: { owner: where.owner, slot: row, item: chosen.item } },
        row: 0,
      }
    }
    case 'act': {
      const act = ITEM_ACTS[row]
      const back: ItemsWhere = { at: 'list', owner: where.held.owner }
      if (act === 'use') return { where: back, row: where.held.slot, use: where.held }
      if (act === 'discard') return { where: back, row: where.held.slot, discard: where.held }
      if (act === 'transfer') return { where: { at: 'toWho', held: where.held }, row: 0 }
      return { where: back, row: where.held.slot }
    }
    case 'toWho': {
      if (row >= view.members.length) {
        return {
          where: { at: 'list', owner: where.held.owner },
          row: 0,
          transfer: { held: where.held, to: { owner: 'bag', slot: -1 } },
        }
      }
      return { where: { at: 'toWhere', held: where.held, to: row }, row: 0 }
    }
    case 'toWhere':
      return {
        where: { at: 'list', owner: where.held.owner },
        row: 0,
        transfer: { held: where.held, to: { owner: where.to, slot: row } },
      }
  }
}

/** Go back a level; undefined leaves the panel. */
export function backItems(where: ItemsWhere): { where: ItemsWhere | undefined; row: number } {
  switch (where.at) {
    case 'kinds':
      return { where: undefined, row: 0 }
    case 'whose':
      return { where: { at: 'kinds' }, row: 0 }
    case 'list':
      return where.owner === 'important'
        ? { where: { at: 'kinds' }, row: 1 }
        : { where: { at: 'whose' }, row: where.owner === 'bag' ? -1 : where.owner }
    case 'act':
      return { where: { at: 'list', owner: where.held.owner }, row: where.held.slot }
    case 'toWho':
      return { where: { at: 'act', held: where.held }, row: 1 }
    case 'toWhere':
      return { where: { at: 'toWho', held: where.held }, row: where.to }
  }
}
