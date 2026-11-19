import { create } from 'zustand';
import { todayISO } from './date';

/** Selected calendar day shared by Home, Food and Water so they stay in sync. */
interface DayState { day: string; setDay: (d: string) => void }
export const useDay = create<DayState>((set) => ({ day: todayISO(), setDay: (day) => set({ day }) }));
