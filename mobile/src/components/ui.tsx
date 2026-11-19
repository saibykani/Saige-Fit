import React from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle, ActivityIndicator } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderRadius: radius.lg, padding: space.lg,
      borderWidth: 1, borderColor: t.border }, style]}>
      {children}
    </View>
  );
}

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'ghost';
}) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: primary ? t.accent : 'transparent',
        borderWidth: primary ? 0 : 1, borderColor: t.border,
        borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      {loading ? <ActivityIndicator color={primary ? t.onAccent : t.text} /> :
        <Text style={{ ...font.body, fontWeight: '700', color: primary ? t.onAccent : t.text }}>{title}</Text>}
    </Pressable>
  );
}

export function ProgressRing({ value, target, size = 120, stroke = 12, color, label, sub }: {
  value: number; target: number; size?: number; stroke?: number; color?: string; label?: string; sub?: string;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? t.accent} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - pct)} />
      </Svg>
      <Text style={{ ...font.title, color: t.text }}>{label ?? Math.round(value)}</Text>
      {sub ? <Text style={{ ...font.caption, color: t.textMuted }}>{sub}</Text> : null}
    </View>
  );
}

export function MacroBar({ label, value, target, color, unit = 'g' }: {
  label: string; value: number; target: number; color: string; unit?: string;
}) {
  const t = useTheme();
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...font.caption, color: t.text }}>{label}</Text>
        <Text style={{ ...font.caption, color: t.textMuted }}>{Math.round(value)} / {Math.round(target)} {unit}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt }}>
        <View style={{ height: 8, borderRadius: 4, width: `${pct * 100}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: 6 }}>
      <Text style={{ ...font.title, color: t.text }}>{title}</Text>
      {hint ? <Text style={{ ...font.caption, color: t.textMuted, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}
