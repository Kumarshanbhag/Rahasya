import { Text, View } from 'react-native';

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

const LABEL = ['Weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const;
const BAR = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'] as const;
const TEXT = ['text-danger', 'text-danger', 'text-warning', 'text-success', 'text-success'] as const;

/** How hard a password is to guess: four bars plus a word, so colour is never the only signal. */
export function StrengthMeter({ score }: { score: StrengthScore }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Password strength" accessibilityValue={{ min: 0, max: 4, now: score, text: LABEL[score] }} className="gap-1.5 px-1.5">
      <View className="flex-row gap-1.5">
        {[1, 2, 3, 4].map((bar) => (
          <View key={bar} className={`h-1.5 flex-1 rounded-full ${bar <= score ? BAR[score] : 'bg-soft'}`} />
        ))}
      </View>
      <Text className={`font-heading text-label ${TEXT[score]}`}>{LABEL[score]}</Text>
    </View>
  );
}
