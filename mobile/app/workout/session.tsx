import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeInRight, FadeOutDown, FadeOutLeft, SlideInDown, SlideOutDown, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';
import { Button, Card, Chip, Icon, IconButton, PressableScale, ProgressBar, Ring, Sheet, Skeleton, Text, EmptyState, haptic } from '@/ui';
import { ErrorPanel, errorInfo } from '@/features/paywall/gate';
import { Burst } from '@/features/workout/Burst';
import { Exercise, PLAN_KEY, PR, prName, repsLabel, usePlan, usePrs } from '@/features/workout/api';
import { ExState, SetRow, sessionProgress, useSession } from '@/features/workout/sessionStore';
import { KG_PER_LB, displayWeight, num, usePrefs, weightUnit } from '@/features/settings/util';

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Stepper({ value, label, onMinus, onPlus, width = 112 }: { value: string; label: string; onMinus: () => void; onPlus: () => void; width?: number }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', width }}>
      <Text v="label" faint style={{ fontSize: 9, marginBottom: 2 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <PressableScale onPress={onMinus} accessibilityLabel={`Decrease ${label}`} hapticStyle="select"
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Icon name="remove" size={16} /></PressableScale>
        <Text v="number" style={{ fontSize: 20, minWidth: 44, textAlign: 'center' }}>{value}</Text>
        <PressableScale onPress={onPlus} accessibilityLabel={`Increase ${label}`} hapticStyle="select"
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Icon name="add" size={16} /></PressableScale>
      </View>
    </View>
  );
}

function SetRowView({ n, row, units, onAdjust, onTick }: {
  n: number; row: SetRow; units: 'metric' | 'imperial'; onAdjust: (f: 'reps' | 'weight_kg', d: number) => void; onTick: () => void;
}) {
  const t = useTheme();
  const bounce = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));
  const wStep = units === 'metric' ? 2.5 : 5 * KG_PER_LB;
  const shown = displayWeight(row.weight_kg, units);
  const tick = () => { bounce.value = withSequence(withSpring(1.25, spring), withSpring(1, spring)); onTick(); };
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 20,
      backgroundColor: row.done ? t.accent + '1F' : row.skipped ? t.surfaceAlt : t.surface, borderWidth: 1, borderColor: row.done ? t.accent + '66' : t.border, opacity: row.skipped ? 0.5 : 1 }}>
      <View style={{ width: 26, alignItems: 'center' }}><Text v="bodyStrong" muted>{n}</Text></View>
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
        <Stepper label={weightUnit(units).toUpperCase()} value={String(Number(shown.toFixed(1)))} onMinus={() => onAdjust('weight_kg', -wStep)} onPlus={() => onAdjust('weight_kg', wStep)} />
        <Stepper label="REPS" value={String(row.reps)} width={104} onMinus={() => onAdjust('reps', -1)} onPlus={() => onAdjust('reps', 1)} />
      </View>
      <Animated.View style={a}>
        <PressableScale onPress={tick} hapticStyle="none" disabled={row.skipped} accessibilityLabel={row.done ? `Set ${n} done, tap to undo` : `Complete set ${n}`}
          style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: row.done ? t.accent : t.surfaceAlt, borderWidth: row.done ? 0 : 1, borderColor: t.border }}>
          <Icon name={row.failed ? 'cloud-offline' : row.pending ? 'sync' : 'checkmark'} size={22} color={row.done ? t.onAccent : row.failed ? t.warn : t.textMuted} />
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}

export default function SessionScreen() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { dayId, resumeId } = useLocalSearchParams<{ dayId: string; resumeId?: string }>();
  const plan = usePlan();
  const prs = usePrs();
  const units = usePrefs((s) => s.units);
  const s = useSession();
  const started = useRef(false);
  const [startErr, setStartErr] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  const [rest, setRest] = useState<{ end: number; total: number } | null>(null);
  const [burst, setBurst] = useState(0);
  const [swapOpen, setSwapOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const best = useMemo(() => {
    const m: Record<string, PR> = {};
    (prs.data ?? []).forEach((p) => { if (p.exercise_id && (!m[p.exercise_id] || num(p.weight_kg) > num(m[p.exercise_id].weight_kg))) m[p.exercise_id] = p; });
    return m;
  }, [prs.data]);

  // start (or re-enter) the session once the plan + PR hints are loaded
  useEffect(() => {
    if (started.current || !plan.data || (!prs.isFetched && !prs.isError)) return;
    const day = plan.data.days.find((d) => d.id === dayId);
    if (!day) return;
    started.current = true;
    if (s.day?.id === day.id && s.sessionId) return; // re-entering an in-progress session
    const w: Record<string, number> = {};
    Object.entries(best).forEach(([id, p]) => { w[id] = num(p.weight_kg); });
    s.begin(day, resumeId ?? null, w).catch((e) => setStartErr(e));
  }, [plan.data, prs.isFetched, prs.isError, dayId, resumeId, best, s]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (rest && now >= rest.end) { haptic.success(); setRest(null); }
  }, [now, rest]);
  // retry unsynced sets whenever the connection might be back
  useEffect(() => { const id = setInterval(() => { useSession.getState().retryFailed(); }, 15000); return () => clearInterval(id); }, []);

  const exercises = s.exercises;
  const ex: ExState | undefined = exercises[s.index];
  const prog = sessionProgress(exercises);
  const elapsed = s.startedAt ? Math.max(0, Math.floor((now - s.startedAt) / 1000)) : 0;

  const go = useCallback((d: number) => { haptic.select(); const st = useSession.getState(); st.go(st.index + d); }, []);
  const swipe = Gesture.Pan().activeOffsetX([-30, 30]).failOffsetY([-24, 24]).onEnd((e) => {
    if (e.translationX < -70) runOnJS(go)(1);
    else if (e.translationX > 70) runOnJS(go)(-1);
  });

  const onTick = async (si: number) => {
    if (!ex) return;
    const wasDone = ex.sets[si].done;
    const isPr = await s.complete(s.index, si);
    if (!wasDone) {
      haptic.medium();
      const last = si === ex.sets.length - 1 && s.index === exercises.length - 1;
      if (!last) setRest({ end: Date.now() + num(ex.plan.rest_s, 60) * 1000, total: num(ex.plan.rest_s, 60) * 1000 });
    }
    if (isPr) { haptic.success(); setBurst((b) => b + 1); }
  };

  const replace = useMutation({
    mutationFn: (alt: Exercise) => api(`/v1/workouts/days/${s.day?.id}/replace-exercise`, { body: { exercise_id: ex?.plan.exercise.id, replacement_id: alt.id } }).then(() => alt),
    onSuccess: (alt) => {
      s.swapExercise(s.index, { ...alt, equipment: alt.equipment ?? [], instructions: alt.instructions ?? [], common_mistakes: alt.common_mistakes ?? [] });
      qc.invalidateQueries({ queryKey: PLAN_KEY });
      setSwapOpen(false); haptic.success();
    },
    onError: (e) => Alert.alert('Cannot use that exercise', errorInfo(e).message),
  });
  const alts = useQuery({ queryKey: ['exercise', ex?.plan.exercise.id], enabled: swapOpen && !!ex, queryFn: async () => { const r = await api<any>(`/v1/exercises/${ex!.plan.exercise.id}`); return (r.exercise ?? r) as Exercise; } });

  const finish = async () => {
    const run = async () => {
      setBusy(true);
      try {
        const failing = await s.retryFailed();
        if (failing > 0) { Alert.alert('Some sets have not synced', 'Check your connection, then tap Finish again. Nothing was lost.'); return; }
        await s.finish();
        qc.invalidateQueries({ queryKey: ['workout-stats'] }); qc.invalidateQueries({ queryKey: ['workout-prs'] });
        qc.invalidateQueries({ queryKey: ['workout-today'] }); qc.invalidateQueries({ queryKey: ['workout-history'] }); qc.invalidateQueries({ queryKey: ['dashboard'] });
        router.replace('/workout/summary');
      } catch (e) { Alert.alert('Could not finish', errorInfo(e).message); } finally { setBusy(false); }
    };
    if (prog.completed === 0) return Alert.alert('No sets completed', 'Finish anyway? There is nothing to save yet.', [{ text: 'Keep training', style: 'cancel' }, { text: 'Finish', onPress: run }]);
    if (prog.done < prog.total) return Alert.alert('Finish with sets left?', `${prog.total - prog.done} set(s) are not done. They will count against completion.`, [{ text: 'Keep training', style: 'cancel' }, { text: 'Finish', onPress: run }]);
    run();
  };
  const leave = () => Alert.alert('Leave workout?', 'Sets you completed are already saved. You can resume from the Workout tab.', [
    { text: 'Keep training', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => { s.reset(); router.back(); } },
  ]);

  const remaining = rest ? Math.max(0, Math.ceil((rest.end - now) / 1000)) : 0;
  const b = ex ? best[ex.plan.exercise.id] : undefined;

  if (plan.isError) return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}><ErrorPanel error={plan.error} onRetry={() => plan.refetch()} /></SafeAreaView>;
  if (startErr) return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 }}><ErrorPanel error={startErr} /><Button title="Close" variant="ghost" onPress={() => router.back()} /></SafeAreaView>;
  if (!ex || !s.sessionId) {
    const dayObj = plan.data?.days.find((d) => d.id === dayId);
    const missing = !!plan.data && (!dayObj || dayObj.exercises.length === 0);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 }}>
        {missing ? <EmptyState icon="alert-circle-outline" title={dayObj ? "Nothing to train" : "Workout not found"} hint={dayObj ? "This day has no exercises. Try regenerating your plan." : "This day is no longer in your plan."} action={{ label: 'Go back', onPress: () => router.back() }} />
          : <><Skeleton height={60} radius={20} /><Skeleton height={200} radius={28} /><Skeleton height={80} radius={20} /></>}
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={[t.accent + '26', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }} pointerEvents="none" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 6 }}>
          <IconButton name="close" label="Leave workout" onPress={leave} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text v="number" style={{ fontSize: 24 }}>{mmss(elapsed)}</Text>
            <Text v="caption" muted>{s.day?.focus} · {s.index + 1}/{exercises.length}</Text>
          </View>
          <Button title="Finish" size="md" loading={busy} onPress={finish} style={{ width: 96 }} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><ProgressBar value={prog.done} target={prog.total} height={6} /></View>

        <GestureDetector gesture={swipe}>
          <Animated.View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: rest ? 250 : 60, gap: 16 }} showsVerticalScrollIndicator={false}>
              <Animated.View key={s.index} entering={FadeInRight.springify().damping(18)} exiting={FadeOutLeft.duration(150)} style={{ gap: 16 }}>
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Chip label={ex.plan.exercise.muscle_group} selected />
                    {ex.plan.exercise.equipment.slice(0, 2).map((e) => <Chip key={e} label={e} />)}
                  </View>
                  <Text v="display">{ex.plan.exercise.name}</Text>
                  <Text v="body" muted>Target {ex.plan.sets} × {repsLabel(ex.plan.reps)} · rest {ex.plan.rest_s}s</Text>
                  {b ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="trophy-outline" size={15} color={t.fat} /><Text v="caption" color={t.fat}>Your best: {num(b.weight_kg)} kg{b.reps ? ` × ${b.reps}` : ''}</Text></View>
                    : <Text v="caption" faint>No previous record yet. Start light and focus on form.</Text>}
                </View>

                {ex.skipped ? <Card><Text v="body" muted>Exercise skipped.</Text></Card> : (
                  <View style={{ gap: 10 }}>
                    {ex.sets.map((row, si) => (
                      <SetRowView key={si} n={si + 1} row={row} units={units}
                        onAdjust={(f, d) => s.adjust(s.index, si, f, d)} onTick={() => onTick(si)} />
                    ))}
                  </View>
                )}

                {ex.plan.exercise.instructions.length > 0 && (
                  <Card>
                    <Text v="label" muted style={{ marginBottom: 8 }}>Form cues</Text>
                    {ex.plan.exercise.instructions.slice(0, 3).map((i, k) => <Text key={k} v="body" muted style={{ marginBottom: 4 }}>{k + 1}. {i}</Text>)}
                  </Card>
                )}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Skip" variant="ghost" size="md" icon="play-skip-forward" style={{ flex: 1 }} onPress={() => Alert.alert('Skip this exercise?', 'Its remaining sets will be marked as skipped.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Skip', onPress: () => { s.skipExercise(s.index); if (s.index < exercises.length - 1) s.go(s.index + 1); } }])} />
                  <Button title="Swap" variant="ghost" size="md" icon="swap-horizontal" style={{ flex: 1 }} onPress={() => setSwapOpen(true)} />
                </View>
              </Animated.View>
            </ScrollView>
          </Animated.View>
        </GestureDetector>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 12 }}>
          <IconButton name="chevron-back" label="Previous exercise" onPress={() => go(-1)} />
          {exercises.map((e, i) => <View key={i} style={{ width: i === s.index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: e.sets.every((r) => r.done || r.skipped) ? t.accent : i === s.index ? t.text : t.surfaceAlt }} />)}
          <IconButton name="chevron-forward" label="Next exercise" onPress={() => go(1)} />
        </View>

        <Burst k={burst} />
        {burst > 0 && <Animated.View key={burst} entering={FadeInDown.springify()} exiting={FadeOutDown.delay(1600)} pointerEvents="none" style={{ position: 'absolute', top: 120, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: t.fat, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, alignItems: 'center' }}><Icon name="trophy" size={18} color="#07080A" /><Text v="bodyStrong" color="#07080A">New personal record!</Text></View>
        </Animated.View>}

        {rest && (
          <Animated.View entering={SlideInDown.springify().damping(18)} exiting={SlideOutDown.duration(180)}
            style={{ position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: t.bgElevated, borderRadius: 28, borderWidth: 1, borderColor: t.accent + '55', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Ring value={remaining * 1000} target={rest.total} size={92} stroke={9}>
              <Text v="number" style={{ fontSize: 22 }}>{mmss(remaining)}</Text>
            </Ring>
            <View style={{ flex: 1, gap: 8 }}>
              <Text v="heading">Rest</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="+15s" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => setRest((r) => (r ? { end: r.end + 15000, total: r.total + 15000 } : r))} />
                <Button title="Skip" size="md" style={{ flex: 1 }} onPress={() => setRest(null)} />
              </View>
            </View>
          </Animated.View>
        )}
      </SafeAreaView>

      <Sheet visible={swapOpen} onClose={() => setSwapOpen(false)} title="Swap exercise">
        <View style={{ gap: 10 }}>
          <Text v="caption" muted>Only alternatives that are safe for your reported limitations are accepted.</Text>
          {alts.isLoading ? <Skeleton height={56} radius={16} /> : alts.isError ? <ErrorPanel error={alts.error} onRetry={() => alts.refetch()} />
            : (alts.data?.alternatives ?? []).length === 0 ? <Text v="body" muted>No alternatives listed for this exercise.</Text>
            : (alts.data?.alternatives ?? []).map((a) => (
              <PressableScale key={a.id} onPress={() => replace.mutate(a)} disabled={replace.isPending} accessibilityLabel={`Swap to ${a.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: t.surfaceAlt }}>
                <Icon name="barbell-outline" size={20} color={t.accent} />
                <View style={{ flex: 1 }}><Text v="bodyStrong">{a.name}</Text><Text v="caption" muted>{a.muscle_group}{a.equipment?.length ? ` · ${a.equipment.join(', ')}` : ''}</Text></View>
                <Icon name="chevron-forward" size={16} color={t.textFaint} />
              </PressableScale>
            ))}
        </View>
      </Sheet>
    </View>
  );
}
