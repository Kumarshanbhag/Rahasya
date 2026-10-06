import { Button, Screen, StrengthMeter, TextField } from '@rahasya/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/features/session';
import { checkMasterPassword } from './master-password';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creating an account: the email, a master password that is checked for strength as it is typed, and a
 * confirmation. Keys are derived on the device, so this takes a moment; then the recovery kit is shown.
 */
export function SignUpScreen() {
  const signUp = useSession((s) => s.signUp);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string; form?: string }>({});
  const [working, setWorking] = useState(false);
  const strength = checkMasterPassword(password, email);

  async function submit() {
    const found = {
      email: EMAIL.test(email.trim()) ? undefined : 'Enter a valid email address',
      password: strength.problem,
      confirm: confirm === password ? undefined : "The passwords don't match",
    };
    setErrors(found);
    if (found.email || found.password || found.confirm) return;
    setWorking(true);
    try {
      await signUp(email, password);
      router.replace('/signup/recovery-kit');
    } catch (e) {
      setErrors({ form: (e as Error).message });
      setWorking(false);
    }
  }

  return (
    <Screen scroll narrow>
      <View className="gap-6">
        <View className="gap-2">
          <Text accessibilityRole="header" className="font-heading text-page text-foreground">
            Create your vault
          </Text>
          <Text className="font-body text-body text-muted">
            Your master password is the only key to your vault. Everything is encrypted on this device before it leaves.
          </Text>
        </View>

        <TextField label="Email" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <View className="gap-3">
          <TextField label="Master password" value={password} onChangeText={setPassword} error={errors.password} secret autoComplete="new-password" textContentType="newPassword" />
          {password.length > 0 && <StrengthMeter score={strength.score} />}
        </View>
        <TextField label="Confirm master password" value={confirm} onChangeText={setConfirm} error={errors.confirm} secret autoComplete="new-password" />

        <View className="rounded-card border border-warning bg-soft p-4">
          <Text className="font-body text-label text-foreground">
            No one can reset your master password, not even Rahasya. If you forget it, your vault can't be opened unless your
            organisation has set up emergency recovery.
          </Text>
        </View>

        {errors.form && (
          <Text accessibilityLiveRegion="polite" className="font-body text-label text-danger">
            {errors.form}
          </Text>
        )}

        <View className="gap-3">
          <Button title="Create account" onPress={submit} loading={working} accessibilityHint="Derives your keys on this device, which takes a moment" />
          {working && <Text className="text-center font-body text-label text-muted">Creating your keys on this device…</Text>}
          <Button title="I already have an account" variant="link" onPress={() => router.replace('/signin')} />
        </View>
      </View>
    </Screen>
  );
}
