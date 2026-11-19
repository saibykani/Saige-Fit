import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import {
  BarChart, Button, Card, ChipGroup, EmptyState, ErrorState, Field, PressableScale, Reveal, Screen, Section, Sheet, Skeleton, SwitchRow, Text, haptic,
} from '@/ui';
import { DateStrip } from '@/features/common/DateStrip';
import { dowShort, fromISODate, prettyDay } from '@/features/common/date';
import { useDay } from '@/features/common/dayStore';
import { NumberStepper } from '@/features/onboarding/widgets';
import { BEVERAGES, useAddDrink, useDeleteDrink, useHydration, useHydrationHistory, useSetWaterTarget } from '@/features/water/api';
import { WaterGlass } from '@/features/water/WaterGlass';

const QUICK = [150, 250, 500];

export default function Water() {
  const t = useTheme();
  const { day, setDay } = useDay();
  const q = useHydration(day);
  const history = useHydrationHistory(14);
  const add = useAddDrink(day);
  const del = useDeleteDrink();
  const setTarget = useSetWaterTarget();

  const [beverage, setBeverage] = useState('water');
  const [counts, setCounts] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMl, setCustomMl] = useState('');
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetMl, setTargetMl] = useState(2500);
  const [error, setError] = useState<string | null>(null);

  const logs = q.data?.logs ?? [];
  const goalMl = useMemo(() => logs.filter((l) => l.counts_toward_goal).reduce((s, l) => s + l.amount_ml, 0), [logs]);
  const otherMl = useMemo(() => logs.filter((l) => !l.counts_toward_goal).reduce((s, l) => s + l.amount_ml, 0), [logs]);

  const pickBeverage = (v: string) => {
    setBeverage(v);
    setCounts(BEVERAGES.find((b) => b.value === v)?.counts ?? false); // plain water counts; everything else defaults to not counting
  };

  const addDrink = (ml: number) => {
    if (!Number.isFinite(ml) || ml < 1 || ml > 5000) { haptic.warning(); return setError('Enter an amount between 1 and 5000 ml.'); }
    setError(null);
    add.mutate({ amount_ml: Math.round(ml), beverage, counts_toward_goal: counts }, {
      onSuccess: () => haptic.success(), onError: (e) => { haptic.warning(); setError(errorMessage(e)); },
    });
  };

  const openTarget = () => { setTargetMl(q.data?.target_ml ?? 2500); setTargetOpen(true); };

  const bars = history.data?.points ?? [];

  return (
    <Screen title="Hydration" subtitle={prettyDay(day)} back tabBar={false} onRefresh={() => { q.refetch(); history.refetch(); }} refreshing={q.isRefetching}>
      <DateStrip value={day} onChange={setDay} />

      {q.isLoading ? (
        <View style={{ gap: 14, alignItems: 'center' }}><Skeleton height={270} width={210} radius={38} /><Skeleton height={64} radius={20} /></View>
      ) : q.isError || !q.data ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Reveal index={0}>
            <Card glow style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
              <WaterGlass value={goalMl} target={q.data.target_ml} />
              {otherMl > 0 ? <Text v="caption" muted>+ {otherMl} ml of other drinks (not counted toward your water goal)</Text> : null}
              <PressableScale onPress={openTarget} accessibilityRole="button" accessibilityLabel="Edit daily water target">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text v="caption" muted>Daily target {q.data.target_ml} ml</Text>
                  <Ionicons name="pencil" size={13} color={t.textMuted} />
                </View>
              </PressableScale>
            </Card>
          </Reveal>

          <Reveal index={1}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {QUICK.map((ml) => (
                  <PressableScale key={ml} onPress={() => addDrink(ml)} disabled={add.isPending} hapticStyle="medium" style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Add ${ml} millilitres`}>
                    <View style={{ backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border, paddingVertical: 14, alignItems: 'center', gap: 4, opacity: add.isPending ? 0.6 : 1 }}>
                      <Ionicons name={ml >= 500 ? 'beer' : ml >= 250 ? 'water' : 'water-outline'} size={ml >= 500 ? 28 : ml >= 250 ? 24 : 20} color={counts ? t.water : t.fat} />
                      <Text v="bodyStrong">+{ml}</Text>
                      <Text v="caption" faint>ml</Text>
                    </View>
                  </PressableScale>
                ))}
                <PressableScale onPress={() => setCustomOpen(true)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Add a custom amount">
                  <View style={{ backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.border, paddingVertical: 14, alignItems: 'center', gap: 4 }}>
                    <Ionicons name="create-outline" size={22} color={t.textMuted} />
                    <Text v="bodyStrong">Custom</Text>
                    <Text v="caption" faint>amount</Text>
                  </View>
                </PressableScale>
              </View>
              <Text v="label" muted>Drink type</Text>
              <ChipGroup options={BEVERAGES.map((b) => ({ value: b.value, label: b.label }))} value={beverage} onChange={pickBeverage} />
              {beverage !== 'water' ? (
                <SwitchRow icon="water-outline" label="Count toward water goal" hint="Plain water counts by default. Other drinks don't, unless you choose." value={counts} onChange={setCounts} />
              ) : null}
              {error ? <Text v="caption" color={t.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
            </View>
          </Reveal>

          <Section title="Today's log" index={2}>
            {logs.length === 0 ? (
              <Card><EmptyState icon="water-outline" title="No drinks logged" hint="Tap a quick-add button to log your first drink." /></Card>
            ) : (
              <Card style={{ paddingVertical: 4 }}>
                {logs.map((l, i) => {
                  const time = new Date(l.logged_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                  const label = BEVERAGES.find((b) => b.value === l.beverage)?.label ?? l.beverage;
                  return (
                    <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
                      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: (l.counts_toward_goal ? t.water : t.fat) + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={l.beverage === 'water' ? 'water' : 'cafe'} size={18} color={l.counts_toward_goal ? t.water : t.fat} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text v="bodyStrong">{l.amount_ml} ml · {label}</Text>
                        <Text v="caption" muted>{time}{l.counts_toward_goal ? '' : ' · not counted toward goal'}</Text>
                      </View>
                      <PressableScale onPress={() => { haptic.warning(); del.mutate(l.id); }} accessibilityRole="button" accessibilityLabel={`Delete ${l.amount_ml} millilitres ${label}`} style={{ padding: 8 }}>
                        <Ionicons name="trash-outline" size={20} color={t.textFaint} />
                      </PressableScale>
                    </View>
                  );
                })}
              </Card>
            )}
          </Section>

          <Section title="Last 14 days" index={3}>
            <Card style={{ gap: 8 }}>
              {history.isLoading ? <Skeleton height={150} radius={16} /> : history.isError ? (
                <Text v="caption" muted>History isn't available right now.</Text>
              ) : (
                <>
                  <BarChart data={bars.map((b) => b.ml)} labels={bars.map((b) => dowShort(fromISODate(b.date)).slice(0, 1))} target={q.data.target_ml} />
                  <Text v="caption" faint>Plain water per day. The dashed line is your target.</Text>
                </>
              )}
            </Card>
          </Section>
        </>
      )}

      <Sheet visible={customOpen} onClose={() => setCustomOpen(false)} title="Custom amount">
        <View style={{ gap: 14 }}>
          <Field label="Amount" value={customMl} onChangeText={setCustomMl} keyboardType="number-pad" suffix="ml" placeholder="e.g. 330" autoFocus />
          <Button title={`Add ${beverage === 'water' ? 'water' : BEVERAGES.find((b) => b.value === beverage)?.label.toLowerCase()}`} icon="add"
            onPress={() => { const ml = Number(customMl); addDrink(ml); if (ml >= 1 && ml <= 5000) { setCustomMl(''); setCustomOpen(false); } }} loading={add.isPending} />
        </View>
      </Sheet>

      <Sheet visible={targetOpen} onClose={() => setTargetOpen(false)} title="Daily water target">
        <View style={{ gap: 14 }}>
          <NumberStepper label="Target" value={targetMl} onChange={setTargetMl} min={500} max={8000} step={100} unit="ml" />
          <Text v="caption" muted>This is a personal goal you can change any time. It isn't a medical requirement. Needs vary with body size, climate, activity and health, so ask a professional if unsure.</Text>
          <Button title="Save target" loading={setTarget.isPending} onPress={() => setTarget.mutate(Math.min(8000, Math.max(500, Math.round(targetMl))), {
            onSuccess: () => { haptic.success(); setTargetOpen(false); }, onError: (e) => { haptic.warning(); setError(errorMessage(e)); },
          })} />
        </View>
      </Sheet>
    </Screen>
  );
}
