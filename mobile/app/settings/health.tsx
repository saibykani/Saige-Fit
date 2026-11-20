import React from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Reveal, Screen, Section, Text } from '@/ui';
import { openHealthConnectApp } from '@/features/health/healthConnect';
import { useHealthConnect } from '@/features/health/useHealthConnect';

const READS = ['Steps', 'Active calories burned', 'Sleep sessions', 'Body weight', 'Heart rate'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text v="body" muted>{label}</Text>
      <Text v="body">{value}</Text>
    </View>
  );
}

export default function HealthSettings() {
  const router = useRouter();
  const qc = useQueryClient();
  const h = useHealthConnect();
  const s = h.snapshot;

  const sync = async () => { await h.sync(); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const connect = async () => { await h.connect(); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const disconnect = () => Alert.alert('Disconnect Health Connect?', 'Saige Fit will stop reading your health data and its access is revoked. Data already synced stays in your account until you delete it in Privacy & data.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Disconnect', style: 'destructive', onPress: () => h.disconnect() },
  ]);

  if (Platform.OS !== 'android' || h.status === 'unavailable') {
    return (
      <Screen title="Google Fit / Health Connect" subtitle="Sync your phone's health data" back tabBar={false}>
        <Card>
          <Text v="heading">{Platform.OS === 'android' ? 'Health Connect is not available' : 'Available in the Android app'}</Text>
          <Text v="body" muted style={{ marginTop: 8 }}>
            {Platform.OS === 'android'
              ? 'Health Connect is not available on this device, or this build does not include it. Update Android / install Health Connect from Google Play and try again.'
              : 'Syncing steps, sleep and weight from Google Fit / Health Connect works in the Saige Fit Android app. Install the Android app to connect.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Google Fit / Health Connect" subtitle="Sync your phone's health data" back tabBar={false}>
      <Reveal index={0}>
        <Card>
          <Text v="heading">What this does</Text>
          <Text v="body" muted style={{ marginTop: 8 }}>
            Google Fit has been replaced by Android Health Connect, where Google Fit and most fitness apps and watches save their data. Saige Fit can read it to fill in your steps, sleep and weight automatically.
          </Text>
          <Text v="caption" muted style={{ marginTop: 10 }}>Read-only. Saige Fit never writes to or changes your Health Connect data.</Text>
          <View style={{ marginTop: 10 }}>
            {READS.map((r) => <Text key={r} v="body" muted>{'•  '}{r}</Text>)}
          </View>
          <Text v="caption" muted style={{ marginTop: 10 }}>
            Steps, sleep and weight are saved to your Saige Fit account to power your dashboard and progress; calories and heart rate are only shown on this screen. You choose what to allow in Android's permission dialog, and can disconnect any time. To delete data already synced, use Privacy & data.
          </Text>
        </Card>
      </Reveal>

      {h.status === 'needs-install' ? (
        <Section title="Setup" index={1}>
          <Card>
            <Text v="body" muted>Health Connect needs to be installed or updated from Google Play first.</Text>
            <View style={{ marginTop: 12 }}><Button title="Open Health Connect" icon="open-outline" onPress={openHealthConnectApp} /></View>
          </Card>
        </Section>
      ) : h.connected ? (
        <Section title="Connected" index={1}>
          <Card>
            <Row label="Last synced" value={h.lastSynced ? new Date(h.lastSynced).toLocaleString() : 'Not yet'} />
            {s ? (
              <>
                <Row label="Steps today" value={s.steps != null ? s.steps.toLocaleString() : 'No data'} />
                <Row label="Active calories" value={s.activeKcal != null ? `${s.activeKcal} kcal` : 'No data'} />
                <Row label="Last sleep" value={s.sleepHours != null ? `${s.sleepHours} h` : 'No data'} />
                <Row label="Latest weight" value={s.weightKg != null ? `${s.weightKg} kg` : 'No data'} />
              </>
            ) : null}
            {h.error ? <Text v="caption" style={{ marginTop: 8 }}>{h.error}</Text> : null}
            <View style={{ gap: 10, marginTop: 12 }}>
              <Button title="Sync now" icon="sync-outline" loading={h.busy} onPress={sync} />
              <Button title="Disconnect" variant="secondary" onPress={disconnect} />
              <Button title="Manage in Health Connect" variant="secondary" icon="open-outline" onPress={openHealthConnectApp} />
              <Button title="Privacy & data" variant="secondary" icon="shield-checkmark-outline" onPress={() => router.push('/settings/privacy')} />
            </View>
          </Card>
        </Section>
      ) : (
        <Section title="Connect" index={1}>
          <Card>
            {h.status === 'denied' ? <Text v="body" muted style={{ marginBottom: 10 }}>Permission was not granted. You can allow access in Health Connect settings.</Text> : null}
            {h.error ? <Text v="caption" style={{ marginBottom: 8 }}>{h.error}</Text> : null}
            <Button title="Connect Google Fit / Health Connect" icon="fitness-outline" loading={h.busy} onPress={connect} />
          </Card>
        </Section>
      )}
    </Screen>
  );
}
