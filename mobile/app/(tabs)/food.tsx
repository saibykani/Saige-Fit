import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, EmptyState } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function Food() {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: space.lg }}>
      <Card><EmptyState title="Food" hint="Coming in a later phase." /></Card>
    </SafeAreaView>
  );
}
