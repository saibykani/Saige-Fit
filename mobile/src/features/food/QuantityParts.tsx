import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Chip, Text } from '@/ui';
import { NumberStepper } from '@/features/onboarding/widgets';
import type { Macros } from '@/features/common/types';

/** Gram stepper with quick portion chips. `unit` (e.g. "1 katori = 150 g") adds serving multiples. */
export function GramsPicker({ grams, onChange, unit }: { grams: number; onChange: (g: number) => void; unit?: { label: string; grams: number } | null }) {
  const quick = [50, 100, 150, 200, 250];
  const servings = unit && unit.grams > 0 ? [0.5, 1, 1.5, 2] : [];
  return (
    <View style={{ gap: 12 }}>
      <NumberStepper label="Quantity" value={grams} onChange={onChange} min={1} max={5000} step={5} unit="g" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {servings.map((s) => {
          const g = Math.round((unit as { grams: number }).grams * s);
          return <Chip key={`s${s}`} label={`${s} × ${(unit as { label: string }).label}`} selected={grams === g} onPress={() => onChange(g)} />;
        })}
        {quick.map((g) => <Chip key={g} label={`${g} g`} selected={grams === g} onPress={() => onChange(g)} />)}
      </View>
    </View>
  );
}

/** Live calories + macros for the chosen quantity (all computed from the food's per-100 g data). */
export function MacroPreview({ m }: { m: Macros }) {
  const t = useTheme();
  const cells: [string, number, string, string][] = [['Protein', m.protein_g, t.protein, 'g'], ['Carbs', m.carbs_g, t.carbs, 'g'], ['Fat', m.fat_g, t.fat, 'g']];
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <AnimatedNumber value={m.kcal} style={{ fontSize: 40 }} duration={350} />
        <Text v="heading" muted>kcal</Text>
        <View style={{ flex: 1 }} />
        <Text v="caption" faint>estimate</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {cells.map(([l, v, c, u]) => (
          <View key={l} style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
              <Text v="caption" muted>{l}</Text>
            </View>
            <AnimatedNumber value={v} decimals={1} suffix={u} style={{ fontSize: 20 }} duration={350} />
          </View>
        ))}
      </View>
    </View>
  );
}
