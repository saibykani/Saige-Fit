import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Linking } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import {
  NOTIF_KINDS, NOTIF_META, NotifSetting, effectiveDays, permissionStatus, registerPushToken, requestPermission, rescheduleAll,
} from '@/lib/notifications';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Icon, PressableScale, Reveal, Screen, Text, SwitchRow, haptic } from '@/ui';
import { QueryState, errorInfo } from '@/features/paywall/gate';
import { TimeSheet } from '@/features/settings/TimeSheet';
import { WEEKDAY_SHORT, asArray, fmtTime12 } from '@/features/settings/util';

const KEY = ['notif-settings'];
const normalize = (items: NotifSetting[]): NotifSetting[] =>
  NOTIF_KINDS.map((k) => items.find((i) => i.kind === k) ?? { kind: k, enabled: false, time_local: null, weekdays: [1, 2, 3, 4, 5, 6, 7], timezone: 'UTC' });

export default function NotificationSettings() {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const q = useQuery({ queryKey: KEY, queryFn: async () => normalize(asArray<NotifSetting>(await api('/v1/notifications/settings'), 'items')) });
  const [draft, setDraft] = useState<NotifSetting[] | null>(null);
  const [perm, setPerm] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (q.data && !draft) setDraft(q.data); }, [q.data, draft]);
  useEffect(() => { permissionStatus().then(setPerm).catch(() => {}); }, []);

  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data);
  const patch = (kind: string, p: Partial<NotifSetting>) => setDraft((d) => d && d.map((s) => (s.kind === kind ? { ...s, ...p } : s)));

  const save = useMutation({
    mutationFn: async () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const items = (draft ?? []).map((s) => ({ ...s, weekdays: effectiveDays(s), timezone: tz, time_local: s.time_local ?? NOTIF_META[s.kind].defaultTime }));
      const anyOn = items.some((i) => i.enabled);
      if (anyOn && perm !== 'granted') {
        const ok = await requestPermission();
        setPerm(ok ? 'granted' : 'denied');
      }
      await api('/v1/notifications/settings', { method: 'PUT', body: { items } });
      const n = await rescheduleAll(items, me.data?.profile as any);
      if (anyOn) registerPushToken();
      return { items, n, anyOn };
    },
    onSuccess: ({ items, n, anyOn }) => {
      haptic.success();
      qc.setQueryData(KEY, items);
      setDraft(items);
      setMsg(!anyOn ? 'All reminders are off.' : n > 0 ? `Saved. ${n} reminder${n === 1 ? '' : 's'} scheduled on this device.` : 'Saved, but notifications are blocked in system settings so nothing was scheduled.');
    },
    onError: (e) => Alert.alert('Could not save', errorInfo(e).message),
  });

  return (
    <Screen title="Reminders" subtitle="Gentle nudges, on your schedule" back tabBar={false}>
      {perm === 'denied' && (
        <Card glow>
          <View style={{ gap: 10 }}>
            <Text v="heading">Notifications are blocked</Text>
            <Text v="body" muted>Allow notifications for Saige Fit in your phone settings to receive reminders.</Text>
            <Button title="Open settings" variant="secondary" size="md" icon="settings-outline" onPress={() => Linking.openSettings()} />
          </View>
        </Card>
      )}
      <QueryState query={q}>
        {() => (
          <View style={{ gap: 12 }}>
            {(draft ?? []).map((s, i) => {
              const meta = NOTIF_META[s.kind];
              const days = effectiveDays(s);
              return (
                <Reveal key={s.kind} index={i}>
                  <Card>
                    <SwitchRow icon={meta.icon as any} label={meta.label} hint={meta.hint} value={s.enabled} onChange={(v) => patch(s.kind, { enabled: v })} />
                    {s.enabled && (
                      <View style={{ gap: 14, marginTop: 8 }}>
                        <PressableScale onPress={() => setEditing(s.kind)} hapticStyle="select" accessibilityLabel={`Change ${meta.label} time`}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.surfaceAlt, borderRadius: 16, padding: 14 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Icon name="time-outline" size={20} color={t.accent} />
                            <Text v="bodyStrong">{fmtTime12(s.time_local ?? meta.defaultTime)}</Text>
                          </View>
                          <Text v="caption" muted>Change</Text>
                        </PressableScale>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          {WEEKDAY_SHORT.map((d, idx) => {
                            const wd = idx + 1;
                            const on = days.includes(wd);
                            return (
                              <PressableScale key={d} hapticStyle="select" accessibilityLabel={`${d} ${on ? 'on' : 'off'}`}
                                onPress={() => {
                                  const next = on ? days.filter((x) => x !== wd) : [...days, wd].sort();
                                  patch(s.kind, { weekdays: next.length ? next : days });
                                }}
                                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : t.surfaceAlt }}>
                                <Text v="caption" color={on ? t.onAccent : t.textMuted}>{d[0]}</Text>
                              </PressableScale>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </Card>
                </Reveal>
              );
            })}
            {msg && <Text v="caption" accent style={{ textAlign: 'center' }}>{msg}</Text>}
            <Button title={dirty ? 'Save & schedule' : 'Saved'} icon="checkmark-circle" disabled={!dirty} loading={save.isPending} onPress={() => { setMsg(null); save.mutate(); }} />
            <Text v="caption" faint style={{ textAlign: 'center' }}>Reminders are created on this device, so they work offline.</Text>
          </View>
        )}
      </QueryState>
      <TimeSheet visible={!!editing} title={editing ? `${NOTIF_META[editing].label} time` : ''}
        value={(draft?.find((s) => s.kind === editing)?.time_local ?? (editing ? NOTIF_META[editing].defaultTime : '08:00')) || '08:00'}
        onClose={() => setEditing(null)} onSave={(v) => editing && patch(editing, { time_local: v })} />
    </Screen>
  );
}
