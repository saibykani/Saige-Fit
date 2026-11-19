import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Text, haptic } from '@/ui';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { AUTH_REDIRECT } from '@/features/auth/oauth';
import { authMessage } from '@/features/auth/validation';

export default function Verify() {
  const t = useTheme();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const bob = useSharedValue(0);
  useEffect(() => { bob.value = withRepeat(withSequence(withTiming(-8, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })), -1); }, [bob]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const resend = async () => {
    if (!email) return;
    setBusy(true); setNote(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: AUTH_REDIRECT() } });
    setBusy(false);
    if (error) { haptic.warning(); return setNote(authMessage(error)); }
    haptic.success(); setNote('Verification email sent.'); setCooldown(45);
  };

  return (
    <AuthShell title="Verify your email" subtitle="One last step before we build your plan." back={false}>
      <View style={{ alignItems: 'center', gap: 16, paddingVertical: 12 }}>
        <Animated.View style={[{ width: 96, height: 96, borderRadius: 48, backgroundColor: t.accent + '1F', alignItems: 'center', justifyContent: 'center' }, a]}>
          <Ionicons name="mail-outline" size={44} color={t.accent} />
        </Animated.View>
        <Text v="body" muted style={{ textAlign: 'center' }}>
          We sent a confirmation link to{'\n'}<Text v="bodyStrong">{email ?? 'your email'}</Text>.{'\n'}Open it on this device, then sign in.
        </Text>
      </View>
      {note ? <Text v="caption" color={note.startsWith('Verification') ? t.success : t.danger} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{note}</Text> : null}
      <Button title="I've verified, sign in" onPress={() => router.replace('/(auth)/login')} />
      <Button title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'} variant="ghost" onPress={resend} loading={busy} disabled={cooldown > 0 || !email} />
    </AuthShell>
  );
}
