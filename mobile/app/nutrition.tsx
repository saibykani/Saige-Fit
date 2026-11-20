import React from 'react';
import { View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { ErrorState, Reveal, Screen, Skeleton } from '@/ui';
import { DateStrip } from '@/features/common/DateStrip';
import { prettyDay } from '@/features/common/date';
import { useDay } from '@/features/common/dayStore';
import { useNutritionInsights } from '@/features/nutrition/api';
import { InsightCards, ScoreCard, SubScoreBars, TrendCard } from '@/features/nutrition/parts';

export default function Nutrition() {
  const { day, setDay } = useDay();
  const q = useNutritionInsights(day);
  return (
    <Screen title="Nutrition" subtitle={prettyDay(day)} back onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <DateStrip value={day} onChange={setDay} />
      {q.isLoading ? (
        <View style={{ gap: 14 }}><Skeleton height={260} radius={24} /><Skeleton height={200} radius={24} /><Skeleton height={100} radius={24} /></View>
      ) : q.isError || !q.data ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Reveal index={0}><ScoreCard d={q.data} /></Reveal>
          <Reveal index={1}><InsightCards items={q.data.insights} /></Reveal>
          <Reveal index={2}><SubScoreBars d={q.data} /></Reveal>
          <Reveal index={3}><TrendCard d={q.data} /></Reveal>
        </>
      )}
    </Screen>
  );
}
