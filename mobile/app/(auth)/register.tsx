import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Field, Text, haptic } from '@/ui';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/features/auth/AuthShell';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { AUTH_REDIRECT } from '@/features/auth/oauth';
import { authMessage, isEmail, passwordStrength } from '@/features/auth/validation';

export default function Register() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = passwordStrength(password);
  const colors = [t.danger, t.danger, t.warn, t.success, t.accent];

  const submit = async () => {
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: AUTH_REDIRECT() } });
    setBusy(false);
    if (e) { haptic.warning(); return setError(authMessage(e)); }
    haptic.success();
    // With email confirmation on there is no session yet: show the verification screen.
    if (!data.session) router.replace({ pathname: '/(auth)/verify', params: { email: email.trim() } });
  };

  return (
    <AuthShell title="Create your account" subtitle="Start with email, or use Google/Apple below.">
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
      <View style={{ gap: 8 }}>
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" />
        {password ? (
          <View style={{ gap: 6 }} accessibilityLabel={`Password strength: ${strength.label}`}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= strength.score ? colors[strength.score] : t.surfaceAlt }} />
              ))}
            </View>
            <Text v="caption" muted>{strength.label}. Mix upper/lower case, numbers and symbols.</Text>
          </View>
        ) : null}
      </View>
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" placeholder="Repeat password" onSubmitEditing={submit} />
      {error ? <Text v="caption" color={t.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button title="Create account" onPress={submit} loading={busy} />
      <Text v="caption" faint style={{ textAlign: 'center' }}>By continuing you agree to our Terms and Privacy Policy.</Text>
      <SocialButtons onError={setError} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text v="body" muted>Already have an account?</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} accessibilityRole="link"><Text v="bodyStrong" accent>Sign in</Text></Pressable>
      </View>
    </AuthShell>
  );
}
