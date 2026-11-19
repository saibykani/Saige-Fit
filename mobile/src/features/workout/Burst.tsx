import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

function Particle({ i, n, k, color, radius }: { i: number; n: number; k: number; color: string; radius: number }) {
  const p = useSharedValue(0);
  const angle = (i / n) * Math.PI * 2;
  const dx = Math.cos(angle) * radius;
  const dy = Math.sin(angle) * radius;
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) });
  }, [k, p]);
  const a = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ translateX: dx * p.value }, { translateY: dy * p.value }, { scale: 1 + 0.6 * (1 - p.value) }, { rotate: `${p.value * 180}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute' }, a]}><Ionicons name={i % 2 ? 'star' : 'sparkles'} size={i % 3 ? 14 : 20} color={color} /></Animated.View>;
}

/** Radial star/sparkle burst. Change `k` (any changing number) to replay it. Pointer-transparent. */
export function Burst({ k, size = 90 }: { k: number; size?: number }) {
  const t = useTheme();
  if (!k) return null;
  const colors = [t.accent, t.accent2, t.fat, '#FFFFFF'];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: 14 }).map((_, i) => <Particle key={`${k}-${i}`} i={i} n={14} k={k} color={colors[i % colors.length]} radius={size * (i % 2 ? 0.8 : 1.2)} />)}
    </View>
  );
}
