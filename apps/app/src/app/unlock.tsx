import { Redirect } from 'expo-router';
import { useSession } from '@/features/session';
import { UnlockScreen } from '@/features/session/unlock-screen';

export default function UnlockRoute() {
  const status = useSession((s) => s.status);
  return status === 'locked' ? <UnlockScreen /> : <Redirect href="/" />;
}
