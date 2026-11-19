import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, spring } from '@/theme/tokens';
import { Chip, Field, PressableScale, Text, haptic } from '@/ui';

/** Big -/+ stepper with an editable numeric value. */
export function NumberStepper({ label, value, onChange, min, max, step = 1, unit, decimals = 0 }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit: string; decimals?: number;
}) {
  const t = useTheme();
  const [text, setText] = useState(value.toFixed(decimals));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value.toFixed(decimals)); }, [value, decimals, focused]);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10 ** decimals) / 10 ** decimals));
  const bump = (d: number) => { haptic.select(); onChange(clamp(value + d)); };
  const btn = (icon: 'remove' | 'add', d: number, lbl: string) => (
    <PressableScale onPress={() => bump(d)} hapticStyle="none" accessibilityRole="button" accessibilityLabel={lbl}
      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={22} color={t.text} />
    </PressableScale>
  );
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: 16, gap: 10 }}>
      <Text v="label" muted>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {btn('remove', -step, `Decrease ${label}`)}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <TextInput
            value={text} keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel={label}
            onFocus={() => setFocused(true)}
            onChangeText={(s) => {
              setText(s);
              const n = parseFloat(s.replace(',', '.'));
              if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(0, n)));
            }}
            onBlur={() => { setFocused(false); onChange(clamp(value)); }}
            style={{ fontFamily: fonts.display, fontSize: 40, color: t.text, minWidth: 90, textAlign: 'center', padding: 0 }}
          />
          <Text v="heading" muted>{unit}</Text>
        </View>
        {btn('add', step, `Increase ${label}`)}
      </View>
    </View>
  );
}

/** Free-text chip input with tappable suggestions. */
export function ChipInput({ label, values, onChange, suggestions = [], placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v || values.includes(v) || values.length >= 20) return setText('');
    haptic.select();
    onChange([...values, v]);
    setText('');
  };
  const pretty = (s: string) => s.replace(/_/g, ' ');
  return (
    <View style={{ gap: 10 }}>
      <Field label={label} value={text} onChangeText={setText} placeholder={placeholder ?? 'Type and press add'} returnKeyType="done"
        onSubmitEditing={() => add(text)} autoCapitalize="none" />
      {values.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {values.map((v) => (
            <PressableScale key={v} onPress={() => onChange(values.filter((x) => x !== v))} accessibilityRole="button" accessibilityLabel={`Remove ${v}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: t.accent + '22', borderWidth: 1, borderColor: t.accent + '55' }}>
                <Text v="caption" color={t.accent}>{pretty(v)}</Text>
                <Ionicons name="close" size={14} color={t.accent} />
              </View>
            </PressableScale>
          ))}
        </View>
      )}
      {suggestions.filter((s) => !values.includes(s)).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggestions.filter((s) => !values.includes(s)).map((s) => <Chip key={s} label={`+ ${pretty(s)}`} onPress={() => add(s)} />)}
        </View>
      )}
    </View>
  );
}

/** Large selectable card used for goals / activity / experience. */
export function ChoiceCard({ title, desc, icon, selected, onPress }: {
  title: string; desc?: string; icon?: React.ComponentProps<typeof Ionicons>['name']; selected: boolean; onPress: () => void;
}) {
  const t = useTheme();
  const p = useSharedValue(selected ? 1 : 0);
  useEffect(() => { p.value = withTiming(selected ? 1 : 0, { duration: 220 }); }, [selected, p]);
  const a = useAnimatedStyle(() => ({
    borderColor: interpolateColor(p.value, [0, 1], [t.border, t.accent]),
    backgroundColor: interpolateColor(p.value, [0, 1], [t.surface, t.accent + '18']),
  }));
  const check = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(selected ? 1 : 0, spring) }], opacity: p.value }));
  return (
    <PressableScale onPress={onPress} hapticStyle="select" scaleTo={0.975} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={title}>
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1.5 }, a]}>
        {icon && (
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: selected ? t.accent : t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={22} color={selected ? t.onAccent : t.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text v="heading">{title}</Text>
          {desc ? <Text v="caption" muted>{desc}</Text> : null}
        </View>
        <Animated.View style={check}><Ionicons name="checkmark-circle" size={24} color={t.accent} /></Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

export function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 6, marginBottom: 4 }}>
      <Text v="display">{title}</Text>
      {subtitle ? <Text v="body" muted>{subtitle}</Text> : null}
    </View>
  );
}

export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text v="label" muted>{label}</Text>
      {children}
    </View>
  );
}
