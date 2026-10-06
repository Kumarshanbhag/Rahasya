import { View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { KEYHOLE_PATH } from '../icons';
import { useTheme } from '../theme';

/**
 * Rahasya's brand mark: a glass sphere with a soft glow, a highlight at the top left and the keyhole in the accent
 * gradient. Static here; the unlock and lock animations move it.
 */
export function GlassOrb({ size = 150 }: { size?: number }) {
  const { color } = useTheme();
  const box = 200;
  const orb = 70;
  const keyhole = { width: 40, height: (40 * 60) / 44 };
  return (
    <View accessibilityRole="image" accessibilityLabel="Rahasya" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
        <Defs>
          <RadialGradient id="orb-glow">
            <Stop offset="0.6" stopColor={color.orbGlow} />
            <Stop offset="1" stopColor={color.orbGlow} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="orb-fill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color.surface[0]} />
            <Stop offset="1" stopColor={color.surface[1]} />
          </LinearGradient>
          <RadialGradient id="orb-shine" cx="34%" cy="20%" rx="31%" ry="21%">
            <Stop offset="0" stopColor={color.orbShine} />
            <Stop offset="1" stopColor={color.orbShine} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="keyhole" x1="0" y1="0" x2="1" y2="1">
            {color.accentGradient.map((c, i) => (
              <Stop key={c} offset={i / (color.accentGradient.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle cx={box / 2} cy={box / 2} r={orb + 22} fill="url(#orb-glow)" />
        <Circle cx={box / 2} cy={box / 2} r={orb} fill="url(#orb-fill)" stroke={color.surfaceEdge} strokeWidth={1} />
        <Circle cx={box / 2} cy={box / 2} r={orb} fill="url(#orb-shine)" />
        <G transform={`translate(${(box - keyhole.width) / 2} ${(box - keyhole.height) / 2}) scale(${keyhole.width / 44})`}>
          <Path d={KEYHOLE_PATH} fill="url(#keyhole)" />
        </G>
      </Svg>
    </View>
  );
}
