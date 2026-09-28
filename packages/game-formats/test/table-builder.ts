/**
 * A data table built in code, for tests — see `readDataTable`. Never taken
 * from a cartridge: tagged records of integers (`n`), floats (`f`) and strings
 * (`s`), the strings into the table's own section by their byte offset.
 */
export type Value = { readonly n: number } | { readonly f: number } | { readonly s: string }

export function build(records: { tag: number; values: Value[] }[]): Uint8Array {
  const strings: string[] = []
  const offsets = new Map<string, number>()
  let at = 0
  const offsetOf = (text: string) => {
    const known = offsets.get(text)
    if (known !== undefined) return known
    offsets.set(text, at)
    strings.push(text)
    at += text.length + 1
    return offsets.get(text) as number
  }
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.values.length
    const typeBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    const bits = new Uint8Array(header - 3)
    record.values.forEach((v, i) => {
      const kind = 'n' in v ? 1 : 'f' in v ? 2 : 0
      bits[i >> 2] = (bits[i >> 2] as number) | (kind << ((i & 3) * 2))
    })
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count, ...bits)
    for (const v of record.values) {
      if ('n' in v) push32(v.n)
      else if ('f' in v) {
        const view = new DataView(new ArrayBuffer(4))
        view.setFloat32(0, v.f, true)
        push32(view.getUint32(0, true))
      } else push32(offsetOf(v.s))
    }
  }
  const bytes = strings.flatMap((s) => [...s].map((c) => c.charCodeAt(0)).concat(0))
  const start = 16 + body.length
  const out = new Uint8Array(start + bytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(4, start, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, strings.length, true)
  out.set(body, 16)
  out.set(bytes, start)
  return out
}
