import { describe, expect, it } from 'vitest'
import { Phase } from '../src/channel.ts'
import { Mixer, renderSong } from '../src/render.ts'
import { Sequencer, TICK_RATE } from '../src/sequencer.ts'
import { songWith, vl } from './song-fixture.ts'

/** The strongest frequency in a stretch of samples, by a plain DFT over a range. */
function peakHz(samples: Float32Array, rate: number, from: number, count: number): number {
  let best = 0
  let bestPower = 0
  for (let hz = 100; hz < 2000; hz += 2) {
    let re = 0
    let im = 0
    for (let i = 0; i < count; i++) {
      const t = (i / rate) * 2 * Math.PI * hz
      const v = samples[from + i] as number
      re += v * Math.cos(t)
      im += v * Math.sin(t)
    }
    const power = re * re + im * im
    if (power > bestPower) {
      bestPower = power
      best = hz
    }
  }
  return best
}

const rms = (s: Float32Array, from: number, count: number) => {
  let sum = 0
  for (let i = from; i < from + count; i++) sum += (s[i] as number) ** 2
  return Math.sqrt(sum / count)
}

describe('the sequencer', () => {
  it('sounds a note for its length in ticks, at the tempo set', () => {
    // Tempo 120: 48 ticks a beat, 96 a second. A note of 96 ticks lasts a second.
    const song = songWith([0xe1, 120, 0, 0x81, 0, 69, 127, ...vl(96), 0xff])
    const sequencer = new Sequencer()
    sequencer.load(song)
    sequencer.play()
    let sounding = 0
    for (let tick = 0; tick < TICK_RATE * 2; tick++) {
      sequencer.tick()
      if (sequencer.channels.some((c) => c.phase > Phase.Start && c.phase < Phase.Release))
        sounding++
    }
    expect(sounding).toBeGreaterThan(TICK_RATE * 0.95)
    expect(sounding).toBeLessThan(TICK_RATE * 1.05)
    expect(sequencer.finished).toBe(true)
  })

  it('plays the key it is given at the wave’s pitch, an octave per twelve keys', () => {
    const rate = 32768
    // Key 69 is the wave's own 512 Hz; key 81 an octave up.
    const high = renderSong(songWith([0x81, 0, 81, 127, ...vl(200), 0xff]), 1, rate)
    expect(peakHz(high.left, rate, 8000, 4096)).toBeCloseTo(1024, -1)
    const base = renderSong(songWith([0x81, 0, 69, 127, ...vl(200), 0xff]), 1, rate)
    expect(peakHz(base.left, rate, 8000, 4096)).toBeCloseTo(512, -1)
  })

  it('loops with 0xD4/0xFC, calls and returns, and ends when every track has', () => {
    // Loop twice over a 10-tick note; then call a rest and return; then end.
    const song = songWith([
      0x81,
      0,
      0xd4,
      2,
      60,
      100,
      ...vl(10),
      0xfc,
      0x95,
      20,
      0,
      0,
      0xff,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // padding to offset 20
      0x80,
      ...vl(30),
      0xfd,
    ])
    const sequencer = new Sequencer()
    sequencer.load(song)
    sequencer.play()
    let notes = 0
    let last = -1
    for (let tick = 0; tick < TICK_RATE * 2 && !sequencer.finished; tick++) {
      sequencer.tick()
      const on = sequencer.channels.findIndex(
        (c) => c.phase === Phase.Attack || c.phase === Phase.Decay,
      )
      if (on >= 0 && sequencer.ticks !== last) {
        notes++
        last = sequencer.ticks
      }
    }
    expect(sequencer.finished).toBe(true)
    // Two notes of ten ticks, then thirty of rest: fifty sequence ticks in all.
    expect(sequencer.ticks).toBeGreaterThanOrEqual(50)
    expect(sequencer.ticks).toBeLessThan(56)
  })

  it('opens the tracks its first command allocates and runs them together', () => {
    // Track 0 plays 60; track 1, at offset 12, plays 72 at once.
    const song = songWith([
      0xfe,
      0x03,
      0x00,
      0x93,
      1,
      12,
      0,
      0,
      0x81,
      0,
      60,
      127,
      ...vl(50),
      0xff,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ])
    // Put track 1's stream at 12: patch 0, note 72 for 50, end.
    song.commands.set([0x81, 0, 72, 127, ...vl(50), 0xff], 12)
    const sequencer = new Sequencer()
    sequencer.load(song)
    sequencer.play()
    for (let tick = 0; tick < 8; tick++) sequencer.tick()
    const keys = sequencer.channels
      .filter((c) => c.phase > Phase.Off)
      .map((c) => c.key)
      .sort()
    expect(keys).toEqual([60, 72])
  })

  it('applies volume and expression to the loudness, and pans', () => {
    const rate = 32768
    const loud = renderSong(songWith([0x81, 0, 0xc1, 127, 69, 127, ...vl(200), 0xff]), 0.5, rate)
    const quiet = renderSong(songWith([0x81, 0, 0xc1, 64, 69, 127, ...vl(200), 0xff]), 0.5, rate)
    expect(rms(quiet.left, 4000, 4000)).toBeLessThan(rms(loud.left, 4000, 4000) * 0.5)
    const leftOnly = renderSong(songWith([0x81, 0, 0xc0, 0, 69, 127, ...vl(200), 0xff]), 0.5, rate)
    expect(rms(leftOnly.right, 4000, 4000)).toBeLessThan(0.001)
    expect(rms(leftOnly.left, 4000, 4000)).toBeGreaterThan(0.05)
  })

  it('releases a note over its release rate, and holds a tied one through the next key', () => {
    const song = songWith([0x81, 0, 69, 127, ...vl(20), 0xff], { release: 100 })
    const sequencer = new Sequencer()
    sequencer.load(song)
    sequencer.play()
    let releasing = 0
    for (let tick = 0; tick < TICK_RATE * 3; tick++) {
      sequencer.tick()
      if (sequencer.channels.some((c) => c.phase === Phase.Release)) releasing++
    }
    expect(releasing).toBeGreaterThan(5)
    const tied = songWith([0x81, 0, 0xc8, 1, 69, 127, ...vl(10), 81, 127, ...vl(10), 0xff])
    const s2 = new Sequencer()
    s2.load(tied)
    s2.play()
    for (let tick = 0; tick < 30; tick++) s2.tick()
    const on = s2.channels.filter((c) => c.phase > Phase.Off)
    expect(on).toHaveLength(1)
    expect(on[0]?.key).toBe(81)
  })

  it('mixes at any output rate to the same pitch', () => {
    const song = songWith([0x81, 0, 69, 127, ...vl(200), 0xff])
    for (const rate of [32768, 48000]) {
      const sequencer = new Sequencer()
      sequencer.load(song)
      sequencer.play()
      const mixer = new Mixer(sequencer, rate)
      const left = new Float32Array(rate)
      const right = new Float32Array(rate)
      mixer.render(left, right, rate)
      expect(peakHz(left, rate, Math.floor(rate / 4), 4096)).toBeCloseTo(512, -1)
    }
  })
})
