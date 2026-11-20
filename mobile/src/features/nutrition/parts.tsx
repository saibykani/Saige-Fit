import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, AreaChart, Card, PressableScale, ProgressBar, Ring, Skeleton, Text } from '@/ui';
import { dowShort, fromISODate } from '@/features/common/date';
import type { Insight, NutritionInsights } from './api';

export function useScoreColor() {
  const t = useTheme();
  return (s: number | null) => (s == null ? t.textFaint : s >= 70 ? t.success : s >= 50 ? t.warn : t.danger);
}

export function ScoreCard({ d }: { d: NutritionInsights }) {
  const color = useScoreColor()(d.score);
  return (
    <Card glow style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
      <Ring value={d.score ?? 0} target={100} size={190} stroke={15} from={color} to={color}>
        {d.score == null ? <Text v="heading" muted>No data</Text> : <AnimatedNumber value={d.score} style={{ fontSize: 56 }} />}
        <Text v="label" muted>{d.score == null ? 'log a meal' : 'of 100'}</Text>
      </Ring>
      <Text v="title">{d.grade}</Text>
      {d.trend_avg != null ? <Text v="caption" muted>7-day average {d.trend_avg}</Text> : null}
    </Card>
  );
}

export function SubScoreBars({ d }: { d: NutritionInsights }) {
  const colorOf = useScoreColor();
  return (
    <Card style={{ gap: 14 }}>
      <Text v="title">How your score adds up</Text>
      {d.subscores.map((s, i) => (
        <View key={s.key} style={{ gap: 6 }} accessible accessibilityLabel={`${s.label}: ${s.score ?? 'no data'} out of 100, ${s.detail}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text v="bodyStrong">{s.label} <Text v="caption" faint>({s.weight}%)</Text></Text>
            <Text v="bodyStrong" color={colorOf(s.score)}>{s.score ?? '-'}</Text>
          </View>
          <ProgressBar value={s.score ?? 0} target={100} color={colorOf(s.score)} delay={i * 80} />
          <Text v="caption" muted>{s.detail}</Text>
        </View>
      ))}
    </Card>
  );
}

export function InsightCards({ items }: { items: Insight[] }) {
  const t = useTheme();
  const tone = (s: Insight['severity']) => (s === 'good' ? t.success : s === 'warn' ? t.warn : t.accent);
  const icon = (s: Insight['severity']) => (s === 'good' ? 'checkmark-circle' : s === 'warn' ? 'alert-circle' : 'information-circle');
  return (
    <View style={{ gap: 10 }}>
      {items.map((i) => (
        <Card key={i.key + i.title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Ionicons name={icon(i.severity)} size={24} color={tone(i.severity)} />
          <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${i.title}. ${i.body}`}>
            <Text v="heading">{i.title}</Text>
            <Text v="body" muted>{i.body}</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

export function TrendCard({ d }: { d: NutritionInsights }) {
  const labels = d.trend.map((p) => dowShort(fromISODate(p.date)));
  const has = d.trend.some((p) => p.score != null);
  return (
    <Card style={{ gap: 10 }}>
      <Text v="title">Last 7 days</Text>
      {has ? <AreaChart data={d.trend.map((p) => p.score)} labels={labels} height={150} goal={70} />
        : <Text v="caption" muted>Log meals on a few days to see your trend.</Text>}
    </Card>
  );
}

/** Compact card for Home: score plus the top insight, taps through to the full screen. */
export function HomeInsightsCard({ d, loading }: { d?: NutritionInsights; loading?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const color = useScoreColor()(d?.score ?? null);
  if (loading) return <Skeleton height={92} radius={24} />;
  if (!d) return null; // optional extra: never block Home
  const top = d.insights[0];
  return (
    <PressableScale onPress={() => router.push('/nutrition')} accessibilityRole="button"
      accessibilityLabel={`Nutrition score ${d.score ?? 'not available'}. ${top?.title ?? ''}. Open details.`}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ring value={d.score ?? 0} target={100} size={64} stroke={7} from={color} to={color}>
          <Text v="bodyStrong">{d.score ?? '-'}</Text>
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="heading">Nutrition score</Text>
          <Text v="caption" muted numberOfLines={2}>{top ? top.title : 'Log a meal to see your score'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.textFaint} />
      </Card>
    </PressableScale>
  );
}
