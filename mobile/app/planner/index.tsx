import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useHasFeature, useMe } from '@/lib/useMe';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Button, Card, Chip, EmptyState, Icon, IconButton, PressableScale, Reveal, Ring, Screen, Section, Segmented, Sheet, Skeleton, Text, haptic } from '@/ui';
import { ErrorPanel, LockBadge, QueryState, UpgradeCard, errorInfo } from '@/features/paywall/gate';
import { MealCard } from '@/features/planner/MealCard';
import { DayPlan, MEAL_ICON, MEAL_LABEL, Rec, groupMeals, normalizeMeals, sumMeals, useDayPlan, useRecs } from '@/features/planner/api';
import { WEEKDAY_SHORT, addDays, num, parseIso, shortDate, todayIso, weekdayMon1 } from '@/features/settings/util';

function WeekStrip({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const t = useTheme();
  const monday = addDays(date, -(weekdayMon1(parseIso(date)) - 1));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = todayIso();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <IconButton name="chevron-back" label="Previous week" size={18} onPress={() => onPick(addDays(date, -7))} />
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
        {days.map((d, i) => {
          const sel = d === date;
          return (
            <PressableScale key={d} onPress={() => onPick(d)} hapticStyle="select" accessibilityLabel={`${WEEKDAY_SHORT[i]} ${shortDate(d)}`}
              style={{ alignItems: 'center', gap: 4, paddingVertical: 8, width: 40, borderRadius: 16, backgroundColor: sel ? t.accent : 'transparent' }}>
              <Text v="caption" color={sel ? t.onAccent : t.textFaint} style={{ fontSize: 10 }}>{WEEKDAY_SHORT[i]}</Text>
              <Text v="bodyStrong" color={sel ? t.onAccent : d === today ? t.accent : t.text}>{parseIso(d).getDate()}</Text>
            </PressableScale>
          );
        })}
      </View>
      <IconButton name="chevron-forward" label="Next week" size={18} onPress={() => onPick(addDays(date, 7))} />
    </View>
  );
}

function RecCard({ date }: { date: string }) {
  const t = useTheme();
  const q = useRecs(date, true);
  return (
    <Card glow>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="sparkles" size={18} color={t.accent} /><Text v="heading">What should I eat next?</Text></View>
        <QueryState query={q} skeleton={<Skeleton height={80} radius={16} />} feature="ai_meal_suggestions"
          empty={(r) => (r.recommendations.length ? null : <Text v="body" muted>{r.summary ?? 'Log a meal and we will suggest what fits your remaining calories and macros.'}</Text>)}>
          {(r) => (
            <View style={{ gap: 10 }}>
              {r.summary ? <Text v="body" muted>{r.summary}</Text> : null}
              {r.recommendations.slice(0, 4).map((x: Rec, i) => (
                <View key={i} style={{ backgroundColor: t.surfaceAlt, borderRadius: 16, padding: 12, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text v="bodyStrong" style={{ flex: 1 }}>{x.name}{x.grams ? ` · ${Math.round(x.grams)} g` : ''}</Text>
                    {x.kcal != null && <Text v="caption" muted>{Math.round(x.kcal)} kcal</Text>}
                  </View>
                  {x.reason ? <Text v="caption" muted>{x.reason}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </QueryState>
      </View>
    </Card>
  );
}

export default function Planner() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const canPlan = useHasFeature('ai_meal_suggestions');
  const [date, setDate] = useState(todayIso());
  const [view, setView] = useState<'day' | 'week'>('day');
  const [genOpen, setGenOpen] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const plan = useDayPlan(date);

  const monday = addDays(date, -(weekdayMon1(parseIso(date)) - 1));
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const weekQs = useQueries({
    queries: weekDates.map((d) => ({
      queryKey: ['diet-plan', d], enabled: view === 'week',
      queryFn: async (): Promise<DayPlan> => {
        try { const r = await api<any>(`/v1/diet/plan?date=${d}`); return { plan_id: r?.plan_id ?? null, date: d, meals: normalizeMeals(r) }; }
        catch { return { plan_id: null, date: d, meals: [] }; }
      },
    })),
  });

  const target = num((me.data?.profile as any)?.target_kcal);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['diet-plan'] }); qc.invalidateQueries({ queryKey: ['diet-recs'] }); qc.invalidateQueries({ queryKey: ['shopping'] }); };
  const generate = useMutation({
    mutationFn: () => api<{ plan_id: string }>('/v1/diet/generate', { body: { period, start_date: date } }),
    onSuccess: () => { haptic.success(); setGenOpen(false); refresh(); },
    onError: (e) => { setGenOpen(false); Alert.alert('Could not generate a plan', errorInfo(e).message); },
  });

  return (
    <Screen title="Meal plan" subtitle="Built around your goal and tastes" back tabBar={false} onRefresh={refresh} refreshing={plan.isRefetching}
      right={<View style={{ flexDirection: 'row', gap: 8 }}>
        <IconButton name="book-outline" label="Recipes" onPress={() => router.push('/recipes')} />
        <IconButton name="cart-outline" label="Shopping list" onPress={() => router.push({ pathname: '/planner/shopping', params: { planId: plan.data?.plan_id ?? '' } })} />
      </View>}>
      <WeekStrip date={date} onPick={setDate} />
      <Segmented options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} value={view} onChange={setView} />

      {view === 'day' ? (
        <>
          {date === todayIso() && canPlan && <Reveal index={0}><RecCard date={date} /></Reveal>}
          <QueryState query={plan} feature="ai_meal_suggestions" skeleton={<><Skeleton height={110} radius={24} /><Skeleton height={90} radius={24} /><Skeleton height={90} radius={24} /></>}
            empty={(p) => (p.meals.length ? null : !canPlan ? (
              <UpgradeCard feature="ai_meal_suggestions" title="Personalised meal plans" hint="Pro generates daily, weekly and monthly plans that match your calories, macros, diet and allergies." />
            ) : (
              <Card glow><EmptyState icon="restaurant-outline" title="No plan for this day" hint="Generate meals that fit your calories, macros, preferences and workout days."
                action={{ label: 'Generate meal plan', onPress: () => setGenOpen(true) }} /></Card>
            ))}>
            {(p) => {
              const sum = sumMeals(p.meals);
              return (
                <View style={{ gap: 18 }}>
                  <Reveal index={1}>
                    <Card>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                        <Ring value={sum.kcal} target={target || sum.kcal || 1} size={104} stroke={10}>
                          <AnimatedNumber value={sum.kcal} style={{ fontSize: 22 }} /><Text v="caption" muted style={{ fontSize: 10 }}>kcal</Text>
                        </Ring>
                        <View style={{ flex: 1, gap: 6 }}>
                          <Text v="label" muted>Planned for the day</Text>
                          <Text v="caption" color={t.protein}>Protein {Math.round(sum.p)} g</Text>
                          <Text v="caption" color={t.carbs}>Carbs {Math.round(sum.c)} g</Text>
                          <Text v="caption" color={t.fat}>Fat {Math.round(sum.f)} g</Text>
                          {target ? <Text v="caption" faint>Target {Math.round(target)} kcal</Text> : null}
                        </View>
                      </View>
                    </Card>
                  </Reveal>
                  {groupMeals(p.meals).map((g, gi) => (
                    <Section key={g.type} title={MEAL_LABEL[g.type] ?? g.type} index={gi + 2}>
                      {g.meals.map((m) => <MealCard key={m.id} meal={m} date={date} onChanged={refresh} />)}
                    </Section>
                  ))}
                  <Button title="Regenerate plan" icon="refresh" variant="ghost" onPress={() => setGenOpen(true)} />
                  <Text v="caption" faint style={{ textAlign: 'center' }}>Plans are suggestions based on food database values. Portions and recipes vary, so adjust to how you feel.</Text>
                </View>
              );
            }}
          </QueryState>
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {weekDates.map((d, i) => {
            const q = weekQs[i];
            const meals = q.data?.meals ?? [];
            const sum = sumMeals(meals);
            return (
              <Reveal key={d} index={i}>
                <Card onPress={() => { setDate(d); setView('day'); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 48 }}><Text v="caption" color={d === todayIso() ? t.accent : t.textMuted}>{WEEKDAY_SHORT[i]}</Text><Text v="number" style={{ fontSize: 22 }}>{parseIso(d).getDate()}</Text></View>
                    <View style={{ flex: 1 }}>
                      {q.isLoading ? <Skeleton height={36} radius={10} /> : meals.length === 0 ? <Text v="body" muted>No meals planned</Text> : (
                        <>
                          <Text v="bodyStrong">{Math.round(sum.kcal)} kcal · P {Math.round(sum.p)}g</Text>
                          <Text v="caption" muted numberOfLines={1}>{meals.map((m) => m.name).join(' · ')}</Text>
                        </>
                      )}
                    </View>
                    <Icon name="chevron-forward" size={16} color={t.textFaint} />
                  </View>
                </Card>
              </Reveal>
            );
          })}
          {!canPlan && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><LockBadge /><Text v="caption" muted>Meal plan generation is part of Pro.</Text></View>}
        </View>
      )}

      <Sheet visible={genOpen} onClose={() => setGenOpen(false)} title="Generate meal plan">
        <View style={{ gap: 16 }}>
          <Text v="body" muted>Starting {shortDate(date)}. Plans match your calorie and macro targets within a few percent and respect allergies, diet type and disliked foods.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['daily', 'weekly', 'monthly'] as const).map((p) => <Chip key={p} label={p[0].toUpperCase() + p.slice(1)} selected={period === p} onPress={() => setPeriod(p)} />)}
          </View>
          {plan.data && plan.data.meals.length > 0 && <Text v="caption" color={t.warn}>This replaces the meals planned for this period.</Text>}
          <Button title="Generate" icon="sparkles" loading={generate.isPending} onPress={() => generate.mutate()} />
        </View>
      </Sheet>
      {generate.isError && <ErrorPanel error={generate.error} feature="ai_meal_suggestions" />}
    </Screen>
  );
}
