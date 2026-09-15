import { ARM7_CLOCK, type DecodedWave } from '@minstrel/nitro-snd'
import {
  AMPL_K,
  attackRate,
  fallRate,
  loudness,
  PITCH_TABLE,
  sine,
  VOLUME_TABLE,
  volumeDivider,
} from './tables.ts'

/**
 * One of the DS's sixteen sound channels, as the driver runs it: an envelope,
 * a tuning, a pan and a modulation ticked 192 times a second, and a sample
 * source the mixer reads at the channel's own rate.
 *
 * The envelope, modulation, portamento and pitch arithmetic follow fincs's
 * FeOS Sound System (`sndchannel.arm.c`, `fssplayer.arm.c`; WTFPL), which
 * reproduces the SDK driver; `Timer_Adjust` there is "obtained through
 * disassembly of Ninty's sound driver". The mixing follows GBATEK's channel
 * registers as melonDS reads them: sample × volume / 128, over the divider, and
 * pan as `(128 − pan) / 128` left and `pan / 128` right.
 */

/** The envelope's states. */
export const Phase = { Off: 0, Start: 1, Attack: 2, Decay: 3, Sustain: 4, Release: 5 } as const
export type PhaseValue = (typeof Phase)[keyof typeof Phase]

export const ChannelType = { Pcm: 0, Psg: 1, Noise: 2 } as const
export type ChannelTypeValue = (typeof ChannelType)[keyof typeof ChannelType]

/** The lowest loudness, with the seven fractional bits the envelope keeps. */
const AMPL_THRESHOLD = -AMPL_K << 7

/** The eight PSG duties, as GBATEK gives them: `n` high samples of eight. */
const PSG_DUTY: readonly (readonly number[])[] = Array.from({ length: 8 }, (_, duty) =>
  Array.from({ length: 8 }, (_, i) => (duty === 7 ? -1 : i >= 7 - duty ? 1 : -1)),
)

export class Channel {
  phase: PhaseValue = Phase.Off
  type: ChannelTypeValue = ChannelType.Pcm
  /** Which track sounded it, or −1. */
  track = -1
  priority = 0
  /** Ticks of the sequence left to sound, or −1 for as long as the envelope lasts. */
  length = -1

  // What sounds.
  wave: DecodedWave | undefined
  duty = 0
  /** The wave's own timer, before tuning. */
  baseTimer = 0

  // The note.
  key = 60
  baseKey = 60
  velocity = 0
  /** The instrument's pan, −64..63, and the track's. */
  pan = 0
  trackPan = 0
  /** The track's loudness beside the envelope's. */
  trackLoudness = 0
  /** In 64ths of a semitone. */
  tune = 0

  // The envelope, in loudness with seven fractional bits.
  ampl = 0
  attackLevel = 0
  decayRate = 0
  sustainLevel = 0
  releaseRate = 0

  // Modulation and portamento.
  modType = 0
  modSpeed = 0
  modDepth = 0
  modRange = 0
  modDelay = 0
  private modDelayCount = 0
  private modCounter = 0
  sweepPitch = 0
  sweepLength = 0
  sweepCount = 0
  manualSweep = false

  // What the last tick came to, for the mixer.
  /** 0–127, the table's value. */
  volume = 0
  divider = 1
  /** 0–127 as the hardware takes it. */
  outPan = 64
  /** The channel's sample rate now, in hertz. */
  rate = 0
  /** Where the mixer is in the source, in samples. */
  position = 0
  /** For PSG, the phase within the eight-sample duty; for noise, the shift register. */
  noise = 0x7fff

  /** Take the channel for a note: `Note_On`'s register work. */
  start(): void {
    this.phase = Phase.Start
    this.position = 0
    this.noise = 0x7fff
    this.modDelayCount = 0
    this.modCounter = 0
    this.sweepCount = 0
  }

  release(): void {
    if (this.phase === Phase.Off) return
    this.length = -1
    this.priority = 1
    this.phase = Phase.Release
  }

  kill(): void {
    this.phase = Phase.Off
    this.track = -1
    this.priority = 0
    this.length = -1
    this.volume = 0
  }

  /** Set the envelope from an instrument's or the track's values. */
  envelope(attack: number, decay: number, sustain: number, release: number): void {
    this.attackLevel = attackRate(attack)
    this.decayRate = fallRate(decay)
    this.sustainLevel = sustain
    this.releaseRate = fallRate(release)
  }

  /** One of the driver's ticks, 192 a second: the envelope, the LFO, the sweep, and what they come to. */
  tick(): void {
    if (this.phase === Phase.Start) {
      this.ampl = AMPL_THRESHOLD
      this.phase = Phase.Attack
    }
    switch (this.phase) {
      case Phase.Off:
        return
      case Phase.Attack:
        this.ampl = Math.trunc((this.ampl * this.attackLevel) / 255)
        if (this.ampl === 0) this.phase = Phase.Decay
        break
      case Phase.Decay: {
        this.ampl -= this.decayRate
        const level = loudness(this.sustainLevel) << 7
        if (this.ampl <= level) {
          this.ampl = level
          this.phase = Phase.Sustain
        }
        break
      }
      case Phase.Release:
        this.ampl -= this.releaseRate
        if (this.ampl <= AMPL_THRESHOLD) {
          this.kill()
          return
        }
        break
      default:
        break
    }

    let modulation = 0
    let modulating = this.modDepth !== 0
    if (modulating) {
      if (this.modDelayCount < this.modDelay) {
        this.modDelayCount++
        modulating = false
      } else {
        modulation = sine(this.modCounter >> 8) * this.modRange * this.modDepth
        if (this.modType === 0) modulation = Math.trunc((modulation * 60) / 16384)
        else modulation = modulation >> 8
        const speed = (this.modSpeed << 6) & 0xffff
        let counter = (this.modCounter + speed) >> 8
        while (counter >= 0x80) counter -= 0x80
        this.modCounter = ((this.modCounter + speed) & 0xff) | (counter << 8)
      }
    }

    // Pitch: the tuning, the LFO on it, and the portamento sweep.
    let adjust = this.tune
    if (modulating && this.modType === 0) adjust += modulation
    const sweeping =
      this.sweepPitch !== 0 && this.sweepLength > 0 && this.sweepCount <= this.sweepLength
    if (sweeping) {
      adjust += Math.trunc(
        (this.sweepPitch * (this.sweepLength - this.sweepCount)) / this.sweepLength,
      )
      if (!this.manualSweep) this.sweepCount++
    }
    const timer = adjust === 0 ? this.baseTimer : adjustTimer(this.baseTimer, adjust)
    this.rate = ARM7_CLOCK / Math.max(1, timer)

    // Loudness: the envelope's, the track's, the velocity's, the LFO's.
    let total = (this.ampl >> 7) + this.trackLoudness + this.velocity + AMPL_K
    if (modulating && this.modType === 1) total += modulation
    if (total < 0) total = 0
    if (total > AMPL_K) total = AMPL_K
    this.volume = VOLUME_TABLE[total] as number
    this.divider = volumeDivider(total)

    let pan = this.pan + this.trackPan
    if (modulating && this.modType === 2) pan += modulation
    pan += 64
    this.outPan = pan < 0 ? 0 : pan > 127 ? 127 : pan
  }

  /**
   * Read `frames` samples at `outputRate` into `left` and `right`, added to
   * what is there. The source is read at the channel's own rate, between
   * samples by a straight line — ours: the hardware holds each sample.
   */
  mix(left: Float32Array, right: Float32Array, frames: number, outputRate: number): void {
    if (this.phase === Phase.Off || this.phase === Phase.Start || this.volume === 0) return
    const gain = (this.volume / 128 / this.divider) * (this.master / 128)
    const pan = this.outPan === 127 ? 128 : this.outPan
    const gainL = (gain * (128 - pan)) / 128
    const gainR = (gain * pan) / 128
    const step = this.rate / outputRate
    if (this.type === ChannelType.Pcm) {
      const wave = this.wave
      if (!wave) return
      const samples = wave.samples
      const end = samples.length
      let position = this.position
      for (let i = 0; i < frames; i++) {
        if (position >= end) {
          if (!wave.loops || end <= wave.loopStart) {
            this.kill()
            return
          }
          position = wave.loopStart + ((position - wave.loopStart) % (end - wave.loopStart))
        }
        const at = position | 0
        const frac = position - at
        const a = samples[at] as number
        const b =
          at + 1 < end
            ? (samples[at + 1] as number)
            : wave.loops
              ? (samples[wave.loopStart] as number)
              : a
        const value = (a + (b - a) * frac) / 32768
        left[i] = (left[i] as number) + value * gainL
        right[i] = (right[i] as number) + value * gainR
        position += step
      }
      this.position = position
    } else if (this.type === ChannelType.Psg) {
      const duty = PSG_DUTY[this.duty & 7] as readonly number[]
      let position = this.position
      for (let i = 0; i < frames; i++) {
        const value = duty[position & 7] as number
        left[i] = (left[i] as number) + value * gainL
        right[i] = (right[i] as number) + value * gainR
        position += step
        if (position >= 8) position -= 8
      }
      this.position = position
    } else {
      // GBATEK: X = X SHR 1, IF carry THEN Out = LOW, X = X XOR 6000h ELSE Out = HIGH.
      let position = this.position
      let x = this.noise
      let value = x & 1 ? -1 : 1
      for (let i = 0; i < frames; i++) {
        position += step
        while (position >= 1) {
          position -= 1
          if (x & 1) {
            x = (x >> 1) ^ 0x6000
            value = -1
          } else {
            x >>= 1
            value = 1
          }
        }
        left[i] = (left[i] as number) + value * gainL
        right[i] = (right[i] as number) + value * gainR
      }
      this.position = position
      this.noise = x
    }
  }

  /** The mixer's master volume, 0–128 — SOUNDCNT's, 127 taken as 128. */
  master = 128
}

/**
 * The driver's `Timer_Adjust`: a timer moved by `pitch` 64ths of a semitone
 * through the BIOS pitch table, 768 to the octave.
 */
export function adjustTimer(base: number, pitch: number): number {
  let p = -pitch
  let shift = 0
  while (p < 0) {
    shift--
    p += 0x300
  }
  while (p >= 0x300) {
    shift++
    p -= 0x300
  }
  let timer = base * ((PITCH_TABLE[p] as number) + 0x10000)
  shift -= 16
  if (shift <= 0) timer = Math.floor(timer / 2 ** -shift)
  else timer = timer * 2 ** shift
  if (timer < 0x10) return 0x10
  if (timer > 0xffff) return 0xffff
  return Math.floor(timer)
}
