import { REVEAL_MS } from '@rahasya/config';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme';

const MASK = '••••••••••••';
const COPIED_MS = 1500;

function IconButton({ label, icon, onPress, active = false }: { label: string; icon: IconName; onPress: () => void; active?: boolean }) {
  const { color } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className={`size-11 items-center justify-center rounded-full ${active ? 'bg-accent' : 'bg-soft'}`}>
      <Icon name={icon} color={active ? color.onAccent : color.accent} />
    </Pressable>
  );
}

/**
 * A hidden value (password, PIN, card number). Masked as 12 dots whatever its length; the eye shows it for 20
 * seconds, and copy works without ever showing it.
 */
export function SecretField({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const hide = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(hide);
  }, [revealed]);

  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(reset);
  }, [copied]);

  function copy() {
    onCopy(value);
    setCopied(true);
  }

  return (
    <View className="gap-1.5">
      <Text className="px-1.5 font-body text-label text-muted">{label}</Text>
      <View className="min-h-14 flex-row items-center gap-1 rounded-input border border-surface-edge bg-surface pl-5 pr-1.5">
        <Text
          selectable={revealed}
          accessibilityLabel={revealed ? undefined : `${label}, hidden`}
          className={`flex-1 py-3 font-mono text-body text-foreground ${revealed ? '' : 'tracking-[3px]'}`}
        >
          {revealed ? value : MASK}
        </Text>
        <IconButton label={revealed ? `Hide ${label}` : `Show ${label}`} icon={revealed ? 'eyeOff' : 'eye'} onPress={() => setRevealed((r) => !r)} active={revealed} />
        <IconButton label={copied ? 'Copied' : `Copy ${label}`} icon={copied ? 'check' : 'copy'} onPress={copy} active={copied} />
      </View>
    </View>
  );
}
