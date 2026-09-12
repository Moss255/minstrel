import { parseMarkup } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { branchOf, runLine } from '../src/talk.ts'

describe('answers that share a branch', () => {
  const tokens = parseMarkup(
    '*: Is that odd?<YESNO><YES><NO>*: Well, then.<PAGE>*: A bed?<ADD><INN=1>',
  )
  const asked = runLine(tokens)

  it('run on into the text after both markers, whichever is chosen', () => {
    const prompt = asked.prompt
    if (!prompt) throw new Error('no prompt')
    for (const answer of prompt.answers) {
      const from = branchOf(tokens, prompt, answer)
      if (from === undefined) throw new Error(`no branch for ${answer.label}`)
      const run = runLine(tokens, from)
      expect(run.pages.map((page) => page.text)).toEqual(['Well, then.', 'A bed?'])
      expect(run.service).toEqual({ kind: 'INN', id: 1 })
    }
  })

  it('leave separate branches separate', () => {
    const own = parseMarkup('*: Well?<YESNO><YES>*: Good.<NO>*: Pity.')
    const prompt = runLine(own).prompt
    if (!prompt) throw new Error('no prompt')
    const [yes, no] = prompt.answers.map((answer) => {
      const from = branchOf(own, prompt, answer)
      return from === undefined ? [] : runLine(own, from).pages.map((page) => page.text)
    })
    expect(yes).toEqual(['Good.'])
    expect(no).toEqual(['Pity.'])
  })
})
