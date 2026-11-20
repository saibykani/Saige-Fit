import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideInRight, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { api, errorMessage } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { ME_KEY } from '@/lib/useMe';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { space, spring } from '@/theme/tokens';
import { Button, Confetti, IconButton, PressableScale, SuccessCheck, Text, haptic } from '@/ui';
import { TOTAL_STEPS, useOnboarding, validateStep } from '@/features/onboarding/store';
import { StepBody, StepDiet, StepGoals, StepLifestyle, StepPersonal, StepWorkout } from '@/features/onboarding/Steps';
import { StepSummary, useTargetsPreview } from '@/features/onboarding/StepSummary';
import { Orb } from '@/features/auth/AuthShell';

const TITLES = ['About you', 'Body', 'Goal', 'Lifestyle', 'Nutrition', 'Training', 'Your plan'];

function ProgressTrack({ step }: { step: number }) {
  const t = useTheme();
  const p = useSharedValue(0);
  useEffect(() => { p.value = withSpring((step + 1) / TOTAL_STEPS, spring); }, [step, p]);
  const a = useAnimatedStyle(() => ({ width: `${p.value * 100}%` as `${number}%` }));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step + 1 }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: t.accent }, a]} />
    </View>
  );
}

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const signOut = useAuth((s) => s.signOut);
  const { step, dir, data, next, back, reset } = useOnboarding();
  const preview = useTargetsPreview(step === TOTAL_STEPS - 1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const last = step === TOTAL_STEPS - 1;

  const submit = async () => {
    if (!data.privacy_consent) { haptic.warning(); return setError('Please accept the privacy consent to continue.'); }
    if (!preview.data) { haptic.warning(); return setError('We need your plan summary first. Tap retry above.'); }
    setBusy(true); setError(null);
    try {
      let avatar_path: string | undefined;
      if (data.avatar_uri) {
        try { avatar_path = await uploadImage('avatars', data.avatar_uri); } catch { /* the photo is optional; don't block onboarding */ }
      }
      const days = Math.max(1, data.workout_days.length);
      await api('/v1/onboarding', {
        body: {
          full_name: data.full_name.trim(), date_of_birth: data.date_of_birth, gender: data.gender,
          country: data.country.trim() || undefined, language: data.language,
          height_cm: data.height_cm, weight_kg: data.weight_kg, target_weight_kg: data.target_weight_kg,
          body_fat_pct: data.body_fat_pct ?? undefined, waist_cm: data.waist_cm ?? undefined,
          goal: data.goal, activity_level: data.activity_level, sleep_hours: data.sleep_hours, experience: data.experience,
          workout_env: data.workout_env, training_days: Math.min(data.training_days, days), workout_days: data.workout_days,
          workout_minutes: data.workout_minutes, preferred_workout_time: data.preferred_workout_time,
          equipment: data.equipment, injuries: data.injuries,
          diet_type: data.diet_type, allergies: data.allergies, intolerances: data.intolerances, restrictions: data.restrictions,
          liked_foods: data.liked_foods, disliked_foods: data.disliked_foods, cuisines: data.cuisines,
          meals_per_day: data.meals_per_day, monthly_budget: data.monthly_budget ?? undefined,
          privacy_consent: true, ai_consent: data.ai_consent,
          ...(avatar_path ? { avatar_path } : {}),
        },
      });
      haptic.success();
      setDone(1);
      await new Promise((r) => setTimeout(r, 1500));
      await qc.invalidateQueries({ queryKey: ME_KEY });
      reset();
      router.replace('/(tabs)');
    } catch (e) {
      haptic.warning();
      setError(errorMessage(e));
    } finally { setBusy(false); }
  };

  const onContinue = () => {
    const err = validateStep(step, data);
    if (err) { haptic.warning(); return setError(err); }
    setError(null);
    if (last) return submit();
    haptic.light();
    next();
  };

  const Step = [StepPersonal, StepBody, StepGoals, StepLifestyle, StepDiet, StepWorkout, StepSummary][step];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Orb size={280} color={t.accent} top={-100} right={-100} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: 8, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {step > 0 ? (
              <IconButton name="chevron-back" label="Previous step" onPress={() => { setError(null); back(); }} />
            ) : (
              <PressableScale onPress={() => signOut()} accessibilityRole="button" accessibilityLabel="Sign out" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text v="caption" muted>Sign out</Text>
              </PressableScale>
            )}
            <View style={{ flex: 1 }}><ProgressTrack step={step} /></View>
            <Text v="caption" muted>{step + 1}/{TOTAL_STEPS}</Text>
          </View>
          <Text v="label" accent>{TITLES[step]}</Text>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: space.lg, paddingBottom: 24 }}>
            <Animated.View key={step} entering={(dir === 1 ? SlideInRight : SlideInLeft).delay(100).springify().damping(20)} exiting={FadeOut.duration(100)}>
              <Step />
            </Animated.View>
          </ScrollView>
          <View style={{ padding: space.lg, paddingTop: 8, gap: 10 }}>
            {error ? <Text v="caption" color={t.danger} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{error}</Text> : null}
            <Button title={last ? 'Build my plan' : 'Continue'} icon={last ? 'rocket' : 'arrow-forward'} onPress={onContinue} loading={busy} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {done > 0 ? (
        <Animated.View entering={FadeIn.duration(250)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg + 'F2', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <SuccessCheck size={110} />
          <Text v="title">You're all set!</Text>
          <Text v="body" muted>Your plan is ready.</Text>
          <Confetti trigger={done} />
        </Animated.View>
      ) : null}
    </View>
  );
}
