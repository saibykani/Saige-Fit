import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Chip, EmptyState, Icon, PressableScale, Reveal, Screen, Section, Skeleton, Text } from '@/ui';
import { QueryState, errorInfo } from '@/features/paywall/gate';
import { asArray, num, titleCase } from '@/features/settings/util';

interface Item { name: string; grams: number }
interface Group { category: string; items: Item[] }

function normalize(r: any): Group[] {
  const toItem = (i: any): Item => ({ name: i.name ?? i.food_name ?? 'Item', grams: num(i.grams ?? i.quantity_g ?? i.total_g) });
  const g = r?.groups ?? r?.categories;
  if (Array.isArray(g)) return g.map((x: any) => ({ category: x.category ?? x.name ?? 'Other', items: asArray<any>(x.items).map(toItem) }));
  if (g && typeof g === 'object') return Object.entries(g).map(([category, items]) => ({ category, items: asArray<any>(items).map(toItem) }));
  const flat = asArray<any>(r, 'items');
  const by: Record<string, Item[]> = {};
  flat.forEach((i) => { (by[i.category ?? 'Other'] ??= []).push(toItem(i)); });
  return Object.entries(by).map(([category, items]) => ({ category, items }));
}
const fmtG = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg` : `${Math.round(g)} g`);

export default function Shopping() {
  const t = useTheme();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const [days, setDays] = useState(7);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const q = useQuery({
    queryKey: ['shopping', planId, days],
    queryFn: async () => normalize(await api<any>(`/v1/diet/shopping-list?${planId ? `plan_id=${encodeURIComponent(planId)}&` : ''}days=${days}`)),
  });

  const share = async (groups: Group[]) => {
    try {
      const text = groups.map((g) => `${titleCase(g.category)}\n${g.items.map((i) => `${done[g.category + i.name] ? '[x]' : '[ ]'} ${i.name} - ${fmtG(i.grams)}`).join('\n')}`).join('\n\n');
      const uri = `${FileSystem.cacheDirectory}shopping-list.txt`;
      await FileSystem.writeAsStringAsync(uri, `Saige Fit shopping list (${days} days)\n\n${text}\n`);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: 'Shopping list' });
      else Alert.alert('Sharing unavailable', 'This device cannot share files.');
    } catch (e) { Alert.alert('Could not share', errorInfo(e).message); }
  };

  return (
    <Screen title="Shopping list" subtitle="Everything your plan needs" back tabBar={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <View style={{ flexDirection: 'row', gap: 8 }}>{[3, 7, 14].map((d) => <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />)}</View>
      <QueryState query={q} feature="ai_meal_suggestions" skeleton={<><Skeleton height={140} radius={24} /><Skeleton height={140} radius={24} /></>}
        empty={(g) => (g.length === 0 || g.every((x) => x.items.length === 0) ? <EmptyState icon="cart-outline" title="Nothing to buy yet" hint="Generate a meal plan first and your grocery list will appear here." /> : null)}>
        {(groups) => (
          <View style={{ gap: 16 }}>
            {groups.filter((g) => g.items.length).map((g, gi) => (
              <Section key={g.category} title={titleCase(g.category)} index={gi}>
                <Card padded={false} style={{ paddingHorizontal: 16 }}>
                  {g.items.map((it, i) => {
                    const key = g.category + it.name;
                    const on = !!done[key];
                    return (
                      <PressableScale key={key + i} onPress={() => setDone((d) => ({ ...d, [key]: !d[key] }))} hapticStyle="select" accessibilityLabel={`${it.name}, ${fmtG(it.grams)}, ${on ? 'checked' : 'unchecked'}`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {on && <Icon name="checkmark" size={14} color={t.onAccent} />}
                        </View>
                        <Text v="body" style={{ flex: 1, opacity: on ? 0.45 : 1, textDecorationLine: on ? 'line-through' : 'none' }}>{it.name}</Text>
                        <Text v="caption" muted>{fmtG(it.grams)}</Text>
                      </PressableScale>
                    );
                  })}
                </Card>
              </Section>
            ))}
            <Button title="Share list" icon="share-outline" onPress={() => share(groups)} />
            <Text v="caption" faint style={{ textAlign: 'center' }}>Quantities are totals from your meal plan in raw/prepared grams. Adjust for pack sizes.</Text>
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
