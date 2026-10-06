import '../global.css';
import { ThemeProvider } from '@rahasya/ui';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { session, useSession } from '@/features/session';
import { fonts } from '@/theme/fonts';
import { useApplyTheme } from '@/theme/use-theme';

SplashScreen.preventAutoHideAsync();
session.getState().load();

/**
 * Wraps every screen: holds the splash until fonts load and the device's saved account (if any) has been read,
 * then applies the user's theme everywhere.
 */
export default function RootLayout() {
  const theme = useApplyTheme();
  const [fontsReady] = useFonts(fonts);
  const sessionReady = useSession((s) => s.status) !== 'loading';
  const ready = fontsReady && sessionReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider theme={theme}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.background } }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
