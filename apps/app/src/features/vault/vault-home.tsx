import { CLIPBOARD_CLEAR_MS } from '@rahasya/config';
import { Button, EntryRow, Icon, Screen, useTheme } from '@rahasya/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useSession } from '@/features/session';
import { useVault } from '@/features/vault';
import { copySecret } from '@/lib/clipboard';
import { mainSecret, subtitle } from './entry';
import { SORT_LABELS, type SortOrder, visibleEntries } from './vault-list';

const SORT_ORDER: SortOrder[] = ['name-asc', 'name-desc', 'newest', 'oldest'];
const NOTICE_MS = 3000;

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function HeaderButton({ label, icon, onPress }: { label: string; icon: 'plus' | 'lock'; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="size-11 items-center justify-center rounded-full border border-surface-edge bg-soft">
      <Icon name={icon} color={color.accent} />
    </Pressable>
  );
}

/**
 * The open vault: every entry, searchable and sorted, with each password one tap away from the list. Pulling
 * down (or opening the screen) fetches changes made on other devices.
 */
export function VaultHome() {
  const { color } = useTheme();
  const email = useSession((s) => s.email);
  const lock = useSession((s) => s.lock);
  const entries = useVault((s) => s.entries);
  const sync = useVault((s) => s.sync);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOrder>('name-asc');
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const list = useMemo(() => visibleEntries(entries, { search, sort }), [entries, search, sort]);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      await sync();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    } finally {
      setSyncing(false);
    }
  }, [sync]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const hide = setTimeout(() => setNotice(undefined), NOTICE_MS);
    return () => clearTimeout(hide);
  }, [notice]);

  function copy(value: string) {
    copySecret(value);
    setNotice({ text: `Password copied. Clears in ${CLIPBOARD_CLEAR_MS / 1000} s.` });
  }

  function lockNow() {
    lock();
    router.replace('/unlock');
  }

  const isEmpty = Object.values(entries).every((e) => e.deletedAt);

  return (
    <Screen>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-body text-label text-muted">{greeting(new Date().getHours())}</Text>
          <Text numberOfLines={1} className="font-heading text-title text-foreground">
            {email}
          </Text>
        </View>
        <HeaderButton label="Add entry" icon="plus" onPress={() => router.push('/entry/new')} />
        <HeaderButton label="Lock" icon="lock" onPress={lockNow} />
      </View>

      {isEmpty ? (
        <View className="flex-1 items-center justify-center gap-3">
          <Text className="font-heading text-title text-foreground">Your vault is empty</Text>
          <Text className="font-body text-body text-muted">Everything you save is encrypted on this device first.</Text>
          <View className="mt-2 w-64">
            <Button title="Add your first password" onPress={() => router.push('/entry/new')} />
          </View>
        </View>
      ) : (
        <>
          <View className="mt-5 flex-row items-center gap-2">
            <View className="min-h-12 flex-1 flex-row items-center gap-2 rounded-full border border-surface-edge bg-surface px-4">
              <Icon name="search" color={color.muted} size={18} />
              <TextInput
                accessibilityLabel="Search"
                placeholder="Search your vault"
                placeholderTextColor={color.muted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                className="min-h-12 flex-1 font-body text-body text-foreground"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort: ${SORT_LABELS[sort]}`}
              onPress={() => setSort(SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length]!)}
              className="min-h-12 justify-center rounded-full border border-surface-edge bg-soft px-4"
            >
              <Text className="font-heading text-label text-foreground">{SORT_LABELS[sort]}</Text>
            </Pressable>
          </View>

          <FlatList
            className="mt-4"
            data={list}
            keyExtractor={(e) => e.id}
            contentContainerClassName="gap-2.5 pb-6"
            refreshControl={<RefreshControl refreshing={syncing} onRefresh={refresh} tintColor={color.accent} />}
            ListEmptyComponent={<Text className="mt-10 text-center font-body text-body text-muted">{`No matches for '${search.trim()}'`}</Text>}
            renderItem={({ item }) => {
              const secret = mainSecret(item.data);
              return (
                <EntryRow
                  name={item.data.name}
                  subtitle={subtitle(item.data)}
                  onPress={() => router.push(`/entry/${item.id}`)}
                  onCopy={secret ? () => copy(secret.value) : undefined}
                />
              );
            }}
          />
        </>
      )}

      {notice && (
        <View accessibilityLiveRegion="polite" className={`absolute bottom-8 self-center rounded-full border px-5 py-3 ${notice.error ? 'border-danger bg-danger-soft' : 'border-surface-edge bg-surface'}`}>
          <Text className={`font-heading text-label ${notice.error ? 'text-danger' : 'text-foreground'}`}>{notice.text}</Text>
        </View>
      )}
    </Screen>
  );
}
