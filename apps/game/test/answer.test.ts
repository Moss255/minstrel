import { describe, expect, it } from 'vitest'
import {
  answerNow,
  type Conversation,
  DEFAULT_CONTEXT,
  nextPage,
  startConversation,
} from '../src/talk.ts'

/** A question as the Hexagon statue asks it, written out for the test: its Yes says nothing. */
const QUESTION = 'Press the button?<YESNO><NO>Not pressed.<END><YES><END>'
const asked = (text = QUESTION): Conversation => {
  const conversation = startConversation(
    { id: 201, name: 'the statue', x: 0, z: 0 },
    'test',
    [text],
    ['note'],
  )
  if (!conversation) throw new Error('the question did not start')
  return conversation
}

describe('the answer to a question', () => {
  it('is Yes as the question stands, and No once chosen', () => {
    const conversation = asked()
    expect(answerNow(conversation)).toBe(0)
    expect(answerNow({ ...conversation, choice: 1 })).toBe(1)
  })

  it('counts even where its branch says nothing and the talk ends with it', () => {
    const conversation = asked()
    const given = answerNow(conversation)
    expect(nextPage(conversation, DEFAULT_CONTEXT)).toBeUndefined()
    expect(given).toBe(0)
  })

  it('is nothing before the question is reached', () => {
    expect(answerNow(asked(`First.<PAGE>${QUESTION}`))).toBeUndefined()
  })
})
