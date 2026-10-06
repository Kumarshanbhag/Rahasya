import { Redirect } from 'expo-router';
import { useSession } from '@/features/session';
import { screenFor } from '@/features/session/entry';
import { VaultHome } from '@/features/vault/vault-home';

/** The vault. Anyone without an open vault is sent to welcome or unlock instead. */
export default function VaultRoute() {
  const target = screenFor(useSession((s) => s.status));
  if (target === null) return null;
  return target === '/' ? <VaultHome /> : <Redirect href={target} />;
}
