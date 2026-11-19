import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

/** Corner brackets + sweeping laser. `w`/`h` is the frame size. */
export function ScanFrame({ w, h, active = true }: { w: number; h: number; active?: boolean }) {
  const t = useTheme();
  const y = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(h - 4, { duration: 1900, easing: Easing.inOut(Easing.quad) }), -1, true);
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1);
  }, [h, y, pulse]);
  const laser = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: active ? 1 : 0 }));
  const frame = useAnimatedStyle(() => ({ opacity: 0.75 + pulse.value * 0.25, transform: [{ scale: 1 + pulse.value * 0.012 }] }));
  const corner = (pos: object, borders: object) => (
    <View style={[{ position: 'absolute', width: 34, height: 34, borderColor: t.accent, borderRadius: 10 }, pos, borders]} />
  );
  return (
    <Animated.View pointerEvents="none" style={[{ width: w, height: h }, frame]}>
      {corner({ top: 0, left: 0 }, { borderTopWidth: 4, borderLeftWidth: 4 })}
      {corner({ top: 0, right: 0 }, { borderTopWidth: 4, borderRightWidth: 4 })}
      {corner({ bottom: 0, left: 0 }, { borderBottomWidth: 4, borderLeftWidth: 4 })}
      {corner({ bottom: 0, right: 0 }, { borderBottomWidth: 4, borderRightWidth: 4 })}
      <Animated.View style={[{ position: 'absolute', left: 8, right: 8, top: 0, height: 3, borderRadius: 2, backgroundColor: t.accent, shadowColor: t.accent, shadowOpacity: 0.9, shadowRadius: 12, elevation: 8 }, laser]} />
    </Animated.View>
  );
}

const STATUS = ['Looking at your plate…', 'Spotting each food…', 'Estimating portions…', 'Matching nutrition data…'];

function Ripple({ delay }: { delay: number }) {
  const t = useTheme();
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1)); }, [p, delay]);
  const a = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - p.value), transform: [{ scale: 0.4 + p.value * 1.4 }] }));
  return <Animated.View style={[{ position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: t.accent }, a]} />;
}

export function AnalyzingOverlay({ uri }: { uri: string | null }) {
  const t = useTheme();
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((n) => (n + 1) % STATUS.length), 1700); return () => clearInterval(id); }, []);
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      {uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 }} contentFit="cover" blurRadius={18} /> : null}
      <BlurView intensity={25} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
        <Ripple delay={0} /><Ripple delay={800} /><Ripple delay={1600} />
        <LinearGradient colors={[t.accent, t.accent2]} style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={36} color={t.onAccent} />
        </LinearGradient>
      </View>
      <Animated.View key={i} entering={FadeIn.duration(350)} style={{ marginTop: 24 }}>
        <Text v="heading" style={{ color: '#fff' }}>{STATUS[i]}</Text>
      </Animated.View>
      <Text v="caption" style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>Usually takes a few seconds</Text>
    </Animated.View>
  );
}
