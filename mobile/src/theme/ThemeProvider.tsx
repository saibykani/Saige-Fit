import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/settings';
import { darkTheme, lightTheme, Theme } from './tokens';

const Ctx = createContext<Theme>(darkTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const pref = useSettings((s) => s.theme); // 'dark' | 'light' | 'system'
  const theme = useMemo(() => {
    const mode = pref === 'system' ? system ?? 'dark' : pref;
    return mode === 'light' ? lightTheme : darkTheme;
  }, [pref, system]);
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
