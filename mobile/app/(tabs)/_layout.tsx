import { Dimensions, Platform } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { TabBar } from '@/ui';
import { haptic } from '@/ui/motion';

// Order matters: swipe left/right moves between these in order.
const ORDER = ['/', '/food', '/workout', '/progress', '/profile'] as const;

function indexOf(path: string) {
  const p = path.replace('/(tabs)', '') || '/';
  return ORDER.findIndex((o) => (o === '/' ? p === '/' : p === o || p.startsWith(o + '/')));
}

export default function TabsLayout() {
  const router = useRouter();
  const path = usePathname();
  const go = (dir: 1 | -1) => {
    const i = indexOf(path);
    const n = i + dir;
    if (i < 0 || n < 0 || n >= ORDER.length) return;
    haptic.select();
    router.navigate(ORDER[n] as any);
  };
  // Native only: web keeps normal mouse/touch behaviour. Needs a clear, mostly horizontal swipe so scrolling and SwipeRow win.
  const swipe = Gesture.Pan()
    .enabled(Platform.OS !== 'web')
    // Only start from the left/right screen edges (24px) so nested horizontal lists and SwipeRow keep their own swipes.
    .onTouchesDown((e, m) => {
      const x = e.allTouches[0]?.absoluteX ?? 0;
      const w = Dimensions.get('window').width;
      if (x > 24 && x < w - 24) m.fail();
    })
    .activeOffsetX([-50, 50]).failOffsetY([-18, 18])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 900) runOnJS(go)(e.translationX < 0 ? 1 : -1);
    });
  return (
    <GestureDetector gesture={swipe}>
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, lazy: true }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="food" />
        <Tabs.Screen name="workout" />
        <Tabs.Screen name="progress" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </GestureDetector>
  );
}
