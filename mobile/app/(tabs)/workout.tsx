import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { useTheme } from '@/theme/ThemeProvider';
import {
  AnimatedNumber, BarChart, Button, Card, Chip, EmptyState, Icon, PressableScale, Reveal, Ring, Screen, Section, Sheet, Skeleton, Text, haptic,
} from '@/ui';
import { ErrorPanel, LockBadge, QueryState, errorInfo } from '@/features/paywall/gate';
import { PLAN_KEY, Plan, PlanDay, QUICK_MUSCLES, estMinutes, prName, repsLabel, useOverview, usePlan, usePrs, useStats, useToday } from '@/features/workout/api';
import { useSession } from '@/features/workout/sessionStore';
import { WEEKDAY_LONG, WEEKDAY_SHORT, num, shortDate, weekdayMon1 } from '@/features/settings/util';

function DayExercises({ day }: { day: PlanDay }) {
  return (
    <View style={{ gap: 10 }}>
      {day.exercises.map((pe, i) => (
        <View key={pe.exercise.id + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text v="caption" faint style={{ width: 18 }}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text v="bodyStrong" numberOfLines={1}>{pe.exercise.name}</Text>
            <Text v="caption" muted>{pe.sets} × {repsLabel(pe.reps)} · rest {pe.rest_s}s · {pe.exercise.muscle_group}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function WorkoutTab() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const plan = usePlan();
  const today = useToday();
  const stats = useStats(8);
  const prs = usePrs();
  const [preview, setPreview] = useState<PlanDay | null>(null);
  const overview = useOverview();
  const [quickOpen, setQuickOpen] = useState(false);
  const [qMin, setQMin] = useState<15 | 30 | 45 | 60>(30);
  const [qMuscle, setQMuscle] = useState<string>('full');
  const quick = useMutation({
    mutationFn: () => api<{ day: PlanDay; notes?: string[] }>('/v1/workouts/quick', { body: { minutes: qMin, ...(qMuscle !== 'full' ? { muscle: qMuscle } : {}) } }),
    onSuccess: (r) => {
      const st = useSession.getState();
      st.reset(); st.setQuick(r.day);
      setQuickOpen(false); haptic.success();
      router.push({ pathname: '/workout/session', params: { quick: '1' } });
    },
    onError: (e) => Alert.alert('Could not build a quick workout', errorInfo(e).message),
  });

  const refetchAll = () => { plan.refetch(); today.refetch(); stats.refetch(); prs.refetch(); overview.refetch(); };
  const generate = useMutation({
    mutationFn: () => api<{ plan: Plan }>('/v1/workouts/plan/generate', { body: {} }),
    onSuccess: () => { haptic.success(); qc.invalidateQueries({ queryKey: PLAN_KEY }); qc.invalidateQueries({ queryKey: ['workout-today'] }); },
    onError: (e) => Alert.alert('Could not build your plan', errorInfo(e).message),
  });
  const confirmRegenerate = () =>
    Alert.alert('Regenerate your plan?', 'Your current weekly plan will be replaced. Your history and personal records stay safe. The new plan respects your goal, equipment and any limitations you reported.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Regenerate', onPress: () => generate.mutate() },
    ]);

  const start = (d: PlanDay, resumeId?: string | null) => router.push({ pathname: '/workout/session', params: { dayId: d.id, ...(resumeId ? { resumeId } : {}) } });
  const wd = weekdayMon1();
  const isFree = me.data?.tier === 'free';

  return (
    <Screen title="Workout" subtitle="Train smart, recover well" onRefresh={refetchAll} refreshing={plan.isRefetching}>
      <QueryState query={plan} skeleton={<><Skeleton height={190} radius={28} /><Skeleton height={80} radius={24} /></>}
        empty={(p) => (p ? null : (
          <Card glow>
            <EmptyState icon="barbell-outline" title="Let's build your plan" hint="We create a weekly schedule from your goal, experience, equipment and available days, and we avoid anything that conflicts with your limitations."
              action={{ label: generate.isPending ? 'Building…' : 'Generate my plan', onPress: () => generate.mutate() }} />
            {isFree && <Text v="caption" muted style={{ textAlign: 'center' }}>Free plans get a balanced full-body template. Pro unlocks personalised schedules.</Text>}
          </Card>
        ))}>
        {(p) => {
          const day = today.data?.day ?? p?.days.find((d) => d.weekday === wd) ?? null;
          const active = today.data?.session;
          return (
            <View style={{ gap: 20 }}>
              <Reveal index={0}>
                <LinearGradient colors={day && !day.is_rest ? [t.accent + '40', t.accent2 + '14'] : [t.surface, t.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 28, padding: 22, borderWidth: 1, borderColor: day && !day.is_rest ? t.accent + '55' : t.border, gap: 14 }}>
                  <Text v="label" accent>{WEEKDAY_LONG[wd - 1]} · Today</Text>
                  {!day || day.is_rest ? (
                    <>
                      <Text v="display">Recovery day</Text>
                      <Text v="body" muted>Muscles grow while you rest. A light walk, stretching and good sleep are plenty today.</Text>
                    </>
                  ) : (
                    <>
                      <Text v="display">{day.focus}</Text>
                      <View style={{ flexDirection: 'row', gap: 20 }}>
                        <View><AnimatedNumber value={day.exercises.length} style={{ fontSize: 26 }} /><Text v="caption" muted>exercises</Text></View>
                        <View><AnimatedNumber value={estMinutes(day)} prefix="~" style={{ fontSize: 26 }} /><Text v="caption" muted>minutes</Text></View>
                        <View><AnimatedNumber value={day.exercises.reduce((a, e) => a + num(e.sets), 0)} style={{ fontSize: 26 }} /><Text v="caption" muted>sets</Text></View>
                      </View>
                      <Button title={active ? 'Resume workout' : 'Start workout'} icon="play" onPress={() => start(day, active?.id)} />
                    </>
                  )}
                </LinearGradient>
              </Reveal>

              <Section title="This week" index={1}
                action={<PressableScale onPress={confirmRegenerate} accessibilityLabel="Regenerate plan" hapticStyle="select"><View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="refresh" size={16} color={t.accent} /><Text v="caption" accent>{generate.isPending ? 'Building…' : 'Regenerate'}</Text></View></PressableScale>}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {WEEKDAY_SHORT.map((label, i) => {
                    const d = p?.days.find((x) => x.weekday === i + 1);
                    const rest = !d || d.is_rest;
                    const isToday = i + 1 === wd;
                    return (
                      <PressableScale key={label} onPress={() => d && setPreview(d)} hapticStyle="select" accessibilityLabel={`${WEEKDAY_LONG[i]}: ${rest ? 'rest' : d?.focus}`}
                        style={{ alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text v="caption" color={isToday ? t.accent : t.textFaint}>{label}</Text>
                        <View style={{ width: 40, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: rest ? t.surface : t.accent + (isToday ? 'FF' : '26'), borderWidth: 1, borderColor: isToday ? t.accent : t.border }}>
                          <Icon name={rest ? 'moon-outline' : 'barbell'} size={18} color={rest ? t.textFaint : isToday ? t.onAccent : t.accent} />
                        </View>
                        <Text v="caption" color={t.textMuted} numberOfLines={1} style={{ fontSize: 10, maxWidth: 46 }}>{rest ? 'Rest' : d?.focus.split(/[ ,&/·-]/)[0]}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                <Text v="caption" faint>Plan avoids exercises that conflict with the limitations you reported. Stop if anything hurts, and check with a professional for injuries.</Text>
              </Section>
            </View>
          );
        }}
      </QueryState>

      <Section title="Quick workout" index={2}>
        <Card onPress={() => setQuickOpen(true)} glow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accent + '26', alignItems: 'center', justifyContent: 'center' }}><Icon name="flash" size={22} color={t.accent} /></View>
            <View style={{ flex: 1 }}><Text v="heading">Short on time?</Text><Text v="caption" muted>Pick 15 to 60 minutes and a muscle. We build it for you.</Text></View>
            <Icon name="chevron-forward" size={18} color={t.textFaint} />
          </View>
        </Card>
      </Section>

      <Section title="This week by muscle" index={3}>
        <QueryState query={overview} skeleton={<Skeleton height={200} radius={24} />}
          empty={(o) => (o.muscles.length ? null : <Card><Text v="body" muted>Finish a workout this week to see your sets per muscle group here.</Text></Card>)}>
          {(o) => (
            <Card>
              <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
                <View><AnimatedNumber value={o.sessions_this_week} suffix={o.planned_sessions ? ` / ${o.planned_sessions}` : ''} style={{ fontSize: 24 }} /><Text v="caption" muted>sessions</Text></View>
                <View><AnimatedNumber value={o.streak.current} style={{ fontSize: 24 }} /><Text v="caption" muted>day streak</Text></View>
                <View><AnimatedNumber value={o.muscles.reduce((a, m) => a + m.sets, 0)} style={{ fontSize: 24 }} /><Text v="caption" muted>sets</Text></View>
              </View>
              <BarChart data={o.muscles.map((m) => m.sets)} labels={o.muscles.map((m) => m.muscle_group.slice(0, 4))} height={150} highlightLast={false} />
              <Text v="caption" faint style={{ marginTop: 6 }}>Sets completed per muscle group since Monday.</Text>
              {o.last_pr && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <Icon name="trophy" size={16} color={t.fat} />
                  <Text v="caption" muted style={{ flex: 1 }} numberOfLines={1}>Last PR: {o.last_pr.name ?? 'Exercise'} · {num(o.last_pr.weight_kg)} kg × {o.last_pr.reps} ({shortDate(o.last_pr.achieved_on)})</Text>
                </View>
              )}
            </Card>
          )}
        </QueryState>
      </Section>

      {plan.data && (
        <>
          <Section title="Weekly stats" index={4}>
            <QueryState query={stats} skeleton={<Skeleton height={200} radius={24} />} feature="workout_analytics"
              empty={(s) => ((s.weeks ?? []).every((w) => !num(w.sessions)) && !num(s.sessions_this_week) ? (
                <Card><EmptyState icon="stats-chart-outline" title="No sessions yet" hint="Finish your first workout to see frequency, volume and completion here." /></Card>) : null)}>
              {(s) => {
                const weeks = s.weeks ?? [];
                const cur = weeks[weeks.length - 1];
                const completion = num(s.completion_pct ?? cur?.completion_pct);
                const sessions = num(s.sessions_this_week ?? cur?.sessions);
                return (
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                      <Ring value={completion} target={100} size={104} stroke={10}>
                        <AnimatedNumber value={completion} suffix="%" style={{ fontSize: 22 }} />
                        <Text v="caption" muted style={{ fontSize: 10 }}>completion</Text>
                      </Ring>
                      <View style={{ flex: 1, gap: 10 }}>
                        <View><AnimatedNumber value={sessions} style={{ fontSize: 28 }} /><Text v="caption" muted>sessions this week{p_target(plan.data)}</Text></View>
                        {s.frequency != null && <Text v="caption" muted>~{num(s.frequency).toFixed(1)} sessions / week average</Text>}
                      </View>
                    </View>
                    {weeks.length > 1 && (
                      <View style={{ marginTop: 16, gap: 6 }}>
                        <Text v="label" muted>Weekly volume (kg)</Text>
                        <BarChart data={weeks.map((w) => num(w.volume_kg))} labels={weeks.map((w) => (w.week_start ? shortDate(w.week_start) : ''))} height={140} />
                      </View>
                    )}
                  </Card>
                );
              }}
            </QueryState>
          </Section>

          <Section title="Personal records" index={5}>
            <QueryState query={prs} skeleton={<Skeleton height={90} radius={24} />}
              empty={(r) => (r.length ? null : <Card><Text v="body" muted>Your best lifts will show up here as you train. Complete sets with weight to set your first PR.</Text></Card>)}>
              {(r) => (
                <Card>
                  <View style={{ gap: 12 }}>
                    {[...r].sort((a, b) => num(b.weight_kg) - num(a.weight_kg)).slice(0, 4).map((x, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.fat + '26', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={17} color={t.fat} /></View>
                        <Text v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{prName(x)}</Text>
                        <Text v="bodyStrong" accent>{num(x.weight_kg)} kg{x.reps ? ` × ${x.reps}` : ''}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              )}
            </QueryState>
          </Section>

          <Section title="Explore" index={6}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Card onPress={() => router.push('/exercises')} style={{ flex: 1 }}>
                <View style={{ gap: 8 }}><Icon name="library-outline" size={24} color={t.accent} /><Text v="heading">Exercise library</Text><Text v="caption" muted>Form guides & alternatives</Text></View>
              </Card>
              <Card onPress={() => router.push('/workout/history')} style={{ flex: 1 }}>
                <View style={{ gap: 8 }}><Icon name="time-outline" size={24} color={t.accent} /><Text v="heading">History</Text><Text v="caption" muted>Every session you logged</Text></View>
              </Card>
            </View>
            {isFree && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><LockBadge /><Text v="caption" muted onPress={() => router.push('/paywall')}>Upgrade for personalised schedules and detailed analytics</Text></View>}
          </Section>
        </>
      )}
      {generate.isError && <ErrorPanel error={generate.error} feature="personalized_workouts" />}

      <Sheet visible={quickOpen} onClose={() => setQuickOpen(false)} title="Quick workout">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Text v="label" muted>How long?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([15, 30, 45, 60] as const).map((m) => <Chip key={m} label={`${m} min`} selected={qMin === m} onPress={() => setQMin(m)} />)}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text v="label" muted>Focus</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_MUSCLES.map((m) => <Chip key={m} label={m === 'full' ? 'Full body' : m.charAt(0).toUpperCase() + m.slice(1)} selected={qMuscle === m} onPress={() => setQMuscle(m)} />)}
            </View>
          </View>
          <Text v="caption" faint>Uses your equipment and avoids anything that conflicts with your reported limitations.</Text>
          <Button title="Build and start" icon="flash" loading={quick.isPending} onPress={() => quick.mutate()} />
        </View>
      </Sheet>

      <Sheet visible={!!preview} onClose={() => setPreview(null)} title={preview ? `${WEEKDAY_LONG[preview.weekday - 1]} · ${preview.focus}` : ''}>
        {preview && (preview.is_rest ? <Text v="body" muted>Rest and recovery.</Text> : (
          <View style={{ gap: 16 }}>
            <DayExercises day={preview} />
            <Button title="Start this workout" icon="play" onPress={() => { const d = preview; setPreview(null); start(d); }} />
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

function p_target(p: Plan | null | undefined): string {
  const n = p?.days.filter((d) => !d.is_rest).length;
  return n ? ` (plan: ${n})` : '';
}
