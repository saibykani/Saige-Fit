import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from './api';

export interface NotifSetting {
  kind: string;
  enabled: boolean;
  time_local: string | null; // "HH:MM" or "HH:MM:SS"
  weekdays: number[]; // 1 = Mon … 7 = Sun
  timezone: string;
}

export interface NotifMeta {
  title: string;
  body: string;
  label: string;
  hint: string;
  icon: string;
  defaultTime: string;
  /** Used when the saved weekdays are "every day" for a kind that is naturally weekly. */
  weeklyDefault?: number[];
}

export const NOTIF_KINDS = ['breakfast', 'lunch', 'dinner', 'hydration', 'workout', 'daily_summary', 'weekly_report', 'weigh_in'] as const;

export const NOTIF_META: Record<string, NotifMeta> = {
  breakfast: { label: 'Breakfast', hint: 'A nudge to log or plan your first meal', icon: 'sunny-outline', title: 'Breakfast time', body: 'Fuel your morning. Log your breakfast in Saige Fit.', defaultTime: '08:00' },
  lunch: { label: 'Lunch', hint: 'Remember to log your midday meal', icon: 'restaurant-outline', title: 'Lunch time', body: 'Take a proper break and log your lunch.', defaultTime: '13:00' },
  dinner: { label: 'Dinner', hint: 'Wrap up the day with a balanced plate', icon: 'moon-outline', title: 'Dinner time', body: 'Check what is left for today and log your dinner.', defaultTime: '20:00' },
  hydration: { label: 'Hydration', hint: 'Every 2 hours from your start time until 9 PM', icon: 'water-outline', title: 'Hydration check', body: 'Time for a glass of water.', defaultTime: '09:00' },
  workout: { label: 'Workout', hint: 'On your training days', icon: 'barbell-outline', title: 'Workout time', body: 'Your session is ready when you are.', defaultTime: '18:00' },
  daily_summary: { label: 'Daily summary', hint: 'Your calories and macros for the day', icon: 'pie-chart-outline', title: 'Your day in review', body: 'See how today went: calories, macros and water.', defaultTime: '21:00' },
  weekly_report: { label: 'Weekly report', hint: 'Once a week', icon: 'document-text-outline', title: 'Your weekly report is ready', body: 'See your week in numbers and what to improve.', defaultTime: '18:00', weeklyDefault: [7] },
  weigh_in: { label: 'Weight check-in', hint: 'Once a week, same time for consistency', icon: 'scale-outline', title: 'Weigh-in day', body: 'Log your weight to keep your trend accurate.', defaultTime: '07:30', weeklyDefault: [1] },
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const CHANNEL = 'reminders';

export const effectiveDays = (s: NotifSetting): number[] => {
  const meta = NOTIF_META[s.kind];
  const days = s.weekdays?.length ? s.weekdays : [1, 2, 3, 4, 5, 6, 7];
  return days.length === 7 && meta?.weeklyDefault ? meta.weeklyDefault : days;
};

export async function permissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#C6FF3D',
  });
}

/** Asks for notification permission (shows the system prompt if still undetermined). */
export async function requestPermission(): Promise<boolean> {
  await ensureChannel();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function cancelAllReminders(): Promise<void> {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch { /* nothing scheduled */ }
}

const expoWeekday = (d: number) => (d % 7) + 1; // 1=Mon..7=Sun -> expo 1=Sun..7=Sat
const parse = (t: string | null | undefined, fallback: string) => {
  const [h, m] = (t ?? fallback).split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 8, minute: Number.isFinite(m) ? m : 0 };
};

async function scheduleAt(kind: string, hour: number, minute: number, days: number[]) {
  const meta = NOTIF_META[kind];
  const content = { title: meta.title, body: meta.body, data: { kind } };
  const T = Notifications.SchedulableTriggerInputTypes;
  if (days.length === 7) {
    await Notifications.scheduleNotificationAsync({ content, trigger: { type: T.DAILY, hour, minute, channelId: CHANNEL } });
    return 1;
  }
  for (const d of days) {
    await Notifications.scheduleNotificationAsync({ content, trigger: { type: T.WEEKLY, weekday: expoWeekday(d), hour, minute, channelId: CHANNEL } });
  }
  return days.length;
}

/**
 * Cancels everything and re-creates local repeating reminders from the saved settings.
 * `profile` (optional) supplies workout_days / preferred_workout_time as defaults for the workout reminder.
 * Returns how many notifications were scheduled; 0 when permission is missing.
 */
export async function rescheduleAll(
  settings: NotifSetting[],
  profile?: { workout_days?: number[] | null; preferred_workout_time?: string | null } | null,
): Promise<number> {
  await cancelAllReminders();
  if (!(await Notifications.getPermissionsAsync()).granted) return 0;
  await ensureChannel();
  let count = 0;
  for (const s of settings) {
    const meta = NOTIF_META[s.kind];
    if (!meta || !s.enabled) continue;
    try {
      let days = effectiveDays(s);
      let time = s.time_local;
      if (s.kind === 'workout') {
        if (!time && profile?.preferred_workout_time) time = profile.preferred_workout_time;
        if (days.length === 7 && profile?.workout_days?.length) days = profile.workout_days;
      }
      const { hour, minute } = parse(time, meta.defaultTime);
      if (s.kind === 'hydration') {
        for (let h = hour; h <= 21; h += 2) count += await scheduleAt(s.kind, h, minute, days);
      } else {
        count += await scheduleAt(s.kind, hour, minute, days);
      }
    } catch {
      // a single bad entry must not block the others
    }
  }
  return count;
}

/** Registers the Expo push token with the backend (physical devices with an EAS project id only). Best effort. */
export async function registerPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (!(await Notifications.getPermissionsAsync()).granted) return null;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api('/v1/devices/push-token', { body: { token } });
    return token;
  } catch {
    return null;
  }
}
