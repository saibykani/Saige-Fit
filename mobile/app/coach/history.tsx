import React from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, EmptyState, Icon, IconButton, Reveal, Screen, Skeleton, SwipeRow, Text, haptic } from '@/ui';
import { QueryState, errorInfo } from '@/features/paywall/gate';
import { asArray } from '@/features/settings/util';

interface Conv { id: string; title: string | null; created_at: string }

export default function CoachHistory() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['coach-convs'], queryFn: async () => asArray<Conv>(await api('/v1/coach/conversations'), 'conversations', 'items') });
  const del = useMutation({
    mutationFn: (id: string) => api(`/v1/coach/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: () => { haptic.warning(); qc.invalidateQueries({ queryKey: ['coach-convs'] }); },
    onError: (e) => Alert.alert('Could not delete', errorInfo(e).message),
  });
  return (
    <Screen title="Chat history" subtitle="Your past conversations" back tabBar={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <QueryState query={q} feature="ai_assistant" skeleton={<><Skeleton height={72} radius={22} /><Skeleton height={72} radius={22} /></>}
        empty={(r) => (r.length ? null : <EmptyState icon="chatbubbles-outline" title="No conversations yet" hint="Start chatting with your coach and it will show up here." action={{ label: 'New chat', onPress: () => router.replace('/coach') }} />)}>
        {(rows) => (
          <View style={{ gap: 10 }}>
            {rows.map((c, i) => (
              <Reveal key={c.id} index={Math.min(i, 8)}>
                <SwipeRow onDelete={() => del.mutate(c.id)} deleteLabel="Delete">
                <Card onPress={() => router.replace({ pathname: '/coach', params: { id: c.id } })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: t.accent + '1F', alignItems: 'center', justifyContent: 'center' }}><Icon name="chatbubble-ellipses-outline" size={20} color={t.accent} /></View>
                    <View style={{ flex: 1 }}>
                      <Text v="bodyStrong" numberOfLines={1}>{c.title ?? 'Conversation'}</Text>
                      <Text v="caption" muted>{new Date(c.created_at).toLocaleDateString()}</Text>
                    </View>
                    <IconButton name="trash-outline" label="Delete conversation" size={18} onPress={() => Alert.alert('Delete conversation?', 'This removes the messages permanently.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => del.mutate(c.id) }])} />
                  </View>
                </Card>
                </SwipeRow>
              </Reveal>
            ))}
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
