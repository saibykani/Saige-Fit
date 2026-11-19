import React, { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale, Text } from '@/ui';

export interface Msg { id: string; role: 'user' | 'assistant'; content: string; failed?: boolean; plan?: boolean; consent?: boolean }

function Dot({ i }: { i: number }) {
  const t = useTheme();
  const o = useSharedValue(0.3);
  useEffect(() => { o.value = withDelay(i * 160, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.3, { duration: 420 })), -1)); }, [i, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: -3 * o.value }] }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.textMuted }, a]} />;
}
export function TypingDots() {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInUp.duration(200)} style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 20, borderBottomLeftRadius: 6 }}
      accessibilityLabel="Coach is typing">
      <Dot i={0} /><Dot i={1} /><Dot i={2} />
    </Animated.View>
  );
}

/** Minimal formatting for replies: **bold** and "- " bullets. No HTML/markdown execution. */
export function RichText({ text, color }: { text: string; color?: string }) {
  const lines = text.split('\n');
  return (
    <View style={{ gap: 4 }}>
      {lines.map((ln, i) => {
        const bullet = /^\s*[-*•]\s+/.test(ln);
        const body = ln.replace(/^\s*[-*•]\s+/, '');
        const parts = body.split('**');
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            {bullet ? <Text v="body" color={color}>•</Text> : null}
            <Text v="body" color={color} style={{ flex: 1 }} selectable>
              {parts.map((p, k) => (k % 2 ? <Text key={k} v="bodyStrong" color={color}>{p}</Text> : p))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function Bubble({ m, onRetry }: { m: Msg; onRetry?: () => void }) {
  const t = useTheme();
  const mine = m.role === 'user';
  return (
    <Animated.View entering={FadeInDown.springify().damping(17)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      {!mine && <LinearGradient colors={[t.accent, t.accent2]} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="sparkles" size={14} color={t.onAccent} /></LinearGradient>}
      <View style={{ flexShrink: 1 }}>
        {mine ? (
          <LinearGradient colors={[t.accent, t.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, borderBottomRightRadius: 6 }}>
            <RichText text={m.content} color={t.onAccent} />
          </LinearGradient>
        ) : (
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: m.failed ? t.danger + '88' : t.border, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, borderBottomLeftRadius: 6 }}>
            <RichText text={m.content} />
          </View>
        )}
        {m.failed && onRetry && (
          <PressableScale onPress={onRetry} accessibilityLabel="Retry sending" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: 4 }}>
            <Text v="caption" color={t.danger}>Not sent. Tap to retry</Text>
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}
