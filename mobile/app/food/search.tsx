import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, EmptyState, ErrorState, Field, Reveal, Screen, Segmented, Skeleton, Text, haptic } from '@/ui';
import { useDebounced } from '@/features/common/hooks';
import { useDay } from '@/features/common/dayStore';
import { FoodSummary, MealType } from '@/features/common/types';
import { AddFoodSheet } from '@/features/food/AddFoodSheet';
import { CustomFoodSheet } from '@/features/food/CustomFoodSheet';
import { FoodRow } from '@/features/food/FoodRow';
import { importUsdaFood, useFavoriteFoods, useFoodSearch, useRecentFoods, useToggleFavorite, useUsdaSearch } from '@/features/food/api';
import { usePick } from '@/features/food/pickStore';

type Tab = 'search' | 'recent' | 'favorites';

/** Full-screen food finder. mode=log adds to the journal; mode=pick returns the choice to the caller (scan results). */
export default function FoodSearch() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; mode?: string; target?: string }>();
  const mode = params.mode === 'pick' ? 'pick' : 'log';
  const { day } = useDay();
  const setPicked = usePick((s) => s.setPicked);

  const [tab, setTab] = useState<Tab>('search');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const [usda, setUsda] = useState(false);
  const [selected, setSelected] = useState<FoodSummary | null>(null);
  const [custom, setCustom] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const search = useFoodSearch(q);
  const usdaQ = useUsdaSearch(q, usda);
  const recent = useRecentFoods();
  const favs = useFavoriteFoods();
  const toggle = useToggleFavorite();
  const favIds = useMemo(() => new Set((favs.data ?? []).map((f) => f.id)), [favs.data]);

  const choose = async (f: FoodSummary) => {
    if (!f.id && f.fdc_id !== undefined) {
      setImporting(String(f.fdc_id));
      try { setSelected(await importUsdaFood(f.fdc_id)); } catch { haptic.warning(); } finally { setImporting(null); }
      return;
    }
    setSelected(f);
  };

  const list: { data: FoodSummary[]; loading: boolean; error: unknown; refetch: () => void } =
    tab === 'search' ? { data: search.data ?? [], loading: search.isFetching && !search.data, error: search.error, refetch: search.refetch }
    : tab === 'recent' ? { data: recent.data ?? [], loading: recent.isLoading, error: recent.error, refetch: recent.refetch }
    : { data: favs.data ?? [], loading: favs.isLoading, error: favs.error, refetch: favs.refetch };

  const usdaRows = usda ? usdaQ.data ?? [] : [];

  const finishPick = (food: FoodSummary, grams: number) => {
    setPicked({ target: params.target ?? 'new', food, grams });
    setSelected(null);
    router.back();
  };

  const row = (f: FoodSummary, i: number, tag?: string) => (
    <Reveal index={Math.min(i, 8)}>
      <FoodRow food={f} tag={tag} onPress={() => choose(f)} favorite={f.id ? favIds.has(f.id) : false}
        onToggleFavorite={f.id ? () => toggle.mutate({ id: f.id as string, on: !favIds.has(f.id) }) : undefined} />
    </Reveal>
  );

  return (
    <Screen title="Add food" back tabBar={false} scroll={false}>
      <View style={{ flex: 1, gap: 12 }}>
        <Field value={text} onChangeText={(v) => { setText(v); setUsda(false); if (tab !== 'search') setTab('search'); }} placeholder="Search idli, paneer, banana…" autoCapitalize="none" returnKeyType="search" />
        <Segmented<Tab> options={[{ value: 'search', label: 'Search' }, { value: 'recent', label: 'Recent' }, { value: 'favorites', label: 'Favorites' }]} value={tab} onChange={setTab} />

        <FlatList
          data={list.data} keyExtractor={(f, i) => f.id ?? `${f.fdc_id ?? f.name}-${i}`} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 10, paddingBottom: 130 }} showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => row(item, index)}
          ListEmptyComponent={
            list.loading ? <View style={{ gap: 10 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={66} radius={18} />)}</View>
            : list.error ? <ErrorState message={errorMessage(list.error)} onRetry={list.refetch} />
            : tab === 'search' ? (q.length < 2 ? <EmptyState icon="search" title="Find a food" hint="Type at least 2 letters. Curated foods are searched first, then USDA on request." />
              : <EmptyState icon="nutrition-outline" title={`Nothing for “${q}”`} hint="Try another spelling, search the USDA database, or create it yourself." />)
            : tab === 'recent' ? <EmptyState icon="time-outline" title="No recent foods" hint="Foods you log will appear here for one-tap adding." />
            : <EmptyState icon="star-outline" title="No favorites yet" hint="Tap the star on any food to keep it handy." />
          }
          ListFooterComponent={tab === 'search' && q.length >= 2 ? (
            <View style={{ gap: 10, marginTop: 4 }}>
              {usda ? (
                usdaQ.isFetching ? <Skeleton height={66} radius={18} />
                : usdaQ.isError ? <Text v="caption" muted>USDA search isn't available right now.</Text>
                : usdaRows.length === 0 ? <Text v="caption" muted>No USDA matches.</Text>
                : <>{usdaRows.map((f, i) => <View key={`u${f.fdc_id ?? i}`} style={{ opacity: importing === String(f.fdc_id) ? 0.5 : 1 }}>{row(f, i, 'USDA')}</View>)}</>
              ) : <Button title="Search USDA database" variant="ghost" icon="globe-outline" size="md" onPress={() => setUsda(true)} />}
            </View>
          ) : null}
        />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 16 }}>
          <Button title="Create custom food" icon="create-outline" variant="secondary" onPress={() => setCustom(true)} />
        </View>
      </View>

      <AddFoodSheet food={selected} day={day} initialMeal={params.meal as MealType | undefined} mode={mode}
        onClose={() => setSelected(null)} onPick={finishPick} onLogged={() => router.back()} />
      <CustomFoodSheet visible={custom} initialName={q} onClose={() => setCustom(false)} onCreated={(f) => { setCustom(false); setSelected(f); }} />
    </Screen>
  );
}
