import { Button, GlassOrb, Screen, TextField } from '@rahasya/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/features/session';
import { triesLeftMessage, waitMessage } from './messages';
import { UnlockFailed } from './unlock-failed';

/**
 * Opening a vault that is already on this device. Works offline: the master password opens the saved, wrapped
 * vault key locally. After too many wrong tries the button waits out a countdown.
 */
export function UnlockScreen() {
  const email = useSession((s) => s.email);
  const unlock = useSession((s) => s.unlock);
  const signOut = useSession((s) => s.signOut);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [working, setWorking] = useState(false);
  const waitMs = Math.max(0, waitUntil - now);

  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const tick = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= waitUntil) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [waitUntil]);

  async function submit() {
    setError(undefined);
    setWorking(true);
    try {
      await unlock(password);
      router.replace('/');
    } catch (e) {
      setPassword('');
      if (!(e instanceof UnlockFailed)) {
        setError((e as Error).message);
      } else if (e.retryAfterMs) {
        setNow(Date.now());
        setWaitUntil(Date.now() + e.retryAfterMs);
      } else {
        setError(triesLeftMessage(e.triesLeft));
      }
    } finally {
      setWorking(false);
    }
  }

  async function useAnotherAccount() {
    await signOut();
    router.replace('/welcome');
  }

  return (
    <Screen narrow>
      <View className="flex-1 items-center justify-center gap-2">
        <GlassOrb />
        <Text className="mt-4 font-body text-body text-muted">Welcome back</Text>
        <Text className="font-heading text-title text-foreground">{email}</Text>
      </View>
      <View className="gap-4">
        <TextField label="Master password" value={password} onChangeText={setPassword} secret autoComplete="current-password" onSubmitEditing={submit} />
        {(error || waitMs > 0) && (
          <Text accessibilityLiveRegion="polite" className="font-body text-label text-danger">
            {waitMs > 0 ? waitMessage(waitMs) : error}
          </Text>
        )}
        <Button title="Unlock" onPress={submit} loading={working} disabled={waitMs > 0 || !password} />
        <Button title="Sign out of this device" variant="link" onPress={useAnotherAccount} />
      </View>
    </Screen>
  );
}
