import { ApiError } from '@rahasya/api-client';
import { TOTP } from '@rahasya/config';
import { Button, Screen, TextField } from '@rahasya/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/features/session';
import { triesLeftMessage, waitMessage } from './messages';

/**
 * Signing in on a device that has no account yet. The master password is turned into keys here; the server only
 * sees the derived auth key. Accounts with two-step sign-in are asked for their 6-digit code after the password.
 */
export function SignInScreen() {
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  async function submit() {
    setError(undefined);
    setWorking(true);
    try {
      await signIn(email, password, needsCode ? code : undefined);
      router.replace('/');
    } catch (e) {
      setWorking(false);
      if (!(e instanceof ApiError)) return setError((e as Error).message);
      if (e.twoFactorRequired && !needsCode) return setNeedsCode(true);
      if (e.retryAfterMs) return setError(waitMessage(e.retryAfterMs));
      if (e.triesLeft !== undefined && !e.twoFactorRequired) return setError(triesLeftMessage(e.triesLeft));
      setError(e.message);
    }
  }

  return (
    <Screen scroll narrow>
      <View className="gap-6">
        <Text accessibilityRole="header" className="font-heading text-page text-foreground">
          Sign in
        </Text>
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <TextField label="Master password" value={password} onChangeText={setPassword} secret autoComplete="current-password" textContentType="password" />
        {needsCode && (
          <TextField
            label="Two-step code"
            value={code}
            onChangeText={setCode}
            hint="The 6-digit code from your authenticator app"
            keyboardType="number-pad"
            maxLength={TOTP.digits}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
          />
        )}
        {error && (
          <Text accessibilityLiveRegion="polite" className="font-body text-label text-danger">
            {error}
          </Text>
        )}
        <View className="gap-3">
          <Button title="Sign in" onPress={submit} loading={working} />
          <Button title="Create an account instead" variant="link" onPress={() => router.replace('/signup')} />
        </View>
      </View>
    </Screen>
  );
}
