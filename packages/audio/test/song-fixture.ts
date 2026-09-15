import type { DecodedWave, Sbnk } from '@minstrel/nitro-snd'
import type { Song } from '../src/sequencer.ts'

/**
 * A song built in code: one instrument playing a sine wave, and whatever
 * commands a test writes. No cartridge bytes.
 */

/** A looping sine of `cycle` samples at 32768 Hz — a note whose pitch is known. */
export function sineWave(cycle: number, cycles = 8): DecodedWave {
  const samples = new Int16Array(cycle * cycles)
  for (let i = 0; i < samples.length; i++)
    samples[i] = Math.round(Math.sin((2 * Math.PI * i) / cycle) * 16000)
  return {
    samples,
    loopStart: 0,
    loops: true,
    sampleRate: 32768,
    timer: Math.round(16756991 / 32768),
  }
}

export function songWith(
  commands: number[],
  options: { volume?: number; baseNote?: number; attack?: number; release?: number } = {},
): Song {
  const bank: Sbnk = {
    instruments: [
      {
        kind: 'note',
        note: {
          source: 'pcm',
          wave: 0,
          archive: 0,
          baseNote: options.baseNote ?? 69,
          attack: options.attack ?? 127,
          decay: 127,
          sustain: 127,
          release: options.release ?? 127,
          pan: 64,
        },
      },
      {
        kind: 'note',
        note: {
          source: 'psg',
          wave: 4,
          archive: 0,
          baseNote: 69,
          attack: 127,
          decay: 127,
          sustain: 127,
          release: 127,
          pan: 64,
        },
      },
    ],
  }
  // 440 Hz at 32768 Hz is a cycle of 74.47 samples; 64 gives 512 Hz at key 69.
  return {
    commands: Uint8Array.from(commands),
    bank,
    archives: [[sineWave(64)]],
    volume: options.volume ?? 127,
  }
}

/** A variable-length quantity, as the sequence writes one. */
export function vl(n: number): number[] {
  const out: number[] = []
  do {
    out.unshift(n & 0x7f)
    n >>= 7
  } while (n > 0)
  return out.map((b, i) => (i < out.length - 1 ? b | 0x80 : b))
}
