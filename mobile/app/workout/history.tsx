import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Card, EmptyState, Icon, Reveal, Ring, Screen, Skeleton, Text } from '@/ui';
import { QueryState } from '@/features/paywall/gate';
import { useHistory } from '@/features/workout/api';
import { num, parseIso, WEEKDAY_SHORT } from '@/features/settings/util';

export default function History() {
  const t = useTheme();
  const q = useHistory(60);
  return (
    <Screen title="History" subtitle="Your logged sessions" back tabBar={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <QueryState query={q} skeleton={<><Skeleton height={84} radius={24} /><Skeleton height={84} radius={24} /><Skeleton height={84} radius={24} /></>}
        empty={(r) => (r.length ? null : <EmptyState icon="time-outline" title="No workouts yet" hint="Completed sessions appear here with duration and completion." />)}>
        {(rows) => (
          <View style={{ gap: 12 }}>
            {rows.map((h, i) => {
              const d = parseIso(h.log_date);
              return (
                <Reveal key={h.id} index={Math.min(i, 8)}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <View style={{ width: 52, alignItems: 'center' }}>
                        <Text v="caption" muted>{WEEKDAY_SHORT[(d.getDay() + 6) % 7]}</Text>
                        <Text v="number" style={{ fontSize: 24 }}>{d.getDate()}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text v="bodyStrong" numberOfLines={1}>{h.focus ?? 'Workout'}</Text>
                        <Text v="caption" muted>{h.duration_min != null ? `${num(h.duration_min)} min` : h.finished_at ? '' : 'Not finished'}{h.kcal_burned ? ` · ≈ ${num(h.kcal_burned)} kcal` : ''}</Text>
                      </View>
                      {h.completion_pct != null ? (
                        <Ring value={num(h.completion_pct)} target={100} size={52} stroke={6}><Text v="caption" style={{ fontSize: 11 }}>{Math.round(num(h.completion_pct))}%</Text></Ring>
                      ) : <Icon name="checkmark-circle" size={24} color={t.accent} />}
                    </View>
                  </Card>
                </Reveal>
              );
            })}
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
