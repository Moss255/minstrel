import { readGrammar } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { type Named, tellBattle } from '../src/battle-text.ts'

/**
 * Messages written for these tests in the files' markup — none is the game's —
 * and an article table of the same shape: definite in the 0s, indefinite in
 * the 100s, plural in the 200s and 300s.
 */
const articles = new Map([
  [0, ''],
  [1, 'the'],
  [101, 'a'],
  [102, 'an'],
  [201, 'the'],
  [301, 'some'],
])
const pack = (a: number, b: number, c: number, d: number, gender: number) =>
  readGrammar(((gender << 24) | (d << 18) | (c << 12) | (b << 6) | a) >>> 0)
const blob: Named = { name: 'blob', plural: 'blobs', grammar: pack(1, 1, 1, 1, 2), letter: 'B' }
const imp: Named = { name: 'imp', plural: 'imps', grammar: pack(2, 1, 1, 1, 1) }
const hero: Named = { name: 'Hero', gender: 0 }
const herb: Named = { name: 'medicinal herb', grammar: pack(1, 1, 1, 1, 0) }

describe('the battle’s words', () => {
  it('names the actor and target behind their articles, and the Hero bare', () => {
    const said = tellBattle(
      '<Cap><DEF_ART_ACTOR> pokes <DEF_ART_TARGET>, and <TARGET> minds.',
      { actor: blob, target: hero },
      articles,
    )
    expect(said.text).toBe('The blob B pokes Hero, and Hero minds.')
    expect(said.unhandled).toEqual([])
  })

  it('chooses on a count, with the indefinite articles, a kind at a time', () => {
    const message =
      '<IF_SING val_1><Cap><INDEF_ART_SGL_M_NAME1> turns up<ELSE_NOT_SING><Cap><INDEF_ART_PLR_M_NAME1> turn up<ENDIF_SING>!\\n' +
      '<IF_SING val_2><Cap><INDEF_ART_SGL_M_NAME2> too<ELSE_NOT_SING>Two lots<ENDIF_SING>!'
    expect(
      tellBattle(message, { monsters: [blob, imp], values: { val_1: 3, val_2: 1 } }, articles).text,
    ).toBe('Some blobs turn up!\nAn imp too!')
  })

  it('chooses a pronoun by the gender, three branches and one end', () => {
    const message =
      '<Cap><DEF_ART_ACTOR> hides <IF_ACTOR_M>his<IF_ACTOR_F>her<IF_ACTOR_N>its<ENDIF_ACTOR_MFN> face.'
    expect(tellBattle(message, { actor: blob }, articles).text).toBe('The blob B hides its face.')
    expect(tellBattle(message, { actor: imp }, articles).text).toBe('The imp hides her face.')
    expect(tellBattle(message, { actor: hero }, articles).text).toBe('Hero hides his face.')
  })

  it('chooses on the target being one and the party being one', () => {
    const message =
      '<IF_TARGET_SING><Cap><DEF_ART_TARGET> is<ELSE_TARGET_PLR>They are<ENDIF_TARGET> cross with <IF_SOLO><LEADER><ELSE_NOT_SOLO>the party<ENDIF_SOLO>.'
    expect(tellBattle(message, { target: imp, leader: hero }, articles).text).toBe(
      'The imp is cross with Hero.',
    )
    expect(
      tellBattle(
        message,
        { target: imp, leader: hero, targetSingular: false, solo: false },
        articles,
      ).text,
    ).toBe('They are cross with the party.')
  })

  it('names an item, fills in the numbers, and lets the timing and the status tags go', () => {
    const message =
      '<Cap><DEF_ART_ACTOR> uses <INDEF_ART_SGL_I_NAME>.<TIME=30>\\nIt<1>s worth <val_1>.<ST=<val_10>,1>'
    const said = tellBattle(message, { actor: hero, item: herb, values: { val_1: 35 } }, articles)
    expect(said.text).toBe('Hero uses a medicinal herb.\nIt’s worth 35.')
    expect(said.unhandled).toEqual([])
  })

  it('reports a tag it cannot render rather than guessing at it', () => {
    const said = tellBattle('<Cap><DEF_ART_ACTOR> <SPARKLE> glows.', { actor: blob }, articles)
    expect(said.text).toBe('The blob B  glows.')
    expect(said.unhandled).toEqual(['SPARKLE'])
  })
})
