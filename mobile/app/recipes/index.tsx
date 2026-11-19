import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Chip, EmptyState, Field, Icon, Reveal, Screen, Skeleton, Text } from '@/ui';
import { QueryState } from '@/features/paywall/gate';
import { Recipe, recipeKcal, recipeProtein } from '@/features/recipes/api';
import { asArray, num, titleCase } from '@/features/settings/util';

const DIETS = ['vegetarian', 'vegan', 'eggetarian', 'non_vegetarian', 'pescatarian'];

export default function Recipes() {
  const t = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [diet, setDiet] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setQ(text.trim()), 350); return () => clearTimeout(id); }, [text]);
  const list = useQuery({
    queryKey: ['recipes', q, diet],
    queryFn: async () => {
      const p: string[] = [];
      if (q) p.push(`q=${encodeURIComponent(q)}`);
      if (diet) p.push(`diet=${encodeURIComponent(diet)}`);
      return asArray<Recipe>(await api(`/v1/recipes${p.length ? `?${p.join('&')}` : ''}`), 'recipes', 'items');
    },
  });
  return (
    <Screen title="Recipes" subtitle="Healthy, goal-friendly meals" back tabBar={false}>
      <Field value={text} onChangeText={setText} placeholder="Search recipes" autoCorrect={false} accessibilityLabel="Search recipes" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
        {DIETS.map((d) => <Chip key={d} label={titleCase(d)} selected={diet === d} onPress={() => setDiet(diet === d ? null : d)} />)}
      </ScrollView>
      <QueryState query={list} skeleton={<><Skeleton height={96} radius={24} /><Skeleton height={96} radius={24} /><Skeleton height={96} radius={24} /></>}
        empty={(r) => (r.length ? null : <EmptyState icon="book-outline" title="No recipes found" hint="Try another search or diet filter." />)}>
        {(rows) => (
          <View style={{ gap: 12 }}>
            {rows.map((r, i) => (
              <Reveal key={r.id} index={Math.min(i, 8)}>
                <Card onPress={() => router.push({ pathname: '/recipes/[id]', params: { id: r.id } })}>
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text v="heading" style={{ flex: 1 }} numberOfLines={2}>{r.name}</Text>
                      <Icon name="chevron-forward" size={18} color={t.textFaint} />
                    </View>
                    {r.description ? <Text v="caption" muted numberOfLines={2}>{r.description}</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
                      <Text v="caption" accent>{Math.round(recipeKcal(r))} kcal</Text>
                      <Text v="caption" color={t.protein}>{Math.round(recipeProtein(r))} g protein</Text>
                      {r.prep_minutes ? <Text v="caption" muted>{num(r.prep_minutes)} min</Text> : null}
                    </View>
                  </View>
                </Card>
              </Reveal>
            ))}
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
