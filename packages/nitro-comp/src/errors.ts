/** Thrown for every malformed-input condition in this package. */
export class NitroCompError extends Error {
  override readonly name = 'NitroCompError'

  /** Byte offset in the compressed stream where the problem was detected. */
  readonly offset: number | undefined

  constructor(message: string, offset?: number) {
    super(offset === undefined ? message : `${message} (at 0x${offset.toString(16)})`)
    this.offset = offset
  }
}
