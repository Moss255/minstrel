import type { Shop } from '@minstrel/game-formats'
import { ITEM_KIND_EVERYDAY } from '@minstrel/game-formats'
import { type Bag, drop, pay, take } from './bag.ts'
import { CARRIED_MOST, type Carriers, type Owner } from './inventory.ts'

/**
 * The shop, the inn and the church: what a line's `<SHOP=n>`, `<INN=n>` and
 * `<CHURCH=n>` hand over to when the talk is done (see `Service` in `talk.ts`).
 * Each is a list to choose from, drawn in the menu's box.
 *
 * **What is read:** which shop sells what, and at what rate (`readShops`), and
 * each item's prices, what a shop asks and what it gives (`readItemTable`).
 * Whether a shop's rate touches what it gives is not established; here it
 * does not.
 *
 * **What is ours:**
 * - the words on every list, since the cartridge's own menu text is not read;
 * - the inn's price, {@link INN_PRICE}: the innkeeper's line leaves it to the
 *   engine (`<val_2>`), and no table of inn prices has been found;
 * - what the inn and the church's numbers select, which is not established.
 */

/**
 * A stand-in for the inn's price. The line says "that'll be <val_2> gold
 * coins"; the number is the engine's, and not found.
 */
export const INN_PRICE = 10

export type Visit =
  | {
      readonly kind: 'shop'
      readonly shop: Shop
      readonly mode: 'top' | 'buy' | 'sell' | 'carrier'
      readonly cursor: number
      readonly said: string
      /** An everyday item bought, waiting for who carries it (overlay 3, state `0xc`). */
      readonly bought?: { readonly item: number; readonly cost: number } | undefined
    }
  | { readonly kind: 'inn'; readonly id: number; readonly cursor: number; readonly said: string }
  | { readonly kind: 'church'; readonly id: number; readonly cursor: number; readonly said: string }
  | {
      /**
       * Cap'n Max's exchange, once every milestone is passed: the six he
       * offers, each at its price in mini medals — see `medals.ts`. Choosing
       * one hands the choice back, for his own lines to take it on.
       */
      readonly kind: 'medals'
      readonly title: string
      readonly exchanges: readonly { readonly medals: number; readonly item: number }[]
      readonly held: number
      readonly cursor: number
      readonly said: string
    }

/** What a visit needs to know about the items, and about the Hero. */
export interface Counter {
  readonly name: (id: number) => string
  /** What a shop asks for an item, from its table; undefined for one no table lists. */
  readonly price: (id: number) => number | undefined
  /** What a shop gives for an item, from its table; 0 or undefined for one it will not buy. */
  readonly sells: (id: number) => number | undefined
  /** What divination tells: how far the Hero is from the next level. */
  readonly divination: () => string
  /** The party as carriers, and their names — see `inventory.ts`. Without them, the bag alone. */
  readonly carriers?: Carriers
  readonly names?: readonly string[]
  /** An item's kind — 8 everyday — see `ItemDef.kind`. */
  readonly kindOf?: (id: number) => number | undefined
}

/** What choosing did: the visit after it, the bag, and whether to rest or to record progress. */
export interface Outcome {
  readonly visit: Visit | undefined
  readonly bag: Bag
  readonly rested?: boolean
  readonly confessed?: boolean
  /** Cap'n Max's exchange: the one chosen, by place in his list, or -1 to leave. */
  readonly medalPick?: number
}

/** How a visit looks: its rows, which is chosen, and the lines beside them. */
export interface VisitView {
  readonly title: string
  readonly rows: readonly string[]
  readonly cursor: number
  readonly lines: readonly string[]
}

const SHOP_TOP = ['Buy', 'Sell', 'Leave']
const INN_ROWS = [`Stay the night — ${INN_PRICE} G`, 'Leave']
const CHURCH_ROWS = ['Confess — record your progress', 'Divination', 'Leave']

export function visitShop(shop: Shop): Visit {
  return { kind: 'shop', shop, mode: 'top', cursor: 0, said: 'What can I do for you?' }
}

export function visitInn(id: number): Visit {
  return { kind: 'inn', id, cursor: 0, said: 'Will you stay the night?' }
}

export function visitChurch(id: number): Visit {
  return { kind: 'church', id, cursor: 0, said: 'What brings you here?' }
}

/** What the shop asks for an item: its price at the shop's rate — INFERRED, see `readShops`. */
export function buyPrice(shop: Shop, price: number): number {
  return Math.floor((price * shop.rate) / 100)
}

/** One thing a shop would buy back: whose it is, its slot, the item. */
interface Sellable {
  readonly owner: Owner
  readonly slot: number
  readonly item: number
}

/**
 * The items a shop would buy back: what each member carries, then what is in
 * the bag. **Ours**: the game asks first whose page to sell from — the
 * equipment, a member, the bag (`func_ov003_02175df4`).
 */
function forSale(bag: Bag, counter?: Counter): Sellable[] {
  const carried = (counter?.carriers?.carried ?? []).flatMap((list, owner) =>
    list.map((item, slot) => ({ owner, slot, item })),
  )
  return [
    ...carried,
    ...[...bag.items.keys()].map((item) => ({ owner: 'bag' as const, slot: -1, item })),
  ]
}

/** Who may carry what is bought: the party, then the Bag. */
function carrierRows(counter: Counter): string[] {
  return [...(counter.names ?? []), 'Bag']
}

function rowsOf(visit: Visit, bag: Bag, counter: Counter): string[] {
  if (visit.kind === 'medals') {
    return [
      ...visit.exchanges.map(
        (offer) =>
          `${counter.name(offer.item)} — ${offer.medals} mini medal${offer.medals === 1 ? '' : 's'}`,
      ),
      'Leave',
    ]
  }
  if (visit.kind === 'inn') return INN_ROWS
  if (visit.kind === 'church') return CHURCH_ROWS
  if (visit.mode === 'top') return SHOP_TOP
  if (visit.mode === 'carrier') return carrierRows(counter)
  if (visit.mode === 'buy') {
    return visit.shop.items.map(
      (id) => `${counter.name(id)} — ${buyPrice(visit.shop, counter.price(id) ?? 0)} G`,
    )
  }
  const selling = forSale(bag, counter)
  if (selling.length === 0) return ['Nothing to sell']
  return selling.map(({ owner, item }) => {
    const count = owner === 'bag' ? (bag.items.get(item) ?? 0) : 1
    const gives = counter.sells(item)
    const offer = gives === undefined || gives === 0 ? 'not bought' : `${gives} G`
    const whose = owner === 'bag' ? '' : ` (${counter.names?.[owner] ?? '?'})`
    return `${counter.name(item)}${count > 1 ? ` ×${count}` : ''}${whose} — ${offer}`
  })
}

export function viewOf(visit: Visit, bag: Bag, counter: Counter): VisitView {
  if (visit.kind === 'medals') {
    return {
      title: visit.title,
      rows: rowsOf(visit, bag, counter),
      cursor: visit.cursor,
      lines: [visit.said, `${visit.held} mini medal${visit.held === 1 ? '' : 's'}`],
    }
  }
  const title =
    visit.kind === 'shop'
      ? `Shop ${visit.shop.id}${visit.mode === 'buy' ? ' — buying' : visit.mode === 'sell' ? ' — selling' : ''}`
      : visit.kind === 'inn'
        ? `Inn ${visit.id}`
        : `Church ${visit.id}`
  return {
    title,
    rows: rowsOf(visit, bag, counter),
    cursor: visit.cursor,
    lines: [visit.said, `${bag.gold} G`],
  }
}

/** Choose another row, round and round. */
export function moveVisit(visit: Visit, by: number, bag: Bag, counter: Counter): Visit {
  const count = rowsOf(visit, bag, counter).length
  return { ...visit, cursor: (((visit.cursor + by) % count) + count) % count }
}

/** Go back a step: out of buying or selling, or out of the visit. */
export function leaveVisit(visit: Visit): Visit | undefined {
  // Who carries what is already paid for must be answered — **ours**: what
  // the game's B does there is not read.
  if (visit.kind === 'shop' && visit.mode === 'carrier') return visit
  if (visit.kind === 'shop' && visit.mode !== 'top') {
    return { ...visit, mode: 'top', cursor: visit.mode === 'buy' ? 0 : 1, said: 'Anything else?' }
  }
  return undefined
}

/** Take the chosen row. */
export function chooseInVisit(visit: Visit, bag: Bag, counter: Counter): Outcome {
  if (visit.kind === 'medals') {
    const picked = visit.cursor < visit.exchanges.length ? visit.cursor : -1
    return { visit: undefined, bag, medalPick: picked }
  }
  if (visit.kind === 'inn') {
    if (visit.cursor !== 0) return { visit: undefined, bag }
    const paid = pay(bag, INN_PRICE)
    if (!paid) return { visit: { ...visit, said: 'You cannot afford a room.' }, bag }
    return {
      visit: { ...visit, cursor: 1, said: 'You rest the night, and wake refreshed.' },
      bag: paid,
      rested: true,
    }
  }
  if (visit.kind === 'church') {
    if (visit.cursor === 0) return { visit: { ...visit, said: 'Confessed.' }, bag, confessed: true }
    if (visit.cursor === 1) return { visit: { ...visit, said: counter.divination() }, bag }
    return { visit: undefined, bag }
  }
  if (visit.mode === 'top') {
    if (visit.cursor === 0) return { visit: { ...visit, mode: 'buy', cursor: 0 }, bag }
    if (visit.cursor === 1) return { visit: { ...visit, mode: 'sell', cursor: 0 }, bag }
    return { visit: undefined, bag }
  }
  if (visit.mode === 'buy') {
    const id = visit.shop.items[visit.cursor]
    if (id === undefined) return { visit, bag }
    const cost = buyPrice(visit.shop, counter.price(id) ?? 0)
    const paid = pay(bag, cost)
    if (!paid)
      return { visit: { ...visit, said: `You cannot afford the ${counter.name(id)}.` }, bag }
    // An everyday item: who carries it — a member or the bag (overlay 3,
    // state `0xc`). Equipment goes to the bag (the equipment bag).
    if (counter.carriers && counter.kindOf?.(id) === ITEM_KIND_EVERYDAY) {
      return {
        visit: {
          ...visit,
          mode: 'carrier',
          cursor: 0,
          bought: { item: id, cost },
          said: `Who will carry the ${counter.name(id)}?`,
        },
        bag: paid,
      }
    }
    return {
      visit: { ...visit, said: `You buy the ${counter.name(id)} for ${cost} G.` },
      bag: take(paid, { item: id }),
    }
  }
  if (visit.mode === 'carrier') {
    const bought = visit.bought
    if (!bought) return { visit: { ...visit, mode: 'buy' }, bag }
    const list = counter.carriers?.carried[visit.cursor]
    const back = { ...visit, mode: 'buy' as const, cursor: 0, bought: undefined }
    // A member with room carries it; one without, the bag takes it
    // (`func_0207ccf0` with the overflow, messages 33 and 22).
    if (list && list.length < CARRIED_MOST) {
      list.push(bought.item)
      return {
        visit: {
          ...back,
          said: `${counter.names?.[visit.cursor] ?? '?'} takes the ${counter.name(bought.item)}.`,
        },
        bag,
      }
    }
    return {
      visit: { ...back, said: `The ${counter.name(bought.item)} goes in the bag.` },
      bag: take(bag, { item: bought.item }),
    }
  }
  const selling = forSale(bag, counter)
  const held = selling[visit.cursor]
  if (held === undefined) return { visit, bag }
  const id = held.item
  const gives = counter.sells(id)
  if (gives === undefined || gives === 0) {
    return { visit: { ...visit, said: `The shop will not buy the ${counter.name(id)}.` }, bag }
  }
  // From a member, that slot, the list closing up; from the bag, one.
  let dropped = bag
  if (held.owner === 'bag') dropped = drop(bag, id) as Bag
  else counter.carriers?.carried[held.owner]?.splice(held.slot, 1)
  const after = take(dropped, { gold: gives })
  const left = forSale(after, counter).length
  return {
    visit: {
      ...visit,
      cursor: Math.min(visit.cursor, Math.max(0, left - 1)),
      said: `You sell the ${counter.name(id)} for ${gives} G.`,
    },
    bag: after,
  }
}
