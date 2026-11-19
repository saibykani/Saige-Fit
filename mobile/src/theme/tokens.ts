// Design tokens. Dark-first "Obsidian + Volt" palette; light theme shares the same shape.
export const palette = {
  accent: '#C6FF3D', // volt lime
  accentDim: '#9BDB1F',
  accent2: '#3DFFB5', // mint, used in gradients
  protein: '#FF6B8B',
  carbs: '#5CC8FF',
  fat: '#FFC24B',
  fiber: '#B58CFF',
  water: '#4DA8FF',
  danger: '#FF5C5C',
  warn: '#FFB020',
  success: '#3DDC84',
} as const;

export const darkTheme = {
  mode: 'dark' as 'dark' | 'light',
  bg: '#07080A',
  bgElevated: '#0E1013',
  surface: '#14161A',
  surfaceAlt: '#1C1F24',
  glass: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.09)',
  text: '#FFFFFF',
  textMuted: '#9AA3AD',
  textFaint: '#5E6670',
  onAccent: '#07080A',
  ...palette,
};

export const lightTheme = {
  ...darkTheme,
  mode: 'light' as 'dark' | 'light',
  bg: '#F4F6F1',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEFE8',
  glass: 'rgba(0,0,0,0.04)',
  border: 'rgba(0,0,0,0.08)',
  text: '#0B0D0F',
  textMuted: '#59626B',
  textFaint: '#98A0A8',
  accent: '#4F9A00',
  accentDim: '#3E7B00',
  accent2: '#00A878',
  onAccent: '#FFFFFF',
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] };
export type Theme = Widen<typeof darkTheme>;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
} as const;

// kept for older screens
export const font = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
};

export const spring = { damping: 16, stiffness: 220, mass: 0.7 } as const;
