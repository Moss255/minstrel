import type { DecodedWave, Sbnk } from '@minstrel/nitro-snd'
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

  /** The number each bank and wave archive was sent to the worklet under — see `KeepMessage`. */
  private readonly kept = new WeakMap<object, number>()
  private nextKept = 1
  /** Once the page has let a kept bank or archive go, the worklet is told to as well. */
  private readonly forgotten = new FinalizationRegistry<number>((id) =>
    this.send({ kind: 'forget', id }),
  )

  /**
   * A song's commands as they cross: their own bytes only. They are a view
   * onto the cartridge, and posting a view copies the whole buffer under it —
   * the cartridge, for every sound. Copied once a sequence.
   */
  private readonly tight = new WeakMap<Uint8Array, Uint8Array>()
  private tightOf(commands: Uint8Array): Uint8Array {
    if (commands.byteOffset === 0 && commands.byteLength === commands.buffer.byteLength)
      return commands
    let copy = this.tight.get(commands)
    if (!copy) {
      copy = commands.slice()
      this.tight.set(commands, copy)
    }
    return copy
  }

  /** A bank or archive's number, sending it to be kept the first time. */
  private keep(value: Sbnk | readonly DecodedWave[]): number {
    const already = this.kept.get(value)
    if (already !== undefined) return already
    const id = this.nextKept++
    this.kept.set(value, id)
    this.forgotten.register(value, id)
    this.send({ kind: 'keep', id, value })
    return id
  }

  private async sendSong(kind: 'song' | 'effect' | 'jingle', song: Song): Promise<void> {
    await this.open()
    if (this.context?.state !== 'running') await this.context?.resume()
    this.send({
      kind,
      commands: this.tightOf(song.commands),
      bank: this.keep(song.bank),
      archives: song.archives.map((archive) => (archive ? this.keep(archive) : undefined)),
      volume: song.volume,
      ...(song.start !== undefined ? { start: song.start } : {}),
    })
  }

  /** Play a song from its start, replacing whatever plays. */
  async play(name: string, song: Song): Promise<void> {
    await this.sendSong('song', song)
    this.send({ kind: 'play' })
    this.playing = name
  }

  /** Sound an effect over the music. */
  async effect(song: Song): Promise<void> {
    await this.sendSong('effect', song)
  }

  /** Let every effect and jingle go — a scene's end. */
  stopEffects(): void {
    this.send({ kind: 'stop-effects' })
  }

  /** Sound a jingle: the music pauses until it is over. */
  async jingle(song: Song): Promise<void> {
    await this.sendSong('jingle', song)
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
