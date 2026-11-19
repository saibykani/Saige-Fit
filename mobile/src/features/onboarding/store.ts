import { create } from 'zustand';
import type { Activity, DietType, Experience, Gender, Goal, WorkoutEnv } from './options';

export interface OnboardingData {
  full_name: string;
  date_of_birth: string; // YYYY-MM-DD, '' until chosen
  gender: Gender;
  country: string;
  language: string;
  avatar_uri: string | null;
  height_cm: number;
  weight_kg: number;
  target_weight_kg: number;
  body_fat_pct: number | null;
  waist_cm: number | null;
  goal: Goal | null;
  activity_level: Activity;
  activity_touched: boolean;
  work_routine: string | null; // used only to suggest an activity level; not sent to the server
  sleep_hours: number;
  experience: Experience;
  workout_days: number[];
  preferred_workout_time: string;
  diet_type: DietType;
  allergies: string[];
  intolerances: string[];
  restrictions: string[];
  liked_foods: string[];
  disliked_foods: string[];
  cuisines: string[];
  meals_per_day: number;
  monthly_budget: number | null;
  workout_env: WorkoutEnv;
  equipment: string[];
  workout_minutes: number;
  training_days: number;
  injuries: string[];
  privacy_consent: boolean;
  ai_consent: boolean;
}

export const INITIAL: OnboardingData = {
  full_name: '', date_of_birth: '', gender: 'unspecified', country: '', language: 'en', avatar_uri: null,
  height_cm: 170, weight_kg: 70, target_weight_kg: 68, body_fat_pct: null, waist_cm: null,
  goal: null, activity_level: 'lightly_active', activity_touched: false, work_routine: null, sleep_hours: 7,
  experience: 'beginner', workout_days: [1, 3, 5], preferred_workout_time: '18:00',
  diet_type: 'non_vegetarian', allergies: [], intolerances: [], restrictions: [], liked_foods: [], disliked_foods: [],
  cuisines: ['indian'], meals_per_day: 4, monthly_budget: null,
  workout_env: 'gym', equipment: [], workout_minutes: 45, training_days: 3, injuries: [],
  privacy_consent: false, ai_consent: false,
};

interface OnboardingState {
  step: number; // 0..6
  dir: 1 | -1;
  data: OnboardingData;
  set: (patch: Partial<OnboardingData>) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
}

export const TOTAL_STEPS = 7;

export const useOnboarding = create<OnboardingState>((set) => ({
  step: 0, dir: 1, data: INITIAL,
  set: (patch) => set((s) => ({ data: { ...s.data, ...patch } })),
  next: () => set((s) => ({ step: Math.min(TOTAL_STEPS - 1, s.step + 1), dir: 1 })),
  back: () => set((s) => ({ step: Math.max(0, s.step - 1), dir: -1 })),
  reset: () => set({ step: 0, dir: 1, data: INITIAL }),
}));

export function ageFrom(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

/** Returns an error message if the step's inputs can't be submitted, else null. */
export function validateStep(step: number, d: OnboardingData): string | null {
  switch (step) {
    case 0: {
      if (d.full_name.trim().length < 2) return 'Enter your name.';
      const age = ageFrom(d.date_of_birth);
      if (age === null) return 'Choose your date of birth.';
      if (age < 13 || age > 100) return 'Saige Fit supports ages 13 to 100.';
      return null;
    }
    case 1:
      if (d.weight_kg < 25 || d.weight_kg > 400) return 'Weight must be between 25 and 400 kg.';
      if (d.height_cm < 80 || d.height_cm > 250) return 'Height must be between 80 and 250 cm.';
      if (d.target_weight_kg < 25 || d.target_weight_kg > 400) return 'Target weight must be between 25 and 400 kg.';
      if (d.body_fat_pct !== null && (d.body_fat_pct < 2 || d.body_fat_pct > 70)) return 'Body fat must be between 2% and 70%.';
      if (d.waist_cm !== null && (d.waist_cm < 30 || d.waist_cm > 250)) return 'Waist must be between 30 and 250 cm.';
      return null;
    case 2: return d.goal ? null : 'Pick the goal that fits you best.';
    case 3: return d.workout_days.length === 0 ? 'Choose at least one day you can train.' : null;
    case 4: return d.cuisines.length === 0 ? 'Choose at least one cuisine.' : null;
    case 5: return null;
    default: return null;
  }
}
