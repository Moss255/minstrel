/**
 * CRC-16 as used by the Nintendo DS cartridge header.
 *
 * Reflected algorithm, polynomial 0xA001 (reversed 0x8005), initial value
 * 0xFFFF, no final XOR. Documented in GBATEK, "DS Cartridge Header".
 *
 * Confirmed against a real cartridge: the Nintendo logo region [0x0C0,0x15C)
 * of every retail ROM must check to the fixed constant 0xCF56, which this
 * implementation reproduces. See `test/crc16.test.ts`.
 */
export function crc16(data: Uint8Array, initial = 0xffff): number {
  let crc = initial & 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] as number
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
    }
  }
  return crc & 0xffff
}

/** The value {@link crc16} must produce over the header's Nintendo logo region. */
export const NINTENDO_LOGO_CRC = 0xcf56
