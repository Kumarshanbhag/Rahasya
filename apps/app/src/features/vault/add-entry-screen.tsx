import { GENERATOR } from '@rahasya/config';
import { generatePassword } from '@rahasya/crypto';
import { Button, Screen, StrengthMeter, TextField } from '@rahasya/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useVault } from '@/features/vault';
import { strengthOf } from '@/lib/password-strength';
import { blankEntry, type EntryData, isHidden, type Template, TEMPLATES } from './entry';

const TEMPLATE_ORDER: Template[] = ['login', 'bank', 'card', 'wifi', 'note'];

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * Adding an entry: pick what kind it is, fill in what's known (only the name is required), generate a strong
 * password if needed, and save. The entry is encrypted on this device before it is sent.
 */
export function AddEntryScreen() {
  const save = useVault((s) => s.save);
  const [entry, setEntry] = useState<EntryData>(() => blankEntry('login'));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const template = TEMPLATES[entry.template];

  const setField = (id: string, value: string) => setEntry((e) => ({ ...e, fields: e.fields.map((f) => (f.id === id ? { ...f, value } : f)) }));

  function chooseTemplate(next: Template) {
    setEntry((e) => ({ ...blankEntry(next), name: e.name, notes: e.notes }));
  }

  async function submit() {
    if (!entry.name.trim()) return setError('Give this entry a name');
    setError(undefined);
    setSaving(true);
    try {
      await save({ data: entry });
      goBack();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Screen scroll narrow>
      <View className="gap-5">
        <View className="flex-row items-center justify-between">
          <Button title="Cancel" variant="link" onPress={goBack} />
          <Text accessibilityRole="header" className="font-heading text-title text-foreground">
            New {template.label.toLowerCase()}
          </Text>
          <View className="w-16" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {TEMPLATE_ORDER.map((t) => {
            const selected = t === entry.template;
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => chooseTemplate(t)}
                className={`min-h-11 justify-center rounded-full px-4 ${selected ? 'bg-accent' : 'border border-surface-edge bg-soft'}`}
              >
                <Text className={`font-heading text-label ${selected ? 'text-on-accent' : 'text-foreground'}`}>{TEMPLATES[t].label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <TextField label={template.nameLabel} value={entry.name} onChangeText={(name) => setEntry((e) => ({ ...e, name }))} autoCapitalize="words" />

        {entry.fields.map((field) => (
          <View key={field.id} className="gap-2">
            <TextField
              label={field.label}
              value={field.value}
              onChangeText={(value) => setField(field.id, value)}
              secret={isHidden(field.kind)}
              keyboardType={field.kind === 'pin' ? 'number-pad' : field.kind === 'link' ? 'url' : 'default'}
            />
            {field.kind === 'secret' && (
              <View className="flex-row items-center justify-between gap-3 px-1.5">
                <View className="flex-1">{field.value ? <StrengthMeter score={strengthOf(field.value, [entry.name])} /> : null}</View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Generate ${field.label}`}
                  onPress={() => setField(field.id, generatePassword({ length: GENERATOR.defaultLength, upper: true, lower: true, digits: true, symbols: true, avoidLookalikes: false }))}
                  className="min-h-11 justify-center rounded-full bg-accent px-4"
                >
                  <Text className="font-heading text-label text-on-accent">Generate</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}

        <TextField label="Notes" value={entry.notes} onChangeText={(notes) => setEntry((e) => ({ ...e, notes }))} multiline autoCapitalize="sentences" />

        {error && (
          <Text accessibilityLiveRegion="polite" className="font-body text-label text-danger">
            {error}
          </Text>
        )}
        <Button title="Save to vault" onPress={submit} loading={saving} />
      </View>
    </Screen>
  );
}
