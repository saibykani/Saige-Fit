import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { palette } from '@/theme/tokens';

const COLORS = [palette.accent, palette.accent2, palette.protein, palette.carbs, palette.fat, palette.fiber];
const N = 24;

function Particle({ p, i, k }: { p: any; i: number; k: any }) {
  const s = useAnimatedStyle(() => {
    const t = k.value;
    return {
      opacity: t === 0 ? 0 : 1 - Math.max(0, (t - 0.6) / 0.4),
      transform: [
        { translateX: p.vx * t },
        { translateY: p.vy * t + 520 * t * t },
        { rotate: `${p.rot * t}deg` },
        { scale: 1 - 0.3 * t },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: p.size, height: p.size * (p.round ? 1 : 0.5), borderRadius: p.round ? p.size : 2, backgroundColor: p.color }, s]} />;
}

/** Brand-coloured particle burst from the screen centre. Plays each time `trigger` increments. Renders nothing at 0. */
export function Confetti({ trigger }: { trigger: number }) {
  const reduced = useReducedMotion();
  const k = useSharedValue(0);
  const parts = useMemo(() => Array.from({ length: N }, (_, i) => {
    const a = (Math.PI * 2 * i) / N + Math.random() * 0.4;
    const sp = 140 + Math.random() * 180;
    return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, rot: (Math.random() - 0.5) * 720, size: 7 + Math.random() * 7, round: i % 3 === 0, color: COLORS[i % COLORS.length] };
  }), [trigger]);
  useEffect(() => {
    if (trigger <= 0 || reduced) return;
    k.value = 0.001;
    k.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) });
  }, [trigger, reduced, k]);
  if (trigger <= 0 || reduced) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {parts.map((p, i) => <Particle key={`${trigger}-${i}`} p={p} i={i} k={k} />)}
    </View>
  );
}
