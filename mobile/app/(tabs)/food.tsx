import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { Confetti, EmptyState, ErrorState, IconButton, Reveal, Screen, Skeleton } from '@/ui';
import { DateStrip } from '@/features/common/DateStrip';
import { prettyDay } from '@/features/common/date';
import { useDay } from '@/features/common/dayStore';
import { MEAL_ORDER, MealType } from '@/features/common/types';
import { useJournal } from '@/features/food/api';
import { DayTotals, MealSection, ScanCta } from '@/features/food/JournalParts';
import { NextMealCard } from '@/features/food/NextMealCard';
import { QuickAdd } from '@/features/food/QuickAdd';
import { useDashboard } from '@/features/home/api';

const ALWAYS: MealType[] = ['breakfast', 'lunch', 'dinner'];

export default function Food() {
  const router = useRouter();
  const { day, setDay } = useDay();
  const journal = useJournal(day);
  const dash = useDashboard(day); // shared cache with Home; gives the calorie target
  const [party, setParty] = useState(0); // bumps when a meal is logged to fire the confetti
  const celebrate = () => setParty((n) => n + 1);
  const meals = journal.data ?? [];
  const add = (meal?: MealType) => router.push({ pathname: '/food/search', params: meal ? { meal } : {} });
  const visible = MEAL_ORDER.filter((m) => ALWAYS.includes(m) || meals.some((x) => x.meal_type === m));

  return (
    <>
    <Screen title="Food" subtitle={prettyDay(day)} onRefresh={() => { journal.refetch(); dash.refetch(); }} refreshing={journal.isRefetching}
      right={<IconButton name="search" label="Search and add food" onPress={() => add()} />}>
      <ScanCta onPress={() => router.push('/scan')} />
      <DateStrip value={day} onChange={setDay} />
      <QuickAdd day={day} hasMeals={meals.length > 0} onLogged={celebrate} />
      <NextMealCard day={day} onLogged={celebrate} />
      {journal.isLoading ? (
        <View style={{ gap: 14 }}><Skeleton height={140} radius={24} /><Skeleton height={110} radius={24} /><Skeleton height={110} radius={24} /></View>
      ) : journal.isError ? (
        <ErrorState message={errorMessage(journal.error)} onRetry={() => journal.refetch()} />
      ) : (
        <>
          {meals.length > 0 ? <Reveal index={0}><DayTotals meals={meals} target={dash.data?.targets.kcal} /></Reveal> : (
            <EmptyState icon="restaurant-outline" title="Nothing logged yet" hint="Scan a meal, search a food, or add something you ate. Swipe a meal left to delete it."
              action={{ label: 'Add food', onPress: () => add() }} />
          )}
          {visible.map((type, i) => (
            <Reveal key={type} index={i + 1}>
              <MealSection type={type} meals={meals.filter((m) => m.meal_type === type)} onAdd={() => add(type)} />
            </Reveal>
          ))}
        </>
      )}
    </Screen>
    <Confetti trigger={party} />
    </>
  );
}
