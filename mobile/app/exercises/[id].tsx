import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Chip, Icon, IconButton, PressableScale, Reveal, Screen, Section, Skeleton, Text, haptic } from '@/ui';
import { QueryState } from '@/features/paywall/gate';
import { ExerciseArt } from '@/features/exercises/ExerciseArt';
import { Exercise } from '@/features/workout/api';
import { titleCase } from '@/features/settings/util';

const isVideo = (u: string) => /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(u);

export default function ExerciseDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['exercise', id], queryFn: async () => { const r = await api<any>(`/v1/exercises/${id}`); return (r.exercise ?? r) as Exercise; } });
  // Favourite state comes from the server; the toggle is optimistic and rolls back if saving fails.
  const qc = useQueryClient();
  const favs = useQuery({ queryKey: ['fav-exercises'], queryFn: () => api<{ ids: string[] }>('/v1/favorites/exercises') });
  const fav = !!favs.data?.ids.includes(String(id));
  const toggle = useMutation({
    mutationFn: (next: boolean) => api(`/v1/favorites/exercises/${id}`, { method: next ? 'POST' : 'DELETE' }),
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey: ['fav-exercises'] });
      const prev = qc.getQueryData<{ ids: string[] }>(['fav-exercises']);
      const ids = (prev?.ids ?? []).filter((x) => x !== String(id));
      qc.setQueryData(['fav-exercises'], { ids: next ? [...ids, String(id)] : ids });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['fav-exercises'], ctx.prev); haptic.warning(); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['fav-exercises'] }),
  });
  const toggleFav = () => { haptic.light(); toggle.mutate(!fav); };

  return (
    <Screen title="Exercise" back tabBar={false} right={<IconButton name={fav ? 'heart' : 'heart-outline'} label={fav ? 'Remove favourite' : 'Add favourite'} tint={fav ? t.danger : undefined} onPress={toggleFav} />}>
      <QueryState query={q} skeleton={<><Skeleton height={190} radius={28} /><Skeleton height={120} radius={24} /></>}>
        {(e) => (
          <View style={{ gap: 20 }}>
            <Reveal index={0}>
              {e.media_url && !isVideo(e.media_url) ? (
                <Image source={{ uri: e.media_url }} style={{ height: 220, borderRadius: 28 }} contentFit="cover" transition={300} accessibilityLabel={`${e.name} demonstration`} />
              ) : (
                <View style={{ gap: 10 }}>
                  <ExerciseArt muscle={titleCase(e.muscle_group)} />
                  {e.media_url && <Button title="Watch demo video" icon="play-circle" variant="secondary" size="md" onPress={() => WebBrowser.openBrowserAsync(e.media_url as string)} />}
                </View>
              )}
            </Reveal>
            <Reveal index={1}>
              <View style={{ gap: 10 }}>
                <Text v="display">{e.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Chip label={titleCase(e.muscle_group)} selected />
                  <Chip label={titleCase(e.difficulty)} />
                  {(e.equipment?.length ? e.equipment : ['bodyweight']).map((x) => <Chip key={x} label={titleCase(x)} />)}
                </View>
                {e.secondary_muscles && e.secondary_muscles.length > 0 && <Text v="caption" muted>Also works: {e.secondary_muscles.map(titleCase).join(', ')}</Text>}
              </View>
            </Reveal>

            <Section title="How to do it" index={2}>
              <Card>
                {e.instructions?.length ? (
                  <View style={{ gap: 12 }}>
                    {e.instructions.map((s, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.accent + '26', alignItems: 'center', justifyContent: 'center' }}><Text v="caption" accent>{i + 1}</Text></View>
                        <Text v="body" style={{ flex: 1 }}>{s}</Text>
                      </View>
                    ))}
                  </View>
                ) : <Text v="body" muted>No instructions available yet.</Text>}
              </Card>
            </Section>

            {e.common_mistakes?.length > 0 && (
              <Section title="Common mistakes" index={3}>
                <Card>
                  <View style={{ gap: 10 }}>
                    {e.common_mistakes.map((m, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 10 }}><Icon name="warning-outline" size={18} color={t.warn} /><Text v="body" style={{ flex: 1 }}>{m}</Text></View>
                    ))}
                  </View>
                </Card>
              </Section>
            )}

            {(e.alternatives?.length ?? 0) > 0 && (
              <Section title="Alternatives" index={4}>
                <View style={{ gap: 10 }}>
                  {e.alternatives!.map((a) => (
                    <Card key={a.id} onPress={() => router.push({ pathname: '/exercises/[id]', params: { id: a.id } })}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Icon name="swap-horizontal" size={20} color={t.accent} />
                        <View style={{ flex: 1 }}><Text v="bodyStrong">{a.name}</Text><Text v="caption" muted>{titleCase(a.muscle_group)}</Text></View>
                        <Icon name="chevron-forward" size={16} color={t.textFaint} />
                      </View>
                    </Card>
                  ))}
                </View>
              </Section>
            )}
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
