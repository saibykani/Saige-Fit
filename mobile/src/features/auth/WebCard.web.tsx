import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Orb } from './AuthShell';
import { injectWebGlobal } from '@/ui/web-global.web';

injectWebGlobal();

/** Web desktop only: centres auth/onboarding content as a card over the gradient backdrop. Phones pass through. */
export function WebCard({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  if (width < 900) return <>{children}</>;
  const h = Math.min(820, Math.max(560, height - 64));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Orb size={520} color={t.accent} top={-180} right={-120} />
      <Orb size={420} color={t.accent2} bottom={-160} left={-100} delay={900} />
      <View style={{ width: '100%', maxWidth: 480, height: h, borderRadius: 28, overflow: 'hidden', backgroundColor: t.bgElevated, borderWidth: 1, borderColor: t.border,
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        {children}
      </View>
    </View>
  );
}
