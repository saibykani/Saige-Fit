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
import { ApkPrompt } from '@/features/download/ApkPrompt';
import { useMe } from '@/lib/useMe';
import { Button, Text } from '@/ui';

// Without this the navigator can fall back to the first declared screen (the camera) after a remount.
export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

/** Routes users to the right place: signed out -> welcome, not onboarded -> onboarding, else tabs. */
// No-login mode (EXPO_PUBLIC_PREVIEW=1): treat everyone as signed in. The backend must have GUEST_USER_ID set to serve data.
import { DEMO } from '@/lib/demo';
const PREVIEW = DEMO;

function Gate() {
  const t = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { session, ready, init, signOut } = useAuth();
  const me = useMe();

  useEffect(() => init(), [init]);

  const signedIn = PREVIEW || DEMO || !!session;
  const loading = (!PREVIEW && !DEMO && !ready) || (signedIn && me.isLoading);
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

  // Hide the tabs while a redirect (to welcome or onboarding) is pending so they never flash.
  const root0 = segments[0] as string | undefined;
  const redirecting = !loading && ((!signedIn && root0 !== '(auth)') || (signedIn && !me.isError && !!me.data && !me.data.onboarded && root0 !== 'onboarding'));
  // Signed in, but the server could not load the profile (network, or the backend rejected the login).
  const serverProblem = signedIn && !DEMO && me.isError && !loading;
  return (
    <>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
      {loading || redirecting ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} size="large" />
        </View>
      ) : null}
      {serverProblem ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
          <Text v="title" style={{ textAlign: 'center' }}>Can't load your account</Text>
          <Text v="body" muted style={{ textAlign: 'center', maxWidth: 340 }}>You are signed in, but the server did not respond correctly. Check your connection and try again.</Text>
          <View style={{ width: '100%', maxWidth: 340, gap: 10 }}>
            <Button title="Try again" onPress={() => me.refetch()} />
            <Button title="Sign out" variant="ghost" onPress={() => signOut()} />
          </View>
        </View>
      ) : null}
      <ApkPrompt />
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
