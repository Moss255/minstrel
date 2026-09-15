import type { DecodedWave, Sbnk } from '@minstrel/nitro-snd'
import { Mixer } from './render.ts'
import { Sequencer, type Song } from './sequencer.ts'

/**
 * The sequencer and mixer inside an AudioWorklet: the page sends a song and
 * says play, stop or fade, and the processor fills the output at the
 * context's rate. Loaded by `Music` in `player.ts`; the game's worklet entry
 * imports this file and nothing else, so the worklet scope sees no DOM.
 */

/** A song as it crosses to the worklet: the same fields, structured-cloned. */
export interface SongMessage {
  readonly kind: 'song'
  readonly commands: Uint8Array
  readonly bank: Sbnk
  readonly archives: readonly (readonly DecodedWave[] | undefined)[]
  readonly volume: number
}

export type MusicMessage =
  | SongMessage
  | { readonly kind: 'play' }
  | { readonly kind: 'stop'; readonly now: boolean }
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
}

declare const sampleRate: number
declare function registerProcessor(name: string, processor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

export const MUSIC_PROCESSOR = 'minstrel-music'

export function registerMusicProcessor(): void {
  class MusicProcessor extends AudioWorkletProcessor {
    private readonly sequencer = new Sequencer()
    private readonly mixer = new Mixer(this.sequencer, sampleRate)
    private frames = 0
    private gain = 1
    private gainTo = 1
    private gainStep = 0
    private sinceReport = 0

    constructor() {
      super()
      this.port.onmessage = (event: MessageEvent<MusicMessage>) => this.take(event.data)
    }

    private take(message: MusicMessage): void {
      switch (message.kind) {
        case 'song': {
          const song: Song = {
            commands: message.commands,
            bank: message.bank,
            archives: message.archives,
            volume: message.volume,
          }
          this.sequencer.load(song)
          this.gain = 1
          this.gainTo = 1
          this.gainStep = 0
          break
        }
        case 'play':
          this.sequencer.play()
          break
        case 'stop':
          this.sequencer.stop(message.now)
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
      this.mixer.render(left, right, frames)
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
        }
        this.port.postMessage(report)
      }
      return true
    }
  }
  registerProcessor(MUSIC_PROCESSOR, MusicProcessor)
}
