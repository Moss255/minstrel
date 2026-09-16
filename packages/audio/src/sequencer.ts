import { type DecodedWave, type NoteDefinition, noteFor, type Sbnk } from '@minstrel/nitro-snd'
import { Channel, ChannelType, type ChannelTypeValue, Phase } from './channel.ts'
import { AMPL_K, loudness, Random } from './tables.ts'

/**
 * The sequence player: SSEQ commands over a bank's instruments, sounding on
 * the sixteen channels, 192 ticks a second.
 *
 * The command set and its handling follow Gota7's *Nitro Studio 2* sequence
 * specification for the opcodes and fincs's FeOS Sound System (`Track_Run`,
 * `Note_On`, `Player_Run`; WTFPL) for what each does, tick by tick — the
 * tempo count of 240, the note-wait and tie states, the call stack shared
 * with loops, the envelope and portamento hand-off to a channel.
 *
 * What the driver gets from the sequence's SDAT record — its volume — is
 * applied as the player's user volume, INFERRED: FSS leaves it to the caller.
 */

/** Ticks a second — the driver's timer, ARM7 clock / 64 / 2728. */
export const TICK_RATE = 192

const CMD = {
  Rest: 0x80,
  Patch: 0x81,
  OpenTrack: 0x93,
  Jump: 0x94,
  Call: 0x95,
  Random: 0xa0,
  Variable: 0xa1,
  If: 0xa2,
  Pan: 0xc0,
  Volume: 0xc1,
  MasterVolume: 0xc2,
  Transpose: 0xc3,
  PitchBend: 0xc4,
  PitchBendRange: 0xc5,
  Priority: 0xc6,
  NoteWait: 0xc7,
  Tie: 0xc8,
  PortamentoKey: 0xc9,
  ModDepth: 0xca,
  ModSpeed: 0xcb,
  ModType: 0xcc,
  ModRange: 0xcd,
  Portamento: 0xce,
  PortamentoTime: 0xcf,
  Attack: 0xd0,
  Decay: 0xd1,
  Sustain: 0xd2,
  Release: 0xd3,
  LoopStart: 0xd4,
  Expression: 0xd5,
  PrintVariable: 0xd6,
  ModDelay: 0xe0,
  Tempo: 0xe1,
  SweepPitch: 0xe3,
  LoopEnd: 0xfc,
  Return: 0xfd,
  AllocateTracks: 0xfe,
  End: 0xff,
} as const

const STACK = 3

class Track {
  pos = 0
  ended = false
  wait = 0
  readonly stack: number[] = []
  readonly loops: number[] = []
  patch = 0
  priority = 64
  noteWait = true
  tie = false
  portamento = false
  portaKey = 60
  portaTime = 0
  sweepPitch = 0
  volume = 127
  expression = 127
  pan = 0
  pitchBendRange = 2
  pitchBend = 0
  transpose = 0
  attack = 0xff
  decay = 0xff
  sustain = 0xff
  release = 0xff
  modType = 0
  modRange = 1
  modSpeed = 16
  modDelay = 10
  modDepth = 0
  /** A prefixed value waiting for the next argument — see `Random` and `Variable`. */
  override: number | undefined
  overrideVariable = false
  conditional = true

  constructor(
    readonly index: number,
    start: number,
    priority: number,
  ) {
    this.pos = start
    this.priority = priority
  }
}

/** What the player needs of a song: its commands, its bank and its bank's decoded wave archives. */
export interface Song {
  readonly commands: Uint8Array
  readonly bank: Sbnk
  /** By the bank's archive slot, 0–3. */
  readonly archives: readonly (readonly DecodedWave[] | undefined)[]
  /** The SDAT sequence record's volume, 0–127. */
  readonly volume: number
  /**
   * Where the sequence starts in `commands`: 0 for a sequence of its own, an
   * entry's offset for one of a sequence archive's, whose track and jump
   * offsets still count from the shared stream's start.
   */
  readonly start?: number
}

/** The order the driver tries channels in for each kind of note. */
const PCM_ORDER = [4, 5, 6, 7, 2, 0, 3, 1, 8, 9, 10, 11, 14, 12, 15, 13]
const PSG_ORDER = [8, 9, 10, 11, 12, 13]
const NOISE_ORDER = [14, 15]

export class Sequencer {
  readonly channels: Channel[] = Array.from({ length: 16 }, () => new Channel())
  private tracks: Track[] = []
  /** The tempo the sequence has set, in beats a minute at 48 ticks a beat. */
  tempo = 120
  /**
   * A multiplier on the tempo — the driver's `tempoRate`, 8.8 fixed point in
   * FSS, 1 by default. A knob for the page: nothing in the data sets it.
   */
  tempoRate = 1
  private tempoCount = 0
  private masterLoudness = 0
  private userLoudness = 0
  private readonly variables = new Int16Array(16)
  private readonly random = new Random()
  private song: Song | undefined
  playing = false
  /** How many sequence ticks have played. */
  ticks = 0

  /** Set a song up: its first track, and the tracks its opening allocates. */
  load(song: Song): void {
    this.stop()
    this.song = song
    this.userLoudness = loudness(song.volume)
    this.masterLoudness = 0
    this.tempo = 120
    this.tempoCount = 0
    this.ticks = 0
    const c = song.commands
    let pos = song.start ?? 0
    const tracks: Track[] = []
    if (c[pos] === CMD.AllocateTracks) {
      pos += 3
      while (c[pos] === CMD.OpenTrack) {
        const number = c[pos + 1] as number
        const start =
          (c[pos + 2] as number) | ((c[pos + 3] as number) << 8) | ((c[pos + 4] as number) << 16)
        tracks.push(new Track(number, start, 64))
        pos += 5
      }
    }
    this.tracks = [new Track(0, pos, 64), ...tracks]
  }

  play(): void {
    if (this.song) this.playing = true
  }

  /**
   * Stop, cutting every note — or, with `now` false, pause: the notes are
   * released and the tracks kept where they are, for `play` to go on from.
   */
  stop(now = true): void {
    this.playing = false
    for (const channel of this.channels) {
      if (channel.phase === Phase.Off) continue
      if (now) channel.kill()
      else channel.release()
    }
    if (now) this.tracks = []
  }

  /** Whether every track has ended and every channel fallen silent. */
  get finished(): boolean {
    return (
      this.tracks.every((track) => track.ended) &&
      this.channels.every((channel) => channel.phase === Phase.Off)
    )
  }

  /** One of the driver's 192 ticks a second: the channels, then the sequence as the tempo allows. */
  tick(): void {
    for (const channel of this.channels) channel.tick()
    if (!this.playing) return
    while (this.tempoCount > 240) {
      this.tempoCount -= 240
      this.sequenceTick()
    }
    this.tempoCount += this.tempo * this.tempoRate
  }

  private sequenceTick(): void {
    this.ticks++
    // Note lengths count sequence ticks; a note whose time is up is released.
    for (const channel of this.channels) {
      if (channel.phase > Phase.Start && channel.phase < Phase.Release && channel.length > 0) {
        if (--channel.length === 0) channel.release()
      }
      if (channel.manualSweep && channel.sweepCount < channel.sweepLength) channel.sweepCount++
    }
    for (const track of this.tracks) this.runTrack(track)
  }

  private runTrack(track: Track): void {
    if (track.ended) return
    if (track.wait > 0) {
      track.wait--
      if (track.wait > 0) return
    }
    const c = (this.song as Song).commands
    let guard = 0
    while (track.wait === 0 && !track.ended) {
      if (++guard > 100000) {
        track.ended = true
        break
      }
      if (track.pos >= c.length) {
        track.ended = true
        break
      }
      const cmd = c[track.pos++] as number
      if (cmd < 0x80) {
        const key = cmd + track.transpose
        const velocity = c[track.pos++] as number
        const length = this.readVl(track)
        if (track.noteWait) track.wait = length
        if (!track.conditional) {
          track.conditional = true
          continue
        }
        if (track.tie) this.tieOn(track, key, velocity)
        else this.noteOn(track, key, velocity, length)
        continue
      }
      // A skipped conditional command still consumes its arguments.
      const skip = !track.conditional
      track.conditional = true
      switch (cmd) {
        case CMD.Rest: {
          const v = this.readVl(track)
          if (!skip) track.wait = v
          break
        }
        case CMD.Patch: {
          const v = this.readVl(track)
          if (!skip) track.patch = v
          break
        }
        case CMD.OpenTrack:
          track.pos += 4
          break
        case CMD.Jump: {
          const to = this.read24(track)
          if (!skip) track.pos = to
          break
        }
        case CMD.Call: {
          const to = this.read24(track)
          if (!skip && track.stack.length < STACK) {
            track.stack.push(track.pos)
            track.loops.push(0)
            track.pos = to
          }
          break
        }
        case CMD.Return:
          if (!skip && track.stack.length > 0) {
            track.pos = track.stack.pop() as number
            track.loops.pop()
          }
          break
        case CMD.LoopStart: {
          const count = this.read8(track)
          if (!skip && track.stack.length < STACK) {
            track.loops.push(count)
            track.stack.push(track.pos)
          }
          break
        }
        case CMD.LoopEnd:
          if (!skip && track.stack.length > 0) {
            const top = track.loops.length - 1
            const left = track.loops[top] as number
            if (left === 0) {
              // Forever.
              track.pos = track.stack[top] as number
            } else if (left === 1) {
              track.stack.pop()
              track.loops.pop()
            } else {
              track.loops[top] = left - 1
              track.pos = track.stack[top] as number
            }
          }
          break
        case CMD.Pan: {
          const v = this.read8(track) - 64
          if (!skip) {
            track.pan = v
            this.updateTrack(track, 'pan')
          }
          break
        }
        case CMD.Volume: {
          const v = this.read8(track)
          if (!skip) {
            track.volume = v
            this.updateTrack(track, 'volume')
          }
          break
        }
        case CMD.MasterVolume: {
          const v = this.read8(track)
          if (!skip) {
            this.masterLoudness = loudness(v)
            for (const t of this.tracks) this.updateTrack(t, 'volume')
          }
          break
        }
        case CMD.Expression: {
          const v = this.read8(track)
          if (!skip) {
            track.expression = v
            this.updateTrack(track, 'volume')
          }
          break
        }
        case CMD.Priority: {
          const v = c[track.pos++] as number
          if (!skip) track.priority = 64 + v
          break
        }
        case CMD.NoteWait: {
          const v = c[track.pos++] as number
          if (!skip) track.noteWait = v !== 0
          break
        }
        case CMD.Tie: {
          const v = c[track.pos++] as number
          if (!skip) {
            track.tie = v !== 0
            this.releaseTrack(track)
          }
          break
        }
        case CMD.Tempo: {
          const v = this.read16(track)
          if (!skip) this.tempo = v
          break
        }
        case CMD.End:
          if (!skip) track.ended = true
          break
        case CMD.Transpose: {
          const v = this.read8(track)
          if (!skip) track.transpose = (v << 24) >> 24
          break
        }
        case CMD.PitchBend: {
          const v = this.read8(track)
          if (!skip) {
            track.pitchBend = (v << 24) >> 24
            this.updateTrack(track, 'tune')
          }
          break
        }
        case CMD.PitchBendRange: {
          const v = c[track.pos++] as number
          if (!skip) {
            track.pitchBendRange = v
            this.updateTrack(track, 'tune')
          }
          break
        }
        case CMD.Attack: {
          const v = this.read8(track)
          if (!skip) track.attack = v
          break
        }
        case CMD.Decay: {
          const v = this.read8(track)
          if (!skip) track.decay = v
          break
        }
        case CMD.Sustain: {
          const v = this.read8(track)
          if (!skip) track.sustain = v
          break
        }
        case CMD.Release: {
          const v = this.read8(track)
          if (!skip) track.release = v
          break
        }
        case CMD.PortamentoKey: {
          const v = c[track.pos++] as number
          if (!skip) {
            track.portaKey = v + track.transpose
            track.portamento = true
          }
          break
        }
        case CMD.Portamento: {
          const v = c[track.pos++] as number
          if (!skip) track.portamento = v !== 0
          break
        }
        case CMD.PortamentoTime: {
          const v = this.read8(track)
          if (!skip) track.portaTime = v
          break
        }
        case CMD.SweepPitch: {
          const v = this.read16(track)
          if (!skip) track.sweepPitch = (v << 16) >> 16
          break
        }
        case CMD.ModDepth: {
          const v = this.read8(track)
          if (!skip) {
            track.modDepth = v
            this.updateTrack(track, 'mod')
          }
          break
        }
        case CMD.ModSpeed: {
          const v = this.read8(track)
          if (!skip) {
            track.modSpeed = v
            this.updateTrack(track, 'mod')
          }
          break
        }
        case CMD.ModType: {
          const v = c[track.pos++] as number
          if (!skip) {
            track.modType = v
            this.updateTrack(track, 'mod')
          }
          break
        }
        case CMD.ModRange: {
          const v = c[track.pos++] as number
          if (!skip) {
            track.modRange = v
            this.updateTrack(track, 'mod')
          }
          break
        }
        case CMD.ModDelay: {
          const v = this.read16(track)
          if (!skip) {
            track.modDelay = v
            this.updateTrack(track, 'mod')
          }
          break
        }
        case CMD.Random: {
          // The next command's last argument is a random value in a range.
          const min = (this.read16(track) << 16) >> 16
          const max = (this.read16(track) << 16) >> 16
          const span = max - min
          track.override = span === 0 ? min : (this.random.next() % (span + 1)) + min
          track.overrideVariable = false
          break
        }
        case CMD.Variable:
          // The next command's last argument is a variable's value.
          track.overrideVariable = true
          track.override = 0
          break
        case CMD.If:
          // The next command runs only if the last comparison held.
          track.conditional = this.conditionalFlag
          break
        case CMD.PrintVariable:
          track.pos += 1
          break
        case CMD.AllocateTracks:
          track.pos += 2
          break
        default:
          if (cmd >= 0xb0 && cmd <= 0xbd) {
            const variable = c[track.pos++] as number
            const value = (this.read16(track) << 16) >> 16
            if (!skip) this.variableOp(cmd, variable, value)
          } else {
            // Unknown: the stream cannot be followed further.
            track.ended = true
          }
      }
    }
  }

  private conditionalFlag = true

  private variableOp(cmd: number, variable: number, value: number): void {
    const v = this.variables
    const i = variable & 15
    const x = v[i] as number
    switch (cmd) {
      case 0xb0:
        v[i] = value
        break
      case 0xb1:
        v[i] = x + value
        break
      case 0xb2:
        v[i] = x - value
        break
      case 0xb3:
        v[i] = x * value
        break
      case 0xb4:
        if (value !== 0) v[i] = Math.trunc(x / value)
        break
      case 0xb5:
        v[i] = value < 0 ? x >> -value : x << value
        break
      case 0xb6:
        v[i] = value < 0 ? -(this.random.next() % (-value + 1)) : this.random.next() % (value + 1)
        break
      case 0xb8:
        this.conditionalFlag = x === value
        break
      case 0xb9:
        this.conditionalFlag = x >= value
        break
      case 0xba:
        this.conditionalFlag = x > value
        break
      case 0xbb:
        this.conditionalFlag = x <= value
        break
      case 0xbc:
        this.conditionalFlag = x < value
        break
      case 0xbd:
        this.conditionalFlag = x !== value
        break
    }
  }

  // --- reading arguments, with a prefixed override taking the place of the last ---

  private overridden(track: Track): number | undefined {
    if (track.override === undefined) return undefined
    const value = track.overrideVariable
      ? (this.variables[(this.song as Song).commands[track.pos++] as number & 15] as number)
      : track.override
    track.override = undefined
    track.overrideVariable = false
    return value
  }

  private read8(track: Track): number {
    const o = this.overridden(track)
    if (o !== undefined) return o & 0xff
    return (this.song as Song).commands[track.pos++] as number
  }

  private read16(track: Track): number {
    const o = this.overridden(track)
    if (o !== undefined) return o & 0xffff
    const c = (this.song as Song).commands
    const v = (c[track.pos] as number) | ((c[track.pos + 1] as number) << 8)
    track.pos += 2
    return v
  }

  private read24(track: Track): number {
    const c = (this.song as Song).commands
    const v =
      (c[track.pos] as number) |
      ((c[track.pos + 1] as number) << 8) |
      ((c[track.pos + 2] as number) << 16)
    track.pos += 3
    return v
  }

  private readVl(track: Track): number {
    const o = this.overridden(track)
    if (o !== undefined) return o
    const c = (this.song as Song).commands
    let x = 0
    for (;;) {
      const byte = c[track.pos++] as number
      x = (x << 7) | (byte & 0x7f)
      if (!(byte & 0x80)) break
      if (track.pos >= c.length) break
    }
    return x
  }

  // --- notes ---

  private allocate(type: ChannelTypeValue, priority: number): Channel | undefined {
    const order =
      type === ChannelType.Pcm ? PCM_ORDER : type === ChannelType.Psg ? PSG_ORDER : NOISE_ORDER
    let chosen: Channel | undefined
    for (const index of order) {
      const channel = this.channels[index] as Channel
      if (chosen && channel.priority >= chosen.priority) {
        if (channel.priority !== chosen.priority) continue
        if (chosen.volume <= channel.volume) continue
      }
      chosen = channel
    }
    if (!chosen || priority < chosen.priority) return undefined
    return chosen
  }

  private noteOn(track: Track, key: number, velocity: number, length: number): Channel | undefined {
    const song = this.song as Song
    const instrument = song.bank.instruments[track.patch]
    if (!instrument) return undefined
    const note = noteFor(instrument, key)
    if (!note) return undefined
    const type: ChannelTypeValue =
      note.source === 'psg'
        ? ChannelType.Psg
        : note.source === 'noise'
          ? ChannelType.Noise
          : ChannelType.Pcm
    const channel = this.allocate(type, track.priority)
    if (!channel) return undefined
    channel.kill()
    channel.type = type
    if (type === ChannelType.Pcm) {
      const wave = song.archives[note.archive]?.[note.wave]
      if (!wave) return undefined
      channel.wave = wave
      channel.baseTimer = wave.timer
      channel.baseKey = note.baseNote
    } else {
      channel.wave = undefined
      channel.duty = note.wave & 7
      // A4, 440 Hz, as the driver tunes PSG: eight samples a cycle.
      channel.baseTimer = Math.round(16756991 / (440 * 8))
      channel.baseKey = 69
    }
    channel.start()
    channel.track = track.index
    channel.priority = track.priority
    channel.key = key
    channel.velocity = loudness(velocity)
    channel.pan = note.pan - 64
    channel.length = length
    channel.envelope(
      track.attack === 0xff ? note.attack : track.attack,
      track.decay === 0xff ? note.decay : track.decay,
      track.sustain === 0xff ? note.sustain : track.sustain,
      track.release === 0xff ? note.release : track.release,
    )
    this.applyTrack(channel, track)
    this.applyPortamento(channel, track)
    track.portaKey = key
    return channel
  }

  private tieOn(track: Track, key: number, velocity: number): void {
    const held = this.channels.find(
      (c) => c.phase > Phase.Off && c.track === track.index && c.phase !== Phase.Release,
    )
    if (!held) {
      this.noteOn(track, key, velocity, -1)
      return
    }
    held.priority = track.priority
    held.key = key
    held.velocity = loudness(velocity)
    this.applyTrack(held, track)
    this.applyPortamento(held, track)
    track.portaKey = key
  }

  private applyTrack(channel: Channel, track: Track): void {
    let vol =
      this.masterLoudness + this.userLoudness + loudness(track.volume) + loudness(track.expression)
    if (vol < -AMPL_K) vol = -AMPL_K
    channel.trackLoudness = vol
    channel.trackPan = track.pan
    channel.tune =
      (channel.key - channel.baseKey) * 64 + ((track.pitchBend * track.pitchBendRange) >> 1)
    channel.modType = track.modType
    channel.modSpeed = track.modSpeed
    channel.modDepth = track.modDepth
    channel.modRange = track.modRange
    channel.modDelay = track.modDelay
  }

  private applyPortamento(channel: Channel, track: Track): void {
    channel.manualSweep = false
    channel.sweepPitch = track.sweepPitch
    channel.sweepCount = 0
    if (!track.portamento) {
      channel.sweepLength = 0
      return
    }
    channel.sweepPitch += (track.portaKey - channel.key) * 64
    if (track.portaTime === 0) {
      channel.sweepLength = channel.length
      channel.manualSweep = true
    } else {
      const squared = track.portaTime * track.portaTime
      channel.sweepLength = (Math.abs(channel.sweepPitch) * squared) >> 11
    }
  }

  private updateTrack(track: Track, what: 'volume' | 'pan' | 'tune' | 'mod'): void {
    for (const channel of this.channels) {
      if (channel.track !== track.index || channel.phase === Phase.Off) continue
      if (what === 'pan') channel.trackPan = track.pan
      else if (what === 'volume') {
        let vol =
          this.masterLoudness +
          this.userLoudness +
          loudness(track.volume) +
          loudness(track.expression)
        if (vol < -AMPL_K) vol = -AMPL_K
        channel.trackLoudness = vol
      } else if (what === 'tune') {
        channel.tune =
          (channel.key - channel.baseKey) * 64 + ((track.pitchBend * track.pitchBendRange) >> 1)
      } else {
        channel.modType = track.modType
        channel.modSpeed = track.modSpeed
        channel.modDepth = track.modDepth
        channel.modRange = track.modRange
        channel.modDelay = track.modDelay
      }
    }
  }

  private releaseTrack(track: Track): void {
    for (const channel of this.channels) {
      if (
        channel.track === track.index &&
        channel.phase > Phase.Off &&
        channel.phase !== Phase.Release
      ) {
        channel.release()
      }
    }
  }
}

/** A note definition's kind of channel — exported for tests. */
export function channelTypeOf(note: NoteDefinition): ChannelTypeValue {
  return note.source === 'psg'
    ? ChannelType.Psg
    : note.source === 'noise'
      ? ChannelType.Noise
      : ChannelType.Pcm
}
