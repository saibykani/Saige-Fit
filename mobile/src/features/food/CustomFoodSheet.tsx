import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Field, Sheet, Text, haptic } from '@/ui';
import type { FoodSummary } from '@/features/common/types';
import { createCustomFood } from './api';

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

/** Create a private custom food from label values (per 100 g). */
export function CustomFoodSheet({ visible, onClose, onCreated, initialName = '' }: {
  visible: boolean; onClose: () => void; onCreated: (f: FoodSummary) => void; initialName?: string;
}) {
  const t = useTheme();
  const [f, setF] = useState({ name: initialName, kcal: '', protein: '', carbs: '', fat: '', fiber: '', sugar: '', sodium: '', serving: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    const kcal = num(f.kcal), p = num(f.protein), c = num(f.carbs), fat = num(f.fat);
    if (f.name.trim().length < 2) return setError('Give the food a name.');
    if ([kcal, p, c, fat].some((v) => v === undefined || Number.isNaN(v) || (v as number) < 0)) return setError('Calories, protein, carbs and fat are required (use 0 if none).');
    if ((p as number) + (c as number) + (fat as number) > 100.5) return setError('Protein + carbs + fat can\'t exceed 100 g per 100 g.');
    if ((kcal as number) > 900) return setError('Calories per 100 g can\'t exceed 900.');
    const opt = { fiber_g: num(f.fiber), sugar_g: num(f.sugar), sodium_mg: num(f.sodium), default_serving_g: num(f.serving) };
    if (Object.values(opt).some((v) => v !== undefined && (Number.isNaN(v) || (v as number) < 0))) return setError('Optional values must be positive numbers.');
    setBusy(true); setError(null);
    try {
      const food = await createCustomFood({
        name: f.name.trim(), kcal: kcal as number, protein_g: p as number, carbs_g: c as number, fat_g: fat as number,
        ...(opt.fiber_g !== undefined ? { fiber_g: opt.fiber_g } : {}), ...(opt.sugar_g !== undefined ? { sugar_g: opt.sugar_g } : {}),
        ...(opt.sodium_mg !== undefined ? { sodium_mg: opt.sodium_mg } : {}), ...(opt.default_serving_g !== undefined ? { default_serving_g: opt.default_serving_g } : {}),
      });
      haptic.success();
      onCreated(food);
    } catch (e) { haptic.warning(); setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Custom food">
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
        <Text v="caption" muted>Enter values per 100 g, as on the nutrition label.</Text>
        <Field label="Name" value={f.name} onChangeText={set('name')} placeholder="e.g. Homemade protein bar" />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Calories" value={f.kcal} onChangeText={set('kcal')} keyboardType="decimal-pad" suffix="kcal" /></View>
          <View style={{ flex: 1 }}><Field label="Protein" value={f.protein} onChangeText={set('protein')} keyboardType="decimal-pad" suffix="g" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Carbs" value={f.carbs} onChangeText={set('carbs')} keyboardType="decimal-pad" suffix="g" /></View>
          <View style={{ flex: 1 }}><Field label="Fat" value={f.fat} onChangeText={set('fat')} keyboardType="decimal-pad" suffix="g" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Fiber (opt.)" value={f.fiber} onChangeText={set('fiber')} keyboardType="decimal-pad" suffix="g" /></View>
          <View style={{ flex: 1 }}><Field label="Sugar (opt.)" value={f.sugar} onChangeText={set('sugar')} keyboardType="decimal-pad" suffix="g" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Sodium (opt.)" value={f.sodium} onChangeText={set('sodium')} keyboardType="decimal-pad" suffix="mg" /></View>
          <View style={{ flex: 1 }}><Field label="Serving (opt.)" value={f.serving} onChangeText={set('serving')} keyboardType="decimal-pad" suffix="g" /></View>
        </View>
        {error ? <Text v="caption" color={t.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Button title="Save food" icon="checkmark" onPress={submit} loading={busy} />
      </ScrollView>
    </Sheet>
  );
}
