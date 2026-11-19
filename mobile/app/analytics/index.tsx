import React, { useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useHasFeature, useMe } from '@/lib/useMe';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, AreaChart, BarChart, Button, Card, EmptyState, Icon, MacroRow, Reveal, Ring, Screen, Section, Segmented, Skeleton, Text } from '@/ui';
import { ErrorPanel, LockBadge, QueryState, UpgradeCard } from '@/features/paywall/gate';
import { Norm, Period, useAnalytics, useWeeklyReport } from '@/features/analytics/api';
import { num, titleCase, usePrefs, displayWeight, weightUnit } from '@/features/settings/util';

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function Tile({ label, value, unit, color }: { label: string; value: number; unit?: string; color?: string }) {
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Text v="label" muted style={{ fontSize: 10 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <AnimatedNumber value={value} style={{ fontSize: 26, color: color }} />{unit ? <Text v="caption" muted>{unit}</Text> : null}
      </View>
    </Card>
  );
}

function WeeklyReportCard() {
  const t = useTheme();
  const has = useHasFeature('weekly_ai_report');
  const [on, setOn] = useState(false);
  const q = useWeeklyReport(on && has);
  if (!has) return <UpgradeCard feature="weekly_ai_report" title="Weekly AI report" hint="Premium gives you a personalised weekly report with clear, actionable recommendations based on your own data." />;
  return (
    <Card glow>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="document-text" size={20} color={t.accent} /><Text v="heading">Weekly AI report</Text></View>
        {!on ? (
          <><Text v="body" muted>Your week in numbers, with a short summary and what to focus on next.</Text><Button title="View my report" icon="sparkles" size="md" onPress={() => setOn(true)} /></>
        ) : (
          <QueryState query={q} skeleton={<Skeleton height={160} radius={16} />} feature="weekly_ai_report">
            {(r) => (
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {Object.entries(r.stats ?? {}).filter(([, v]) => typeof v === 'number').slice(0, 8).map(([k, v]) => (
                    <View key={k} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: t.surfaceAlt, borderRadius: 16, padding: 12 }}>
                      <Text v="caption" muted>{titleCase(k)}</Text><Text v="number" style={{ fontSize: 20 }}>{Math.round((v as number) * 10) / 10}</Text>
                    </View>
                  ))}
                </View>
                {r.summary ? <Text v="body">{r.summary}</Text> : null}
                {(r.recommendations ?? []).map((x, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}><Icon name="arrow-forward-circle" size={20} color={t.accent} /><Text v="body" style={{ flex: 1 }}>{x}</Text></View>
                ))}
                <Text v="caption" faint>Numbers are calculated from your logs. The AI only writes the summary and is not medical advice.</Text>
              </View>
            )}
          </QueryState>
        )}
      </View>
    </Card>
  );
}

function Body({ d, period }: { d: Norm; period: Period }) {
  const t = useTheme();
  const me = useMe();
  const units = usePrefs((s) => s.units);
  const p = (me.data?.profile ?? {}) as Record<string, any>;
  const tk = d.target_kcal ?? num(p.target_kcal);
  const tw = d.target_water_ml ?? num(p.target_water_ml);
  const series = d.calories.length >= 2;
  const unit = period === 'weekly' ? 'day' : period === 'monthly' ? 'day' : '';
  const a = (k: string, arr: number[]) => d.averages[k] ?? d.averages[`${k}_avg`] ?? avg(arr);
  const kcal = period === 'daily' ? (d.totals.calories ?? d.calories[d.calories.length - 1] ?? 0) : a('calories', d.calories);
  const wData = d.weight.filter((x) => x != null) as number[];
  const empty = !series && d.calories.every((x) => !x) && d.water.every((x) => !x) && d.workouts.every((x) => !x);

  if (empty) return <Card><EmptyState icon="stats-chart-outline" title="Nothing to analyse yet" hint="Log meals, water and workouts and your trends will appear here." /></Card>;

  return (
    <View style={{ gap: 20 }}>
      <Reveal index={0}>
        <LinearGradient colors={[t.accent + '30', t.accent2 + '0D']} style={{ borderRadius: 28, padding: 20, borderWidth: 1, borderColor: t.accent + '44' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Ring value={num(d.adherence_pct)} target={100} size={112} stroke={11}>
              {d.adherence_pct != null ? <><AnimatedNumber value={d.adherence_pct} suffix="%" style={{ fontSize: 24 }} /><Text v="caption" muted style={{ fontSize: 10 }}>on target</Text></> : <Text v="caption" muted>n/a</Text>}
            </Ring>
            <View style={{ flex: 1, gap: 10 }}>
              <View><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}><AnimatedNumber value={kcal} style={{ fontSize: 30 }} /><Text v="caption" muted>kcal{unit ? ` / ${unit}` : ''}</Text></View>
                <Text v="caption" muted>{tk ? `Target ${Math.round(tk)} kcal` : period === 'daily' ? 'Consumed today' : 'Average intake'}</Text></View>
              {d.streak_days != null && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="flame" size={18} color={t.fat} /><Text v="bodyStrong">{d.streak_days}-day streak</Text></View>}
            </View>
          </View>
        </LinearGradient>
      </Reveal>

      <Section title="Nutrition" index={1}>
        {series && (
          <Card>
            <Text v="label" muted style={{ marginBottom: 8 }}>Calories</Text>
            <BarChart data={d.calories} labels={d.labels.length === d.calories.length ? d.labels : undefined} target={tk || undefined} height={150} />
          </Card>
        )}
        <Card>
          <View style={{ gap: 14 }}>
            <Text v="label" muted>{period === 'daily' ? 'Macros today' : 'Average macros'}</Text>
            <MacroRow label="Protein" value={a('protein', d.protein)} target={num(p.target_protein_g) || Math.max(a('protein', d.protein), 1)} color={t.protein} />
            <MacroRow label="Carbs" value={a('carbs', d.carbs)} target={num(p.target_carbs_g) || Math.max(a('carbs', d.carbs), 1)} color={t.carbs} />
            <MacroRow label="Fat" value={a('fat', d.fat)} target={num(p.target_fat_g) || Math.max(a('fat', d.fat), 1)} color={t.fat} />
          </View>
        </Card>
      </Section>

      <Section title="Habits" index={2}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Tile label={period === 'daily' ? 'WATER' : 'AVG WATER'} value={a('water', d.water)} unit="ml" color={t.water} />
          <Tile label={period === 'daily' ? 'WORKOUTS' : 'WORKOUTS (TOTAL)'} value={d.totals.workouts ?? d.workouts.reduce((x, y) => x + y, 0)} />
        </View>
        {series && d.water.some((x) => x > 0) && <Card><Text v="label" muted style={{ marginBottom: 8 }}>Hydration</Text><BarChart data={d.water} labels={d.labels.length === d.water.length ? d.labels : undefined} target={tw || undefined} color={t.water} height={130} /></Card>}
        {series && d.workouts.some((x) => x > 0) && <Card><Text v="label" muted style={{ marginBottom: 8 }}>Workout frequency</Text><BarChart data={d.workouts} labels={d.labels.length === d.workouts.length ? d.labels : undefined} height={110} color={t.fiber} /></Card>}
      </Section>

      {wData.length >= 2 && (
        <Section title="Weight" index={3}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text v="label" muted>Trend ({weightUnit(units)})</Text>
              <Text v="caption" accent>{(wData[wData.length - 1] - wData[0] > 0 ? '+' : '') + displayWeight(wData[wData.length - 1] - wData[0], units).toFixed(1)} {weightUnit(units)}</Text>
            </View>
            <AreaChart data={d.weight.map((x) => (x == null ? null : Number(displayWeight(x, units).toFixed(1))))} labels={d.labels.length === d.weight.length ? d.labels : undefined} height={150} />
          </Card>
        </Section>
      )}
    </View>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('weekly');
  const q = useAnalytics(period);
  const advanced = useHasFeature('advanced_analytics');
  return (
    <Screen title="Analytics" subtitle="What your data says" back tabBar={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Segmented options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} value={period} onChange={setPeriod} />
      {!advanced && period !== 'daily' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><LockBadge /><Text v="caption" muted>Advanced analytics are part of Pro.</Text></View>}
      {q.isError ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} feature="advanced_analytics" /> : (
        <QueryState query={q} skeleton={<><Skeleton height={150} radius={28} /><Skeleton height={180} radius={24} /><Skeleton height={140} radius={24} /></>}>
          {(d) => <Body d={d} period={period} />}
        </QueryState>
      )}
      <Section title="Weekly report" index={4}><WeeklyReportCard /></Section>
    </Screen>
  );
}
