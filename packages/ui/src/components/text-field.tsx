import { useState } from 'react';
import { Pressable, Text, TextInput, type TextInputProps, View } from 'react-native';
import { Icon } from '../icons';
import { useTheme } from '../theme';

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'secureTextEntry'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Masks the value, with an eye button to show it while the user checks what they typed. */
  secret?: boolean;
  error?: string;
  hint?: string;
};

export function TextField({ label, value, onChangeText, secret = false, error, hint, ...input }: Props) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  const masked = secret && !revealed;
  return (
    <View className="gap-1.5">
      <Text className="px-1.5 font-body text-label text-muted">{label}</Text>
      <View className={`min-h-14 flex-row items-center rounded-input border bg-surface pl-5 pr-1.5 ${error ? 'border-danger' : 'border-surface-edge'}`}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={masked}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={theme.color.muted}
          className={`min-h-12 flex-1 text-body text-foreground ${secret && !masked ? 'font-mono' : 'font-body'}`}
          {...input}
        />
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((r) => !r)}
            className="size-11 items-center justify-center rounded-full"
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} color={theme.color.accent} />
          </Pressable>
        )}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="px-1.5 font-body text-label text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="px-1.5 font-body text-label text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
