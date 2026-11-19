import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

function Particle({ angle, dist, color, size, delay }: { angle: number; dist: number; color: string; size: number; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })); }, [p, delay]);
  const a = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * dist * p.value },
      { translateY: Math.sin(angle) * dist * p.value + 60 * p.value * p.value },
      { rotate: `${p.value * 360}deg` },
      { scale: 1 - p.value * 0.4 },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size * 0.5, borderRadius: 2, backgroundColor: color }, a]} />;
}

/** Confetti-style burst from the centre of its container. Mount it to play once. */
export function Burst({ count = 28 }: { count?: number }) {
  const t = useTheme();
  const colors = [t.accent, t.accent2, t.protein, t.carbs, t.fat, t.fiber];
  const parts = useMemo(() => Array.from({ length: count }, (_, i) => ({
    angle: (Math.PI * 2 * i) / count + Math.random() * 0.4,
    dist: 90 + Math.random() * 110,
    color: colors[i % colors.length],
    size: 8 + Math.random() * 8,
    delay: Math.random() * 120,
  })), [count]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      {parts.map((p, i) => <Particle key={i} {...p} />)}
    </View>
  );
}
