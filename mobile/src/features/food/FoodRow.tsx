import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale, Text, haptic } from '@/ui';
import { FoodSummary, per100Of } from '@/features/common/types';

export function FoodRow({ food, onPress, favorite, onToggleFavorite, tag }: {
  food: FoodSummary; onPress: () => void; favorite?: boolean; onToggleFavorite?: () => void; tag?: string;
}) {
  const t = useTheme();
  const p = per100Of(food);
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} hapticStyle="select" accessibilityRole="button" accessibilityLabel={`${food.name}, ${Math.round(p.kcal)} calories per 100 grams`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: t.border }}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{food.name}</Text>
            {tag ? <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: t.accent + '22' }}><Text v="label" accent style={{ fontSize: 9 }}>{tag}</Text></View> : null}
          </View>
          <Text v="caption" muted numberOfLines={1}>
            {food.brand ? `${food.brand} · ` : ''}{Math.round(p.kcal)} kcal · P {Math.round(p.protein_g)} · C {Math.round(p.carbs_g)} · F {Math.round(p.fat_g)} per 100 g
          </Text>
        </View>
        {onToggleFavorite ? (
          <PressableScale onPress={() => { haptic.light(); onToggleFavorite(); }} hapticStyle="none" accessibilityRole="button" accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'} style={{ padding: 6 }}>
            <Ionicons name={favorite ? 'star' : 'star-outline'} size={20} color={favorite ? t.fat : t.textFaint} />
          </PressableScale>
        ) : null}
        <Ionicons name="add-circle" size={26} color={t.accent} />
      </View>
    </PressableScale>
  );
}
