import React, { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Pull-to-refresh helper.
 *   const refresh = useRefreshControl([profileQuery, logsQuery]);
 *   <ScrollView refreshControl={refresh}> ...   (or Animated.ScrollView / FlatList refreshControl={refresh})
 * Pass anything with `refetch()` (react-query results). All refetches run in parallel; the spinner stays
 * until they settle (errors are swallowed so the spinner always stops). Tinted in brand colours.
 */
export function useRefreshControl(queries: { refetch: () => Promise<unknown> }[]): React.ReactElement {
  const t = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const ref = React.useRef(queries);
  ref.current = queries;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.allSettled(ref.current.map((q) => q.refetch())); } finally { setRefreshing(false); }
  }, []);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} colors={[t.accent]} progressBackgroundColor={t.surface} />;
}
