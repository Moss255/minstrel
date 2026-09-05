/** Thrown for every malformed-input condition in this package. */
export class GpcError extends Error {
  override readonly name = 'GpcError'

  /** Byte offset in the archive where the problem was detected, if known. */
  readonly offset: number | undefined

  constructor(message: string, offset?: number) {
    super(offset === undefined ? message : `${message} (at 0x${offset.toString(16)})`)
    this.offset = offset
  }
}
