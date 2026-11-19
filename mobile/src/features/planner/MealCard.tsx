import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Icon, PressableScale, Sheet, Text, haptic } from '@/ui';
import { errorInfo } from '@/features/paywall/gate';
import { TimeSheet } from '@/features/settings/TimeSheet';
import { fmtTime12 } from '@/features/settings/util';
import { PlanMeal, altName } from './api';

function Macro({ label, v, color }: { label: string; v: number; color: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /><Text v="caption" muted>{label} {Math.round(v)}g</Text></View>;
}

export function MealCard({ meal, date, onChanged }: { meal: PlanMeal; date: string; onChanged: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState(false);
  const [time, setTime] = useState(false);
  const [logged, setLogged] = useState(false);

  const fail = (title: string) => (e: unknown) => Alert.alert(title, errorInfo(e).message);
  const replace = useMutation({
    mutationFn: (index?: number) => api(`/v1/diet/meals/${meal.id}/replace`, { body: index === undefined ? {} : { alternative_index: index } }),
    onSuccess: () => { haptic.success(); setSwap(false); onChanged(); },
    onError: fail('Could not replace meal'),
  });
  const log = useMutation({
    mutationFn: () => api(`/v1/diet/meals/${meal.id}/log`, { body: { log_date: date } }),
    onSuccess: () => { haptic.success(); setLogged(true); ['dashboard', 'journal'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: fail('Could not add to journal'),
  });
  const retime = useMutation({
    mutationFn: (hhmm: string) => api(`/v1/diet/meals/${meal.id}`, { method: 'PATCH', body: { scheduled_time: hhmm } }),
    onSuccess: () => { haptic.light(); onChanged(); },
    onError: fail('Could not change time'),
  });

  const alts = meal.alternatives ?? [];
  return (
    <>
      <Card onPress={() => setOpen((o) => !o)} padded={false}>
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text v="bodyStrong" numberOfLines={open ? 3 : 1}>{meal.name}</Text>
              <Text v="caption" muted>{meal.quantity_g ? `${Math.round(meal.quantity_g)} g · ` : ''}{Math.round(meal.kcal)} kcal</Text>
            </View>
            {meal.scheduled_time ? <PressableScale onPress={() => setTime(true)} hapticStyle="select" accessibilityLabel="Change meal time" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}><Icon name="time-outline" size={14} color={t.accent} /><Text v="caption">{fmtTime12(meal.scheduled_time)}</Text></PressableScale> : null}
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.textFaint} />
          </View>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Macro label="P" v={meal.protein_g} color={t.protein} /><Macro label="C" v={meal.carbs_g} color={t.carbs} /><Macro label="F" v={meal.fat_g} color={t.fat} />
          </View>
          {open && (
            <View style={{ gap: 14, marginTop: 4 }}>
              {meal.instructions ? <View style={{ gap: 4 }}><Text v="label" muted>Preparation</Text><Text v="body" muted>{meal.instructions}</Text></View> : null}
              {alts.length > 0 && <View style={{ gap: 4 }}><Text v="label" muted>Alternatives</Text>{alts.slice(0, 4).map((a, i) => <Text key={i} v="body" muted>• {altName(a)}</Text>)}</View>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={logged ? 'Logged' : 'Log it'} icon={logged ? 'checkmark-circle' : 'add-circle-outline'} size="md" style={{ flex: 1 }} disabled={logged} loading={log.isPending} onPress={() => log.mutate()} />
                <Button title="Replace" icon="swap-horizontal" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => setSwap(true)} />
              </View>
              <Button title={meal.scheduled_time ? 'Adjust time' : 'Set a time'} icon="time-outline" variant="ghost" size="md" onPress={() => setTime(true)} />
            </View>
          )}
        </View>
      </Card>

      <Sheet visible={swap} onClose={() => setSwap(false)} title="Replace this meal">
        <View style={{ gap: 10 }}>
          {alts.map((a, i) => (
            <PressableScale key={i} onPress={() => replace.mutate(i)} disabled={replace.isPending} accessibilityLabel={`Swap to ${altName(a)}`}
              style={{ padding: 14, borderRadius: 18, backgroundColor: t.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="swap-horizontal" size={18} color={t.accent} /><Text v="bodyStrong" style={{ flex: 1 }}>{altName(a)}</Text>
            </PressableScale>
          ))}
          <Button title="Suggest something new" icon="refresh" variant="secondary" loading={replace.isPending} onPress={() => replace.mutate(undefined)} />
        </View>
      </Sheet>
      <TimeSheet visible={time} value={meal.scheduled_time ?? '08:00'} title="Meal time" onClose={() => setTime(false)} onSave={(v) => retime.mutate(v)} />
    </>
  );
}
