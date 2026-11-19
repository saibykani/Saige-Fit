import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ME_KEY } from '@/lib/useMe';
import { Button, Field, Sheet, Text, haptic } from '@/ui';
import { errorInfo } from '@/features/paywall/gate';
import { displayWeight, toKg, todayIso, usePrefs, weightUnit } from '@/features/settings/util';
import { MEASURES, Measurement } from './api';

const refreshAll = (qc: ReturnType<typeof useQueryClient>) => {
  ['weight', 'progress-summary', 'measurements', 'dashboard', 'analytics'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  qc.invalidateQueries({ queryKey: ME_KEY });
};

export function LogWeightSheet({ visible, onClose, last }: { visible: boolean; onClose: () => void; last?: number | null }) {
  const qc = useQueryClient();
  const units = usePrefs((s) => s.units);
  const [v, setV] = useState('');
  useEffect(() => { if (visible) setV(last ? String(Number(displayWeight(last, units).toFixed(1))) : ''); }, [visible, last, units]);
  const kg = toKg(parseFloat(v), units);
  const valid = isFinite(kg) && kg >= 25 && kg <= 400;
  const save = useMutation({
    mutationFn: () => api('/v1/weight', { body: { weight_kg: Math.round(kg * 10) / 10, log_date: todayIso() } }),
    onSuccess: () => { haptic.success(); refreshAll(qc); onClose(); },
    onError: (e) => Alert.alert('Could not save weight', errorInfo(e).message),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Log today's weight">
      <View style={{ gap: 14 }}>
        <Field label="Weight" suffix={weightUnit(units)} keyboardType="decimal-pad" value={v} onChangeText={setV} autoFocus error={v && !valid ? 'Enter a realistic weight' : undefined} accessibilityLabel="Weight" />
        <Text v="caption" muted>Weigh yourself at a similar time each day. Day-to-day changes are normal; watch the trend.</Text>
        <Button title="Save" icon="checkmark" disabled={!valid} loading={save.isPending} onPress={() => save.mutate()} />
      </View>
    </Sheet>
  );
}

export function LogMeasurementsSheet({ visible, onClose, last }: { visible: boolean; onClose: () => void; last?: Measurement }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => { if (visible) setF({}); }, [visible]);
  const body: Record<string, number | string> = { log_date: todayIso() };
  let any = false; let bad = false;
  MEASURES.forEach(({ key, unit }) => {
    const raw = f[key as string];
    if (!raw) return;
    const n = parseFloat(raw);
    if (!isFinite(n) || n <= 0 || n > (unit === '%' ? 70 : 250)) bad = true; else { body[key as string] = n; any = true; }
  });
  const save = useMutation({
    mutationFn: () => api('/v1/measurements', { body }),
    onSuccess: () => { haptic.success(); refreshAll(qc); onClose(); },
    onError: (e) => Alert.alert('Could not save', errorInfo(e).message),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Log measurements">
      <View style={{ gap: 12 }}>
        {MEASURES.map(({ key, label, unit }) => (
          <Field key={key as string} label={`${label}${last?.[key] != null ? ` (last ${last[key]})` : ''}`} suffix={unit} keyboardType="decimal-pad" value={f[key as string] ?? ''}
            onChangeText={(v) => setF((x) => ({ ...x, [key as string]: v }))} />
        ))}
        <Text v="caption" faint>Fill in only what you measured. Body fat should come from a real measurement, never from a photo.</Text>
        <Button title="Save" icon="checkmark" disabled={!any || bad} loading={save.isPending} onPress={() => save.mutate()} />
      </View>
    </Sheet>
  );
}
