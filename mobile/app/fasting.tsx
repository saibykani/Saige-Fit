import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Field, ProgressBar, Reveal, Ring, Screen, Section, Text, haptic } from '@/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useFasting } from '@/features/fasting/store';
import {
  PRESETS, completionPct, clampHours, elapsedMs, formatClock, formatHM, nextStage, progress, remainingMs, stageAt, HOUR_MS,
} from '@/features/fasting/logic';

export default function Fasting() {
  const t = useTheme();
  const { ready, hydrate, goalHours, active, history, setGoal, start, stop } = useFasting();
  const [now, setNow] = useState(Date.now());
  const [custom, setCustom] = useState('');

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const goal = active?.goalHours ?? goalHours;
  const el = active ? elapsedMs(active.startedAt, now) : 0;
  const rem = active ? remainingMs(active.startedAt, goal, now) : goal * HOUR_MS;
  const pct = active ? progress(active.startedAt, goal, now) : 0;
  const hrs = el / HOUR_MS;
  const stage = stageAt(hrs);
  const next = nextStage(hrs);
  const done = !!active && rem === 0;
  const isPreset = PRESETS.some((p) => p.hours === goalHours);

  const applyCustom = (v: string) => {
    setCustom(v);
    const n = Number(v);
    if (v && Number.isFinite(n) && n >= 1) setGoal(clampHours(n));
  };

  return (
    <Screen title="Fasting" subtitle="Intermittent fasting timer" back tabBar={false}>
      <Reveal index={0}>
        <Card glow style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
          <Ring value={pct} target={1} size={240} stroke={16}>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text v="caption" muted>{active ? (done ? 'Goal reached' : 'Elapsed') : `${goal}h goal`}</Text>
              <Text v="title">{formatClock(el)}</Text>
              <Text v="caption" muted>{active ? (done ? `+${formatHM(el - goal * HOUR_MS)} over` : `${formatHM(rem)} left`) : 'Ready to start'}</Text>
            </View>
          </Ring>
          {active ? (
            <View style={{ gap: 4, alignItems: 'center' }}>
              <Text v="bodyStrong">{stage.title}</Text>
              <Text v="caption" muted style={{ textAlign: 'center' }}>{stage.hint}</Text>
              {next ? <Text v="caption" faint>Next: {next.title.toLowerCase()} at about {next.fromHour}h</Text> : null}
            </View>
          ) : null}
          {active ? (
            <Button title={done ? 'End fast' : 'End early'} icon="stop" variant={done ? 'primary' : 'secondary'}
              onPress={() => { haptic.success(); stop(); }} />
          ) : (
            <Button title="Start fast" icon="play" disabled={!ready} onPress={() => { haptic.success(); start(); }} />
          )}
        </Card>
      </Reveal>

      {!active ? (
        <Section title="Fasting window" index={1}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <Chip key={p.id} label={p.label} selected={goalHours === p.hours} onPress={() => { setCustom(''); setGoal(p.hours); }} />
            ))}
            <Chip label="Custom" selected={!isPreset} />
          </View>
          <Field label="Custom hours" value={custom} onChangeText={applyCustom} keyboardType="decimal-pad" suffix="h" placeholder="1 to 72" />
        </Section>
      ) : null}

      <Section title="Last 14 fasts" index={2}>
        {history.length === 0 ? (
          <Card><Text v="caption" muted>No completed fasts yet.</Text></Card>
        ) : (
          <Card style={{ gap: 14 }}>
            {history.map((r) => {
              const p = completionPct(r);
              return (
                <View key={r.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text v="bodyStrong">{new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {formatHM(r.endedAt - r.startedAt)} of {r.goalHours}h</Text>
                    <Text v="bodyStrong" color={p >= 100 ? t.accent : undefined}>{p}%</Text>
                  </View>
                  <ProgressBar value={p} target={100} />
                </View>
              );
            })}
          </Card>
        )}
      </Section>

      <Text v="caption" faint style={{ textAlign: 'center' }}>
        Stage hints are rough general estimates, not medical advice. Fasting is not suitable for everyone (for example in pregnancy, with diabetes or an eating disorder, or when taking medication). Talk to a professional first.
      </Text>
    </Screen>
  );
}
