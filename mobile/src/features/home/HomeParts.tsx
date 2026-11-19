import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Button, Card, PressableScale, Reveal, Ring, Sheet, Skeleton, Text, haptic } from '@/ui';
import { MEAL_ICONS, MEAL_LABELS, MealType } from '@/features/common/types';
import type { Dashboard, WorkoutToday } from './api';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ---------- calorie hero ---------- */
export function CalorieHero({ d }: { d: Dashboard }) {
  const t = useTheme();
  const over = d.remaining_kcal < 0;
  const burned = d.activity?.active_kcal;
  const Stat = ({ icon, label, value }: { icon: IconName; label: string; value: string }) => (
    <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
      <Ionicons name={icon} size={16} color={t.textMuted} />
      <Text v="bodyStrong">{value}</Text>
      <Text v="caption" faint>{label}</Text>
    </View>
  );
  return (
    <Card glow style={{ alignItems: 'center', gap: 18, paddingVertical: 24 }}>
      <Ring value={d.consumed.kcal} target={d.targets.kcal} size={212} stroke={16}
        from={over ? t.warn : t.accent} to={over ? t.danger : t.accent2}>
        <AnimatedNumber value={Math.abs(Math.round(d.remaining_kcal))} style={{ fontSize: 48 }} />
        <Text v="label" muted>{over ? 'kcal over' : 'kcal left'}</Text>
      </Ring>
      <View style={{ flexDirection: 'row', width: '100%' }}>
        <Stat icon="restaurant-outline" label="Eaten" value={`${Math.round(d.consumed.kcal)}`} />
        <Stat icon="flag-outline" label="Target" value={`${d.targets.kcal}`} />
        <Stat icon="flame-outline" label="Burned" value={burned === null || burned === undefined ? '-' : `${Math.round(burned)}`} />
      </View>
    </Card>
  );
}

/* ---------- macros ---------- */
export function MacroRings({ d }: { d: Dashboard }) {
  const t = useTheme();
  const items = [
    { l: 'Protein', v: d.consumed.protein_g, tg: d.targets.protein_g, c: t.protein },
    { l: 'Carbs', v: d.consumed.carbs_g, tg: d.targets.carbs_g, c: t.carbs },
    { l: 'Fat', v: d.consumed.fat_g, tg: d.targets.fat_g, c: t.fat },
    { l: 'Fiber', v: d.consumed.fiber_g ?? 0, tg: d.targets.fiber_g, c: t.fiber },
  ];
  return (
    <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {items.map((m, i) => (
        <View key={m.l} style={{ alignItems: 'center', gap: 8 }} accessible accessibilityLabel={`${m.l}: ${Math.round(m.v)} of ${Math.round(m.tg)} grams`}>
          <Ring value={m.v} target={m.tg} size={68} stroke={7} from={m.c} to={m.c} delay={150 + i * 120}>
            <AnimatedNumber value={Math.round(m.v)} style={{ fontSize: 17 }} />
          </Ring>
          <View style={{ alignItems: 'center' }}>
            <Text v="caption">{m.l}</Text>
            <Text v="caption" faint>/ {Math.round(m.tg)}g</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/* ---------- activity ---------- */
function Tile({ icon, color, label, onPress, children, flex = '47%' }: { icon: IconName; color: string; label: string; onPress?: () => void; children: React.ReactNode; flex?: string }) {
  return (
    <View style={{ flexBasis: flex as `${number}%`, flexGrow: 1 }}>
      <Card onPress={onPress} style={{ gap: 10, minHeight: 118 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={17} color={color} />
          </View>
          <Text v="caption" muted>{label}</Text>
        </View>
        {children}
      </Card>
    </View>
  );
}

export function ActivityGrid({ d, steps, stepStatus, onAddWater, waterBusy, onSleep, onWater }: {
  d: Dashboard; steps: number | null; stepStatus: string; onAddWater: () => void; waterBusy: boolean; onSleep: () => void; onWater: () => void;
}) {
  const t = useTheme();
  const a = d.activity;
  const sleep = a?.sleep_hours;
  const mins = a?.workout_minutes;
  const kcal = a?.active_kcal;
  const water = d.water_ml;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <Tile icon="footsteps" color={t.accent} label="Steps">
        {steps === null ? <Text v="caption" muted>{stepStatus === 'denied' ? 'Allow activity access to count steps' : stepStatus === 'unavailable' ? 'Step counter not available' : 'Counting…'}</Text>
          : <AnimatedNumber value={steps} style={{ fontSize: 30 }} />}
      </Tile>
      <Tile icon="barbell" color={t.protein} label="Workout">
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          {mins === null || mins === undefined ? <Text v="number">-</Text> : <AnimatedNumber value={mins} style={{ fontSize: 30 }} />}
          <Text v="caption" muted>min</Text>
        </View>
      </Tile>
      <Tile icon="water" color={t.water} label="Water" onPress={onWater}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <AnimatedNumber value={water} style={{ fontSize: 26 }} />
              <Text v="caption" muted>ml</Text>
            </View>
            <Text v="caption" faint>of {d.water_target_ml}</Text>
          </View>
          <PressableScale onPress={onAddWater} disabled={waterBusy} hapticStyle="medium" accessibilityRole="button" accessibilityLabel="Add 250 millilitres of water">
            <View style={{ backgroundColor: t.water, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, opacity: waterBusy ? 0.5 : 1 }}>
              <Text v="caption" color="#07080A" style={{ fontFamily: 'Inter_700Bold' }}>+250</Text>
            </View>
          </PressableScale>
        </View>
      </Tile>
      <Tile icon="moon" color={t.fiber} label="Sleep" onPress={onSleep}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          {sleep === null || sleep === undefined ? <Text v="caption" muted>Tap to log last night</Text> : (
            <><AnimatedNumber value={sleep} decimals={1} style={{ fontSize: 30 }} /><Text v="caption" muted>hours</Text></>
          )}
        </View>
      </Tile>
      <Tile icon="flame" color={t.fat} label="Active calories" flex="100%">
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          {kcal === null || kcal === undefined ? <Text v="caption" muted>Complete a workout to see an estimate</Text> : (
            <><AnimatedNumber value={Math.round(kcal)} style={{ fontSize: 30 }} /><Text v="caption" muted>kcal (estimated)</Text></>
          )}
        </View>
      </Tile>
    </View>
  );
}

export function SleepSheet({ visible, onClose, current, onSave, busy }: { visible: boolean; onClose: () => void; current: number | null | undefined; onSave: (h: number) => void; busy: boolean }) {
  const t = useTheme();
  const [h, setH] = useState(current ?? 7);
  const bump = (n: number) => { haptic.select(); setH((v) => Math.min(14, Math.max(0, Math.round((v + n) * 2) / 2))); };
  return (
    <Sheet visible={visible} onClose={onClose} title="How long did you sleep?">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <PressableScale onPress={() => bump(-0.5)} hapticStyle="none" accessibilityLabel="Less sleep" accessibilityRole="button"><View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="remove" size={26} color={t.text} /></View></PressableScale>
        <View style={{ alignItems: 'center' }}><AnimatedNumber value={h} decimals={1} style={{ fontSize: 52 }} /><Text v="caption" muted>hours</Text></View>
        <PressableScale onPress={() => bump(0.5)} hapticStyle="none" accessibilityLabel="More sleep" accessibilityRole="button"><View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={26} color={t.text} /></View></PressableScale>
      </View>
      <Button title="Save" loading={busy} onPress={() => onSave(h)} />
    </Sheet>
  );
}

/* ---------- today's schedule ---------- */
const SLOTS: MealType[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'];

export function Schedule({ d, workout }: { d: Dashboard; workout: WorkoutToday | undefined }) {
  const t = useTheme();
  const router = useRouter();
  const loggedBy = (type: MealType) => d.meals.filter((m) => m.meal_type === type).reduce((s, m) => s + m.kcal, 0);
  const planned = (type: MealType) => d.meal_slots?.find((s) => s.meal_type === type)?.planned ?? null;
  const extra = d.meals.map((m) => m.meal_type).filter((m) => !SLOTS.includes(m));
  const slots = [...SLOTS, ...Array.from(new Set(extra))];
  const wDay = workout?.day;
  const done = !!workout?.session?.finished_at;

  const Row = ({ icon, title, sub, right, ok, onPress }: { icon: IconName; title: string; sub?: string; right?: string; ok: boolean; onPress: () => void }) => (
    <PressableScale onPress={onPress} scaleTo={0.985} hapticStyle="select" accessibilityRole="button" accessibilityLabel={`${title}. ${ok ? 'Done' : 'Not yet'}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ok ? t.accent + '22' : t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={19} color={ok ? t.accent : t.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong">{title}</Text>
          {sub ? <Text v="caption" muted numberOfLines={1}>{sub}</Text> : null}
        </View>
        {right ? <Text v="caption" muted>{right}</Text> : null}
        <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={ok ? t.accent : t.textFaint} />
      </View>
    </PressableScale>
  );

  return (
    <Card style={{ paddingVertical: 6 }}>
      {slots.map((s) => {
        const kcal = loggedBy(s);
        const p = planned(s);
        return <Row key={s} icon={MEAL_ICONS[s]} title={MEAL_LABELS[s]} ok={kcal > 0}
          sub={kcal > 0 ? 'Logged' : p ? `Planned: ${p.name}` : 'Tap to add'} right={kcal > 0 ? `${Math.round(kcal)} kcal` : p?.kcal ? `~${Math.round(p.kcal)} kcal` : undefined}
          onPress={() => router.push('/(tabs)/food')} />;
      })}
      {wDay ? (
        <Row icon={wDay.is_rest ? 'bed-outline' : 'barbell-outline'} title={wDay.is_rest ? 'Rest & recovery' : `Workout: ${wDay.focus ?? 'Training'}`}
          sub={wDay.is_rest ? 'Recovery is part of the plan' : done ? 'Completed' : `${wDay.exercises?.length ?? 0} exercises`} ok={done || !!wDay.is_rest}
          onPress={() => router.push('/(tabs)/workout')} />
      ) : null}
    </Card>
  );
}

/* ---------- insights ---------- */
export function Insights({ items }: { items: string[] }) {
  const t = useTheme();
  if (items.length === 0) {
    return (
      <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Ionicons name="sparkles-outline" size={22} color={t.textMuted} />
        <Text v="body" muted style={{ flex: 1 }}>No recommendations yet. As you log meals and water, tips based on your own data will show up here.</Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {items.map((m, i) => (
        <Reveal key={m} index={i}>
          <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderColor: t.accent + '33' }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={17} color={t.accent} />
            </View>
            <Text v="body" style={{ flex: 1 }}>{m}</Text>
          </Card>
        </Reveal>
      ))}
    </View>
  );
}

export function HomeSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <Skeleton height={330} radius={24} />
      <Skeleton height={130} radius={24} />
      <View style={{ flexDirection: 'row', gap: 12 }}><Skeleton height={118} radius={24} width="48%" /><Skeleton height={118} radius={24} width="48%" /></View>
    </View>
  );
}
