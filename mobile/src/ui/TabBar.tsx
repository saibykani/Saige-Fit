import React from 'react';
import { View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';
import { PressableScale, haptic } from './motion';
import { Text } from './Text';

export const TAB_BAR_HEIGHT = 64;
const FAB = 60;
const FAB_GAP = 14;
const PAD = 6;
export const TAB_BAR_MAX_WIDTH = 520;

/** Bottom padding that keeps scroll content clear of the floating tab bar and the scan FAB. Applied inside <Screen>. */
export function useTabBarInset() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + FAB_GAP + FAB + 20;
}

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap, string]> = {
  index: ['home-outline', 'home', 'Home'],
  food: ['restaurant-outline', 'restaurant', 'Food'],
  workout: ['barbell-outline', 'barbell', 'Workout'],
  progress: ['stats-chart-outline', 'stats-chart', 'Progress'],
  profile: ['person-outline', 'person', 'Profile'],
};

function TabItem({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [off, on, label] = ICONS[name] ?? ['ellipse-outline', 'ellipse', name];
  const s = useSharedValue(focused ? 1 : 0);
  React.useEffect(() => { s.value = reduced ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, spring); }, [focused, s, reduced]);
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * s.value }, { scale: 1 + 0.14 * s.value }] }));
  return (
    <PressableScale onPress={onPress} hapticStyle="select" scaleTo={0.9} accessibilityRole="tab" accessibilityLabel={label}
      accessibilityState={{ selected: focused }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: TAB_BAR_HEIGHT - 2 * PAD, gap: 3 }}>
      <Animated.View style={icon}><Ionicons name={focused ? on : off} size={23} color={focused ? t.accent : t.textMuted} /></Animated.View>
      <Text v="caption" color={focused ? t.accent : t.textFaint} style={{ fontSize: 10.5 }}>{label}</Text>
    </PressableScale>
  );
}

/** Floating glass tab bar (5 equal slots, sliding highlight) with a pulsing scan FAB above its right end. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withSequence(withTiming(1.35, { duration: 1400 }), withTiming(1, { duration: 1400 })), -1);
  }, [pulse, reduced]);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: reduced ? 0 : 2 - pulse.value }));

  const routes = state.routes;
  const [w, setW] = React.useState(0);
  const slot = routes.length ? Math.max(0, w - PAD * 2) / routes.length : 0;
  const x = useSharedValue(0);
  const started = React.useRef(false);
  React.useEffect(() => {
    const target = PAD + state.index * slot;
    if (slot === 0) return;
    if (!started.current || reduced) { x.value = target; started.current = true; }
    else x.value = withSpring(target, { damping: 18, stiffness: 240, mass: 0.7 });
  }, [state.index, slot, x, reduced]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const bottom = Math.max(insets.bottom, 12);
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }} pointerEvents="box-none">
      <View style={{ width: '100%', maxWidth: TAB_BAR_MAX_WIDTH, paddingHorizontal: 14 }} pointerEvents="box-none">
        <View style={{ borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: t.border }}>
          <BlurView intensity={50} tint={t.mode as 'dark' | 'light'} onLayout={(e) => setW(e.nativeEvent.layout.width)}
            style={{ flexDirection: 'row', alignItems: 'center', height: TAB_BAR_HEIGHT, paddingHorizontal: PAD, backgroundColor: t.mode === 'dark' ? 'rgba(14,16,19,0.82)' : 'rgba(255,255,255,0.85)' }}>
            {slot > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: PAD, left: 0, width: slot, height: TAB_BAR_HEIGHT - 2 * PAD, borderRadius: 26, backgroundColor: t.accent + '1F' }, pill]} />}
            {routes.map((r, i) => (
              <TabItem key={r.key} name={r.name} focused={state.index === i} onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
                if (state.index !== i && !e.defaultPrevented) navigation.navigate(r.name as never);
              }} />
            ))}
          </BlurView>
        </View>
        <View style={{ position: 'absolute', right: 14 + 4, bottom: TAB_BAR_HEIGHT + FAB_GAP, width: FAB, height: FAB }} pointerEvents="box-none">
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: FAB, height: FAB, borderRadius: FAB / 2, backgroundColor: t.accent }, halo]} />
          <PressableScale onPress={() => { haptic.medium(); router.push('/scan'); }} hapticStyle="none" scaleTo={0.9}
            accessibilityRole="button" accessibilityLabel="Scan food">
            <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center', shadowColor: t.accent, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
              <Ionicons name="scan" size={28} color={t.onAccent} />
            </LinearGradient>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
