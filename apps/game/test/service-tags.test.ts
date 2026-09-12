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

  it("fills in the engine's values when it is given them, and leaves them out when not", () => {
    const line = parseMarkup("That'll be <val_2> gold coins.<ADD><INN=2>")
    const priced = runLine(line, 0, { ...DEFAULT_CONTEXT, values: { val_2: '10' } })
    expect(priced.pages[0]?.text).toBe("That'll be 10 gold coins.")
    const bare = runLine(line)
    expect(bare.pages[0]?.text).toBe("That'll be  gold coins.")
    expect(bare.unhandled).toContain('val_2')
  })
})
