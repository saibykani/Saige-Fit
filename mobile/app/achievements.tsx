import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Card, Icon, Reveal, Screen, Section, Skeleton, Text } from '@/ui';
import { QueryState } from '@/features/paywall/gate';
import { Badge, Streak, useStreaks } from '@/features/achievements/api';

function StreakTile({ label, s }: { label: string; s: Streak }) {
  const t = useTheme();
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Text v="label" muted style={{ fontSize: 10 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <AnimatedNumber value={s.current} style={{ fontSize: 26, color: t.accent }} /><Text v="caption" muted>days</Text>
      </View>
      <Text v="caption" muted>Best: {s.longest}</Text>
    </Card>
  );
}

function BadgeRow({ b }: { b: Badge }) {
  const t = useTheme();
  const pct = b.goal ? Math.min(1, b.progress / b.goal) : 0;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={b.earned ? 'trophy' : 'trophy-outline'} size={26} color={b.earned ? t.accent : t.textMuted} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text v="heading">{b.title}</Text>
          <Text v="caption" muted>{b.description}</Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: t.accent }} />
          </View>
        </View>
        <Text v="caption" muted>{b.earned ? 'Earned' : `${b.progress}/${b.goal}`}</Text>
      </View>
    </Card>
  );
}

export default function Achievements() {
  const q = useStreaks();
  return (
    <Screen title="Achievements" subtitle="Streaks and badges" back onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <QueryState query={q} skeleton={<Skeleton height={200} radius={16} />}>
        {(d) => (
          <View style={{ gap: 16 }}>
            <Reveal>
              <Section title="Streaks">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <StreakTile label="LOGGING" s={d.streaks.logging} />
                  <StreakTile label="WORKOUTS" s={d.streaks.workout} />
                  <StreakTile label="WATER GOAL" s={d.streaks.water} />
                </View>
              </Section>
            </Reveal>
            <Section title="Badges">
              <View style={{ gap: 10 }}>{d.badges.map((b) => <BadgeRow key={b.key} b={b} />)}</View>
            </Section>
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
