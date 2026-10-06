import { Pressable, Text, View } from 'react-native';
import { Icon } from '../icons';
import { useTheme } from '../theme';

const AVATAR_COLOURS = ['bg-[#6B4CFF]', 'bg-[#14B8A6]', 'bg-[#F472B6]', 'bg-[#F59E0B]', 'bg-[#0EA5E9]', 'bg-[#22C55E]'] as const;

/** A stable colour per name, so an entry keeps the same avatar everywhere. */
function avatarColour(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
}

type Props = {
  name: string;
  subtitle?: string;
  onPress: () => void;
  /** Copies the entry's password; omit when it has none. */
  onCopy?: () => void;
};

/** One entry in the vault list: initial, name and username, with copy-password on the row itself. */
export function EntryRow({ name, subtitle, onPress, onCopy }: Props) {
  const { color } = useTheme();
  return (
    <View className="min-h-[72px] flex-row items-center gap-3 rounded-card border border-surface-edge bg-surface pl-3.5 pr-2.5">
      <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityHint="Opens the entry" onPress={onPress} className="flex-1 flex-row items-center gap-3 py-3">
        <View className={`size-11 items-center justify-center rounded-row ${avatarColour(name)}`}>
          <Text className="font-heading text-title text-white">{name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="font-heading text-body text-foreground">
            {name}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} className="font-body text-label text-muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {onCopy && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Copy password for ${name}`} onPress={onCopy} className="size-11 items-center justify-center rounded-full bg-soft">
          <Icon name="copy" color={color.accent} size={18} />
        </Pressable>
      )}
    </View>
  );
}
