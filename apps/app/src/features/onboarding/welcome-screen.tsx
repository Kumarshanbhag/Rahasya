import { Button, GlassOrb, Screen } from '@rahasya/ui';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

/** The first screen on a device with no account: what Rahasya is, and the two ways in. */
export function WelcomeScreen() {
  return (
    <Screen narrow>
      <View className="flex-1 items-center justify-center gap-4">
        <GlassOrb />
        <Text accessibilityRole="header" className="font-heading text-display text-foreground">
          Rahasya
        </Text>
        <Text className="text-center font-body text-body text-muted">Your secrets, safely yours.</Text>
      </View>
      <View className="gap-3">
        <Button title="Create account" onPress={() => router.push('/signup')} />
        <Button title="Sign in" variant="secondary" onPress={() => router.push('/signin')} />
      </View>
    </Screen>
  );
}
