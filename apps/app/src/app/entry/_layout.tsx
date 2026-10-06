import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/features/session';
import { screenFor } from '@/features/session/entry';

/** Entry pages need an open vault; anyone else goes to sign in or unlock. */
export default function EntryLayout() {
  const target = screenFor(useSession((s) => s.status));
  if (target === null) return null;
  return target === '/' ? <Stack screenOptions={{ headerShown: false }} /> : <Redirect href={target} />;
}
