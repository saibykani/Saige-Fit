import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { useMe } from '@/lib/useMe';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

/** Routes users to the right place: signed out -> welcome, not onboarded -> onboarding, else tabs. */
// No-login mode (EXPO_PUBLIC_PREVIEW=1): treat everyone as signed in. The backend must have GUEST_USER_ID set to serve data.
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

function Gate() {
  const t = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { session, ready, init } = useAuth();
  const me = useMe();

  useEffect(() => init(), [init]);

  const signedIn = PREVIEW || !!session;
  const loading = (!PREVIEW && !ready) || (signedIn && me.isLoading);
  useEffect(() => {
    if (loading) return;
    const root = segments[0] as string | undefined;
    const inAuth = root === '(auth)';
    const inOnboarding = root === 'onboarding';
    if (!signedIn) { if (!inAuth) router.replace('/(auth)/welcome'); return; }
    if (me.isError) return; // keep the user where they are; screens show their own error state
    if (me.data && !me.data.onboarded) { if (!inOnboarding) router.replace('/onboarding'); return; }
    if (me.data?.onboarded && (inAuth || inOnboarding)) router.replace('/(tabs)');
  }, [loading, signedIn, me.data, me.isError, segments, router]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.accent} size="large" /></View>;
  }
  return (
    <>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Gate />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
