/**
 * CRC-32 (IEEE 802.3): reflected polynomial 0xEDB88320, initial value
 * 0xFFFFFFFF, final XOR 0xFFFFFFFF.
 *
 * GPC2 indexes its members by the CRC-32 of their filename. Implemented here
 * rather than pulled from a dependency because the project writes its own
 * binary primitives and this is fifteen lines.
 */

const TABLE = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = ((crc >>> 8) ^ (TABLE[(crc ^ (data[i] as number)) & 0xff] as number)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** CRC-32 of a byte-transparent string, as GPC2 hashes its filenames. */
export function crc32OfName(name: string): number {
  const bytes = new Uint8Array(name.length)
  for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i) & 0xff
  return crc32(bytes)
}
