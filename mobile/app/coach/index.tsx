import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ME_KEY, useHasFeature, useMe } from '@/lib/useMe';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Icon, IconButton, PressableScale, Skeleton, Text, haptic } from '@/ui';
import { UpgradeCard, errorInfo } from '@/features/paywall/gate';
import { Bubble, Msg, TypingDots } from '@/features/coach/parts';
import { asArray } from '@/features/settings/util';

const STARTERS = ['How many calories should I eat today?', 'What should I eat for dinner?', 'What workout should I do today?', 'Suggest a high-protein vegetarian breakfast', 'Am I meeting my weekly fitness goal?'];
const MAX = 1000;
let seq = 0;
const mid = () => `m${Date.now()}-${seq++}`;

export default function Coach() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const hasPlan = useHasFeature('ai_assistant');
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [convId, setConvId] = useState<string | null>(id ?? null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingHist, setLoadingHist] = useState(!!id);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const scroll = useRef<ScrollView>(null);

  const consented = !!me.data?.user.ai_consent_at;

  useEffect(() => {
    if (!id) return;
    api<any>(`/v1/coach/conversations/${id}`).then((r) => {
      setMsgs(asArray<any>(r, 'messages').map((m) => ({ id: m.id ?? mid(), role: m.role, content: m.content })));
    }).catch((e) => setMsgs([{ id: mid(), role: 'assistant', content: errorInfo(e).message, failed: true }])).finally(() => setLoadingHist(false));
  }, [id]);

  const toEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  useEffect(() => { toEnd(); }, [msgs.length, busy]);

  const grant = useMutation({
    mutationFn: () => api('/v1/consent', { body: { ai: true } }),
    onSuccess: () => { haptic.success(); qc.invalidateQueries({ queryKey: ME_KEY }); },
    onError: (e) => Alert.alert('Could not save', errorInfo(e).message),
  });

  const send = useCallback(async (content: string, retryId?: string) => {
    const clean = content.trim().slice(0, MAX);
    if (!clean || busy) return;
    haptic.light();
    if (retryId) setMsgs((m) => m.filter((x) => x.id !== retryId && !(x.failed && x.role === 'assistant')).map((x) => x));
    const userMsg: Msg = { id: retryId ?? mid(), role: 'user', content: clean };
    setMsgs((m) => (retryId ? [...m.filter((x) => x.id !== retryId), userMsg] : [...m, userMsg]));
    setText(''); setBusy(true); setSuggestions([]);
    try {
      const r = await api<{ conversation_id: string; reply: string; suggestions?: string[] }>('/v1/coach/chat', { body: { ...(convId ? { conversation_id: convId } : {}), message: clean } });
      setConvId(r.conversation_id);
      setMsgs((m) => [...m, { id: mid(), role: 'assistant', content: r.reply }]);
      setSuggestions(r.suggestions ?? []);
      haptic.select();
    } catch (e) {
      const info = errorInfo(e);
      setMsgs((m) => m.map((x) => (x.id === userMsg.id ? { ...x, failed: info.kind !== 'plan' && info.kind !== 'consent' } : x)));
      if (info.kind === 'plan') setMsgs((m) => [...m, { id: mid(), role: 'assistant', content: 'The AI coach is part of the Pro plan.', plan: true }]);
      else if (info.kind === 'consent') { qc.invalidateQueries({ queryKey: ME_KEY }); setMsgs((m) => [...m, { id: mid(), role: 'assistant', content: info.message, consent: true }]); }
      else setMsgs((m) => [...m, { id: mid(), role: 'assistant', content: info.message, failed: true }]);
    } finally { setBusy(false); }
  }, [busy, convId, qc]);

  const newChat = () => { setConvId(null); setMsgs([]); setSuggestions(STARTERS); setText(''); router.setParams({ id: undefined } as any); };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
      <IconButton name="chevron-back" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
      <View style={{ flex: 1 }}><Text v="title">AI Coach</Text><Text v="caption" muted>General guidance, not medical advice</Text></View>
      <IconButton name="time-outline" label="Chat history" onPress={() => router.push('/coach/history')} />
      <IconButton name="create-outline" label="New chat" onPress={newChat} />
    </View>
  );

  const shell = (child: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={[t.accent + '22', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260 }} pointerEvents="none" />
      <SafeAreaView style={{ flex: 1 }}>{header}{child}</SafeAreaView>
    </View>
  );

  if (me.data && !hasPlan) return shell(<View style={{ padding: 16 }}><UpgradeCard feature="ai_assistant" title="Meet your AI coach" hint="Ask about your meals, workouts and progress. Answers use your own logged data. Included in Pro." /></View>);
  if (me.data && !consented) {
    return shell(
      <View style={{ padding: 16 }}>
        <Card glow>
          <View style={{ gap: 12 }}>
            <Icon name="shield-checkmark" size={28} color={t.accent} />
            <Text v="title">Before we chat</Text>
            <Text v="body" muted>To give personal answers, the coach reads your profile, food journal, workouts and progress. This context is sent securely from our server to an AI provider to write each reply. It is never shown to other users, and you can turn this off any time in Privacy & data.</Text>
            <Text v="caption" faint>The coach gives general wellness guidance. It does not diagnose conditions or replace a doctor or dietitian.</Text>
            <Button title="I agree, enable AI coach" icon="checkmark-circle" loading={grant.isPending} onPress={() => grant.mutate()} />
          </View>
        </Card>
      </View>,
    );
  }

  return shell(
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loadingHist ? <><Skeleton height={60} radius={20} width="70%" /><Skeleton height={80} radius={20} width="80%" /></> : msgs.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 14, paddingVertical: 24 }}>
            <LinearGradient colors={[t.accent, t.accent2]} style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}><Icon name="sparkles" size={30} color={t.onAccent} /></LinearGradient>
            <Text v="display" style={{ textAlign: 'center' }}>How can I help?</Text>
            <Text v="body" muted style={{ textAlign: 'center' }}>Ask about calories, meals, workouts or your progress. I use your own data to answer.</Text>
          </View>
        ) : msgs.map((m) => (
          <View key={m.id} style={{ gap: 8 }}>
            <Bubble m={m} onRetry={m.failed ? () => (m.role === 'user' ? send(m.content, m.id) : undefined) : undefined} />
            {m.plan && <UpgradeCard feature="ai_assistant" />}
            {m.consent && <Button title="Open privacy settings" size="md" variant="secondary" onPress={() => router.push('/settings/privacy')} />}
            {m.failed && m.role === 'assistant' && <PressableScale onPress={() => { const last = [...msgs].reverse().find((x) => x.role === 'user'); if (last) send(last.content, last.id); }} accessibilityLabel="Retry"><Text v="caption" accent>Try again</Text></PressableScale>}
          </View>
        ))}
        {busy && <TypingDots />}
      </ScrollView>

      {suggestions.length > 0 && !busy && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          {suggestions.map((s) => (
            <PressableScale key={s} onPress={() => send(s)} hapticStyle="select" accessibilityLabel={s}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, maxWidth: 280 }}>
              <Text v="caption" numberOfLines={1}>{s}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
        <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: 24, borderWidth: 1, borderColor: t.border, paddingHorizontal: 16 }}>
          <TextInput value={text} onChangeText={setText} placeholder="Ask your coach…" placeholderTextColor={t.textFaint} multiline maxLength={MAX} selectionColor={t.accent}
            accessibilityLabel="Message" style={{ color: t.text, fontSize: 16, minHeight: 48, maxHeight: 120, paddingTop: 12, paddingBottom: 12 }} />
        </View>
        <PressableScale onPress={() => send(text)} disabled={!text.trim() || busy} hapticStyle="none" accessibilityLabel="Send message" style={{ opacity: !text.trim() || busy ? 0.4 : 1 }}>
          <LinearGradient colors={[t.accent, t.accent2]} style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-up" size={24} color={t.onAccent} /></LinearGradient>
        </PressableScale>
      </View>
      {msgs.length > 0 && <Text v="caption" faint style={{ textAlign: 'center', paddingBottom: 6 }}>Not medical advice. For symptoms or conditions, see a professional.</Text>}
    </KeyboardAvoidingView>,
  );
}
