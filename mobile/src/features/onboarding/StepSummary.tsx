import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Card, ErrorState, Reveal, Ring, Skeleton, SwitchRow, Text } from '@/ui';
import { useOnboarding } from './store';
import { ACTIVITY } from './options';
import { StepHeader } from './widgets';

export interface Targets {
  bmi: number; bmi_category: string; bmr_kcal: number; tdee_kcal: number; target_kcal: number;
  protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; water_ml: number;
  suggested_activity: string; notes: string[]; disclaimer: string;
}

export function useTargetsPreview(active = true) {
  const d = useOnboarding((s) => s.data);
  const body = {
    date_of_birth: d.date_of_birth, gender: d.gender, weight_kg: d.weight_kg, height_cm: d.height_cm,
    target_weight_kg: d.target_weight_kg, activity_level: d.activity_level, goal: d.goal, training_days: Math.min(d.training_days, Math.max(1, d.workout_days.length)),
  };
  return useQuery({ queryKey: ['onb-targets', body], queryFn: () => api<Targets>('/v1/profile/targets', { body }), enabled: active && !!d.goal && !!d.date_of_birth, staleTime: 0, retry: 0 });
}

function Tile({ icon, label, value, sub, delay }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; sub?: string; delay: number }) {
  const t = useTheme();
  return (
    <Reveal index={delay} style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Card style={{ gap: 6 }}>
        <Ionicons name={icon} size={20} color={t.accent} />
        <Text v="number" style={{ fontSize: 24 }}>{value}</Text>
        <Text v="caption" muted>{label}{sub ? ` · ${sub}` : ''}</Text>
      </Card>
    </Reveal>
  );
}

export function StepSummary() {
  const t = useTheme();
  const { data, set } = useOnboarding();
  const q = useTargetsPreview();
  const r = q.data;
  const act = ACTIVITY.find((a) => a.value === r?.suggested_activity)?.title;

  return (
    <View style={{ gap: 18 }}>
      <StepHeader title="Your personal plan" subtitle="Estimates from standard formulas, based on what you told us." />

      {q.isLoading ? (
        <View style={{ gap: 14, alignItems: 'center' }}>
          <Skeleton height={220} width={220} radius={110} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : q.isError || !r ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Reveal index={0} style={{ alignItems: 'center' }}>
            <Ring value={r.target_kcal} target={r.target_kcal} size={220} stroke={16}>
              <AnimatedNumber value={r.target_kcal} style={{ fontSize: 46 }} />
              <Text v="label" muted>kcal / day</Text>
            </Ring>
          </Reveal>
          <Reveal index={1}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {([['Protein', r.protein_g, t.protein], ['Carbs', r.carbs_g, t.carbs], ['Fat', r.fat_g, t.fat]] as const).map(([l, v, c], i) => (
                <View key={l} style={{ alignItems: 'center', gap: 8 }}>
                  <Ring value={1} target={1} size={84} stroke={8} from={c} to={c} delay={200 + i * 150}>
                    <AnimatedNumber value={v} suffix="g" style={{ fontSize: 20 }} />
                  </Ring>
                  <Text v="caption" muted>{l}</Text>
                </View>
              ))}
            </View>
          </Reveal>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Tile icon="body-outline" label="BMI" value={r.bmi.toFixed(1)} sub={r.bmi_category} delay={2} />
            <Tile icon="flame-outline" label="BMR" value={`${r.bmr_kcal}`} sub="kcal" delay={3} />
            <Tile icon="speedometer-outline" label="TDEE" value={`${r.tdee_kcal}`} sub="kcal" delay={4} />
            <Tile icon="water-outline" label="Water" value={`${(r.water_ml / 1000).toFixed(1)} L`} sub="adjustable" delay={5} />
            <Tile icon="leaf-outline" label="Fiber" value={`${r.fiber_g} g`} delay={6} />
            <Tile icon="pulse-outline" label="Activity" value={act ?? '-'} sub="suggested" delay={7} />
          </View>
          {r.notes.map((n) => (
            <Reveal key={n} index={8}>
              <Card style={{ flexDirection: 'row', gap: 12, borderColor: t.warn + '66' }}>
                <Ionicons name="information-circle" size={22} color={t.warn} />
                <Text v="body" style={{ flex: 1 }}>{n}</Text>
              </Card>
            </Reveal>
          ))}
          <Text v="caption" faint>{r.disclaimer}</Text>
        </>
      )}

      <Card style={{ gap: 4 }}>
        <SwitchRow icon="shield-checkmark-outline" label="Privacy consent (required)" hint="I agree to the Privacy Policy and to my fitness data being stored securely to power the app."
          value={data.privacy_consent} onChange={(v) => set({ privacy_consent: v })} />
        <SwitchRow icon="sparkles-outline" label="AI processing (optional)" hint="Allow food photos and your logged data to be processed by AI to recognise meals and personalise advice. You can change this later."
          value={data.ai_consent} onChange={(v) => set({ ai_consent: v })} />
      </Card>
    </View>
  );
}
