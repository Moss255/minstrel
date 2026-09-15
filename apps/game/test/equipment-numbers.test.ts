import { describe, expect, it } from 'vitest'
import { type MenuContext, panelLines } from '../src/menu.ts'

/** A menu's context built in code: a copper blade worn, a lid in the bag. */
const context: MenuContext = {
  hero: 'Hero',
  map: 'M01M07',
  stage: '2.2',
  equipped: new Map([['weapon', 1]]),
  itemName: (id) => (id === 1 ? 'copper blade' : `item ${id}`),
  numbersOf: (id) =>
    id === 1 ? { attack: 7, defence: 0 } : id === 2 ? { attack: 0, defence: 3 } : undefined,
}

describe('equipment’s numbers in the menu', () => {
  it('shows each worn piece’s own number, and what the worn pieces add', () => {
    const lines = panelLines('equip', context)
    expect(lines.join('\n')).toContain('copper blade — attack 7')
    expect(lines).toContain('Equipment worn: attack +7, defence +0.')
  })

  it('counts a worn piece’s agility, and names it beside the piece', () => {
    const ring: MenuContext = {
      ...context,
      equipped: new Map([
        ['weapon', 1],
        ['accessory', 3],
      ]),
      itemName: (id) => (id === 3 ? 'swift band' : `item ${id}`),
      numbersOf: (id) =>
        id === 1
          ? { attack: 7, defence: 0 }
          : id === 3
            ? { attack: 0, defence: 0, agility: 20 }
            : undefined,
    }
    const lines = panelLines('equip', ring)
    expect(lines.join('\n')).toContain('swift band — agility 20')
    expect(lines).toContain('Equipment worn: attack +7, defence +0, agility +20.')
  })

  it('says so when the numbers did not read', () => {
    const lines = panelLines('equip', { ...context, numbersOf: undefined })
    expect(lines).toContain('What equipment adds is not read.')
    expect(lines.join('\n')).not.toContain('attack 7')
  })
})
