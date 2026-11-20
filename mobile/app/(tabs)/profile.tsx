import React from 'react';
import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '@/lib/useMe';
import { signedUrl } from '@/lib/upload';
import { cancelAllReminders } from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Card, ErrorState, ListRow, Reveal, Screen, Section, Segmented, Skeleton, Text, haptic } from '@/ui';
import { LockBadge } from '@/features/paywall/gate';
import { goalLabel } from '@/features/settings/options';
import { usePrefs } from '@/features/settings/util';

function Avatar({ name, path }: { name: string; path?: string | null }) {
  const t = useTheme();
  const url = useQuery({ queryKey: ['avatar', path], enabled: !!path, queryFn: () => signedUrl('avatars', path as string), staleTime: 50 * 60_000 });
  const initials = (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return (
    <LinearGradient colors={[t.accent, t.accent2]} style={{ width: 76, height: 76, borderRadius: 38, padding: 3 }}>
      <View style={{ flex: 1, borderRadius: 36, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {url.data ? <Image source={{ uri: url.data }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="Profile photo" />
          : <Text v="title" accent>{initials}</Text>}
      </View>
    </LinearGradient>
  );
}

export default function ProfileTab() {
  const t = useTheme();
  const router = useRouter();
  const me = useMe();
  const signOut = useAuth((s) => s.signOut);
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const units = usePrefs((s) => s.units);
  const setUnits = usePrefs((s) => s.setUnits);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to sign in again to see your data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { haptic.warning(); await cancelAllReminders(); await signOut(); } },
    ]);

  const p = me.data?.profile as Record<string, any> | null | undefined;
  const name = me.data?.user.full_name || me.data?.user.email?.split('@')[0] || 'You';
  const tier = me.data?.tier ?? 'free';

  return (
    <Screen title="Profile" onRefresh={() => me.refetch()} refreshing={me.isRefetching}>
      {me.isLoading ? <><Skeleton height={130} radius={24} /><Skeleton height={160} radius={24} /></> :
        me.isError ? <ErrorState message="We couldn't load your profile." onRetry={() => me.refetch()} /> : (
          <>
            <Reveal index={0}>
              <Card glow>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <Avatar name={name} path={me.data?.user.avatar_path} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text v="title" numberOfLines={1}>{name}</Text>
                    <Text v="caption" muted numberOfLines={1}>{me.data?.user.email}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Text v="caption" accent>{goalLabel(me.data?.goal)}</Text>
                      <LockBadge label={tier === 'free' ? 'Free' : tier === 'pro' ? 'Pro' : 'Premium'} />
                    </View>
                  </View>
                </View>
              </Card>
            </Reveal>

            {p?.target_kcal ? (
              <Reveal index={1}>
                <Card>
                  <Text v="label" muted style={{ marginBottom: 12 }}>Your daily targets</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
                    {[
                      { l: 'Calories', v: p.target_kcal, u: 'kcal', c: t.accent },
                      { l: 'Protein', v: p.target_protein_g, u: 'g', c: t.protein },
                      { l: 'Carbs', v: p.target_carbs_g, u: 'g', c: t.carbs },
                      { l: 'Fat', v: p.target_fat_g, u: 'g', c: t.fat },
                      { l: 'Fiber', v: p.target_fiber_g, u: 'g', c: t.fiber },
                      { l: 'Water', v: p.target_water_ml, u: 'ml', c: t.water },
                    ].map((x) => (
                      <View key={x.l} style={{ width: '33.33%', gap: 2 }}>
                        <AnimatedNumber value={Number(x.v) || 0} style={{ fontSize: 22, color: x.c }} />
                        <Text v="caption" muted>{x.l} · {x.u}</Text>
                      </View>
                    ))}
                  </View>
                  <Text v="caption" faint style={{ marginTop: 12 }}>Estimates for healthy adults. Not medical advice.</Text>
                </Card>
              </Reveal>
            ) : null}

            <Section title="Account" index={2}>
              <Card padded={false} style={{ paddingHorizontal: 16 }}>
                <ListRow icon="create-outline" title="Edit profile & goals" subtitle="Update body stats, goal and preferences" onPress={() => router.push('/settings/edit-profile')} />
                <ListRow icon="notifications-outline" title="Reminders" subtitle="Meals, water, workouts and reports" onPress={() => router.push('/settings/notifications')} />
                <ListRow icon="sparkles-outline" title="Subscription" subtitle={`Current plan: ${tier[0].toUpperCase() + tier.slice(1)}`} onPress={() => router.push('/paywall')} />
                <ListRow icon="analytics-outline" title="Analytics & reports" onPress={() => router.push('/analytics')} />
                <ListRow icon="trophy-outline" title="Achievements" subtitle="Streaks and badges" onPress={() => router.push('/achievements' as any)} />
                <ListRow icon="sparkles" title="AI Coach" subtitle="Ask about meals, workouts and progress" onPress={() => router.push('/coach')} />
                <ListRow icon="calendar-outline" title="Meal plan & shopping list" onPress={() => router.push('/planner')} />
                <ListRow icon="timer-outline" title="Fasting timer" subtitle="Intermittent fasting windows and history" onPress={() => router.push('/fasting')} />
                <ListRow icon="book-outline" title="Recipes" onPress={() => router.push('/recipes')} />
              </Card>
            </Section>

            <Section title="Appearance" index={3}>
              <Card>
                <View style={{ gap: 14 }}>
                  <View style={{ gap: 8 }}>
                    <Text v="label" muted>Theme</Text>
                    <Segmented options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} value={theme} onChange={setTheme} />
                  </View>
                  <View style={{ gap: 8 }}>
                    <Text v="label" muted>Units</Text>
                    <Segmented options={[{ value: 'metric', label: 'Metric (kg)' }, { value: 'imperial', label: 'Imperial (lb)' }]} value={units} onChange={setUnits} />
                  </View>
                </View>
              </Card>
            </Section>

            <Section title="Privacy & help" index={4}>
              <Card padded={false} style={{ paddingHorizontal: 16 }}>
                <ListRow icon="shield-checkmark-outline" title="Privacy & data" subtitle="AI consent, export, delete account" onPress={() => router.push('/settings/privacy')} />
                <ListRow icon="information-circle-outline" title="Help & disclaimers" onPress={() => router.push('/settings/about')} />
                <ListRow icon="log-out-outline" title="Sign out" danger onPress={confirmSignOut} />
              </Card>
            </Section>
          </>
        )}
    </Screen>
  );
}
