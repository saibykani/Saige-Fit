import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown, FadeIn as RNFadeIn, FadeOut, Layout, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { spring } from '@/theme/tokens';

export const haptic = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  select: () => Haptics.selectionAsync().catch(() => {}),
};

const APressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with spring scale feedback + optional haptic. */
export function PressableScale({
  children, style, scaleTo = 0.96, hapticStyle = 'light', onPress, ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; hapticStyle?: 'light' | 'medium' | 'select' | 'none' }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : s.value }], opacity: reduced ? 1 - (1 - s.value) * 6 : 1 }));
  return (
    <APressable
      {...rest}
      onPressIn={() => { s.value = withSpring(scaleTo, spring); }}
      onPressOut={() => { s.value = withSpring(1, spring); }}
      onPress={(e) => { if (hapticStyle !== 'none') haptic[hapticStyle](); onPress?.(e); }}
      style={[a, style as any]}>
      {children as any}
    </APressable>
  );
}

/** Staggered entrance: wrap list items with index for a cascading spring-in. */
export function Reveal({ children, index = 0, style }: { children: React.ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(Math.min(index, 10) * 70).springify().damping(18)} layout={reduced ? undefined : Layout.springify()} style={style}>
      {children}
    </Animated.View>
  );
}

export const FadeInView = ({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) => (
  <Animated.View entering={RNFadeIn.delay(delay).duration(400)} exiting={FadeOut.duration(200)} style={style}>{children}</Animated.View>
);
