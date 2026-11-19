import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { errorMessage } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Button, Card, Chip, EmptyState, Reveal, Screen, Text, haptic } from '@/ui';
import { useDay } from '@/features/common/dayStore';
import { Burst } from '@/features/common/Burst';
import { MacroPills } from '@/features/common/MacroPills';
import { MEAL_LABELS, MEAL_ORDER, scaleMacros, sumMacros } from '@/features/common/types';
import { useLogMeal } from '@/features/food/api';
import { usePick } from '@/features/food/pickStore';
import { ItemCard } from '@/features/scan/ResultParts';
import { fromFood, useScan } from '@/features/scan/store';

export default function ScanResults() {
  const t = useTheme();
  const router = useRouter();
  const { day } = useDay();
  const s = useScan();
  const picked = usePick((p) => p.picked);
  const setPicked = usePick((p) => p.setPicked);
  const log = useLogMeal();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  // A food chosen on the search screen (swap an item, or add a missing one) arrives through the pick store.
  useEffect(() => {
    if (!picked) return;
    if (picked.target === 'new') s.addItem(fromFood(picked.food, picked.grams));
    else s.replaceFood(picked.target, picked.food, picked.grams);
    setPicked(null);
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => sumMacros(s.items.filter((i) => i.per100).map((i) => scaleMacros(i.per100!, i.grams))), [s.items]);
  const unmatched = s.items.filter((i) => !i.foodId).length;
  const unconfirmed = s.items.filter((i) => i.needsConfirmation && !i.confirmed).length;
  const canSave = s.items.length > 0 && unmatched === 0 && unconfirmed === 0;

  const openPicker = (target: string) => router.push({ pathname: '/food/search', params: { mode: 'pick', target } });
  const close = () => {
    try { router.dismissAll(); } catch { router.replace('/(tabs)'); }
    setTimeout(() => useScan.getState().reset(), 600); // reset after the dismiss so the empty state never flashes
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError(null);
    try {
      let photo_path: string | undefined;
      if (s.imageUri) {
        try { photo_path = await uploadImage('food-photos', s.imageUri); } catch { /* meal is still worth saving without the photo */ }
      }
      await log.mutateAsync({
        meal_type: s.mealType, log_date: day, is_estimate: true,
        ...(s.scanId ? { scan_id: s.scanId } : {}), ...(photo_path ? { photo_path } : {}),
        items: s.items.map((i) => ({ food_id: i.foodId as string, quantity_g: i.grams, user_edited: i.edited })),
      });
      haptic.success();
      setDone(Math.round(total.kcal));
      setTimeout(close, 1700);
    } catch (e) {
      haptic.warning();
      setError(errorMessage(e));
    } finally { setSaving(false); }
  };

  if (!s.imageUri && s.items.length === 0) {
    return (
      <Screen title="Review meal" back tabBar={false}>
        <EmptyState icon="camera-outline" title="Nothing to review" hint="Scan a meal first." action={{ label: 'Open scanner', onPress: () => router.replace('/scan') }} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Review meal" subtitle="Check each item before saving" back tabBar={false}>
        {s.imageUri ? (
          <Reveal index={0}>
            <View style={{ borderRadius: 28, overflow: 'hidden', height: 220 }}>
              <Image source={{ uri: s.imageUri }} style={{ flex: 1 }} contentFit="cover" transition={300} accessibilityLabel="Photo of your meal" />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 }} />
              <View style={{ position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <AnimatedNumber value={total.kcal} style={{ fontSize: 38, color: '#fff' }} />
                <Text v="heading" style={{ color: 'rgba(255,255,255,0.8)' }}>kcal · estimate</Text>
              </View>
            </View>
          </Reveal>
        ) : null}

        <Reveal index={1}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 18, backgroundColor: t.warn + '16', borderWidth: 1, borderColor: t.warn + '44' }}>
            <Ionicons name="information-circle" size={20} color={t.warn} />
            <Text v="caption" style={{ flex: 1 }}>{s.disclaimer || 'These values are estimates from a photo, not lab measurements. Portions, ingredients and cooking methods vary. Please check and adjust each item.'}</Text>
          </View>
        </Reveal>

        {s.items.length === 0 ? (
          <EmptyState icon="search" title="No food detected" hint="We couldn't spot any food. Retake the photo, or add items manually."
            action={{ label: 'Add food manually', onPress: () => openPicker('new') }} />
        ) : (
          <>
            <Reveal index={2}>
              <Card glow style={{ gap: 12 }}>
                <Text v="label" muted>Meal total</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <AnimatedNumber value={total.kcal} style={{ fontSize: 40 }} duration={400} />
                  <Text v="heading" muted>kcal</Text>
                </View>
                <MacroPills m={total} size="md" />
                {unconfirmed + unmatched > 0 ? <Text v="caption" color={t.warn}>{unconfirmed + unmatched} item{unconfirmed + unmatched > 1 ? 's' : ''} need your confirmation before saving.</Text> : null}
              </Card>
            </Reveal>
            {s.items.map((it, i) => (
              <Reveal key={it.key} index={i + 3}>
                <ItemCard item={it} onSwap={() => openPicker(it.key)} onRemove={() => { haptic.light(); s.removeItem(it.key); }}
                  onGrams={(g) => s.patchItem(it.key, { grams: g, edited: true })} onConfirm={() => s.patchItem(it.key, { confirmed: true })} />
              </Reveal>
            ))}
          </>
        )}

        <Button title="Add a missing item" variant="ghost" icon="add" onPress={() => openPicker('new')} />

        <View style={{ gap: 10 }}>
          <Text v="label" muted>Save as</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MEAL_ORDER.map((m) => <Chip key={m} label={MEAL_LABELS[m]} selected={s.mealType === m} onPress={() => s.setMealType(m)} />)}
          </View>
        </View>

        {error ? <Text v="caption" color={t.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Button title="Save meal" icon="checkmark-circle" onPress={save} loading={saving} disabled={!canSave} />
        <Button title="Retake photo" variant="ghost" icon="camera-outline" onPress={() => router.replace('/scan')} />
      </Screen>

      {done !== null ? (
        <Animated.View entering={FadeIn.duration(250)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg + 'F2', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <Burst />
          <Animated.View entering={ZoomIn.springify().damping(12)} style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={64} color={t.onAccent} />
          </Animated.View>
          <Text v="display">Meal saved</Text>
          <Text v="body" muted>{done} kcal added to {MEAL_LABELS[s.mealType]}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
