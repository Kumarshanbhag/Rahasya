import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

/** Where each aurora light sits, as fractions of the screen. */
const LIGHTS = [
  { cx: '5%', cy: '8%', r: '55%' },
  { cx: '100%', cy: '45%', r: '50%' },
  { cx: '10%', cy: '95%', r: '45%' },
];

/** Soft coloured lights behind the content, as in every theme's background. */
function Aurora() {
  const { color, dark } = useTheme();
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
      <Defs>
        {color.aurora.map((c, i) => (
          <RadialGradient key={c} id={`aurora-${i}`}>
            <Stop offset="0" stopColor={c} stopOpacity={dark ? 0.55 : 0.65} />
            <Stop offset="1" stopColor={c} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {color.aurora.map((c, i) => (
        <Circle key={c} {...LIGHTS[i % LIGHTS.length]} fill={`url(#aurora-${i})`} />
      ))}
    </Svg>
  );
}

type Props = {
  children: ReactNode;
  /** Scrolls when the content is taller than the screen, as forms are once the keyboard opens. */
  scroll?: boolean;
  /** Centres a column no wider than a form on large screens. */
  narrow?: boolean;
};

/** A full page: themed background, aurora lights and safe-area padding. */
export function Screen({ children, scroll = false, narrow = false }: Props) {
  const insets = useSafeAreaInsets();
  const body = (
    <View className={`flex-1 px-5 ${narrow ? 'w-full max-w-[420px] self-center' : ''}`} style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
      {children}
    </View>
  );
  return (
    <View className="flex-1 bg-background">
      <Aurora />
      {scroll ? (
        <ScrollView contentContainerClassName="grow" keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}
