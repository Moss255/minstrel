import { describe, expect, it } from 'vitest'
import { back, choose, MENU_COMMANDS, moveCursor, openMenu, panelLines } from '../src/menu.ts'

describe('the main menu', () => {
  it('opens on the first command and chooses round and round', () => {
    const menu = openMenu()
    expect(MENU_COMMANDS[menu.cursor]?.id).toBe('talk')
    expect(moveCursor(menu, -1).cursor).toBe(MENU_COMMANDS.length - 1)
    expect(moveCursor(menu, MENU_COMMANDS.length + 1).cursor).toBe(1)
  })

  it('closes to talk, and opens a panel for anything else', () => {
    expect(choose(openMenu())).toEqual({ state: undefined, talk: true })
    const status = choose(moveCursor(openMenu(), 1))
    expect(status).toEqual({ state: { cursor: 1, panel: 'status' }, talk: false })
  })

  it('keeps its place while a panel is open, and goes back a step at a time', () => {
    const panel = choose(moveCursor(openMenu(), 2)).state
    if (!panel) throw new Error('no panel')
    expect(moveCursor(panel, 1)).toBe(panel)
    expect(choose(panel).state).toBe(panel)
    const menu = back(panel)
    expect(menu).toEqual({ cursor: 2, panel: undefined })
    expect(menu && back(menu)).toBeUndefined()
  })

  it('says who and where on the status panel, and what is not read yet', () => {
    const lines = panelLines('status', { hero: 'Hero', map: 'M01M07', stage: '2.1' })
    expect(lines[0]).toBe('Hero')
    expect(lines[1]).toContain('M01M07')
    expect(lines.join(' ')).toContain('not read yet')
    expect(panelLines('talk', { hero: 'Hero', map: undefined, stage: undefined })).toEqual([])
  })
})
