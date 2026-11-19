import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, EmptyState, Icon, PressableScale, Screen, Segmented, Skeleton, Text } from '@/ui';
import { QueryState } from '@/features/paywall/gate';
import { Photo, usePhotos } from '@/features/progress/api';
import { shortDate } from '@/features/settings/util';

function Slider({ before, after }: { before: Photo; after: Photo }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => { if (w) x.value = w / 2; }, [w, x]);
  // activates on horizontal drags only, so the page can still scroll vertically over the image
  const pan = Gesture.Pan().activeOffsetX([-6, 6]).failOffsetY([-14, 14]).onUpdate((e) => { x.value = Math.max(0, Math.min(w, e.x)); });
  const clip = useAnimatedStyle(() => ({ width: x.value }));
  const handle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 22 }] }));
  const H = 440;
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel="Before and after comparison. Drag to reveal." style={{ height: H, borderRadius: 28, overflow: 'hidden', backgroundColor: t.surfaceAlt }}>
        {after.signed_url ? <Image source={{ uri: after.signed_url }} style={{ position: 'absolute', width: '100%', height: H }} contentFit="cover" /> : null}
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' }, clip]}>
          {before.signed_url && w > 0 ? <Image source={{ uri: before.signed_url }} style={{ width: w, height: H }} contentFit="cover" /> : null}
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' }, handle]} pointerEvents="none">
          <View style={{ position: 'absolute', width: 3, top: 0, bottom: 0, backgroundColor: t.accent }} />
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="swap-horizontal" size={22} color={t.onAccent} /></View>
        </Animated.View>
        <View style={{ position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}><Text v="caption" color="#fff">Before · {shortDate(before.taken_on)}</Text></View>
        <View style={{ position: 'absolute', right: 12, top: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}><Text v="caption" color="#fff">After · {shortDate(after.taken_on)}</Text></View>
      </View>
    </GestureDetector>
  );
}

function Picker({ photos, value, onPick, label }: { photos: Photo[]; value: string; onPick: (id: string) => void; label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text v="label" muted>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {photos.map((p) => (
          <PressableScale key={p.id} onPress={() => onPick(p.id)} hapticStyle="select" accessibilityLabel={`${label} ${shortDate(p.taken_on)}`}
            style={{ width: 62, height: 82, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: p.id === value ? t.accent : 'transparent', backgroundColor: t.surfaceAlt }}>
            {p.signed_url ? <Image source={{ uri: p.signed_url }} style={{ flex: 1 }} contentFit="cover" /> : null}
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

export default function Compare() {
  const q = usePhotos();
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [angle, setAngle] = useState<'all' | 'front' | 'side' | 'back'>('all');

  return (
    <Screen title="Compare" subtitle="Drag the handle to reveal" back tabBar={false}>
      <QueryState query={q} skeleton={<Skeleton height={440} radius={28} />}
        empty={(r) => (r.length < 2 ? <Card><EmptyState icon="git-compare-outline" title="Add two photos to compare" hint="Take a progress photo now and another in a few weeks, in the same pose and light." /></Card> : null)}>
        {(all) => {
          const photos = angle === 'all' ? all : all.filter((p) => p.angle === angle);
          if (photos.length < 2) {
            return (
              <View style={{ gap: 14 }}>
                <Segmented options={[{ value: 'all', label: 'All' }, { value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} value={angle} onChange={setAngle} />
                <Card><Text v="body" muted>You need at least two {angle} photos to compare.</Text></Card>
              </View>
            );
          }
          const before = photos.find((p) => p.id === beforeId) ?? photos[0];
          const after = photos.find((p) => p.id === afterId) ?? photos[photos.length - 1];
          return (
            <View style={{ gap: 16 }}>
              <Segmented options={[{ value: 'all', label: 'All' }, { value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} value={angle} onChange={(a) => { setAngle(a); setBeforeId(null); setAfterId(null); }} />
              <Slider before={before} after={after} />
              <Picker photos={photos} value={before.id} onPick={setBeforeId} label="Before" />
              <Picker photos={photos} value={after.id} onPick={setAfterId} label="After" />
              <Text v="caption" faint>Photos are private and only used for your own comparison. We never estimate body fat from photos.</Text>
            </View>
          );
        }}
      </QueryState>
    </Screen>
  );
}
