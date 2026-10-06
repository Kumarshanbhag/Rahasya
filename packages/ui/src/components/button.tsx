import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { gradientPoints, stops, useTheme } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  /** primary: the one main action on a screen; secondary: an alternative; link: a quiet text action. */
  variant?: 'primary' | 'secondary' | 'link';
  disabled?: boolean;
  /** Shows a spinner and blocks presses while the action runs. */
  loading?: boolean;
  accessibilityHint?: string;
};

const labelColour = { primary: 'text-on-accent', secondary: 'text-foreground', link: 'text-accent' } as const;

export function Button({ title, onPress, variant = 'primary', disabled = false, loading = false, accessibilityHint }: Props) {
  const theme = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={`min-h-14 overflow-hidden rounded-full ${variant === 'secondary' ? 'border border-surface-edge bg-soft' : ''} ${inactive ? 'opacity-50' : ''}`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {variant === 'primary' && <LinearGradient colors={stops(theme.color.accentGradient)} {...gradientPoints(theme.color.accentAngle)} style={StyleSheet.absoluteFill} />}
      <View className="min-h-14 flex-row items-center justify-center px-6">
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? theme.color.onAccent : theme.color.accent} />
        ) : (
          <Text className={`font-heading text-button ${labelColour[variant]}`}>{title}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({ pressed: { transform: [{ scale: 0.97 }] } });
