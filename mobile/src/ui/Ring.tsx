import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

const ACircle = Animated.createAnimatedComponent(Circle);
let gid = 0;

/** Animated gradient progress ring. Children are rendered centered inside. */
export function Ring({ value, target, size = 140, stroke = 12, from, to, delay = 0, children }: {
  value: number; target: number; size?: number; stroke?: number; from?: string; to?: string; delay?: number; children?: React.ReactNode;
}) {
  const t = useTheme();
  const id = React.useRef(`g${gid++}`).current;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(pct, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, [pct, delay, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  const a = from ?? t.accent;
  const b = to ?? t.accent2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surfaceAlt} strokeWidth={stroke} fill="none" />
        <ACircle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={`${c}`} animatedProps={props} />
      </Svg>
      {children}
    </View>
  );
}
