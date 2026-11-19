import React from 'react';
import { View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';
import { PressableScale, haptic } from './motion';
import { Text } from './Text';

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap, string]> = {
  index: ['home-outline', 'home', 'Home'],
  food: ['restaurant-outline', 'restaurant', 'Food'],
  workout: ['barbell-outline', 'barbell', 'Workout'],
  progress: ['stats-chart-outline', 'stats-chart', 'Progress'],
  profile: ['person-outline', 'person', 'Profile'],
};

function TabItem({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const t = useTheme();
  const [off, on, label] = ICONS[name] ?? ['ellipse-outline', 'ellipse', name];
  const s = useSharedValue(focused ? 1 : 0);
  React.useEffect(() => { s.value = withSpring(focused ? 1 : 0, spring); }, [focused, s]);
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * s.value }, { scale: 1 + 0.12 * s.value }] }));
  const dot = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: s.value }] }));
  return (
    <PressableScale onPress={onPress} hapticStyle="select" accessibilityRole="tab" accessibilityLabel={label}
      accessibilityState={{ selected: focused }} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, gap: 3 }}>
      <Animated.View style={icon}><Ionicons name={focused ? on : off} size={24} color={focused ? t.accent : t.textMuted} /></Animated.View>
      <Text v="caption" color={focused ? t.accent : t.textFaint} style={{ fontSize: 10.5 }}>{label}</Text>
      <Animated.View style={[{ position: 'absolute', bottom: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: t.accent }, dot]} />
    </PressableScale>
  );
}

/** Floating glass tab bar with a pulsing centre scan button. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pulse = useSharedValue(1);
  React.useEffect(() => { pulse.value = withRepeat(withSequence(withTiming(1.35, { duration: 1400 }), withTiming(1, { duration: 1400 })), -1); }, [pulse]);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value }));

  const routes = state.routes;
  const mid = Math.floor(routes.length / 2);
  const item = (r: (typeof routes)[number], i: number) => (
    <TabItem key={r.key} name={r.name} focused={state.index === i} onPress={() => {
      const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
      if (state.index !== i && !e.defaultPrevented) navigation.navigate(r.name as never);
    }} />
  );
  return (
    <View style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 12) }} pointerEvents="box-none">
      <View style={{ borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: t.border }}>
        <BlurView intensity={50} tint={t.mode as "dark" | "light"} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, backgroundColor: t.mode === 'dark' ? 'rgba(14,16,19,0.82)' : 'rgba(255,255,255,0.85)' }}>
          {routes.slice(0, mid).map((r, i) => item(r, i))}
          <View style={{ width: 76 }} />
          {routes.slice(mid).map((r, i) => item(r, i + mid))}
        </BlurView>
      </View>
      <View style={{ position: 'absolute', alignSelf: 'center', top: -22 }} pointerEvents="box-none">
        <Animated.View style={[{ position: 'absolute', width: 68, height: 68, borderRadius: 34, backgroundColor: t.accent, alignSelf: 'center' }, halo]} />
        <PressableScale onPress={() => { haptic.medium(); router.push('/scan'); }} hapticStyle="none" scaleTo={0.9}
          accessibilityRole="button" accessibilityLabel="Scan food">
          <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: t.bg }}>
            <Ionicons name="scan" size={30} color={t.onAccent} />
          </LinearGradient>
        </PressableScale>
      </View>
    </View>
  );
}
