import type { DecodedWave, Sbnk } from '@minstrel/nitro-snd'
import { Ensemble, type JingleTiming } from './render.ts'
import type { Song } from './sequencer.ts'

/**
 * The sequencer and mixer inside an AudioWorklet: the page sends a song and
 * says play, stop or fade, and the processor fills the output at the
 * context's rate. Loaded by `Music` in `player.ts`; the game's worklet entry
 * imports this file and nothing else, so the worklet scope sees no DOM.
 */

/**
 * A song as it crosses to the worklet: its commands cloned, but its bank and
 * its wave archives **by the number each was kept under** — see
 * {@link KeepMessage}. The samples are the bulk of a song, and the same few
 * banks and archives serve every sound a battle makes; cloning them for each
 * effect cost the page whole frames.
 */
export interface SongMessage {
  readonly kind: 'song' | 'effect' | 'jingle'
  readonly commands: Uint8Array
  readonly bank: number
  readonly archives: readonly (number | undefined)[]
  readonly volume: number
  readonly start?: number
  /** A jingle's timing, where a line of text asked for it — see `JingleTiming`. */
  readonly timing?: JingleTiming
}

/** A bank or a wave archive, sent once and kept by the worklet under its number. */
export interface KeepMessage {
  readonly kind: 'keep'
  readonly id: number
  readonly value: Sbnk | readonly DecodedWave[]
}

export type MusicMessage =
  | SongMessage
  | KeepMessage
  /** A kept bank or archive the page no longer holds: let it go. */
  | { readonly kind: 'forget'; readonly id: number }
  | { readonly kind: 'play' }
  | { readonly kind: 'stop'; readonly now: boolean }
  /** Let every effect and jingle go, their notes released. */
  | { readonly kind: 'stop-effects' }
  /** Scale the output to `to` (0–1) over `seconds`. */
  | { readonly kind: 'fade'; readonly to: number; readonly seconds: number }
  /** Multiply the tempo — see `Sequencer.tempoRate`. */
  | { readonly kind: 'rate'; readonly rate: number }

/** What the worklet reports back, now and then. */
export interface MusicReport {
  readonly kind: 'report'
  readonly frames: number
  readonly ticks: number
  readonly playing: boolean
  readonly finished: boolean
  /** How many effects are sounding over it. */
  readonly effects: number
  /** Whether a jingle is sounding, or asked for and waiting — see `Ensemble.jingling`. */
  readonly jingling: boolean
}

declare const sampleRate: number
declare function registerProcessor(name: string, processor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

export const MUSIC_PROCESSOR = 'minstrel-music'

export function registerMusicProcessor(): void {
  class MusicProcessor extends AudioWorkletProcessor {
    private readonly ensemble = new Ensemble(sampleRate)
    private readonly sequencer = this.ensemble.music
    private frames = 0
    private gain = 1
    private gainTo = 1
    private gainStep = 0
    private sinceReport = 0
    /** What the page has sent to be kept — see `KeepMessage`. */
    private readonly kept = new Map<number, Sbnk | readonly DecodedWave[]>()

    constructor() {
      super()
      this.port.onmessage = (event: MessageEvent<MusicMessage>) => this.take(event.data)
    }

    private take(message: MusicMessage): void {
      switch (message.kind) {
        case 'keep':
          this.kept.set(message.id, message.value)
          break
        case 'forget':
          // What is playing holds its own references; only the map lets go.
          this.kept.delete(message.id)
          break
        case 'song':
        case 'effect':
        case 'jingle': {
          const bank = this.kept.get(message.bank) as Sbnk | undefined
          if (!bank) break
          const song: Song = {
            commands: message.commands,
            bank,
            archives: message.archives.map((id) =>
              id === undefined
                ? undefined
                : (this.kept.get(id) as readonly DecodedWave[] | undefined),
            ),
            volume: message.volume,
            ...(message.start !== undefined ? { start: message.start } : {}),
          }
          if (message.kind === 'effect') this.ensemble.effect(song)
          else if (message.kind === 'jingle') this.ensemble.jingle(song, message.timing)
          else {
            this.sequencer.load(song)
            this.gain = 1
            this.gainTo = 1
            this.gainStep = 0
          }
          break
        }
        case 'play':
          this.sequencer.play()
          break
        case 'stop':
          this.sequencer.stop(message.now)
          break
        case 'stop-effects':
          this.ensemble.stopEffects()
          break
        case 'rate':
          this.sequencer.tempoRate = message.rate
          break
        case 'fade':
          this.gainTo = message.to
          this.gainStep =
            message.seconds <= 0
              ? 1
              : Math.abs(message.to - this.gain) / (message.seconds * sampleRate)
          break
      }
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const out = outputs[0]
      const left = out?.[0]
      const right = out?.[1] ?? left
      if (!left || !right) return true
      const frames = left.length
      this.ensemble.render(left, right, frames)
      if (this.gain !== this.gainTo || this.gain !== 1) {
        for (let i = 0; i < frames; i++) {
          if (this.gain !== this.gainTo) {
            this.gain =
              this.gain < this.gainTo
                ? Math.min(this.gainTo, this.gain + this.gainStep)
                : Math.max(this.gainTo, this.gain - this.gainStep)
          }
          left[i] = (left[i] as number) * this.gain
          right[i] = (right[i] as number) * this.gain
        }
      }
      this.frames += frames
      this.sinceReport += frames
      if (this.sinceReport >= sampleRate / 4) {
        this.sinceReport = 0
        const report: MusicReport = {
          kind: 'report',
          frames: this.frames,
          ticks: this.sequencer.ticks,
          playing: this.sequencer.playing,
          finished: this.sequencer.finished,
          effects: this.ensemble.sounding,
          jingling: this.ensemble.jingling,
        }
        this.port.postMessage(report)
      }
      return true
    }
  }
  registerProcessor(MUSIC_PROCESSOR, MusicProcessor)
}
