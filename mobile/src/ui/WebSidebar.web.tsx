import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { useMe } from '@/lib/useMe';
import { Text } from './Text';

export const SIDEBAR_WIDTH = 248;
export const DESKTOP_MIN = 900;

type Icon = keyof typeof Ionicons.glyphMap;
const MAIN: { path: string; label: string; icon: Icon; on: Icon }[] = [
  { path: '/', label: 'Home', icon: 'home-outline', on: 'home' },
  { path: '/food', label: 'Food', icon: 'restaurant-outline', on: 'restaurant' },
  { path: '/workout', label: 'Workout', icon: 'barbell-outline', on: 'barbell' },
  { path: '/progress', label: 'Progress', icon: 'stats-chart-outline', on: 'stats-chart' },
  { path: '/profile', label: 'Profile', icon: 'person-outline', on: 'person' },
];
const MORE: { path: string; label: string; icon: Icon }[] = [
  { path: '/achievements', label: 'Achievements', icon: 'trophy-outline' },
  { path: '/fasting', label: 'Fasting', icon: 'timer-outline' },
  { path: '/water', label: 'Water', icon: 'water-outline' },
  { path: '/planner', label: 'Planner', icon: 'calendar-outline' },
  { path: '/recipes', label: 'Recipes', icon: 'book-outline' },
  { path: '/coach', label: 'Coach', icon: 'chatbubbles-outline' },
  { path: '/analytics', label: 'Analytics', icon: 'analytics-outline' },
  { path: '/settings/about', label: 'Settings', icon: 'settings-outline' },
];

function isActive(path: string, cur: string) {
  const p = cur.replace('/(tabs)', '') || '/';
  if (path === '/') return p === '/';
  if (path === '/settings/about') return p.startsWith('/settings');
  return p === path || p.startsWith(path + '/');
}

const navData = { 'saige-nav': '1' };

function NavItem({ label, icon, active, onPress }: { label: string; icon: Icon; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const extra: any = active ? {} : { dataSet: navData };
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} {...extra}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: active ? t.accent + '24' : 'transparent' }}>
      <Ionicons name={icon} size={20} color={active ? t.accent : t.textMuted} />
      <Text v="bodyStrong" color={active ? t.accent : t.text} style={{ fontSize: 14.5, opacity: active ? 1 : 0.82 }}>{label}</Text>
    </Pressable>
  );
}

/** Fixed left navigation shown on wide web screens. */
export function WebSidebar() {
  const t = useTheme();
  const router = useRouter();
  const path = usePathname();
  const me = useMe();
  const name = me.data?.user.full_name || 'Your account';
  const email = me.data?.user.email ?? '';
  const footer: any = { dataSet: navData };
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: SIDEBAR_WIDTH, zIndex: 20, backgroundColor: t.bgElevated, borderRightWidth: 1, borderRightColor: t.border }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 12, gap: 6 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.navigate('/' as any)} accessibilityRole="link" accessibilityLabel="Saige Fit home"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4, marginBottom: 10 }}>
          <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={20} color={t.onAccent} />
          </LinearGradient>
          <Text v="title" style={{ fontSize: 20 }}>Saige Fit</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/scan' as any)} accessibilityRole="button" accessibilityLabel="Scan food" style={{ marginBottom: 12 }}>
          <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Ionicons name="scan" size={20} color={t.onAccent} />
            <Text v="bodyStrong" color={t.onAccent}>Scan food</Text>
          </LinearGradient>
        </Pressable>

        {MAIN.map((m) => {
          const a = isActive(m.path, path);
          return <NavItem key={m.path} label={m.label} icon={a ? m.on : m.icon} active={a} onPress={() => router.navigate(m.path as any)} />;
        })}

        <Text v="caption" faint style={{ marginTop: 18, marginBottom: 4, paddingHorizontal: 12, letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }}>More</Text>
        {MORE.map((m) => (
          <NavItem key={m.path} label={m.label} icon={m.icon} active={isActive(m.path, path)} onPress={() => router.push(m.path as any)} />
        ))}
      </ScrollView>
      <Pressable onPress={() => router.navigate('/profile' as any)} accessibilityRole="link" accessibilityLabel="Profile" {...footer}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: t.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.accent + '2A', alignItems: 'center', justifyContent: 'center' }}>
          <Text v="bodyStrong" color={t.accent}>{(name[0] ?? 'S').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong" numberOfLines={1} style={{ fontSize: 13.5 }}>{name}</Text>
          {email ? <Text v="caption" muted numberOfLines={1}>{email}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}
