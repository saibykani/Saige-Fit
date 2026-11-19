import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Button, Text } from '@/ui';
import { BrandMark, Orb } from '@/features/auth/AuthShell';

const FEATURES: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { icon: 'scan', label: 'AI food scan' },
  { icon: 'barbell', label: 'Smart workouts' },
  { icon: 'restaurant', label: 'Diet plans' },
  { icon: 'trending-up', label: 'Progress' },
];

export default function Welcome() {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Orb size={380} color={t.accent} top={-120} right={-140} />
      <Orb size={260} color={t.accent2} top={260} left={-130} delay={800} />
      <SafeAreaView style={{ flex: 1, padding: space.xl, justifyContent: 'space-between' }}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <BrandMark size={48} />
          <Text v="label" muted>Saige Fit</Text>
        </Animated.View>

        <View style={{ gap: 18 }}>
          <Animated.View entering={FadeInDown.delay(150).springify().damping(18)}>
            <Text v="hero">Train smarter.</Text>
            <Text v="hero" accent>Eat better.</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(300).springify().damping(18)}>
            <Text v="body" muted style={{ fontSize: 17, lineHeight: 25 }}>
              Your personal AI coach for nutrition, workouts and progress, all in one place.
            </Text>
          </Animated.View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FEATURES.map((f, i) => (
              <Animated.View key={f.label} entering={FadeIn.delay(450 + i * 90)} style={{
                flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
                borderRadius: 999, backgroundColor: t.glass, borderWidth: 1, borderColor: t.border,
              }}>
                <Ionicons name={f.icon} size={14} color={t.accent} />
                <Text v="caption">{f.label}</Text>
              </Animated.View>
            ))}
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(700).springify().damping(18)} style={{ gap: 12 }}>
          <Button title="Get started" icon="arrow-forward" onPress={() => router.push('/(auth)/register')} />
          <Button title="I have an account" variant="ghost" onPress={() => router.push('/(auth)/login')} />
          <Text v="caption" faint style={{ textAlign: 'center' }}>Estimates are for guidance only and are not medical advice.</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
