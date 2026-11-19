import React, { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Button, Card, EmptyState, Icon, Reveal, Ring, Screen, Text, haptic } from '@/ui';
import { Burst } from '@/features/workout/Burst';
import { sessionProgress, useSession } from '@/features/workout/sessionStore';
import { num } from '@/features/settings/util';

export default function Summary() {
  const t = useTheme();
  const router = useRouter();
  const result = useSession((s) => s.result);
  const exercises = useSession((s) => s.exercises);
  const day = useSession((s) => s.day);
  const reset = useSession((s) => s.reset);
  const prs: any[] = result?.new_prs ?? [];

  useEffect(() => { if (result) haptic.success(); }, [result]);
  const done = () => { reset(); router.replace('/(tabs)/workout'); };

  if (!result) {
    return <Screen title="Summary" tabBar={false}><EmptyState icon="checkmark-circle-outline" title="No workout to show" action={{ label: 'Back to workouts', onPress: done }} /></Screen>;
  }
  const { completed, total } = sessionProgress(exercises);
  const completion = num(result.completion_pct);
  const prLabel = (p: any) => (typeof p === 'string' ? p : p?.exercise_name ?? p?.name ?? 'Personal record') + (p?.weight_kg ? ` · ${p.weight_kg} kg${p.reps ? ` × ${p.reps}` : ''}` : '');

  return (
    <Screen title="Workout complete" subtitle={day?.focus} tabBar={false}>
      <Reveal index={0}>
        <LinearGradient colors={[t.accent + '40', t.accent2 + '12']} style={{ borderRadius: 28, padding: 24, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.accent + '55', overflow: 'hidden' }}>
          <Ring value={completion} target={100} size={160} stroke={14} delay={300}>
            <AnimatedNumber value={completion} suffix="%" style={{ fontSize: 38 }} />
            <Text v="caption" muted>completed</Text>
          </Ring>
          <Text v="body" muted>{completed} of {total} sets done</Text>
          {prs.length > 0 && <Burst k={1} size={110} />}
        </LinearGradient>
      </Reveal>

      <Reveal index={1}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1 }}><AnimatedNumber value={num(result.duration_min)} suffix=" min" style={{ fontSize: 26 }} /><Text v="caption" muted>Duration</Text></Card>
          <Card style={{ flex: 1 }}>
            {result.kcal_burned != null ? <AnimatedNumber value={num(result.kcal_burned)} prefix="≈ " style={{ fontSize: 26 }} /> : <Text v="number">-</Text>}
            <Text v="caption" muted>kcal (estimate)</Text>
          </Card>
        </View>
      </Reveal>

      <Reveal index={2}>
        <Card>
          <Text v="label" muted style={{ marginBottom: 10 }}>Personal records</Text>
          {prs.length === 0 ? <Text v="body" muted>No new records this time. Consistency is what builds them.</Text> : (
            <View style={{ gap: 12 }}>
              {prs.map((p, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.fat + '26', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={17} color={t.fat} /></View>
                  <Text v="bodyStrong" style={{ flex: 1 }}>{prLabel(p)}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </Reveal>
      <Text v="caption" faint style={{ textAlign: 'center' }}>Calories burned are rough estimates based on activity type and duration.</Text>
      <Button title="Done" icon="checkmark" onPress={done} />
    </Screen>
  );
}
