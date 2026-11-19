import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, PressableScale, Sheet, Text, AnimatedNumber, haptic } from '@/ui';
import { MacroPills } from '@/features/common/MacroPills';
import { scaleMacros } from '@/features/common/types';
import { GramsPicker, MacroPreview } from '@/features/food/QuantityParts';
import type { ScanItem } from './store';

function confidenceInfo(c: number, theme: ReturnType<typeof useTheme>) {
  if (c >= 0.8) return { label: 'High confidence', color: theme.success };
  if (c >= 0.6) return { label: 'Medium confidence', color: theme.warn };
  return { label: 'Low confidence', color: theme.danger };
}

export function ItemCard({ item, onSwap, onRemove, onGrams, onConfirm }: {
  item: ScanItem; onSwap: () => void; onRemove: () => void; onGrams: (g: number) => void; onConfirm: () => void;
}) {
  const t = useTheme();
  const [sheet, setSheet] = useState(false);
  const m = item.per100 ? scaleMacros(item.per100, item.grams) : null;
  const flagged = item.needsConfirmation && !item.confirmed;
  const conf = confidenceInfo(item.confidence, t);
  const bump = (d: number) => { haptic.select(); onGrams(Math.max(5, Math.min(5000, item.grams + d))); };

  return (
    <Card style={{ gap: 12, borderColor: flagged ? t.warn + '99' : t.border, borderWidth: flagged ? 1.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <PressableScale onPress={onSwap} style={{ flex: 1 }} hapticStyle="select" accessibilityRole="button" accessibilityLabel={`${item.name}. Tap to change food.`}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text v="heading" numberOfLines={2} style={{ flexShrink: 1 }}>{item.foodId ? item.name : item.detectedName}</Text>
              <Ionicons name="swap-horizontal" size={15} color={t.textFaint} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {!item.edited ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: conf.color + '22' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: conf.color }} />
                  <Text v="label" color={conf.color} style={{ fontSize: 9 }}>{conf.label}</Text>
                </View>
              ) : <Text v="label" accent style={{ fontSize: 9 }}>Edited by you</Text>}
              {item.cooking ? <Text v="caption" faint>{item.cooking}</Text> : null}
            </View>
            {item.foodId && item.name !== item.detectedName && !item.edited ? <Text v="caption" faint>Detected as “{item.detectedName}”</Text> : null}
          </View>
        </PressableScale>
        <PressableScale onPress={onRemove} hapticStyle="light" accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} style={{ padding: 4 }}>
          <Ionicons name="close-circle" size={24} color={t.textFaint} />
        </PressableScale>
      </View>

      {m ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <AnimatedNumber value={m.kcal} style={{ fontSize: 28 }} duration={350} />
            <Text v="caption" muted>kcal</Text>
          </View>
          <MacroPills m={m} />
        </View>
      ) : <Text v="caption" muted>No nutrition match yet. Choose the right food to see calories.</Text>}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.surfaceAlt, borderRadius: 16, padding: 6 }}>
        <PressableScale onPress={() => bump(-10)} hapticStyle="none" accessibilityRole="button" accessibilityLabel="Decrease by 10 grams">
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="remove" size={20} color={t.text} /></View>
        </PressableScale>
        <PressableScale onPress={() => setSheet(true)} hapticStyle="select" accessibilityRole="button" accessibilityLabel={`${item.grams} grams. Tap to edit quantity.`}>
          <View style={{ alignItems: 'center' }}>
            <Text v="title">{item.grams} g</Text>
            <Text v="caption" faint>estimated portion · tap to adjust</Text>
          </View>
        </PressableScale>
        <PressableScale onPress={() => bump(10)} hapticStyle="none" accessibilityRole="button" accessibilityLabel="Increase by 10 grams">
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={20} color={t.text} /></View>
        </PressableScale>
      </View>

      {item.allergens.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: t.danger + '1F' }}>
          <Ionicons name="warning" size={16} color={t.danger} />
          <Text v="caption" color={t.danger} style={{ flex: 1 }}>Contains {item.allergens.join(', ').replace(/_/g, ' ')}, which you listed as an allergy.</Text>
        </View>
      ) : null}

      {flagged ? (
        <View style={{ gap: 10, padding: 12, borderRadius: 14, backgroundColor: t.warn + '18' }}>
          <Text v="bodyStrong">{item.foodId ? `Is this ${item.name.toLowerCase()}?` : `We couldn't match “${item.detectedName}”`}</Text>
          <Text v="caption" muted>{item.foodId ? 'We\'re not fully sure. Confirm it, or pick the right food.' : 'Pick the closest food so calories can be calculated accurately.'}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {item.foodId ? <View style={{ flex: 1 }}><Button title="Confirm" size="md" icon="checkmark" onPress={() => { haptic.success(); onConfirm(); }} /></View> : null}
            <View style={{ flex: 1 }}><Button title={item.foodId ? 'Change' : 'Choose food'} size="md" variant="secondary" icon="search" onPress={onSwap} /></View>
          </View>
        </View>
      ) : null}

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={item.name}>
        <View style={{ gap: 16 }}>
          {m ? <MacroPreview m={m} /> : null}
          <GramsPicker grams={item.grams} onChange={onGrams} />
          <Button title="Done" onPress={() => setSheet(false)} />
        </View>
      </Sheet>
    </Card>
  );
}
