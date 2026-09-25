import { parseMarkup } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTEXT, runLine } from '../src/talk.ts'

describe('a line that hands over to a service', () => {
  it('names the shop, the inn or the church it ends with', () => {
    const shop = runLine(parseMarkup('*: Welcome!<ADD><SHOP=32>'))
    expect(shop.service).toEqual({ kind: 'SHOP', id: 32 })
    expect(shop.pages.map((p) => p.text)).toEqual(['Welcome!'])
    expect(runLine(parseMarkup('Rest?<ADD><INN=2>')).service).toEqual({ kind: 'INN', id: 2 })
    expect(runLine(parseMarkup('Pray.<ADD><CHURCH=1>')).service).toEqual({ kind: 'CHURCH', id: 1 })
    expect(runLine(parseMarkup('Just talk.<END>')).service).toBeUndefined()
  })

  it('takes the Krak Pot’s bare tag, which carries no number', () => {
    // **The pot's own line**, as the cartridge has it — `<RENKIN>` after the
    // end, with nothing to select, because there is one pot. Facility code 7;
    // see `Service` in `talk.ts`.
    const pot = runLine(parseMarkup('A pot I may be<,> but I am in no way potty!<END><RENKIN>'))
    expect(pot.service).toEqual({ kind: 'RENKIN', id: 0 })
    expect(pot.pages.map((p) => p.text)).toEqual(['A pot I may be, but I am in no way potty!'])
  })

  it('takes Patty’s bare tag too', () => {
    // `<LUIDA>` is Patty's Party Planning Place — facility code 5. ルイーダ is
    // the tavern's Japanese name, which is why the tag is not "PATTY".
    expect(runLine(parseMarkup('Hey there!<END><LUIDA>')).service).toEqual({
      kind: 'LUIDA',
      id: 0,
    })
  })

  it('does not take a bare tag it has no service for', () => {
    // `<BANK>` is the same shape and the bank is not built. A tag that
    // quietly became a service nobody wrote would be worse than one ignored.
    expect(runLine(parseMarkup('Hello.<END><BANK>')).service).toBeUndefined()
  })

  it("fills in the engine's values when it is given them, and leaves them out when not", () => {
    const line = parseMarkup("That'll be <val_2> gold coins.<ADD><INN=2>")
    const priced = runLine(line, 0, { ...DEFAULT_CONTEXT, values: { val_2: '10' } })
    expect(priced.pages[0]?.text).toBe("That'll be 10 gold coins.")
    const bare = runLine(line)
    expect(bare.pages[0]?.text).toBe("That'll be  gold coins.")
    expect(bare.unhandled).toContain('val_2')
  })
})
