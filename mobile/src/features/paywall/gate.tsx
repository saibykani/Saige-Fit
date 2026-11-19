import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorState, Icon, Skeleton, Text } from '@/ui';

export type ErrKind = 'plan' | 'consent' | 'network' | 'rate' | 'auth' | 'other';

export function errorInfo(e: unknown): { kind: ErrKind; message: string } {
  if (e instanceof ApiError) {
    if (e.status === 402) return { kind: 'plan', message: e.message };
    if (e.status === 403) return { kind: 'consent', message: e.message };
    if (e.status === 0) return { kind: 'network', message: 'No connection. Check your internet and try again.' };
    if (e.status === 429) return { kind: 'rate', message: 'You are going a bit fast. Please wait a moment and try again.' };
    if (e.status === 401) return { kind: 'auth', message: 'Your session expired. Please sign in again.' };
    return { kind: 'other', message: e.message };
  }
  return { kind: 'other', message: 'Something unexpected happened. Please try again.' };
}

/** Which plan unlocks a feature — a UI hint only. The server is the source of truth. */
export function tierFor(feature?: string): 'Pro' | 'Premium' {
  return feature && /weekly_ai_report|advanced_coaching|nutrition_insights|workout_analytics/.test(feature) ? 'Premium' : 'Pro';
}

export function LockBadge({ label = 'Pro' }: { label?: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={`${label} feature`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.accent + '22' }}>
      <Icon name="lock-closed" size={11} color={t.accent} />
      <Text v="label" color={t.accent} style={{ fontSize: 10 }}>{label}</Text>
    </View>
  );
}

export function UpgradeCard({ feature, title, hint }: { feature?: string; title?: string; hint?: string }) {
  const router = useRouter();
  const tier = tierFor(feature);
  return (
    <Card glow>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><LockBadge label={tier} /></View>
        <Text v="title">{title ?? `Unlock this with ${tier}`}</Text>
        <Text v="body" muted>{hint ?? `This feature is part of the ${tier} plan. Compare plans to see what is included.`}</Text>
        <Button title="Compare plans" icon="sparkles" size="md" onPress={() => router.push('/paywall')} />
      </View>
    </Card>
  );
}

/** Error view that understands plan (402), consent (403), offline and rate-limit failures. */
export function ErrorPanel({ error, onRetry, feature }: { error: unknown; onRetry?: () => void; feature?: string }) {
  const router = useRouter();
  const { kind, message } = errorInfo(error);
  if (kind === 'plan') return <UpgradeCard feature={feature} hint={message} />;
  if (kind === 'consent') {
    return <EmptyState icon="shield-checkmark-outline" title="Permission needed" hint={message}
      action={{ label: 'Open privacy settings', onPress: () => router.push('/settings/privacy') }} />;
  }
  return <ErrorState message={message} onRetry={onRetry} />;
}

export function DefaultSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} height={i === 0 ? 120 : 72} radius={24} />)}
    </View>
  );
}

/** Wraps a react-query result with consistent loading / error / empty handling. */
export function QueryState<T>({ query, children, skeleton, empty, feature }: {
  query: UseQueryResult<T>; children: (data: T) => React.ReactNode; skeleton?: React.ReactNode;
  empty?: (data: T) => React.ReactNode | null; feature?: string;
}) {
  if (query.isLoading) return <>{skeleton ?? <DefaultSkeleton />}</>;
  if (query.isError) return <ErrorPanel error={query.error} onRetry={() => query.refetch()} feature={feature} />;
  if (query.data === undefined) return null;
  const e = empty?.(query.data);
  if (e) return <>{e}</>;
  return <>{children(query.data)}</>;
}
