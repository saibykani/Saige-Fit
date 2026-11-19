import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale, Text, haptic } from '@/ui';
import { signInWithProvider } from './oauth';

function SocialBtn({ icon, label, onPress, busy }: { icon: 'logo-google' | 'logo-apple'; label: string; onPress: () => void; busy: boolean }) {
  const t = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, opacity: busy ? 0.5 : 1 }}>
      <View style={{ height: 52, borderRadius: 26, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Ionicons name={icon} size={20} color={t.text} />
        <Text v="bodyStrong">{label}</Text>
      </View>
    </PressableScale>
  );
}

export function SocialButtons({ onError }: { onError: (msg: string) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const run = async (p: 'google' | 'apple') => {
    setBusy(true);
    try {
      const r = await signInWithProvider(p);
      if (r === 'unavailable') { haptic.warning(); onError(`${p === 'google' ? 'Google' : 'Apple'} sign-in isn't available yet. Use email for now.`); }
    } catch {
      onError('Could not complete sign-in. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
        <Text v="caption" faint>or continue with</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SocialBtn icon="logo-google" label="Google" busy={busy} onPress={() => run('google')} />
        {Platform.OS === 'ios' ? <SocialBtn icon="logo-apple" label="Apple" busy={busy} onPress={() => run('apple')} /> : null}
      </View>
    </View>
  );
}
