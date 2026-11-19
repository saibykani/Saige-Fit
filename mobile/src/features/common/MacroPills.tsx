import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';
import { Macros } from './types';

/** Compact P / C / F readout used on cards. */
export function MacroPills({ m, size = 'sm' }: { m: Pick<Macros, 'protein_g' | 'carbs_g' | 'fat_g'>; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const items: [string, number, string][] = [['P', m.protein_g, t.protein], ['C', m.carbs_g, t.carbs], ['F', m.fat_g, t.fat]];
  return (
    <View style={{ flexDirection: 'row', gap: size === 'md' ? 14 : 10 }}>
      {items.map(([l, v, c]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
          <Text v="caption" muted style={size === 'md' ? { fontSize: 14 } : undefined}>{l} {Math.round(v * 10) / 10}g</Text>
        </View>
      ))}
    </View>
  );
}
