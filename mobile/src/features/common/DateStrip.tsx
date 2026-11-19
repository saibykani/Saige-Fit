import React, { useEffect, useRef } from 'react';
import { FlatList, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { spring } from '@/theme/tokens';
import { PressableScale, Text } from '@/ui';
import { addDays, dowShort, fromISODate, toISODate, todayISO } from './date';

const DAYS_BACK = 30;

function DayCell({ iso, selected, isToday, onPress }: { iso: string; selected: boolean; isToday: boolean; onPress: () => void }) {
  const t = useTheme();
  const d = fromISODate(iso);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(selected ? 1.06 : 1, spring) }] }));
  return (
    <PressableScale onPress={onPress} hapticStyle="select" accessibilityRole="button"
      accessibilityLabel={`${d.toDateString()}${isToday ? ', today' : ''}`} accessibilityState={{ selected }}>
      <Animated.View style={[{
        width: 52, paddingVertical: 10, borderRadius: 18, alignItems: 'center', gap: 4, marginRight: 8,
        backgroundColor: selected ? t.accent : t.surface, borderWidth: 1, borderColor: selected ? t.accent : t.border,
      }, a]}>
        <Text v="label" color={selected ? t.onAccent : t.textMuted} style={{ fontSize: 10 }}>{dowShort(d)}</Text>
        <Text v="title" color={selected ? t.onAccent : t.text} style={{ fontSize: 19 }}>{d.getDate()}</Text>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isToday ? (selected ? t.onAccent : t.accent) : 'transparent' }} />
      </Animated.View>
    </PressableScale>
  );
}

/** Horizontal day scroller: last 30 days up to today. */
export function DateStrip({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const ref = useRef<FlatList<string>>(null);
  const today = todayISO();
  const days = React.useMemo(() => Array.from({ length: DAYS_BACK + 1 }, (_, i) => toISODate(addDays(new Date(), i - DAYS_BACK))), []);
  useEffect(() => {
    const i = days.indexOf(value);
    if (i >= 0) ref.current?.scrollToIndex({ index: i, viewPosition: 0.5, animated: true });
  }, [value, days]);
  return (
    <FlatList
      ref={ref} data={days} horizontal showsHorizontalScrollIndicator={false} keyExtractor={(d) => d}
      getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
      initialScrollIndex={DAYS_BACK} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }}
      renderItem={({ item }) => <DayCell iso={item} selected={item === value} isToday={item === today} onPress={() => onChange(item)} />}
      onScrollToIndexFailed={() => {}}
    />
  );
}
