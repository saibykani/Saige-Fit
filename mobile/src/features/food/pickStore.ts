import { create } from 'zustand';
import type { FoodSummary } from '@/features/common/types';

/** Hand-off between the search screen (mode=pick) and whoever opened it (e.g. scan results). */
export interface Picked { target: string; food: FoodSummary; grams: number }
interface PickState { picked: Picked | null; setPicked: (p: Picked | null) => void }
export const usePick = create<PickState>((set) => ({ picked: null, setPicked: (picked) => set({ picked }) }));
