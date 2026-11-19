import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ME_KEY } from '@/lib/useMe';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Chip, Icon, Reveal, Screen, Section, Text, haptic } from '@/ui';
import { QueryState, errorInfo } from '@/features/paywall/gate';
import { FEATURE_LABELS } from '@/features/settings/options';
import { titleCase } from '@/features/settings/util';

interface Sub {
  tier: 'free' | 'pro' | 'premium'; status: string; current_period_end: string | null; entitlements: string[];
  plans: { tier: 'free' | 'pro' | 'premium'; features: string[] }[];
}
const ORDER = ['free', 'pro', 'premium'] as const;
const TAGLINE = { free: 'Track the basics', pro: 'AI-powered coaching', premium: 'Everything, personalised' } as const;

export default function Paywall() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['subscription'], queryFn: () => api<Sub>('/v1/subscription') });
  const [selected, setSelected] = useState<'free' | 'pro' | 'premium'>('pro');

  const dev = useMutation({
    mutationFn: (tier: string) => api('/v1/subscription/dev-tier', { body: { tier } }),
    onSuccess: () => { haptic.success(); qc.invalidateQueries({ queryKey: ['subscription'] }); qc.invalidateQueries({ queryKey: ME_KEY }); },
    onError: (e) => Alert.alert('Dev tier switch unavailable', errorInfo(e).message),
  });

  const features = useMemo(() => {
    const all = new Set<string>();
    q.data?.plans.forEach((p) => p.features.forEach((f) => all.add(f)));
    // order by first plan that introduces the feature, so the table reads Free -> Pro -> Premium
    const first = (f: string) => ORDER.findIndex((tier) => q.data?.plans.find((p) => p.tier === tier)?.features.includes(f));
    return [...all].sort((a, b) => first(a) - first(b));
  }, [q.data]);

  return (
    <Screen title="Plans" subtitle="Choose how much help you want" back tabBar={false}>
      <QueryState query={q}>
        {(s) => (
          <View style={{ gap: 16 }}>
            <Reveal index={0}>
              <LinearGradient colors={[t.accent + '33', t.accent2 + '11']} style={{ borderRadius: 24, padding: 20, borderWidth: 1, borderColor: t.accent + '44' }}>
                <Text v="label" accent>Your plan</Text>
                <Text v="display" style={{ marginTop: 4 }}>{titleCase(s.tier)}</Text>
                <Text v="body" muted>{s.status === 'active' || s.status === 'trialing' ? (s.current_period_end ? `Renews ${new Date(s.current_period_end).toLocaleDateString()}` : 'Active') : titleCase(s.status)}</Text>
              </LinearGradient>
            </Reveal>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ORDER.map((tier) => <Chip key={tier} label={titleCase(tier)} selected={selected === tier} onPress={() => setSelected(tier)} icon={tier === s.tier ? 'checkmark-circle' : undefined} />)}
            </View>

            <Reveal index={1}>
              <Card>
                <Text v="title">{titleCase(selected)}</Text>
                <Text v="body" muted style={{ marginBottom: 12 }}>{TAGLINE[selected]}</Text>
                <View style={{ gap: 10 }}>
                  {features.map((f) => {
                    const has = s.plans.find((p) => p.tier === selected)?.features.includes(f);
                    return (
                      <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: has ? 1 : 0.4 }}>
                        <Icon name={has ? 'checkmark-circle' : 'remove-circle-outline'} size={20} color={has ? t.accent : t.textFaint} />
                        <Text v="body">{FEATURE_LABELS[f] ?? titleCase(f)}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </Reveal>

            <Section title="Compare" index={2}>
              <Card padded={false} style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
                  <View style={{ flex: 1 }} />
                  {ORDER.map((tier) => <Text key={tier} v="label" muted style={{ width: 62, textAlign: 'center' }}>{tier}</Text>)}
                </View>
                {features.map((f) => (
                  <View key={f} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                    <Text v="caption" style={{ flex: 1 }}>{FEATURE_LABELS[f] ?? titleCase(f)}</Text>
                    {ORDER.map((tier) => (
                      <View key={tier} style={{ width: 62, alignItems: 'center' }}>
                        {s.plans.find((p) => p.tier === tier)?.features.includes(f) ? <Icon name="checkmark" size={18} color={t.accent} /> : <Text v="caption" faint>-</Text>}
                      </View>
                    ))}
                  </View>
                ))}
              </Card>
            </Section>

            <View style={{ gap: 8 }}>
              <Button title={selected === s.tier ? 'Current plan' : `Get ${titleCase(selected)}`} icon="sparkles" disabled
                onPress={() => {}} />
              <Text v="caption" faint style={{ textAlign: 'center' }}>
                Purchases are not enabled in this build yet. Price is shown by Google Play / the App Store at purchase.
              </Text>
            </View>

            {__DEV__ && (
              <Card>
                <Text v="label" muted style={{ marginBottom: 8 }}>Dev: switch tier</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ORDER.map((tier) => <Chip key={tier} label={titleCase(tier)} selected={s.tier === tier} onPress={() => dev.mutate(tier)} />)}
                </View>
                <Text v="caption" faint style={{ marginTop: 8 }}>Only works when the backend sets ALLOW_DEV_TIER_SWITCH=true.</Text>
              </Card>
            )}
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
