import { describe, expect, it } from 'vitest'
import {
  actionOfButton,
  actionOfKey,
  bindButton,
  bindingsFrom,
  bindingsToJson,
  bindKey,
  buttonLabel,
  clearAction,
  DEFAULT_BINDINGS,
  keyLabel,
  MOVE_TOKENS,
  playable,
  pressedActions,
} from '../src/controls.ts'
import { turnHint } from '../src/controls-panel.ts'

describe('the controls', () => {
  it('read the keys the game has always read, and the standard pad', () => {
    expect(actionOfKey(DEFAULT_BINDINGS, 'w')).toBe('up')
    expect(actionOfKey(DEFAULT_BINDINGS, 'arrowdown')).toBe('down')
    expect(actionOfKey(DEFAULT_BINDINGS, 'f')).toBe('confirm')
    expect(actionOfKey(DEFAULT_BINDINGS, 'enter')).toBe('confirm')
    expect(actionOfKey(DEFAULT_BINDINGS, 'escape')).toBe('cancel')
    expect(actionOfKey(DEFAULT_BINDINGS, 'x')).toBe('menu')
    expect(actionOfKey(DEFAULT_BINDINGS, 'z')).toBeUndefined()
    expect(actionOfButton(DEFAULT_BINDINGS, 0)).toBe('confirm')
    expect(actionOfButton(DEFAULT_BINDINGS, 12)).toBe('up')
    expect(playable(DEFAULT_BINDINGS)).toBe(true)
  })

  it('turns the camera on q and e, and on the shoulders', () => {
    expect(actionOfKey(DEFAULT_BINDINGS, 'q')).toBe('turnLeft')
    expect(actionOfKey(DEFAULT_BINDINGS, 'e')).toBe('turnRight')
    expect(actionOfButton(DEFAULT_BINDINGS, 4)).toBe('turnLeft')
    expect(actionOfButton(DEFAULT_BINDINGS, 5)).toBe('turnRight')
    // Turning is not walking: it has no movement token, so it never reaches
    // the Hero's held keys.
    expect(MOVE_TOKENS.turnLeft).toBeUndefined()
    expect(MOVE_TOKENS.turnRight).toBeUndefined()
    // And both are rebindable like anything else.
    const moved = bindKey(DEFAULT_BINDINGS, 'turnLeft', 'z')
    expect(actionOfKey(moved, 'z')).toBe('turnLeft')
    expect(moved.turnLeft.keys).toEqual(['q', 'z'])
  })

  it('gives the turns their defaults to a layout saved before they existed', () => {
    // A player who set their keys before this went in has no entry for either,
    // and must not be left unable to turn.
    const before = JSON.stringify({
      up: { keys: ['i'], buttons: [12] },
      down: { keys: ['k'], buttons: [13] },
    })
    const read = bindingsFrom(before)
    expect(read.up.keys).toEqual(['i'])
    expect(read.turnLeft).toEqual(DEFAULT_BINDINGS.turnLeft)
    expect(read.turnRight).toEqual(DEFAULT_BINDINGS.turnRight)
    expect(playable(read)).toBe(true)
  })

  it('binds a key to one action at a time, and clears an action', () => {
    const moved = bindKey(DEFAULT_BINDINGS, 'menu', 'f')
    expect(actionOfKey(moved, 'f')).toBe('menu')
    expect(moved.confirm.keys).toEqual(['enter'])
    expect(moved.menu.keys).toEqual(['x', 'f'])
    // Binding a key where it already is changes nothing.
    expect(bindKey(moved, 'menu', 'f').menu.keys).toEqual(['x', 'f'])
    const cleared = clearAction(moved, 'confirm')
    expect(cleared.confirm.keys).toEqual([])
    expect(playable(cleared)).toBe(false)
    const button = bindButton(DEFAULT_BINDINGS, 'map', 0)
    expect(button.confirm.buttons).toEqual([])
    expect(button.map.buttons).toEqual([8, 0])
  })

  it('survives a round trip through JSON, and falls back from anything else', () => {
    const changed = bindKey(DEFAULT_BINDINGS, 'music', 'n')
    expect(bindingsFrom(bindingsToJson(changed))).toEqual(changed)
    expect(bindingsFrom(null)).toBe(DEFAULT_BINDINGS)
    expect(bindingsFrom('not json')).toBe(DEFAULT_BINDINGS)
    // A saved layout missing an action keeps that action's default.
    expect(bindingsFrom('{"up":{"keys":["i"],"buttons":[]}}').up.keys).toEqual(['i'])
    expect(bindingsFrom('{"up":{"keys":["i"],"buttons":[]}}').confirm).toEqual(
      DEFAULT_BINDINGS.confirm,
    )
  })

  it('fires a pad button’s action once, as it goes down', () => {
    const none = [0, 0, 0, 0]
    expect(pressedActions(DEFAULT_BINDINGS, [1, 0, 0, 0], none)).toEqual(['confirm'])
    expect(pressedActions(DEFAULT_BINDINGS, [1, 0, 0, 0], [1, 0, 0, 0])).toEqual([])
    expect(pressedActions(DEFAULT_BINDINGS, [0, 1, 0, 1], none)).toEqual(['cancel', 'music'])
  })

  it('names keys and buttons for the panel', () => {
    expect(keyLabel('w')).toBe('W')
    expect(keyLabel('arrowup')).toBe('Up arrow')
    expect(keyLabel(' ')).toBe('Space')
    expect(keyLabel('escape')).toBe('Escape')
    expect(buttonLabel(0)).toBe('A / Cross')
    expect(buttonLabel(20)).toBe('Button 20')
  })
})

describe('the overlay hint for turning', () => {
  it('names the two keys, and says nothing when neither is bound', () => {
    expect(turnHint(DEFAULT_BINDINGS)).toBe('Q/E')
    expect(turnHint(bindKey(DEFAULT_BINDINGS, 'turnLeft', 'z'))).toBe('Q/E')
    const rebound = clearAction(bindKey(DEFAULT_BINDINGS, 'turnRight', ','), 'turnLeft')
    expect(turnHint(rebound)).toBe('?/E')
    const silent = clearAction(clearAction(DEFAULT_BINDINGS, 'turnLeft'), 'turnRight')
    expect(turnHint(silent)).toBe('')
  })
})
