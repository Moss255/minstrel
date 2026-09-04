import { describe, expect, it } from 'vitest'
import { crc16, NINTENDO_LOGO_CRC } from '../src/crc16.ts'

const check = new TextEncoder().encode('123456789')

describe('crc16', () => {
  it('matches the published CRC-16/MODBUS check value', () => {
    // CRC-16/MODBUS: poly 0x8005 reflected (0xA001), init 0xFFFF, no final XOR.
    // Its check value over "123456789" is 0x4B37 (CRC RevEng catalogue).
    expect(crc16(check)).toBe(0x4b37)
  })

  it('matches the published CRC-16/ARC check value when started from zero', () => {
    // Same polynomial with init 0x0000 is CRC-16/ARC, check value 0xBB3D.
    expect(crc16(check, 0x0000)).toBe(0xbb3d)
  })

  it('is empty-input safe', () => {
    expect(crc16(new Uint8Array(0))).toBe(0xffff)
  })

  it('exposes the fixed Nintendo logo checksum', () => {
    expect(NINTENDO_LOGO_CRC).toBe(0xcf56)
  })
})
