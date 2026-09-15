import { Sequencer, type Song, TICK_RATE } from './sequencer.ts'

/**
 * Sound out of a sequencer: the sixteen channels mixed at an output rate,
 * the driver ticked 192 times a second between frames.
 */
export class Mixer {
  private carry = 0
  constructor(
    readonly sequencer: Sequencer,
    readonly rate: number,
  ) {}

  /** Fill `left` and `right`, `frames` long, from where the song is. */
  render(left: Float32Array, right: Float32Array, frames: number): void {
    left.fill(0, 0, frames)
    right.fill(0, 0, frames)
    const framesPerTick = this.rate / TICK_RATE
    let done = 0
    while (done < frames) {
      if (this.carry <= 0) {
        this.sequencer.tick()
        this.carry += framesPerTick
      }
      const run = Math.min(frames - done, Math.ceil(this.carry))
      const l = left.subarray(done, done + run)
      const r = right.subarray(done, done + run)
      for (const channel of this.sequencer.channels) channel.mix(l, r, run, this.rate)
      done += run
      this.carry -= run
    }
    for (let i = 0; i < frames; i++) {
      const l = left[i] as number
      const r = right[i] as number
      left[i] = l > 1 ? 1 : l < -1 ? -1 : l
      right[i] = r > 1 ? 1 : r < -1 ? -1 : r
    }
  }
}

/** Render `seconds` of a song from its start, at `rate`, for a test or a file. */
export function renderSong(
  song: Song,
  seconds: number,
  rate = 32768,
): { left: Float32Array; right: Float32Array } {
  const sequencer = new Sequencer()
  sequencer.load(song)
  sequencer.play()
  const mixer = new Mixer(sequencer, rate)
  const frames = Math.round(seconds * rate)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  mixer.render(left, right, frames)
  return { left, right }
}
