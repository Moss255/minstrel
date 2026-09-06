/** Thrown when a value cannot be represented, or a float reaches gameplay. */
export class FixedError extends Error {
  override readonly name = 'FixedError'
}
