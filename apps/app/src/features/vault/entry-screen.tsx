import { Button, Icon, Screen, SecretField, useTheme } from '@rahasya/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useVault } from '@/features/vault';
import { copySecret } from '@/lib/clipboard';
import { type Field, isHidden, TEMPLATES } from './entry';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
const day = (iso: string) => new Date(iso).toLocaleDateString();

function VisibleField({ field }: { field: Field }) {
  const { color } = useTheme();
  return (
    <View className="gap-1.5">
      <Text className="px-1.5 font-body text-label text-muted">{field.label}</Text>
      <View className="min-h-14 flex-row items-center gap-1 rounded-input border border-surface-edge bg-surface pl-5 pr-1.5">
        <Text selectable className="flex-1 py-3 font-body text-body text-foreground">
          {field.value}
        </Text>
        {field.kind === 'link' && (
          <Pressable accessibilityRole="link" accessibilityLabel={`Open ${field.label}`} onPress={() => Linking.openURL(/^https?:\/\//.test(field.value) ? field.value : `https://${field.value}`)} className="size-11 items-center justify-center rounded-full bg-soft">
            <Icon name="open" color={color.accent} size={18} />
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${field.label}`} onPress={() => copySecret(field.value)} className="size-11 items-center justify-center rounded-full bg-soft">
          <Icon name="copy" color={color.accent} size={18} />
        </Pressable>
      </View>
    </View>
  );
}

/** One entry: visible fields in full, hidden ones masked with show and copy, earlier passwords, and Trash. */
export function EntryScreen() {
  const { color } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useVault((s) => s.entries[id]);
  const save = useVault((s) => s.save);
  const trash = useVault((s) => s.trash);
  const [error, setError] = useState<string>();

  if (!entry) {
    return (
      <Screen narrow>
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="font-heading text-title text-foreground">This entry isn't in your vault</Text>
          <Button title="Back to vault" variant="secondary" onPress={goBack} />
        </View>
      </Screen>
    );
  }

  const { data } = entry;
  const run = (action: () => Promise<unknown>) => action().catch((e: Error) => setError(e.message));
  const toggleFavourite = () => run(() => save({ id: entry.id, data: { ...data, favourite: !data.favourite }, groupId: entry.groupId, labelIds: entry.labelIds }));
  const moveToTrash = () => run(async () => {
    await trash(entry.id);
    goBack();
  });

  return (
    <Screen scroll narrow>
      <View className="gap-5">
        <View className="flex-row items-center justify-between">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} className="size-11 items-center justify-center rounded-full bg-soft">
            <Icon name="back" color={color.accent} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={data.favourite ? 'Remove from favourites' : 'Add to favourites'}
            onPress={toggleFavourite}
            className={`size-11 items-center justify-center rounded-full ${data.favourite ? 'bg-accent' : 'bg-soft'}`}
          >
            <Icon name="star" color={data.favourite ? color.onAccent : color.accent} />
          </Pressable>
        </View>

        <View className="gap-1">
          <Text accessibilityRole="header" className="font-heading text-page text-foreground">
            {data.name}
          </Text>
          <Text className="font-body text-label text-muted">{TEMPLATES[data.template].label}</Text>
        </View>

        {data.fields.map((field) =>
          isHidden(field.kind) ? <SecretField key={field.id} label={field.label} value={field.value} onCopy={copySecret} /> : <VisibleField key={field.id} field={field} />,
        )}

        {data.notes ? (
          <View className="gap-1.5">
            <Text className="px-1.5 font-body text-label text-muted">Notes</Text>
            <Text selectable className="rounded-card border border-surface-edge bg-surface p-4 font-body text-body text-foreground">
              {data.notes}
            </Text>
          </View>
        ) : null}

        {data.passwordHistory.length > 0 && (
          <View className="gap-3">
            <Text className="font-heading text-body text-foreground">Earlier passwords</Text>
            {data.passwordHistory.map((past) => (
              <SecretField key={`${past.fieldId}-${past.changedAt}`} label={`${past.label}, changed ${day(past.changedAt)}`} value={past.value} onCopy={copySecret} />
            ))}
          </View>
        )}

        <Text className="font-body text-label text-muted">
          Created {day(entry.createdAt)} · Changed {day(entry.updatedAt)}
        </Text>
        {error && <Text className="font-body text-label text-danger">{error}</Text>}
        <Button title="Move to Trash" variant="secondary" onPress={moveToTrash} />
      </View>
    </Screen>
  );
}
