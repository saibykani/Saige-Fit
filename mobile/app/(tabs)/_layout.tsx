import { Tabs } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

const TABS = [
  { name: 'index', title: 'Home' },
  { name: 'food', title: 'Food' },
  { name: 'workout', title: 'Workout' },
  { name: 'progress', title: 'Progress' },
  { name: 'profile', title: 'Profile' },
] as const;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.accent,
      tabBarInactiveTintColor: t.textMuted,
      tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
    }}>
      {TABS.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />)}
    </Tabs>
  );
}
