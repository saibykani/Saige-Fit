import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

type Variant = 'hero' | 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'number';

const VARIANTS: Record<Variant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 44, letterSpacing: -1.2, lineHeight: 48 },
  display: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.8, lineHeight: 36 },
  title: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.semibold, fontSize: 17 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15 },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, letterSpacing: 0.1 },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  number: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.5 },
};

export function Text({ v = 'body', muted, faint, accent, color, style, ...rest }: TextProps & {
  v?: Variant; muted?: boolean; faint?: boolean; accent?: boolean; color?: string;
}) {
  const t = useTheme();
  const c = color ?? (accent ? t.accent : faint ? t.textFaint : muted ? t.textMuted : t.text);
  return <RNText {...rest} style={[VARIANTS[v], { color: c }, style]} />;
}
