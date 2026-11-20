import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { useTheme } from '@/theme/ThemeProvider';
import { ErrorState, PressableScale, Screen, Section, Text, haptic } from '@/ui';
import { DateStrip } from '@/features/common/DateStrip';
import { greeting, prettyDay, todayISO } from '@/features/common/date';
import { useDay } from '@/features/common/dayStore';
import { useDashboard, useLogActivity, useQuickWater, useWorkoutToday } from '@/features/home/api';
import { ActivityGrid, CalorieHero, HomeSkeleton, Insights, MacroRings, Schedule, SleepSheet } from '@/features/home/HomeParts';
import { useSteps, useSyncSteps } from '@/features/home/usePedometer';
import { useHealthConnect } from '@/features/health/useHealthConnect';

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { day, setDay } = useDay();
  const isToday = day === todayISO();
  const me = useMe();
  const dash = useDashboard(day);
  const workout = useWorkoutToday(day);
  const water = useQuickWater(day);
  const activity = useLogActivity(day);
  const [sleepOpen, setSleepOpen] = useState(false);

  // The server says targets are missing -> onboarding isn't complete.
  useEffect(() => {
    if (dash.error instanceof ApiError && dash.error.status === 409) router.replace('/onboarding');
  }, [dash.error, router]);

  const serverSteps = dash.data?.activity?.steps;
  // Prefer Health Connect (already synced to the server) when connected on Android.
  const hcHealth = useHealthConnect();
  const hcSteps = hcHealth.connected ? hcHealth.snapshot?.steps ?? null : null;
  const { connected: hcOn, sync: hcSync } = hcHealth;
  useEffect(() => { if (hcOn) hcSync().then(() => qc.invalidateQueries({ queryKey: ['dashboard'] })); }, [hcOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const pedo = useSteps(isToday, serverSteps, !!dash.data);
  const refreshDash = useCallback(() => { qc.invalidateQueries({ queryKey: ['dashboard'] }); }, [qc]);
  useSyncSteps(isToday && hcSteps == null ? pedo.steps : null, serverSteps, refreshDash);
  const shownSteps = isToday ? (hcSteps ?? pedo.steps) : serverSteps ?? null;

  const name = me.data?.user.full_name?.split(' ')[0];
  const initial = (me.data?.user.full_name ?? me.data?.user.email ?? '?').slice(0, 1).toUpperCase();

  const refresh = () => { dash.refetch(); workout.refetch(); };

  return (
    <Screen
      title={name ? `${greeting()}, ${name}` : greeting()} subtitle={prettyDay(day)}
      onRefresh={refresh} refreshing={dash.isRefetching}
      right={
        <PressableScale onPress={() => router.push('/(tabs)/profile')} accessibilityRole="button" accessibilityLabel="Open profile">
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text v="heading" color={t.onAccent}>{initial}</Text>
          </View>
        </PressableScale>
      }>
      <DateStrip value={day} onChange={setDay} />

      {dash.isLoading ? <HomeSkeleton /> : dash.isError || !dash.data ? (
        <ErrorState message={errorMessage(dash.error)} onRetry={() => dash.refetch()} />
      ) : (
        <>
          <CalorieHero d={dash.data} />
          <MacroRings d={dash.data} />
          <Section title="Activity" index={2}>
            <ActivityGrid d={dash.data} steps={shownSteps} stepStatus={pedo.status}
              onAddWater={() => { water.mutate(250, { onSuccess: () => haptic.success() }); }} waterBusy={water.isPending}
              onWater={() => router.push('/water')} onSleep={() => setSleepOpen(true)} />
          </Section>
          <Section title="Today's schedule" index={3}><Schedule d={dash.data} workout={workout.data} /></Section>
          <Section title="Coach tips" index={4}><Insights items={dash.data.insights} /></Section>
          <SleepSheet key={String(sleepOpen)} visible={sleepOpen} onClose={() => setSleepOpen(false)} current={dash.data.activity?.sleep_hours} busy={activity.isPending}
            onSave={(h) => activity.mutate({ sleep_hours: h }, { onSuccess: () => { haptic.success(); setSleepOpen(false); } })} />
          {water.isError ? <Text v="caption" color={t.danger}>{errorMessage(water.error)}</Text> : null}
          {activity.isError ? <Text v="caption" color={t.danger}>{errorMessage(activity.error)}</Text> : null}
        </>
      )}
    </Screen>
  );
}
