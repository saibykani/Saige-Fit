import { Tabs } from 'expo-router';
import { TabBar } from '@/ui';

// Web: no swipe gesture. On wide screens the sidebar (rendered by Screen.web) replaces the bottom bar.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, lazy: true }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="food" />
      <Tabs.Screen name="workout" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
