import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Field, Text, haptic } from '@/ui';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { authMessage, isEmail } from '@/features/auth/validation';

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) {
      haptic.warning();
      if (e.message.toLowerCase().includes('not confirmed')) return router.push({ pathname: '/(auth)/verify', params: { email: email.trim() } });
      return setError(authMessage(e));
    }
    haptic.success(); // the root Gate redirects once the session arrives
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue your journey.">
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="••••••••" onSubmitEditing={submit} />
      <Pressable onPress={() => router.push('/(auth)/forgot')} accessibilityRole="link" accessibilityLabel="Forgot password" style={{ alignSelf: 'flex-end' }}>
        <Text v="caption" accent>Forgot password?</Text>
      </Pressable>
      {error ? <Text v="caption" color={t.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button title="Sign in" onPress={submit} loading={busy} />
      <SocialButtons onError={setError} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text v="body" muted>New here?</Text>
        <Pressable onPress={() => router.replace('/(auth)/register')} accessibilityRole="link"><Text v="bodyStrong" accent>Create account</Text></Pressable>
      </View>
    </AuthShell>
  );
}
