import React, { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

function Ripple({ delay, size }: { delay: number; size: number }) {
  const t = useTheme();
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1)); }, [delay, p]);
  const a = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - p.value), transform: [{ scale: 0.5 + p.value }] }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: t.accent }, a]} />;
}

/** Animated placeholder illustration used when an exercise has no media. It is decorative, not a demonstration. */
export function ExerciseArt({ muscle, height = 190 }: { muscle: string; height?: number }) {
  const t = useTheme();
  const bob = useSharedValue(0);
  useEffect(() => { bob.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true); }, [bob]);
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * bob.value }, { rotate: `${-8 + 16 * bob.value}deg` }] }));
  return (
    <LinearGradient colors={[t.accent + '33', t.surface]} style={{ height, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: t.border }}>
      <Ripple delay={0} size={170} /><Ripple delay={870} size={170} /><Ripple delay={1740} size={170} />
      <Animated.View style={icon}><View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="barbell" size={42} color={t.onAccent} /></View></Animated.View>
      <Text v="label" muted style={{ position: 'absolute', bottom: 12 }}>{muscle} · illustration</Text>
    </LinearGradient>
  );
}
