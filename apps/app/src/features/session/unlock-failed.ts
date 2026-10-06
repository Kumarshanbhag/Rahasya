/**
 * A failed unlock: how many tries are left, or how long to wait after the last one. In its own file so screens
 * can recognise it without loading the crypto library.
 */
export class UnlockFailed extends Error {
  constructor(
    readonly triesLeft: number,
    readonly retryAfterMs?: number,
  ) {
    super(retryAfterMs ? 'Too many tries. Wait before trying again.' : 'Incorrect master password');
    this.name = 'UnlockFailed';
  }
}
