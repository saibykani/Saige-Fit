import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, AreaChart, Button, Card, EmptyState, Icon, Reveal, Ring, Screen, Section, Segmented, Skeleton, Text } from '@/ui';
import { ErrorPanel, QueryState } from '@/features/paywall/gate';
import { MEASURES, Measurement, useMeasurements, useSummary, useWeight } from '@/features/progress/api';
import { PhotosSection } from '@/features/progress/Photos';
import { LogMeasurementsSheet, LogWeightSheet } from '@/features/progress/Sheets';
import { displayWeight, num, shortDate, usePrefs, weightUnit } from '@/features/settings/util';

type Range = '30' | '90' | '365';

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return <View style={{ flex: 1, gap: 2 }}><Text v="label" muted style={{ fontSize: 10 }}>{label}</Text><Text v="number" color={color} style={{ fontSize: 22 }}>{value}</Text>{sub ? <Text v="caption" faint>{sub}</Text> : null}</View>;
}

function MeasurementTable({ rows }: { rows: Measurement[] }) {
  const t = useTheme();
  const latest = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : undefined;
  const first = rows[0];
  const fmt = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  return (
    <Card padded={false} style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
        <Text v="label" muted style={{ flex: 1.3 }}>Measure</Text><Text v="label" muted style={{ flex: 1, textAlign: 'right' }}>Latest</Text>
        <Text v="label" muted style={{ flex: 1, textAlign: 'right' }}>vs last</Text><Text v="label" muted style={{ flex: 1, textAlign: 'right' }}>vs first</Text>
      </View>
      {MEASURES.map(({ key, label, unit }) => {
        const cur = latest[key] as number | null | undefined;
        if (cur == null) return null;
        const dPrev = prev && prev[key] != null ? num(cur) - num(prev[key]) : null;
        const dFirst = rows.length > 1 && first[key] != null ? num(cur) - num(first[key]) : null;
        return (
          <View key={key as string} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.border }}>
            <Text v="caption" style={{ flex: 1.3 }}>{label.replace(' (measured)', '')}</Text>
            <Text v="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>{cur}{unit === '%' ? '%' : ''}</Text>
            <Text v="caption" muted style={{ flex: 1, textAlign: 'right' }}>{dPrev == null ? '-' : fmt(dPrev)}</Text>
            <Text v="caption" accent={dFirst != null && dFirst !== 0} muted={dFirst == null || dFirst === 0} style={{ flex: 1, textAlign: 'right' }}>{dFirst == null ? '-' : fmt(dFirst)}</Text>
          </View>
        );
      })}
      <Text v="caption" faint style={{ marginTop: 8 }}>Latest entry {shortDate(latest.log_date)}. Cm unless shown as %.</Text>
    </Card>
  );
}

export default function ProgressTab() {
  const t = useTheme();
  const router = useRouter();
  const units = usePrefs((s) => s.units);
  const [range, setRange] = useState<Range>('90');
  const [mode, setMode] = useState<'daily' | 'trend'>('daily');
  const [logW, setLogW] = useState(false);
  const [logM, setLogM] = useState(false);
  const days = parseInt(range, 10);
  const weight = useWeight(days);
  const summary = useSummary(days);
  const meas = useMeasurements();

  const chart = useMemo(() => {
    const w = weight.data;
    if (!w || w.points.length === 0) return null;
    const useTrend = mode === 'trend' && w.trend.length === w.points.length;
    const data = w.points.map((p, i) => { const v = useTrend ? w.trend[i] : p.weight_kg; return v == null ? null : Number(displayWeight(v, units).toFixed(1)); });
    return { data, labels: w.points.map((p) => shortDate(p.log_date)), hasTrend: w.trend.length === w.points.length && w.trend.length > 0 };
  }, [weight.data, mode, units]);

  const s = summary.data;
  const current = s?.current_weight ?? weight.data?.points[weight.data.points.length - 1]?.weight_kg ?? null;
  const refresh = () => { weight.refetch(); summary.refetch(); meas.refetch(); };
  const u = weightUnit(units);

  return (
    <Screen title="Progress" subtitle="Your body, over time" onRefresh={refresh} refreshing={weight.isRefetching}>
      <Segmented options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]} value={range} onChange={setRange} />

      <QueryState query={summary} skeleton={<Skeleton height={190} radius={28} />}>
        {(sm) => (
          <Reveal index={0}>
            <LinearGradient colors={[t.accent + '30', t.accent2 + '0D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: 20, borderWidth: 1, borderColor: t.accent + '44', gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <Ring value={num(sm.goal_pct)} target={100} size={118} stroke={11}>
                  <AnimatedNumber value={num(sm.goal_pct)} suffix="%" style={{ fontSize: 26 }} />
                  <Text v="caption" muted style={{ fontSize: 10 }}>to goal</Text>
                </Ring>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text v="label" muted>Current weight</Text>
                  {current != null ? <AnimatedNumber value={displayWeight(current, units)} decimals={1} suffix={` ${u}`} style={{ fontSize: 34 }} /> : <Text v="number">-</Text>}
                  {sm.target_weight != null && <Text v="caption" muted>Target {displayWeight(sm.target_weight, units).toFixed(1)} {u}</Text>}
                </View>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Stat label="CHANGE" value={sm.change_kg != null ? `${sm.change_kg > 0 ? '+' : ''}${displayWeight(sm.change_kg, units).toFixed(1)} ${u}` : '-'} sub={`last ${days} days`} />
                <Stat label="PER WEEK" value={sm.weekly_change_kg != null ? `${sm.weekly_change_kg > 0 ? '+' : ''}${displayWeight(sm.weekly_change_kg, units).toFixed(2)}` : '-'} sub={u} />
                <Stat label="BMI" value={sm.bmi != null ? sm.bmi.toFixed(1) : '-'} />
              </View>
            </LinearGradient>
          </Reveal>
        )}
      </QueryState>

      <Section title="Weight" index={1} action={<Button title="Log" icon="add" size="md" onPress={() => setLogW(true)} style={{ width: 96 }} />}>
        <Card>
          {weight.isLoading ? <Skeleton height={170} radius={16} /> : weight.isError ? <ErrorPanel error={weight.error} onRetry={() => weight.refetch()} /> : !chart ? (
            <EmptyState icon="scale-outline" title="No weigh-ins yet" hint="Log your weight to start your trend line." action={{ label: 'Log weight', onPress: () => setLogW(true) }} />
          ) : (
            <View style={{ gap: 12 }}>
              {chart.hasTrend && <Segmented options={[{ value: 'daily', label: 'Daily' }, { value: 'trend', label: '7-day trend' }]} value={mode} onChange={setMode} />}
              <AreaChart data={chart.data} labels={chart.labels} height={190} goal={s?.target_weight != null ? Number(displayWeight(s.target_weight, units).toFixed(1)) : undefined} />
              {s?.target_weight != null && <Text v="caption" faint>Dashed line is your target weight.</Text>}
            </View>
          )}
        </Card>
      </Section>

      <Section title="Measurements" index={2} action={<Button title="Log" icon="add" size="md" variant="secondary" onPress={() => setLogM(true)} style={{ width: 96 }} />}>
        <QueryState query={meas} skeleton={<Skeleton height={150} radius={24} />}
          empty={(r) => (r.length ? null : <Card><EmptyState icon="body-outline" title="No measurements yet" hint="Track waist, chest, arm, hips and thigh to see changes the scale can miss." action={{ label: 'Add measurements', onPress: () => setLogM(true) }} /></Card>)}>
          {(rows) => <MeasurementTable rows={rows} />}
        </QueryState>
      </Section>

      <Section title="Progress photos" index={3}><PhotosSection /></Section>

      <LogWeightSheet visible={logW} onClose={() => setLogW(false)} last={current} />
      <LogMeasurementsSheet visible={logM} onClose={() => setLogM(false)} last={meas.data?.[meas.data.length - 1]} />
    </Screen>
  );
}
