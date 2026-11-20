import { Stack } from 'expo-router';
import { WebCard } from '@/features/auth/WebCard.web';

export default function AuthLayout() {
  return (
    <WebCard>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'slide_from_right' }} />
    </WebCard>
  );
}
