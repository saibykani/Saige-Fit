import React from 'react';
import { LayoutChangeEvent, Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, Extrapolation } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';
import { Text } from './Text';
import { haptic } from './motion';

const ACTION_W = 88;

const tick = () => { if (Platform.OS !== 'web') haptic.light(); };

/** Swipe left to reveal a red delete action. Full swipe or tapping the action calls onDelete; otherwise springs back. */
export function SwipeRow({ children, onDelete, deleteLabel = 'Delete' }: { children: React.ReactNode; onDelete: () => void; deleteLabel?: string }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const w = useSharedValue(360);
  const armed = useSharedValue(false);

  const doDelete = () => { haptic.medium(); onDelete(); };
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12]).failOffsetY([-14, 14])
    .onStart(() => { start.value = x.value; })
    .onUpdate((e) => {
      const v = Math.min(0, start.value + e.translationX);
      x.value = v < -ACTION_W ? -ACTION_W + (v + ACTION_W) * 0.8 : v;
      const full = v < -w.value * 0.6;
      if (full !== armed.value) { armed.value = full; runOnJS(tick)(); }
    })
    .onEnd((e) => {
      if (x.value < -w.value * 0.6 || e.velocityX < -1800) {
        x.value = reduced ? withTiming(-w.value, { duration: 120 }) : withTiming(-w.value, { duration: 180 }, (fin) => { if (fin) runOnJS(doDelete)(); });
        if (reduced) runOnJS(doDelete)();
      } else if (x.value < -ACTION_W / 2 || e.velocityX < -600) {
        x.value = withSpring(-ACTION_W, spring);
      } else {
        x.value = withSpring(0, spring);
      }
    });

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const act = useAnimatedStyle(() => ({
    width: Math.max(0, -x.value),
    opacity: interpolate(-x.value, [0, 30], [0, 1], Extrapolation.CLAMP),
  }));
  const onLayout = (e: LayoutChangeEvent) => { w.value = e.nativeEvent.layout.width; };

  return (
    <View onLayout={onLayout} style={{ overflow: 'hidden', borderRadius: 24 }}>
      <Animated.View style={[{ position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: t.danger, overflow: 'hidden' }, act]}>
        <Pressable onPress={() => { x.value = withTiming(-w.value, { duration: 160 }); doDelete(); }} accessibilityRole="button" accessibilityLabel={deleteLabel}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: ACTION_W, alignSelf: 'flex-end' }}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text v="caption" color="#fff" style={{ fontSize: 11 }}>{deleteLabel}</Text>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={row}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
