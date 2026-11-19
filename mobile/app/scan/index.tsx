import React, { useCallback, useRef, useState } from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ApiError, errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, IconButton, PressableScale, Segmented, Sheet, Text, haptic } from '@/ui';
import { useDay } from '@/features/common/dayStore';
import type { FoodSummary } from '@/features/common/types';
import { AddFoodSheet } from '@/features/food/AddFoodSheet';
import { CustomFoodSheet } from '@/features/food/CustomFoodSheet';
import { grantAiConsent, lookupBarcode, prepareImage, scanFood } from '@/features/scan/api';
import { AnalyzingOverlay, ScanFrame } from '@/features/scan/ScanParts';
import { useScan } from '@/features/scan/store';

type Mode = 'food' | 'barcode';
type Problem = { kind: 'generic' | 'upgrade' | 'consent'; message: string } | null;

export default function ScanScreen() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { day } = useDay();
  const setResult = useScan((s) => s.setResult);
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const lock = useRef(false);

  const [mode, setMode] = useState<Mode>('food');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const lastImage = useRef<{ uri: string; w?: number; h?: number } | null>(null);

  const [product, setProduct] = useState<FoodSummary | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);

  /* ---------- food photo flow ---------- */
  const analyze = useCallback(async (img: { uri: string; w?: number; h?: number }) => {
    lastImage.current = img;
    setProblem(null); setPreview(img.uri); setBusy(true);
    try {
      const prepared = await prepareImage(img.uri, img.w, img.h);
      const res = await scanFood(prepared);
      haptic.success();
      setResult(prepared, res);
      router.replace('/scan/results');
    } catch (e) {
      haptic.warning();
      setBusy(false);
      if (e instanceof ApiError && e.status === 402) setProblem({ kind: 'upgrade', message: 'AI food scanning is part of the Pro plan.' });
      else if (e instanceof ApiError && e.status === 403) setProblem({ kind: 'consent', message: 'To recognise food in photos, we need your permission to process them with AI.' });
      else if (e instanceof ApiError && e.status === 429) setProblem({ kind: 'generic', message: 'You\'re scanning very quickly. Wait a moment and try again.' });
      else setProblem({ kind: 'generic', message: errorMessage(e, 'We couldn\'t analyse that photo. Please try again.') });
    }
  }, [router, setResult]);

  const shoot = async () => {
    if (busy || !cam.current) return;
    haptic.medium();
    try {
      const p = await cam.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (p) analyze({ uri: p.uri, w: p.width, h: p.height });
    } catch { setProblem({ kind: 'generic', message: 'Couldn\'t take the photo. Please try again.' }); }
  };

  const gallery = async () => {
    if (busy) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (!r.canceled && r.assets[0]) analyze({ uri: r.assets[0].uri, w: r.assets[0].width, h: r.assets[0].height });
  };

  const allowAi = async () => {
    try {
      await grantAiConsent();
      setProblem(null);
      if (lastImage.current) analyze(lastImage.current);
    } catch (e) { setProblem({ kind: 'generic', message: errorMessage(e) }); }
  };

  /* ---------- barcode flow ---------- */
  const onBarcode = async ({ data }: { data: string }) => {
    if (lock.current || busy) return;
    lock.current = true;
    haptic.medium();
    try {
      setProduct(await lookupBarcode(data));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(data);
      else { haptic.warning(); setProblem({ kind: 'generic', message: errorMessage(e, 'Couldn\'t look that product up.') }); lock.current = false; }
    }
  };
  const releaseLock = () => { lock.current = false; };

  /* ---------- permission gates ---------- */
  if (!perm) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!perm.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: 'center', gap: 18 }}>
        <View style={{ position: 'absolute', top: 56, left: 20 }}><IconButton name="close" label="Close scanner" onPress={() => router.back()} /></View>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: t.accent + '1F', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera-outline" size={44} color={t.accent} />
          </View>
          <Text v="title" style={{ textAlign: 'center' }}>Camera access needed</Text>
          <Text v="body" muted style={{ textAlign: 'center' }}>
            {perm.canAskAgain ? 'Allow the camera to scan meals and barcodes. Photos are only sent when you take one.' : 'Camera access is turned off. Enable it in Settings to scan meals and barcodes.'}
          </Text>
        </View>
        <Button title={perm.canAskAgain ? 'Allow camera' : 'Open settings'} icon="camera" onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())} />
        <Button title="Choose a photo instead" variant="ghost" icon="images-outline" onPress={gallery} loading={busy} />
        <Button title="Search food manually" variant="ghost" onPress={() => router.replace('/food/search')} />
        {busy ? <AnalyzingOverlay uri={preview} /> : null}
        <ProblemSheet problem={problem} onClose={() => setProblem(null)} onAllow={allowAi} router={router} />
      </SafeAreaView>
    );
  }

  const frameW = mode === 'food' ? width - 64 : width - 56;
  const frameH = mode === 'food' ? width - 64 : 170;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={{ flex: 1 }} facing="back" enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
        onBarcodeScanned={mode === 'barcode' ? onBarcode : undefined} />

      {/* dim everything outside the frame */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <ScanFrame w={frameW} h={frameH} active={!busy} />
        <Text v="bodyStrong" style={{ color: '#fff', marginTop: 22, textShadowColor: '#000', textShadowRadius: 8 }}>
          {mode === 'food' ? 'Fit your whole plate in the frame' : 'Point at the product barcode'}
        </Text>
      </View>

      <SafeAreaView pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
          <IconButton name="close" label="Close scanner" onPress={() => router.back()} tint="#fff" />
          <IconButton name={torch ? 'flash' : 'flash-off'} label={torch ? 'Turn torch off' : 'Turn torch on'} onPress={() => setTorch((v) => !v)} tint={torch ? t.accent : '#fff'} />
        </View>

        <View style={{ padding: 20, gap: 18, alignItems: 'center' }}>
          {problem && problem.kind === 'generic' ? (
            <View style={{ backgroundColor: 'rgba(255,92,92,0.92)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text v="caption" style={{ color: '#fff' }} accessibilityLiveRegion="polite">{problem.message}</Text>
            </View>
          ) : null}
          <View style={{ width: 230 }}><Segmented<Mode> options={[{ value: 'food', label: 'Food' }, { value: 'barcode', label: 'Barcode' }]} value={mode} onChange={(m) => { setMode(m); setProblem(null); lock.current = false; }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 12 }}>
            <IconButton name="images-outline" label="Choose photo from gallery" onPress={gallery} tint="#fff" />
            {mode === 'food' ? (
              <PressableScale onPress={shoot} hapticStyle="none" scaleTo={0.9} disabled={busy} accessibilityRole="button" accessibilityLabel="Take photo">
                <View style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accent }} />
                </View>
              </PressableScale>
            ) : <View style={{ width: 84, height: 84 }} />}
            <IconButton name="search" label="Search food manually" onPress={() => router.replace('/food/search')} tint="#fff" />
          </View>
        </View>
      </SafeAreaView>

      {busy ? <AnalyzingOverlay uri={preview} /> : null}

      <ProblemSheet problem={problem} onClose={() => setProblem(null)} onAllow={allowAi} router={router} />

      <AddFoodSheet food={product} day={day} onClose={() => { setProduct(null); releaseLock(); }} onLogged={() => router.back()} />
      <Sheet visible={!!missing && !custom} onClose={() => { setMissing(null); releaseLock(); }} title="Product not found">
        <View style={{ gap: 12 }}>
          <Text v="body" muted>We couldn't find barcode {missing} in our databases. You can add it yourself from the label.</Text>
          <Button title="Create custom food" icon="create-outline" onPress={() => setCustom(true)} />
          <Button title="Scan again" variant="ghost" onPress={() => { setMissing(null); releaseLock(); }} />
        </View>
      </Sheet>
      <CustomFoodSheet visible={custom} onClose={() => { setCustom(false); setMissing(null); releaseLock(); }} onCreated={(f) => { setCustom(false); setMissing(null); setProduct(f); }} />
    </View>
  );
}

function ProblemSheet({ problem, onClose, onAllow, router }: {
  problem: Problem; onClose: () => void; onAllow: () => void; router: ReturnType<typeof useRouter>;
}) {
  const visible = !!problem && problem.kind !== 'generic';
  return (
    <Sheet visible={visible} onClose={onClose} title={problem?.kind === 'upgrade' ? 'Upgrade to scan with AI' : 'Allow AI processing?'}>
      <View style={{ gap: 12 }}>
        <Text v="body" muted>{problem?.message}</Text>
        {problem?.kind === 'upgrade' ? (
          <>
            <Button title="See plans" icon="sparkles" onPress={() => { onClose(); router.push('/paywall'); }} />
            <Button title="Add food manually" variant="ghost" onPress={() => { onClose(); router.replace('/food/search'); }} />
          </>
        ) : (
          <>
            <Text v="caption" faint>Your photo is sent securely to our AI to identify foods. You can turn this off any time in Settings.</Text>
            <Button title="Allow and continue" icon="checkmark" onPress={onAllow} />
            <Button title="Not now" variant="ghost" onPress={onClose} />
          </>
        )}
      </View>
    </Sheet>
  );
}
