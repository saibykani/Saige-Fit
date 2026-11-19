import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Button, Card, PressableScale, ProgressBar, Sheet, Text, haptic } from '@/ui';
import { JournalMeal, MEAL_ICONS, MEAL_LABELS, MealItem, MealType, per100Of, scaleMacros, sumMacros } from '@/features/common/types';
import { MacroPills } from '@/features/common/MacroPills';
import { useDeleteMeal, usePhotoUrl, useUpdateItem } from './api';
import { GramsPicker, MacroPreview } from './QuantityParts';

export function ScanCta({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} hapticStyle="medium" accessibilityRole="button" accessibilityLabel="Scan your meal with the camera">
      <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="scan" size={28} color={t.onAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text v="title" color={t.onAccent}>Scan your meal</Text>
          <Text v="caption" color={t.onAccent} style={{ opacity: 0.75 }}>Photo or barcode · calories in seconds</Text>
        </View>
        <Ionicons name="arrow-forward" size={22} color={t.onAccent} />
      </LinearGradient>
    </PressableScale>
  );
}

export function DayTotals({ meals, target }: { meals: JournalMeal[]; target?: number }) {
  const total = sumMacros(meals.flatMap((m) => m.items.map((i) => ({ kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, fiber_g: i.fiber_g ?? 0 }))));
  return (
    <Card glow style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <AnimatedNumber value={total.kcal} style={{ fontSize: 40 }} />
        <Text v="heading" muted>{target ? `/ ${target} kcal` : 'kcal'}</Text>
      </View>
      {target ? <ProgressBar value={total.kcal} target={target} /> : null}
      <MacroPills m={total} size="md" />
    </Card>
  );
}

function ItemEditSheet({ meal, item, onClose }: { meal: JournalMeal; item: MealItem | null; onClose: () => void }) {
  const upd = useUpdateItem();
  const [grams, setGrams] = useState(item?.quantity_g ?? 100);
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => { if (item) { setGrams(Math.round(item.quantity_g)); setError(null); } }, [item]);
  if (!item) return null;
  const k = item.quantity_g > 0 ? 100 / item.quantity_g : 0;
  const per100 = { kcal: item.kcal * k, protein_g: item.protein_g * k, carbs_g: item.carbs_g * k, fat_g: item.fat_g * k, fiber_g: (item.fiber_g ?? 0) * k };
  return (
    <Sheet visible onClose={onClose} title={item.name}>
      <View style={{ gap: 16 }}>
        <MacroPreview m={scaleMacros(per100, grams)} />
        <GramsPicker grams={grams} onChange={setGrams} />
        {error ? <Text v="caption" color="#FF5C5C">{error}</Text> : null}
        <Button title="Update quantity" loading={upd.isPending} onPress={() => upd.mutate({ mealId: meal.id, itemId: item.id, quantity_g: grams }, {
          onSuccess: () => { haptic.success(); onClose(); }, onError: (e) => { haptic.warning(); setError(errorMessage(e)); },
        })} />
      </View>
    </Sheet>
  );
}

function MealCard({ meal }: { meal: JournalMeal }) {
  const t = useTheme();
  const del = useDeleteMeal();
  const photo = usePhotoUrl(meal.photo_path);
  const [edit, setEdit] = useState<MealItem | null>(null);
  const total = sumMacros(meal.items.map((i) => ({ kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, fiber_g: i.fiber_g ?? 0 })));
  const confirmDelete = () => {
    haptic.warning();
    Alert.alert('Delete this meal?', `${meal.items.map((i) => i.name).join(', ')} will be removed from your journal.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => del.mutate(meal.id) },
    ]);
  };
  return (
    <Swipeable overshootRight={false} onSwipeableOpen={confirmDelete} renderRightActions={() => (
      <View style={{ justifyContent: 'center', alignItems: 'center', width: 84, marginLeft: 8, borderRadius: 24, backgroundColor: t.danger + '33' }}>
        <Ionicons name="trash" size={24} color={t.danger} />
      </View>
    )}>
      <PressableScale scaleTo={0.99} hapticStyle="none" onLongPress={confirmDelete} accessibilityLabel={`${meal.items.length} items, ${Math.round(total.kcal)} calories. Long press to delete.`}>
        <View style={{ backgroundColor: t.surface, borderRadius: 24, borderWidth: 1, borderColor: t.border, padding: 14, gap: 10, opacity: del.isPending ? 0.5 : 1 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {photo.data ? <Image source={{ uri: photo.data }} style={{ width: 52, height: 52, borderRadius: 14 }} contentFit="cover" transition={250} /> : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Text v="bodyStrong">{Math.round(total.kcal)} kcal</Text>
              <MacroPills m={total} />
            </View>
            {meal.items.some((i) => i.is_estimate) ? <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.warn + '22' }}><Text v="label" color={t.warn} style={{ fontSize: 9 }}>Estimate</Text></View> : null}
          </View>
          {meal.items.map((i) => (
            <PressableScale key={i.id} onPress={() => setEdit(i)} scaleTo={0.98} hapticStyle="select" accessibilityRole="button" accessibilityLabel={`${i.name}, ${Math.round(i.quantity_g)} grams. Tap to adjust.`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Text v="body" style={{ flex: 1 }} numberOfLines={1}>{i.name}</Text>
                <Text v="caption" muted>{Math.round(i.quantity_g)} g · {Math.round(i.kcal)} kcal</Text>
                <Ionicons name="pencil" size={13} color={t.textFaint} />
              </View>
            </PressableScale>
          ))}
        </View>
      </PressableScale>
      <ItemEditSheet meal={meal} item={edit} onClose={() => setEdit(null)} />
    </Swipeable>
  );
}

export function MealSection({ type, meals, onAdd }: { type: MealType; meals: JournalMeal[]; onAdd: () => void }) {
  const t = useTheme();
  const kcal = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + i.kcal, 0), 0);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={MEAL_ICONS[type]} size={18} color={t.accent} />
        <Text v="heading" style={{ flex: 1 }}>{MEAL_LABELS[type]}</Text>
        {kcal > 0 ? <Text v="caption" muted>{Math.round(kcal)} kcal</Text> : null}
        <PressableScale onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add food to ${MEAL_LABELS[type]}`}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={20} color={t.accent} />
          </View>
        </PressableScale>
      </View>
      {meals.length === 0 ? (
        <PressableScale onPress={onAdd} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`Add ${MEAL_LABELS[type]}`}>
          <View style={{ borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.border, paddingVertical: 16, alignItems: 'center' }}>
            <Text v="caption" faint>Nothing logged. Tap to add</Text>
          </View>
        </PressableScale>
      ) : meals.map((m) => <MealCard key={m.id} meal={m} />)}
    </View>
  );
}
