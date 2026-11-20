import React from 'react';
import { RefreshControl, StyleProp, View, ViewStyle, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import Animated, { FadeInDown, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Text } from './Text';
import { IconButton } from './Controls';
import { useTabBarInset } from './TabBar';
import { DESKTOP_MIN, SIDEBAR_WIDTH, WebSidebar } from './WebSidebar.web';
import { injectWebGlobal } from './web-global.web';

injectWebGlobal();

/** Page shell: aurora gradient backdrop, parallax large title, pull-to-refresh, safe areas, bottom padding for the tab bar. */
export function Screen({ title, subtitle, back, right, children, scroll = true, onRefresh, refreshing, tabBar = true, style, contentStyle }: {
  title?: string; subtitle?: string; back?: boolean; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean;
  onRefresh?: () => void; refreshing?: boolean; tabBar?: boolean; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= DESKTOP_MIN;
  const path = usePathname();
  const side = desktop && !path.startsWith('/scan') && !path.startsWith('/paywall'); // full-flow pages keep no sidebar
  const router = useRouter();
  const inset = useTabBarInset();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, 80], [1, 0.0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(y.value, [0, 120], [0, -14], Extrapolation.CLAMP) }, { scale: interpolate(y.value, [-80, 0], [1.06, 1], Extrapolation.CLAMP) }],
  }));
  const header = (title || back || right) && (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: desktop ? 28 : 8, paddingBottom: desktop ? space.lg : space.md }, desktop ? null : titleStyle]}>
      {back && <IconButton name="chevron-back" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
      <View style={{ flex: 1 }}>
        {title && <Text v="display" numberOfLines={1} style={desktop ? { fontSize: 34 } : undefined}>{title}</Text>}
        {subtitle && <Text v="body" muted>{subtitle}</Text>}
      </View>
      {right}
    </Animated.View>
  );
  return (
    <View style={[{ flex: 1, backgroundColor: t.bg }, side ? { paddingLeft: SIDEBAR_WIDTH } : null, style]}>
      {side ? <WebSidebar /> : null}
      <LinearGradient colors={[t.accent + (t.mode === 'dark' ? '1F' : '22'), 'transparent']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 380 }} pointerEvents="none" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {scroll ? (
          <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} /> : undefined}
            contentContainerStyle={[{ paddingHorizontal: desktop ? 40 : space.lg, paddingBottom: tabBar ? inset : 40, gap: desktop ? 24 : space.lg }, desktop ? { width: '100%', maxWidth: 1160, alignSelf: 'center' } : null, contentStyle]}>
            {header}
            {children}
          </Animated.ScrollView>
        ) : (
          <View style={[{ flex: 1, paddingHorizontal: desktop ? 40 : space.lg }, desktop ? { width: '100%', maxWidth: 1160, alignSelf: 'center' } : null, contentStyle]}>{header}{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

export const Section = ({ title, action, children, index = 0 }: { title: string; action?: React.ReactNode; children: React.ReactNode; index?: number }) => (
  <Animated.View entering={FadeInDown.delay(index * 80).springify().damping(18)} style={{ gap: space.md }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text v="title">{title}</Text>
      {action}
    </View>
    {children}
  </Animated.View>
);
