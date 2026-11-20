import React, { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Text } from '@/ui';

// Web only. Shows a "Get the Android app" dialog when an APK is hosted.
// Set EXPO_PUBLIC_APK_URL to the APK's address, or put the file at /saige-fit.apk on this site.
const APK_URL = process.env.EXPO_PUBLIC_APK_URL || '/saige-fit.apk';
const KEY = 'saigefit.apkPrompt.dismissed';

const store = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };

export function ApkPrompt() {
  const t = useTheme();
  const [show, setShow] = useState(false);
  const [mb, setMb] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (store()?.getItem(KEY)) return;
    let alive = true;
    // The single-page site answers unknown paths with HTML, so only show the dialog for a real APK file.
    fetch(APK_URL, { method: 'HEAD' }).then((r) => {
      const type = r.headers.get('content-type') ?? '';
      const len = Number(r.headers.get('content-length') ?? 0);
      if (alive && r.ok && !type.includes('text/html')) {
        if (len > 0) setMb((len / 1048576).toFixed(0));
        setShow(true);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!show) return null;
  const close = () => { try { store()?.setItem(KEY, '1'); } catch { /* ignore */ } setShow(false); };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
      <View style={{ width: '100%', maxWidth: 380, backgroundColor: t.surface ?? '#14161A', borderRadius: 24, padding: 24, gap: 14, borderWidth: 1, borderColor: t.border ?? '#262A30' }}>
        <Text v="title">Get the Saige Fit Android app</Text>
        <Text v="body" muted>Install the app on your phone for the full experience{mb ? ` (${mb} MB)` : ''}. Open the downloaded file and allow installs from this source if Android asks.</Text>
        <Button title="Download APK" icon="download-outline" onPress={() => Linking.openURL(APK_URL)} />
        <Button title="Not now" variant="ghost" onPress={close} />
      </View>
    </View>
  );
}
