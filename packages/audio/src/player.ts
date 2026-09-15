import type { Song } from './sequencer.ts'
import { MUSIC_PROCESSOR, type MusicMessage, type MusicReport } from './worklet.ts'

/**
 * Music on the page: an AudioContext with the worklet in it, and a song sent
 * over to play. The context starts on the first play, which the browser
 * allows only after the player has touched the page.
 */
export class Music {
  private context: AudioContext | undefined
  private node: AudioWorkletNode | undefined
  private ready: Promise<void> | undefined
  /** The last report the worklet sent. */
  report: MusicReport | undefined
  /** The song's name, for the status line. */
  playing: string | undefined

  constructor(private readonly workletUrl: string) {}

  private async open(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const context = new AudioContext()
      await context.audioWorklet.addModule(this.workletUrl)
      const node = new AudioWorkletNode(context, MUSIC_PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })
      node.port.onmessage = (event: MessageEvent<MusicReport>) => {
        if (event.data?.kind === 'report') this.report = event.data
      }
      node.connect(context.destination)
      this.context = context
      this.node = node
    })()
    return this.ready
  }

  private send(message: MusicMessage): void {
    this.node?.port.postMessage(message)
  }

  /** Play a song from its start, replacing whatever plays. */
  async play(name: string, song: Song): Promise<void> {
    await this.open()
    if (this.context?.state !== 'running') await this.context?.resume()
    this.send({
      kind: 'song',
      commands: song.commands,
      bank: song.bank,
      archives: song.archives,
      volume: song.volume,
    })
    this.send({ kind: 'play' })
    this.playing = name
  }

  /** Stop: at once, or letting the notes fade. */
  stop(now = true): void {
    this.send({ kind: 'stop', now })
    this.playing = undefined
  }

  /** Multiply the tempo, for finding by ear where a tempo stands — see `Sequencer.tempoRate`. */
  rate(rate: number): void {
    this.send({ kind: 'rate', rate })
  }

  /** Fade the output to `to` over `seconds`. */
  fade(to: number, seconds: number): void {
    this.send({ kind: 'fade', to, seconds })
  }

  /** The context's state, for the status line. */
  get state(): string {
    return this.context?.state ?? 'closed'
  }
}
