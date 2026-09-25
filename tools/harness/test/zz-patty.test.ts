import { readFileSync, writeFileSync } from 'node:fs'
import { readSystemStrings } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { decompressIfNeeded } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM
const OUT =
  '/tmp/claude-1000/-home-jack-Projects-minstral/5ac764b4-28ee-4ccf-8a5f-cb6445741337/scratchpad'

const WANT = [
  '/data/bin/menu/str_lui.gp2',
  '/data/bin/menu/str_cm.gp2',
  '/data/bin/menu/bm_lui.gp2',
]

describe.skipIf(!romPath)('patty', { timeout: 120_000 }, () => {
  it('dumps', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    for (const file of walkFiles(fs.root)) {
      if (!WANT.includes(file.path)) continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) {
        console.log(file.path, 'not gpc')
        continue
      }
      const archive = readGpc(bytes)
      console.log(file.path, archive.members.map((m) => m.name).join(' '))
      for (const member of archive.members) {
        const raw0 = decompressIfNeeded(archive.read(member))
        writeFileSync(`${OUT}/raw_${member.name}`, Buffer.from(raw0))
        if (!/_en\.nat$/.test(member.name)) continue
        const raw = decompressIfNeeded(archive.read(member))
        let text = ''
        try {
          const read = readSystemStrings(raw)
          for (const [id, s] of read) text += `${id}\t${JSON.stringify(s)}\n`
        } catch (e) {
          text = `ERR ${(e as Error).message}\nlen=${raw.length}\n`
          text += Buffer.from(raw.subarray(0, 256)).toString('hex')
        }
        writeFileSync(`${OUT}/${member.name}.txt`, text)
        console.log(member.name, raw.length, text.split('\n').length - 1)
      }
    }
  })
})
