import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { IconButton, Text } from '@/ui';

export function Orb({ size, color, top, left, right, bottom, delay = 0 }: { size: number; color: string; top?: number; left?: number; right?: number; bottom?: number; delay?: number }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withRepeat(withSequence(withTiming(1, { duration: 5200 + delay, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 5200 + delay, easing: Easing.inOut(Easing.quad) })), -1); }, [p, delay]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: p.value * 34 }, { translateX: p.value * -18 }, { scale: 1 + p.value * 0.12 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, left, right, bottom, width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.22 }, a]} />
  );
}

export function BrandMark({ size = 64 }: { size?: number }) {
  const t = useTheme();
  return (
    <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="flash" size={size * 0.52} color={t.onAccent} />
    </LinearGradient>
  );
}

/** Backdrop + keyboard-safe scroll container shared by auth screens. */
export function AuthShell({ title, subtitle, children, back = true }: { title: string; subtitle?: string; children: React.ReactNode; back?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Orb size={300} color={t.accent} top={-90} right={-110} />
      <Orb size={220} color={t.accent2} bottom={-60} left={-90} delay={900} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: space.lg, paddingBottom: 40, gap: space.xl, flexGrow: 1 }}>
            {back ? <View style={{ flexDirection: 'row' }}><IconButton name="chevron-back" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))} /></View> : null}
            <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: 8, marginTop: 8 }}>
              <Text v="display">{title}</Text>
              {subtitle ? <Text v="body" muted>{subtitle}</Text> : null}
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(120).springify().damping(18)} style={{ gap: space.lg }}>{children}</Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
