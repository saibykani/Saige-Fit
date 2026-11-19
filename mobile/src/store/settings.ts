import { create } from 'zustand';

type ThemePref = 'dark' | 'light' | 'system';

interface SettingsState {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
}));
