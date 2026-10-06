import { useStore } from 'zustand';
import { api } from '@/lib/api';
import { deviceInfo } from '@/lib/device-info';
import { deviceStore } from './device-store';
import { createSession } from './session';

export { UnlockFailed, type SessionStatus } from './session';

/** The one session for the running app. */
export const session = createSession({ api, device: deviceStore, deviceInfo });

export function useSession<T>(select: (state: ReturnType<typeof session.getState>) => T) {
  return useStore(session, select);
}
