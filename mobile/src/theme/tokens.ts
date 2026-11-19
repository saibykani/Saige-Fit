// Design tokens. Dark-first; light theme shares the same shape.
export const palette = {
  accent: '#B6FF3B', // electric lime
  accentDim: '#8BD11F',
  protein: '#FF6B8B',
  carbs: '#5CC8FF',
  fat: '#FFC24B',
  fiber: '#B58CFF',
  water: '#4DA8FF',
  danger: '#FF5C5C',
} as const;

export const darkTheme = {
  mode: 'dark' as 'dark' | 'light',
  bg: '#0B0B0D',
  surface: '#16171A',
  surfaceAlt: '#1F2125',
  border: '#2A2C31',
  text: '#FFFFFF',
  textMuted: '#9AA0A6',
  onAccent: '#0B0B0D',
  ...palette,
};

export const lightTheme = {
  ...darkTheme,
  mode: 'light' as 'dark' | 'light',
  bg: '#F6F7F4',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEEE8',
  border: '#DDE0D8',
  text: '#0B0B0D',
  textMuted: '#5F656B',
  accent: '#5FA800', // darker lime keeps contrast on light backgrounds
  accentDim: '#4A8500',
  onAccent: '#FFFFFF',
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] };
export type Theme = Widen<typeof darkTheme>;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const font = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
};
