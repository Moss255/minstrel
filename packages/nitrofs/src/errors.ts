/**
 * Thrown for every malformed-input condition in this package.
 *
 * Parsers here never return partial or invented data: if a structure does not
 * validate, they throw. Callers that want tolerance can catch.
 */
export class NitroFsError extends Error {
  override readonly name = 'NitroFsError'

  /** Byte offset in the source image where the problem was detected, if known. */
  readonly offset: number | undefined

  constructor(message: string, offset?: number) {
    super(offset === undefined ? message : `${message} (at 0x${offset.toString(16)})`)
    this.offset = offset
  }
}
