import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Chip, EmptyState, Field, Icon, Reveal, Screen, Skeleton, Text } from '@/ui';
import { QueryState } from '@/features/paywall/gate';
import { Exercise } from '@/features/workout/api';
import { asArray, titleCase } from '@/features/settings/util';

const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'core', 'cardio'];
const EQUIPMENT = ['bodyweight', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebell', 'band'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];

function Row({ label, items, value, onPick }: { label: string; items: string[]; value: string | null; onPick: (v: string | null) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text v="label" faint>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
        {items.map((m) => <Chip key={m} label={titleCase(m)} selected={value === m} onPress={() => onPick(value === m ? null : m)} />)}
      </ScrollView>
    </View>
  );
}

export default function ExerciseLibrary() {
  const t = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setQ(text.trim()), 350); return () => clearTimeout(id); }, [text]);

  const list = useQuery({
    queryKey: ['exercises', q, muscle, equipment, level],
    queryFn: async () => {
      const p: string[] = [];
      if (q) p.push(`q=${encodeURIComponent(q)}`);
      if (muscle) p.push(`muscle=${encodeURIComponent(muscle)}`);
      if (equipment) p.push(`equipment=${encodeURIComponent(equipment)}`);
      if (level) p.push(`difficulty=${encodeURIComponent(level)}`);
      return asArray<Exercise>(await api(`/v1/exercises${p.length ? `?${p.join('&')}` : ''}`), 'exercises', 'items');
    },
  });

  return (
    <Screen title="Exercises" subtitle="Form guides for every move" back tabBar={false}>
      <Field value={text} onChangeText={setText} placeholder="Search exercises" returnKeyType="search" autoCorrect={false} accessibilityLabel="Search exercises" />
      <Row label="Muscle" items={MUSCLES} value={muscle} onPick={setMuscle} />
      <Row label="Equipment" items={EQUIPMENT} value={equipment} onPick={setEquipment} />
      <Row label="Level" items={LEVELS} value={level} onPick={setLevel} />
      <QueryState query={list} skeleton={<><Skeleton height={76} radius={22} /><Skeleton height={76} radius={22} /><Skeleton height={76} radius={22} /></>}
        empty={(r) => (r.length ? null : <EmptyState icon="search-outline" title="No exercises found" hint="Try a different search or clear a filter." />)}>
        {(rows) => (
          <View style={{ gap: 10 }}>
            {rows.map((e, i) => (
              <Reveal key={e.id} index={Math.min(i, 8)}>
                <Card onPress={() => router.push({ pathname: '/exercises/[id]', params: { id: e.id } })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: t.accent + '1F', alignItems: 'center', justifyContent: 'center' }}><Icon name="barbell-outline" size={22} color={t.accent} /></View>
                    <View style={{ flex: 1 }}>
                      <Text v="bodyStrong" numberOfLines={1}>{e.name}</Text>
                      <Text v="caption" muted numberOfLines={1}>{titleCase(e.muscle_group)} · {(e.equipment ?? []).join(', ') || 'bodyweight'} · {titleCase(e.difficulty)}</Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={t.textFaint} />
                  </View>
                </Card>
              </Reveal>
            ))}
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
