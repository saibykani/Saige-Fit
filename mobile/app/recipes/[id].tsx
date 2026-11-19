import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Card, Chip, IconButton, MacroRow, Reveal, Screen, Section, Skeleton, Text, haptic } from '@/ui';
import { QueryState } from '@/features/paywall/gate';
import { Recipe, recipeCarbs, recipeFat, recipeKcal, recipeProtein } from '@/features/recipes/api';
import { num, titleCase } from '@/features/settings/util';

export default function RecipeDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['recipe', id], queryFn: async () => { const r = await api<any>(`/v1/recipes/${id}`); return (r.recipe ?? r) as Recipe; } });
  const [fav, setFav] = useState(false);
  useEffect(() => { if (q.data?.is_favorite !== undefined) setFav(!!q.data.is_favorite); }, [q.data]);

  const toggle = async () => {
    haptic.light();
    const next = !fav; setFav(next);
    try { await api(`/v1/favorites/recipes/${id}`, { method: next ? 'POST' : 'DELETE', body: next ? {} : undefined }); }
    catch { setFav(!next); haptic.warning(); } // roll back if the server refused
  };

  return (
    <Screen title="Recipe" back tabBar={false} right={<IconButton name={fav ? 'heart' : 'heart-outline'} label={fav ? 'Remove from favourites' : 'Save to favourites'} tint={fav ? t.danger : undefined} onPress={toggle} />}>
      <QueryState query={q} skeleton={<><Skeleton height={150} radius={28} /><Skeleton height={160} radius={24} /></>}>
        {(r) => (
          <View style={{ gap: 20 }}>
            <Reveal index={0}>
              <LinearGradient colors={[t.accent + '33', t.accent2 + '10']} style={{ borderRadius: 28, padding: 22, gap: 10, borderWidth: 1, borderColor: t.accent + '44' }}>
                <Text v="display">{r.name}</Text>
                {r.description ? <Text v="body" muted>{r.description}</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {r.servings ? <Chip label={`${r.servings} serving${r.servings === 1 ? '' : 's'}`} /> : null}
                  {r.prep_minutes ? <Chip label={`${num(r.prep_minutes)} min`} /> : null}
                  {(r.diet_tags ?? []).slice(0, 3).map((d) => <Chip key={d} label={titleCase(d)} />)}
                </View>
              </LinearGradient>
            </Reveal>

            <Section title="Per serving" index={1}>
              <Card>
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}><AnimatedNumber value={recipeKcal(r)} style={{ fontSize: 40 }} /><Text v="body" muted>kcal</Text></View>
                  <MacroRow label="Protein" value={recipeProtein(r)} target={Math.max(recipeProtein(r), 1)} color={t.protein} />
                  <MacroRow label="Carbs" value={recipeCarbs(r)} target={Math.max(recipeCarbs(r), 1)} color={t.carbs} />
                  <MacroRow label="Fat" value={recipeFat(r)} target={Math.max(recipeFat(r), 1)} color={t.fat} />
                  <Text v="caption" faint>Calculated from the food database. Real recipes vary with brands and cooking oil.</Text>
                </View>
              </Card>
            </Section>

            <Section title="Ingredients" index={2}>
              <Card>
                {(r.ingredients ?? []).length === 0 ? <Text v="body" muted>No ingredients listed.</Text> : (
                  <View style={{ gap: 10 }}>
                    {r.ingredients!.map((i, k) => (
                      <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                        <Text v="body" style={{ flex: 1 }}>{i.name}</Text>
                        <Text v="body" muted>{Math.round(num(i.grams ?? i.quantity_g))} g</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </Section>

            <Section title="Method" index={3}>
              <Card>
                {(r.steps ?? []).length === 0 ? <Text v="body" muted>No steps listed.</Text> : (
                  <View style={{ gap: 14 }}>
                    {r.steps!.map((s, k) => (
                      <View key={k} style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.accent + '26', alignItems: 'center', justifyContent: 'center' }}><Text v="caption" accent>{k + 1}</Text></View>
                        <Text v="body" style={{ flex: 1 }}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </Section>
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
