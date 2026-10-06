import type { SessionStatus } from './session';

/** Where someone belongs for their session state; null while it is still being read from the device. */
export function screenFor(status: SessionStatus) {
  return ({ loading: null, 'signed-out': '/welcome', locked: '/unlock', unlocked: '/' } as const)[status];
}
