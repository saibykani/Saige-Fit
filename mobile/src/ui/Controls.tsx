import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleProp, TextInput, TextInputProps, View, ViewStyle, Switch as RNSwitch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing, useReducedMotion, runOnJS, FadeIn, FadeOut, SlideInDown, SlideOutDown, interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, withSpring, withDelay,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space, spring } from '@/theme/tokens';
import { Text } from './Text';
import { PressableScale, haptic } from './motion';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const Icon = ({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) => {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
};

/** Frosted card. `glow` adds a faint accent edge. */
export function Card({ children, style, glow, onPress, padded = true }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; glow?: boolean; onPress?: () => void; padded?: boolean;
}) {
  const t = useTheme();
  const body = (
    <View style={[{
      backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1,
      borderColor: glow ? t.accent + '55' : t.border, padding: padded ? space.lg : 0, overflow: 'hidden',
    }, style]}>
      {glow && <LinearGradient colors={[t.accent + '22', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 } as any} pointerEvents="none" />}
      {children}
    </View>
  );
  return onPress ? <PressableScale onPress={onPress} scaleTo={0.985}>{body}</PressableScale> : body;
}

export function Button({ title, onPress, loading, disabled, variant = 'primary', icon, style, size = 'lg' }: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName; style?: StyleProp<ViewStyle>; size?: 'md' | 'lg';
}) {
  const t = useTheme();
  const off = disabled || loading;
  const h = size === 'lg' ? 56 : 44;
  const inner = (color: string) => loading ? <ActivityIndicator color={color} /> : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {icon && <Ionicons name={icon} size={20} color={color} />}
      <Text v="bodyStrong" color={color} style={{ fontSize: size === 'lg' ? 16 : 14 }}>{title}</Text>
    </View>
  );
  return (
    <PressableScale onPress={onPress} disabled={off} hapticStyle="medium" accessibilityRole="button"
      accessibilityLabel={title} accessibilityState={{ disabled: !!off }}
      style={[{ opacity: off ? 0.45 : 1 }, style]}>
      {variant === 'primary' ? (
        <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ height: h, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          {inner(t.onAccent)}
        </LinearGradient>
      ) : (
        <View style={{
          height: h, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
          backgroundColor: variant === 'danger' ? t.danger + '22' : variant === 'secondary' ? t.surfaceAlt : 'transparent',
          borderWidth: variant === 'ghost' ? 1 : 0, borderColor: t.border,
        }}>
          {inner(variant === 'danger' ? t.danger : t.text)}
        </View>
      )}
    </PressableScale>
  );
}

export function IconButton({ name, onPress, size = 22, label, tint }: { name: IconName; onPress: () => void; size?: number; label: string; tint?: string }) {
  const t = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.glass, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size} color={tint ?? t.text} />
    </PressableScale>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  const p = useSharedValue(selected ? 1 : 0);
  useEffect(() => { p.value = withTiming(selected ? 1 : 0, { duration: 220 }); }, [selected, p]);
  const a = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [t.surfaceAlt, t.accent]),
    borderColor: interpolateColor(p.value, [0, 1], [t.border, t.accent]),
  }));
  return (
    <PressableScale onPress={onPress} hapticStyle="select" accessibilityRole="button" accessibilityState={{ selected: !!selected }}>
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1 }, a]}>
        {icon && <Ionicons name={icon} size={16} color={selected ? t.onAccent : t.textMuted} />}
        <Text v="bodyStrong" color={selected ? t.onAccent : t.text} style={{ fontSize: 14 }}>{label}</Text>
      </Animated.View>
    </PressableScale>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange, multi }: {
  options: { value: T; label: string; icon?: IconName }[]; value: T | T[] | null; onChange: (v: any) => void; multi?: boolean;
}) {
  const sel = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} icon={o.icon} selected={sel(o.value)} onPress={() => {
          if (!multi) return onChange(o.value);
          const cur = (value as T[]) ?? [];
          onChange(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value]);
        }} />
      ))}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const seg = w / options.length;
  useEffect(() => { x.value = withSpring(idx * seg, spring); }, [idx, seg, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: radius.pill, padding: 4 }}>
      {w > 0 && <Animated.View style={[{ position: 'absolute', top: 4, left: 4, width: seg - 8, height: '100%' as any, bottom: 4, borderRadius: radius.pill, backgroundColor: t.accent }, a, { height: undefined }]} />}
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => { haptic.select(); onChange(o.value); }} style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}>
          <Text v="bodyStrong" color={o.value === value ? t.onAccent : t.textMuted} style={{ fontSize: 13 }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, error, suffix, style, ...rest }: TextInputProps & { label?: string; error?: string; suffix?: string }) {
  const t = useTheme();
  const f = useSharedValue(0);
  const a = useAnimatedStyle(() => ({
    borderColor: error ? t.danger : interpolateColor(f.value, [0, 1], [t.border, t.accent]),
    backgroundColor: interpolateColor(f.value, [0, 1], [t.surface, t.surfaceAlt]),
  }));
  return (
    <View style={{ gap: 6 }}>
      {label && <Text v="label" muted>{label}</Text>}
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 16 }, a]}>
        <TextInput
          placeholderTextColor={t.textFaint}
          selectionColor={t.accent}
          {...rest}
          onFocus={(e) => { f.value = withTiming(1, { duration: 180 }); rest.onFocus?.(e); }}
          onBlur={(e) => { f.value = withTiming(0, { duration: 180 }); rest.onBlur?.(e); }}
          style={[{ flex: 1, height: 54, color: t.text, fontFamily: fonts.medium, fontSize: 16 }, style]}
        />
        {suffix && <Text v="caption" muted>{suffix}</Text>}
      </Animated.View>
      {error && <Text v="caption" color={t.danger}>{error}</Text>}
    </View>
  );
}

export function ProgressBar({ value, target, color, height = 8, delay = 0 }: { value: number; target: number; color?: string; height?: number; delay?: number }) {
  const t = useTheme();
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const w = useSharedValue(0);
  useEffect(() => { w.value = withTiming(pct, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [pct, w]);
  const a = useAnimatedStyle(() => ({ width: `${w.value * 100}%` as any }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? t.accent }, a]} />
    </View>
  );
}

export function MacroRow({ label, value, target, color, unit = 'g' }: { label: string; value: number; target: number; color: string; unit?: string }) {
  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text v="caption">{label}</Text>
        <Text v="caption" muted>{Math.round(value)} / {Math.round(target)} {unit}</Text>
      </View>
      <ProgressBar value={value} target={target} color={color} />
    </View>
  );
}

/** Loading placeholder with a sweeping shimmer highlight (soft pulse when reduced motion is on). */
export function Skeleton({ height = 20, width = '100%', radius: r = 10, style }: { height?: number; width?: number | string; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = 0;
    k.value = reduced ? withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1)
      : withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1);
  }, [reduced, k]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: -w + k.value * w * 2 }] }));
  const pulse = useAnimatedStyle(() => ({ opacity: reduced ? 0.6 + k.value * 0.4 : 1 }));
  return (
    <Animated.View onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ height, width: width as any, borderRadius: r, backgroundColor: t.surfaceAlt, overflow: 'hidden' }, pulse, style]}>
      {!reduced && w > 0 && (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: w }, sweep]}>
          <LinearGradient colors={['transparent', t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Animated success check: ring ripple, pop-in disc and a bouncing tick. */
export function SuccessCheck({ size = 96, color, style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const c = color ?? t.accent;
  const disc = useSharedValue(reduced ? 1 : 0);
  const tick = useSharedValue(reduced ? 1 : 0);
  const ring = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    disc.value = withSpring(1, { damping: 11, stiffness: 160 });
    tick.value = withDelay(180, withSpring(1, { damping: 8, stiffness: 200 }));
    ring.value = withDelay(120, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [reduced, disc, tick, ring]);
  const d = useAnimatedStyle(() => ({ transform: [{ scale: disc.value }] }));
  const k = useAnimatedStyle(() => ({ opacity: Math.min(1, tick.value), transform: [{ scale: 0.3 + tick.value * 0.7 }, { rotate: `${(1 - tick.value) * -25}deg` }] }));
  const r = useAnimatedStyle(() => ({ opacity: reduced ? 0 : 0.5 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.7 }] }));
  return (
    <View accessibilityRole="image" accessibilityLabel="Success" style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: c }, r]} />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }, d]}>
        <Animated.View style={k}><Ionicons name="checkmark" size={size * 0.56} color={t.onAccent} /></Animated.View>
      </Animated.View>
    </View>
  );
}

export function EmptyState({ icon = 'sparkles-outline', title, hint, action }: { icon?: IconName; title: string; hint?: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center', padding: space.xxl, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={32} color={t.accent} />
      </View>
      <Text v="title" style={{ textAlign: 'center' }}>{title}</Text>
      {hint && <Text v="body" muted style={{ textAlign: 'center' }}>{hint}</Text>}
      {action && <View style={{ marginTop: 8 }}><Button title={action.label} onPress={action.onPress} size="md" /></View>}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <EmptyState icon="cloud-offline-outline" title="Something went wrong" hint={message} action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined} />;
}

/** Bottom sheet with blurred scrim. Drag the handle/title area down (or flick) to dismiss. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const dy = useSharedValue(0);
  useEffect(() => { if (visible) dy.value = 0; }, [visible, dy]);
  const close = () => { haptic.light(); onClose(); };
  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6]).failOffsetX([-30, 30])
    .onUpdate((e) => { dy.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (dy.value > 110 || e.velocityY > 900) { dy.value = withTiming(700, { duration: 180 }, (f) => { if (f) runOnJS(close)(); }); }
      else dy.value = reduced ? withTiming(0, { duration: 120 }) : withSpring(0, spring);
    });
  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }] }));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1 }} onPress={onClose}>
            <BlurView intensity={30} tint={t.mode as "dark" | "light"} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
          </Pressable>
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <Animated.View entering={reduced ? FadeIn : SlideInDown.springify().damping(20)} exiting={reduced ? FadeOut : SlideOutDown.duration(200)}>
            <Animated.View style={[{ backgroundColor: t.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, paddingTop: 0, paddingBottom: 36, borderWidth: 1, borderColor: t.border, maxHeight: '88%' as any }, drag]}>
              <GestureDetector gesture={pan}>
                <View collapsable={false}>
                  <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 16 }}>
                    <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.border }} />
                  </View>
                  {title && <Text v="title" style={{ marginBottom: 16 }}>{title}</Text>}
                </View>
              </GestureDetector>
              {children}
            </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function SwitchRow({ label, hint, value, onChange, icon }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      {icon && <Ionicons name={icon} size={22} color={t.textMuted} />}
      <View style={{ flex: 1 }}>
        <Text v="bodyStrong">{label}</Text>
        {hint && <Text v="caption" muted>{hint}</Text>}
      </View>
      <RNSwitch value={value} onValueChange={(v) => { haptic.select(); onChange(v); }}
        trackColor={{ false: t.surfaceAlt, true: t.accent }} thumbColor={t.mode === 'dark' ? '#fff' : '#fff'} />
    </View>
  );
}

export function ListRow({ icon, title, subtitle, right, onPress, danger }: { icon?: IconName; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean }) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
      {icon && (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: (danger ? t.danger : t.accent) + '1A', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={danger ? t.danger : t.accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text v="bodyStrong" color={danger ? t.danger : undefined}>{title}</Text>
        {subtitle && <Text v="caption" muted>{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={t.textFaint} /> : null)}
    </View>
  );
  return onPress ? <PressableScale onPress={onPress} scaleTo={0.98} hapticStyle="select">{body}</PressableScale> : body;
}
