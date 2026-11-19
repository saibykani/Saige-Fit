import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Field, Text, haptic } from '@/ui';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { AUTH_REDIRECT } from '@/features/auth/oauth';
import { authMessage, isEmail } from '@/features/auth/validation';

export default function Forgot() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address.');
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: AUTH_REDIRECT() });
    setBusy(false);
    if (e) { haptic.warning(); return setError(authMessage(e)); }
    haptic.success();
    setSent(true);
  };

  return (
    <AuthShell title="Reset password" subtitle="We'll email you a secure link to set a new password.">
      {sent ? (
        <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: t.accent + '1F', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mail-open-outline" size={40} color={t.accent} />
          </View>
          <Text v="title">Check your inbox</Text>
          <Text v="body" muted style={{ textAlign: 'center' }}>If an account exists for {email.trim()}, a reset link is on its way.</Text>
          <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/(auth)/login')} />
        </Animated.View>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" onSubmitEditing={submit} />
          {error ? <Text v="caption" color={t.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button title="Send reset link" onPress={submit} loading={busy} />
        </>
      )}
    </AuthShell>
  );
}
