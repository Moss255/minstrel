import { describe, expect, it } from 'vitest'
import { Phase } from '../src/channel.ts'
import { Ensemble } from '../src/render.ts'
import { Sequencer, TICK_RATE } from '../src/sequencer.ts'
import { songWith, vl } from './song-fixture.ts'

describe('a sequence played from mid-stream', () => {
  it('starts where it is told, with track offsets from the stream’s start', () => {
    // Two sequences in one stream: the first at 0, the second at 8, whose
    // opening allocates a track at absolute offset 20.
    const stream = [
      0x81,
      0,
      60,
      127,
      ...vl(10),
      0xff,
      0,
      0, // first, 8 bytes
      0xfe,
      0x03,
      0x00,
      0x93,
      1,
      20,
      0,
      0,
      0x81,
      0,
      72,
      127, // second at 8: alloc, open track at 20, patch, note…
    ]
    while (stream.length < 20) stream.push(0)
    stream.push(0x81, 0, 84, 127, ...vl(10), 0xff)
    // Finish the second sequence's own track: it is at index 12..; patch the note and end.
    const song = songWith(stream)
    const bytes = song.commands
    // Track 0 of the second sequence: after the open-track, `81 00 48 7f` then length and end.
    const patched = new Uint8Array([...bytes.subarray(0, 20), ...bytes.subarray(20)])
    const s = { ...song, commands: patched, start: 8 }
    const seq = new Sequencer()
    seq.load(s)
    seq.play()
    for (let i = 0; i < 4; i++) seq.tick()
    const keys = seq.channels
      .filter((c) => c.phase > Phase.Off)
      .map((c) => c.key)
      .sort()
    expect(keys).toContain(84)
    expect(keys).not.toContain(60)
  })
})

describe('the ensemble', () => {
  it('sounds effects over the music and pauses it for a jingle', () => {
    const rate = 32768
    const ensemble = new Ensemble(rate, 2)
    const long = songWith([0x81, 0, 0xd4, 0, 60, 100, ...vl(20), 0x80, ...vl(20), 0xfc])
    ensemble.music.load(long)
    ensemble.music.play()
    const short = songWith([0x81, 0, 72, 127, ...vl(8), 0xff])
    const l = new Float32Array(rate)
    const r = new Float32Array(rate)
    ensemble.render(l, r, rate / 4)
    ensemble.effect(short)
    ensemble.render(l, r, rate / 4)
    expect(ensemble.music.playing).toBe(true)
    ensemble.jingle(short)
    expect(ensemble.music.playing).toBe(false)
    // The jingle lasts under a second; after one the music is back.
    ensemble.render(l, r, rate)
    ensemble.render(l, r, rate / 8)
    expect(ensemble.jingling).toBe(false)
    expect(ensemble.music.playing).toBe(true)
  })

  it('takes the longest-playing voice when every voice is busy', () => {
    const ensemble = new Ensemble(32768, 2)
    const held = songWith([0x81, 0, 60, 127, ...vl(TICK_RATE * 10), 0xff])
    const first = ensemble.effect(held)
    ensemble.effect(held)
    expect(ensemble.effect(held)).toBe(first)
  })
})

describe('stopping the effects', () => {
  it('releases every voice, the jingle too, and the music goes on', () => {
    const ensemble = new Ensemble(32768, 2)
    const held = songWith([0x81, 0, 60, 127, ...vl(TICK_RATE * 10), 0xff])
    ensemble.music.load(held)
    ensemble.music.play()
    ensemble.effect(held)
    ensemble.jingle(held)
    expect(ensemble.sounding).toBe(2)
    expect(ensemble.music.playing).toBe(false)
    ensemble.stopEffects()
    expect(ensemble.sounding).toBe(0)
    const l = new Float32Array(4096)
    const r = new Float32Array(4096)
    ensemble.render(l, r, 4096)
    // Once the released jingle has died away, the music is let go on.
    for (let i = 0; i < 64 && !ensemble.music.playing; i++) ensemble.render(l, r, 4096)
    expect(ensemble.jingling).toBe(false)
    expect(ensemble.music.playing).toBe(true)
  })
})
