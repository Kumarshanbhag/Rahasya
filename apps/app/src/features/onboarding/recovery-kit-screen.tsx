import { Button, Screen } from '@rahasya/ui';
import { router } from 'expo-router';
import { Platform, Share, Text, View } from 'react-native';
import { useSession } from '@/features/session';
import { API_URL } from '@/lib/api';

const TIPS = [
  'Keep this kit somewhere safe and offline, such as printed in a drawer at home.',
  'It contains no password: your master password lives only in your head.',
  'Never type your master password into an email, a chat or any site other than Rahasya.',
  'Lost this device? Sign in on another one and sign this one out under Settings → Devices.',
];

/**
 * Shown once, right after the account is created: the details needed to find the account again, to save or
 * print before going on to the vault.
 */
export function RecoveryKitScreen() {
  const email = useSession((s) => s.email) ?? '';
  const details = [
    ['Email', email],
    ['Server', API_URL],
    ['Created', new Date().toLocaleDateString()],
  ] as const;

  function save() {
    if (Platform.OS === 'web') return window.print();
    const message = ['Rahasya recovery kit', ...details.map(([k, v]) => `${k}: ${v}`), '', ...TIPS.map((t) => `• ${t}`)].join('\n');
    return Share.share({ title: 'Rahasya recovery kit', message });
  }

  return (
    <Screen scroll narrow>
      <View className="flex-1 gap-6">
        <View className="gap-2">
          <Text accessibilityRole="header" className="font-heading text-page text-foreground">
            Save your recovery kit
          </Text>
          <Text className="font-body text-body text-muted">Your vault is ready. Keep these details so you can always find your account again.</Text>
        </View>

        <View className="gap-3 rounded-card border border-surface-edge bg-surface p-5">
          {details.map(([label, value]) => (
            <View key={label} className="gap-0.5">
              <Text className="font-body text-label text-muted">{label}</Text>
              <Text selectable className="font-mono text-body text-foreground">
                {value}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-2">
          {TIPS.map((tip) => (
            <Text key={tip} className="font-body text-label text-foreground">
              • {tip}
            </Text>
          ))}
        </View>
      </View>
      <View className="mt-6 gap-3">
        <Button title="Save or print kit" variant="secondary" onPress={save} />
        <Button title="Continue to my vault" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
