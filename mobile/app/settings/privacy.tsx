import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ME_KEY, useMe } from '@/lib/useMe';
import { cancelAllReminders } from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Field, Reveal, Screen, Section, Sheet, SwitchRow, Text, haptic } from '@/ui';
import { errorInfo } from '@/features/paywall/gate';

export default function Privacy() {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const signOut = useAuth((s) => s.signOut);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const consent = useMutation({
    mutationFn: (ai: boolean) => api('/v1/consent', { body: { ai } }),
    onSuccess: () => { haptic.success(); qc.invalidateQueries({ queryKey: ME_KEY }); },
    onError: (e) => Alert.alert('Could not update', errorInfo(e).message),
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const data = await api<unknown>('/v1/account/export');
      const uri = `${FileSystem.cacheDirectory}saige-fit-export.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Your Saige Fit data' });
      else Alert.alert('Export ready', 'Sharing is not available on this device.');
    },
    onError: (e) => Alert.alert('Export failed', errorInfo(e).message),
  });

  const del = useMutation({
    mutationFn: () => api('/v1/account', { method: 'DELETE', body: { confirm: 'DELETE' } }),
    onSuccess: async () => { haptic.warning(); await cancelAllReminders(); qc.clear(); await signOut(); },
    onError: (e) => Alert.alert('Could not delete account', errorInfo(e).message),
  });

  const aiOn = !!me.data?.user.ai_consent_at;
  return (
    <Screen title="Privacy & data" subtitle="You are in control" back tabBar={false}>
      <Reveal index={0}>
        <Card>
          <SwitchRow icon="sparkles-outline" label="AI data processing" value={aiOn} onChange={(v) => consent.mutate(v)}
            hint="Lets the food scanner and AI coach process your photos, journal and profile." />
          <Text v="caption" muted style={{ marginTop: 6 }}>
            When on, meal photos and relevant profile and journal context are sent securely from our server to an AI provider to identify foods and answer your questions. Nothing is shared with other users, and you can turn this off any time. Turning it off disables the scanner and coach.
          </Text>
        </Card>
      </Reveal>
      <Section title="Your data" index={1}>
        <Card>
          <View style={{ gap: 12 }}>
            <Text v="body" muted>Privacy policy accepted: {me.data?.user.privacy_consent_at ? new Date(me.data.user.privacy_consent_at).toLocaleDateString() : 'not recorded'}.</Text>
            <Text v="caption" muted>Health data synced from Google Fit / Health Connect (steps, sleep, weight) is stored in your account, included in your export and removed when you delete your account. Disconnect any time in Settings, Google Fit / Health Connect.</Text>
            <Button title="Export my data" icon="download-outline" variant="secondary" size="md" loading={exportData.isPending} onPress={() => exportData.mutate()} />
          </View>
        </Card>
      </Section>
      <Section title="Danger zone" index={2}>
        <Card style={{ borderColor: t.danger + '66' }}>
          <View style={{ gap: 12 }}>
            <Text v="heading">Delete account</Text>
            <Text v="body" muted>Permanently deletes your profile, meals, workouts, photos and progress. This cannot be undone.</Text>
            <Button title="Delete my account" icon="trash-outline" variant="danger" size="md" onPress={() => { setTyped(''); setConfirming(true); }} />
          </View>
        </Card>
      </Section>
      <Sheet visible={confirming} onClose={() => setConfirming(false)} title="Delete account?">
        <View style={{ gap: 14 }}>
          <Text v="body" muted>Type DELETE to confirm. All of your data will be removed permanently.</Text>
          <Field value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" accessibilityLabel="Type DELETE to confirm" />
          <Button title="Permanently delete" variant="danger" icon="trash" disabled={typed !== 'DELETE'} loading={del.isPending} onPress={() => del.mutate()} />
        </View>
      </Sheet>
    </Screen>
  );
}
