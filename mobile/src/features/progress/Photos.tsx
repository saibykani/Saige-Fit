import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ChipGroup, EmptyState, Icon, PressableScale, Sheet, Text, haptic } from '@/ui';
import { QueryState, errorInfo } from '@/features/paywall/gate';
import { Photo, usePhotos } from './api';
import { shortDate, todayIso } from '@/features/settings/util';

export function PhotosSection() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = usePhotos();
  const [adding, setAdding] = useState(false);
  const [angle, setAngle] = useState<'front' | 'side' | 'back'>('front');

  const add = useMutation({
    mutationFn: async (source: 'camera' | 'gallery') => {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error(source === 'camera' ? 'Camera permission is needed to take a progress photo. You can enable it in system settings.' : 'Photo library permission is needed to pick a photo.');
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets[0]) return null;
      const path = await uploadImage('progress-photos', res.assets[0].uri);
      await api('/v1/progress/photos', { body: { image_path: path, angle, taken_on: todayIso() } });
      return path;
    },
    onSuccess: (p) => { if (p) { haptic.success(); setAdding(false); qc.invalidateQueries({ queryKey: ['progress-photos'] }); qc.invalidateQueries({ queryKey: ['progress-summary'] }); } },
    onError: (e) => Alert.alert('Could not add photo', e instanceof Error && !(e as any).status ? e.message : errorInfo(e).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/v1/progress/photos/${id}`, { method: 'DELETE' }),
    onSuccess: () => { haptic.warning(); qc.invalidateQueries({ queryKey: ['progress-photos'] }); },
    onError: (e) => Alert.alert('Could not delete', errorInfo(e).message),
  });
  const confirmDelete = (p: Photo) => Alert.alert('Delete this photo?', `Taken ${shortDate(p.taken_on)}. This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(p.id) }]);

  return (
    <View style={{ gap: 12 }}>
      <QueryState query={q}
        empty={(r) => (r.length ? null : <Card><EmptyState icon="images-outline" title="No progress photos yet" hint="Photos are private to you. Take one every few weeks, in the same light and pose." action={{ label: 'Add first photo', onPress: () => setAdding(true) }} /></Card>)}>
        {(photos) => (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[...photos].reverse().map((p) => (
                <PressableScale key={p.id} onPress={() => router.push('/progress/compare')} onLongPress={() => confirmDelete(p)} hapticStyle="select" accessibilityLabel={`Progress photo from ${shortDate(p.taken_on)}. Long press to delete`}
                  style={{ width: '31.5%', aspectRatio: 0.75 }}>
                  <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: t.surfaceAlt }}>
                    {p.signed_url ? <Image source={{ uri: p.signed_url }} style={{ flex: 1 }} contentFit="cover" transition={250} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-outline" size={22} color={t.textFaint} /></View>}
                    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, backgroundColor: 'rgba(0,0,0,0.45)' }}>
                      <Text v="caption" color="#fff" style={{ fontSize: 10 }}>{shortDate(p.taken_on)}{p.angle ? ` · ${p.angle}` : ''}</Text>
                    </View>
                  </View>
                </PressableScale>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Add photo" icon="camera-outline" size="md" style={{ flex: 1 }} onPress={() => setAdding(true)} />
              {photos.length >= 2 && <Button title="Compare" icon="git-compare-outline" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push('/progress/compare')} />}
            </View>
          </View>
        )}
      </QueryState>
      <Text v="caption" faint>Body fat is never estimated from photos; photos are only for your own visual comparison.</Text>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add progress photo">
        <View style={{ gap: 14 }}>
          <Text v="label" muted>Angle</Text>
          <ChipGroup options={[{ value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} value={angle} onChange={setAngle} />
          <Button title="Take photo" icon="camera" loading={add.isPending} onPress={() => add.mutate('camera')} />
          <Button title="Choose from gallery" icon="images" variant="secondary" disabled={add.isPending} onPress={() => add.mutate('gallery')} />
        </View>
      </Sheet>
    </View>
  );
}
