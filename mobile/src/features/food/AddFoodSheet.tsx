import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Chip, Sheet, Text, haptic } from '@/ui';
import { FoodSummary, MEAL_LABELS, MEAL_ORDER, MealType, mealForNow, per100Of, scaleMacros } from '@/features/common/types';
import { useLogMeal } from './api';
import { GramsPicker, MacroPreview } from './QuantityParts';

export function defaultGrams(f: FoodSummary): number {
  return Math.round(f.default_serving_g ?? f.grams_per_unit ?? 100) || 100;
}

/**
 * Pick a quantity for a food. mode "log" saves it to the journal; mode "pick" hands {food, grams} back via onPick.
 */
export function AddFoodSheet({ food, day, initialMeal, mode = 'log', onClose, onPick, onLogged }: {
  food: FoodSummary | null; day: string; initialMeal?: MealType; mode?: 'log' | 'pick';
  onClose: () => void; onPick?: (food: FoodSummary, grams: number) => void; onLogged?: () => void;
}) {
  const t = useTheme();
  const [grams, setGrams] = useState(100);
  const [meal, setMeal] = useState<MealType>(initialMeal ?? mealForNow());
  const [error, setError] = useState<string | null>(null);
  const log = useLogMeal();

  useEffect(() => {
    if (food) { setGrams(defaultGrams(food)); setError(null); setMeal(initialMeal ?? mealForNow()); }
  }, [food, initialMeal]);

  if (!food) return null;
  const macros = scaleMacros(per100Of(food), grams);
  const unit = food.grams_per_unit ? { label: food.serving_label ?? 'serving', grams: food.grams_per_unit } : null;
  const warn = (food.allergens ?? []);

  const submit = () => {
    if (mode === 'pick') { onPick?.(food, grams); return; }
    if (!food.id) return setError('This food needs to be saved first. Please try again.');
    setError(null);
    log.mutate({ meal_type: meal, log_date: day, items: [{ food_id: food.id, quantity_g: grams }] }, {
      onSuccess: () => { haptic.success(); onLogged?.(); onClose(); },
      onError: (e) => { haptic.warning(); setError(errorMessage(e)); },
    });
  };

  return (
    <Sheet visible onClose={onClose} title={food.name}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        {food.brand ? <Text v="caption" muted>{food.brand}</Text> : null}
        <MacroPreview m={macros} />
        <GramsPicker grams={grams} onChange={setGrams} unit={unit} />
        {mode === 'log' && (
          <View style={{ gap: 8 }}>
            <Text v="label" muted>Meal</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MEAL_ORDER.map((m) => <Chip key={m} label={MEAL_LABELS[m]} selected={meal === m} onPress={() => setMeal(m)} />)}
            </View>
          </View>
        )}
        {warn.length > 0 ? <Text v="caption" color={t.warn}>Contains: {warn.join(', ').replace(/_/g, ' ')}</Text> : null}
        {error ? <Text v="caption" color={t.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Button title={mode === 'pick' ? 'Use this food' : 'Add to journal'} icon="add" onPress={submit} loading={log.isPending} />
      </ScrollView>
    </Sheet>
  );
}
