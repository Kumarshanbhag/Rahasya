import type { Device } from '@rahasya/api-client';
import { Platform } from 'react-native';

function browserName() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

/** How this device appears in Settings → Devices, where a lost one can be signed out. */
export const deviceInfo: Device =
  Platform.OS === 'web' ? { name: `${browserName()} on the web`, platform: 'web' } : { name: `Android ${Platform.Version}`, platform: 'android' };
