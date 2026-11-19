import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ME_KEY, useMe } from '@/lib/useMe';
import { AnimatedNumber, Button, Card, ChipGroup, Field, Reveal, Screen, Section, Text, haptic } from '@/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { errorInfo } from '@/features/paywall/gate';
import { ACTIVITY, DIET_TYPES, EXPERIENCE, GOALS, WORKOUT_ENV } from '@/features/settings/options';

interface Targets { bmi: number; bmi_category: string; bmr_kcal: number; tdee_kcal: number; target_kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; water_ml: number; notes: string[] }

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const numOrNull = (s: string) => { const n = parseFloat(s); return isFinite(n) ? n : null; };

export default function EditProfile() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const p = (me.data?.profile ?? {}) as Record<string, any>;
  const d = (me.data?.diet ?? {}) as Record<string, any>;

  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (!me.data || f) return;
    setF({
      full_name: me.data.user.full_name ?? '', weight_kg: String(p.weight_kg ?? ''), height_cm: String(p.height_cm ?? ''),
      target_weight_kg: p.target_weight_kg != null ? String(p.target_weight_kg) : '', goal: me.data.goal ?? 'general_fitness',
      activity_level: p.activity_level ?? 'lightly_active', training_days: String(p.training_days ?? 3), workout_minutes: String(p.workout_minutes ?? 45),
      experience: p.experience ?? 'beginner', workout_env: p.workout_env ?? 'gym', diet_type: d.diet_type ?? 'non_vegetarian',
      meals_per_day: String(d.meals_per_day ?? 4), injuries: (p.injuries ?? []).join(', '), allergies: (d.allergies ?? []).join(', '),
    });
  }, [me.data, f, p, d]);

  const [preview, setPreview] = useState<Targets | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  const valid = useMemo(() => {
    if (!f) return false;
    const w = numOrNull(f.weight_kg), h = numOrNull(f.height_cm);
    return !!w && !!h && w >= 25 && w <= 400 && h >= 80 && h <= 250;
  }, [f]);

  // live recompute (debounced) using the same server engine that saves the targets
  useEffect(() => {
    if (!f || !valid || !p.date_of_birth) return;
    const id = setTimeout(async () => {
      try {
        const r = await api<Targets>('/v1/profile/targets', { body: {
          date_of_birth: p.date_of_birth, gender: p.gender ?? 'unspecified', weight_kg: numOrNull(f.weight_kg), height_cm: numOrNull(f.height_cm),
          target_weight_kg: numOrNull(f.target_weight_kg), activity_level: f.activity_level, goal: f.goal, training_days: Math.min(7, Math.max(0, parseInt(f.training_days, 10) || 3)),
        } });
        setPreview(r); setPreviewErr(null);
      } catch (e) { setPreviewErr(errorInfo(e).message); }
    }, 500);
    return () => clearTimeout(id);
  }, [f, valid, p.date_of_birth, p.gender]);

  const save = useMutation({
    mutationFn: () => api<{ targets: Targets }>('/v1/profile', { method: 'PUT', body: {
      full_name: f.full_name.trim() || undefined, weight_kg: numOrNull(f.weight_kg), height_cm: numOrNull(f.height_cm),
      target_weight_kg: numOrNull(f.target_weight_kg), goal: f.goal, activity_level: f.activity_level,
      training_days: Math.min(7, Math.max(1, parseInt(f.training_days, 10) || 3)), workout_minutes: Math.min(180, Math.max(10, parseInt(f.workout_minutes, 10) || 45)),
      experience: f.experience, workout_env: f.workout_env, diet_type: f.diet_type,
      meals_per_day: Math.min(7, Math.max(2, parseInt(f.meals_per_day, 10) || 4)), injuries: csv(f.injuries), allergies: csv(f.allergies),
    } }),
    onSuccess: async () => {
      haptic.success();
      await qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      Alert.alert('Saved', 'Your profile and daily targets are updated.', [{ text: 'OK', onPress: () => router.back() }]);
    },
    onError: (e) => Alert.alert('Could not save', errorInfo(e).message),
  });

  if (!f) return <Screen title="Edit profile" back tabBar={false}><Text v="body" muted>Loading…</Text></Screen>;

  return (
    <Screen title="Edit profile" subtitle="Targets update as you change things" back tabBar={false}>
      <Reveal index={0}>
        <Card glow>
          <Text v="label" muted>Daily target preview</Text>
          {preview ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <AnimatedNumber value={preview.target_kcal} style={{ fontSize: 40 }} /><Text v="body" muted>kcal / day</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <Text v="caption" color={t.protein}>P {preview.protein_g} g</Text>
                <Text v="caption" color={t.carbs}>C {preview.carbs_g} g</Text>
                <Text v="caption" color={t.fat}>F {preview.fat_g} g</Text>
                <Text v="caption" color={t.water}>{preview.water_ml} ml</Text>
              </View>
              <Text v="caption" muted>BMI {preview.bmi} ({preview.bmi_category}) · BMR {preview.bmr_kcal} · TDEE {preview.tdee_kcal}</Text>
              {preview.notes.map((n, i) => <Text key={i} v="caption" color={t.warn}>{n}</Text>)}
            </View>
          ) : <Text v="body" muted style={{ marginTop: 8 }}>{previewErr ?? (valid ? 'Calculating…' : 'Enter a valid weight and height to see your targets.')}</Text>}
        </Card>
      </Reveal>

      <Section title="You" index={1}>
        <Field label="Name" value={f.full_name} onChangeText={(v) => set('full_name', v)} autoCapitalize="words" />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Weight" suffix="kg" keyboardType="decimal-pad" value={f.weight_kg} onChangeText={(v) => set('weight_kg', v)} error={f.weight_kg && !valid ? 'Check range' : undefined} /></View>
          <View style={{ flex: 1 }}><Field label="Height" suffix="cm" keyboardType="decimal-pad" value={f.height_cm} onChangeText={(v) => set('height_cm', v)} /></View>
        </View>
        <Field label="Target weight (optional)" suffix="kg" keyboardType="decimal-pad" value={f.target_weight_kg} onChangeText={(v) => set('target_weight_kg', v)} />
      </Section>

      <Section title="Goal" index={2}><ChipGroup options={GOALS} value={f.goal} onChange={(v) => set('goal', v)} /></Section>
      <Section title="Activity level" index={3}><ChipGroup options={ACTIVITY} value={f.activity_level} onChange={(v) => set('activity_level', v)} /></Section>
      <Section title="Training" index={4}>
        <ChipGroup options={EXPERIENCE} value={f.experience} onChange={(v) => set('experience', v)} />
        <ChipGroup options={WORKOUT_ENV} value={f.workout_env} onChange={(v) => set('workout_env', v)} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Days / week" keyboardType="number-pad" value={f.training_days} onChangeText={(v) => set('training_days', v)} /></View>
          <View style={{ flex: 1 }}><Field label="Minutes" keyboardType="number-pad" value={f.workout_minutes} onChangeText={(v) => set('workout_minutes', v)} /></View>
        </View>
        <Field label="Injuries / limitations (comma separated)" value={f.injuries} onChangeText={(v) => set('injuries', v)} placeholder="e.g. knee, lower back" />
        <Text v="caption" faint>Exercises that conflict with these are excluded from your plans. This is not medical advice.</Text>
      </Section>
      <Section title="Diet" index={5}>
        <ChipGroup options={DIET_TYPES} value={f.diet_type} onChange={(v) => set('diet_type', v)} />
        <Field label="Allergies (comma separated)" value={f.allergies} onChangeText={(v) => set('allergies', v)} placeholder="e.g. peanuts, milk" />
        <Field label="Meals per day" keyboardType="number-pad" value={f.meals_per_day} onChangeText={(v) => set('meals_per_day', v)} />
      </Section>
      <Button title="Save changes" icon="checkmark-circle" disabled={!valid} loading={save.isPending} onPress={() => save.mutate()} />
    </Screen>
  );
}
