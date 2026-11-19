import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text } from 'react-native';
import { Card, EmptyState } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';

// Phase 2 will wire this to /v1/dashboard. Until real data exists it shows an honest empty state,
// not fabricated statistics.
export default function Home() {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Text style={{ ...font.display, color: t.text }}>Today</Text>
        <Card>
          <EmptyState title="No meals logged yet" hint="Complete onboarding and log your first meal to see your calories and macros here." />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
