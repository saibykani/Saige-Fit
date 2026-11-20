import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Icon, Skeleton, Text } from '@/ui';
import { MEAL_LABELS, MealType } from '@/features/common/types';
import { useNextMeal } from './useNextMeal';

export function NextMealCard({ day }: { day: string }) {
  const t = useTheme();
  const q = useNextMeal(day);
  if (q.isLoading) return <Skeleton height={150} radius={24} />;
  if (q.isError || !q.data) return null; // optional extra: never block the journal
  const { suggestions, message, slot, remaining } = q.data;
  const label = MEAL_LABELS[slot as MealType] ?? 'next meal';
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkles-outline" size={20} color={t.accent} />
        <View style={{ flex: 1 }}>
          <Text v="title">What should I eat next?</Text>
          <Text v="caption" muted>{label} · {Math.max(0, Math.round(remaining.kcal))} kcal and {Math.max(0, Math.round(remaining.protein_g))} g protein left</Text>
        </View>
      </View>
      {suggestions.length === 0 ? <Text v="caption" muted>{message ?? 'No suggestions right now.'}</Text> : suggestions.map((s) => (
        <View key={`${s.kind}-${s.id}`} style={{ gap: 2 }} accessible accessibilityLabel={`${s.name}, ${s.kcal} kilocalories. ${s.reason}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text v="heading" style={{ flex: 1 }}>{s.name}</Text>
            <Text v="caption" muted>{s.kcal} kcal</Text>
          </View>
          <Text v="caption" muted>{s.reason}</Text>
        </View>
      ))}
    </Card>
  );
}
