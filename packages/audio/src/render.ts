import { Phase } from './channel.ts'
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

/**
 * How a jingle asked for by a line of text is timed, in seconds — the game's
 * `func_0209c840`, which the text's `func_0209c830` hands it to (read 4
 * October 2026): the music's volume moved to 0 over `fade` (20 frames,
 * `func_020bc180`, INFERRED), the jingle started `delay` after the asking
 * (800, by `GetEffectiveDeltaTime`, milliseconds), and the music unpaused
 * `after` its end (500), its volume back over `back` (30 frames, INFERRED).
 * A battle's jingle (`func_0209c6d8`) has none of it: the music stops at once.
 */
export interface JingleTiming {
  readonly fade: number
  readonly delay: number
  readonly after: number
  readonly back: number
}

/**
 * Several sequencers sounding at once — the music, and the effects over it —
 * mixed into one output. An effect takes a free sequencer, or the one that
 * has played longest; a jingle pauses the music and lets it go on after.
 * The DS shares its sixteen channels between them by priority; giving each
 * its own sixteen is ours.
 */
export class Ensemble {
  readonly music: Sequencer
  private readonly musicMixer: Mixer
  private readonly effects: { sequencer: Sequencer; mixer: Mixer; started: number }[] = []
  private pending: Sequencer | undefined
  private musicPaused = false
  /** A jingle asked for and not yet started — see {@link JingleTiming}. */
  private queued: { song: Song; wait: number; after: number; back: number } | undefined
  /** Samples still to wait, once the jingle has ended, before the music comes back. */
  private holdAfter = 0
  /** How long the music takes to come back to its volume, in samples. */
  private backOver = 0
  /** The music's own volume, 0–1, and where it is heading, a step a sample. */
  private musicGain = 1
  private musicGainTo = 1
  private musicGainStep = 0
  private played = 0
  private scratchL = new Float32Array(0)
  private scratchR = new Float32Array(0)

  constructor(
    readonly rate: number,
    voices = 4,
  ) {
    this.music = new Sequencer()
    this.musicMixer = new Mixer(this.music, rate)
    for (let i = 0; i < voices; i++) {
      const sequencer = new Sequencer()
      this.effects.push({ sequencer, mixer: new Mixer(sequencer, rate), started: -1 })
    }
  }

  /** Sound an effect: the freest voice takes it. */
  effect(song: Song): Sequencer {
    const voice =
      this.effects.find((v) => v.sequencer.finished || !v.sequencer.playing) ??
      this.effects.reduce((a, b) => (a.started <= b.started ? a : b))
    voice.sequencer.load(song)
    voice.sequencer.play()
    voice.started = this.played++
    return voice.sequencer
  }

  /**
   * Sound a jingle: the music pauses until it is over. With `timing`, as the
   * text's `<ME_n>` asks one — the music fades out first, the jingle starts
   * after a wait, and the music comes back a while after it ends; see
   * {@link JingleTiming}.
   */
  jingle(song: Song, timing?: JingleTiming): void {
    if (timing) {
      this.queued = {
        song,
        wait: timing.delay * this.rate,
        after: timing.after * this.rate,
        back: timing.back * this.rate,
      }
      if (this.music.playing) this.fadeMusic(0, timing.fade * this.rate)
      return
    }
    this.start(song, 0, 0)
  }

  private start(song: Song, after: number, back: number): void {
    this.pending = this.effect(song)
    this.holdAfter = after
    this.backOver = back
    if (this.music.playing) {
      this.music.stop(false)
      this.musicPaused = true
    }
  }

  private fadeMusic(to: number, samples: number): void {
    this.musicGainTo = to
    this.musicGainStep = samples <= 0 ? 1 : Math.abs(to - this.musicGain) / samples
  }

  /** Let every effect go: its notes released, the jingle too. */
  stopEffects(): void {
    for (const voice of this.effects) if (voice.sequencer.playing) voice.sequencer.stop(false)
  }

  /** How many effects are sounding. */
  get sounding(): number {
    return this.effects.filter((v) => v.sequencer.playing && !v.sequencer.finished).length
  }

  /** Whether a jingle is still sounding — or asked for and waiting to start. */
  get jingling(): boolean {
    return this.queued !== undefined || this.sounds(this.pending)
  }

  private sounds(sequencer: Sequencer | undefined): boolean {
    return sequencer?.playing === true && !sequencer.finished
  }

  render(left: Float32Array, right: Float32Array, frames: number): void {
    // A jingle waiting its turn starts once its wait is over.
    if (this.queued) {
      this.queued.wait -= frames
      if (this.queued.wait <= 0) {
        const { song, after, back } = this.queued
        this.queued = undefined
        this.start(song, after, back)
      }
    }
    // The music paused for a jingle plays on once the jingle is done — and,
    // after a text's, once the wait after it is over too.
    if (this.pending && !this.sounds(this.pending) && this.musicPaused) {
      if (this.holdAfter > 0) this.holdAfter -= frames
      else {
        this.music.play()
        this.musicPaused = false
        this.pending = undefined
        this.fadeMusic(1, this.backOver)
      }
    } else if (this.pending && !this.sounds(this.pending) && !this.musicPaused) {
      this.pending = undefined
      this.fadeMusic(1, this.backOver)
    }
    this.musicMixer.render(left, right, frames)
    if (this.musicGain !== 1 || this.musicGainTo !== 1) {
      for (let i = 0; i < frames; i++) {
        if (this.musicGain !== this.musicGainTo) {
          this.musicGain =
            this.musicGain < this.musicGainTo
              ? Math.min(this.musicGainTo, this.musicGain + this.musicGainStep)
              : Math.max(this.musicGainTo, this.musicGain - this.musicGainStep)
        }
        left[i] = (left[i] as number) * this.musicGain
        right[i] = (right[i] as number) * this.musicGain
      }
    }
    if (this.scratchL.length < frames) {
      this.scratchL = new Float32Array(frames)
      this.scratchR = new Float32Array(frames)
    }
    for (const voice of this.effects) {
      // A stopped voice still sounds while its released notes die away.
      if (voice.sequencer.finished) continue
      if (!voice.sequencer.playing && voice.sequencer.channels.every((c) => c.phase === Phase.Off))
        continue
      voice.mixer.render(this.scratchL, this.scratchR, frames)
      for (let i = 0; i < frames; i++) {
        left[i] = (left[i] as number) + (this.scratchL[i] as number)
        right[i] = (right[i] as number) + (this.scratchR[i] as number)
      }
    }
    for (let i = 0; i < frames; i++) {
      const l = left[i] as number
      const r = right[i] as number
      left[i] = l > 1 ? 1 : l < -1 ? -1 : l
      right[i] = r > 1 ? 1 : r < -1 ? -1 : r
    }
  }
}
