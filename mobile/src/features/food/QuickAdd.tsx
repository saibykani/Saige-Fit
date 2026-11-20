import React from 'react';
import { ScrollView, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, PressableScale, Text, haptic } from '@/ui';
import { addDays } from '@/features/settings/util';
import { MEAL_LABELS } from '@/features/common/types';
import { FrequentFood, mealForNow, useCopyDay, useFrequent } from '@/features/nutrition/api';
import { useLogMeal } from './api';

/** Horizontal strip of the user's most-logged foods (one tap logs the usual portion) plus a copy-yesterday action. */
export function QuickAdd({ day, hasMeals, onLogged }: { day: string; hasMeals: boolean; onLogged: () => void }) {
  const t = useTheme();
  const freq = useFrequent();
  const log = useLogMeal();
  const copy = useCopyDay();
  const [note, setNote] = React.useState<string | null>(null);
  const foods = freq.data?.foods ?? [];

  const quick = (f: FrequentFood) => {
    setNote(null);
    log.mutate({ meal_type: mealForNow(), log_date: day, items: [{ food_id: f.food_id, quantity_g: f.default_quantity_g }] }, {
      onSuccess: () => { haptic.success(); onLogged(); setNote(`${f.name} added to ${MEAL_LABELS[mealForNow()]}`); },
      onError: (e) => { haptic.warning(); setNote(errorMessage(e)); },
    });
  };
  const copyYesterday = () => {
    setNote(null);
    copy.mutate({ from_date: addDays(day, -1), to_date: day }, {
      onSuccess: (r) => {
        if (r.copied > 0) { haptic.success(); onLogged(); setNote(`Copied ${r.copied} meal${r.copied > 1 ? 's' : ''} (${Math.round(r.kcal)} kcal) from the day before`); }
        else setNote(r.skipped_meal_types.length ? 'Those meals are already logged today' : 'Nothing was logged the day before');
      },
      onError: (e) => { haptic.warning(); setNote(errorMessage(e)); },
    });
  };

  if (!foods.length && hasMeals) return null;
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text v="title">Quick add</Text>
        {!hasMeals ? <Button title="Copy yesterday" size="md" variant="secondary" icon="copy-outline" loading={copy.isPending} onPress={copyYesterday} /> : null}
      </View>
      {foods.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {foods.map((f) => (
            <PressableScale key={f.food_id} onPress={() => quick(f)} accessibilityRole="button" disabled={log.isPending}
              accessibilityLabel={`Log ${Math.round(f.default_quantity_g)} grams of ${f.name}, ${Math.round(f.kcal)} calories`}>
              <View style={{ width: 132, padding: 12, borderRadius: 18, backgroundColor: t.surfaceAlt ?? t.surface, borderWidth: 1, borderColor: t.border, gap: 2 }}>
                <Text v="bodyStrong" numberOfLines={1}>{f.name}</Text>
                <Text v="caption" muted>{Math.round(f.default_quantity_g)} g · {Math.round(f.kcal)} kcal</Text>
                <Text v="caption" accent>+ Log</Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      ) : <Text v="caption" muted>Your most-logged foods will show up here for one-tap logging.</Text>}
      {note ? <Text v="caption" muted accessibilityLiveRegion="polite">{note}</Text> : null}
    </Card>
  );
}
