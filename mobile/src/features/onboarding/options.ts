import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type Goal = 'weight_loss' | 'fat_loss' | 'muscle_gain' | 'lean_muscle' | 'maintenance' | 'strength' | 'general_fitness' | 'recomposition';
export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export type Activity = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type WorkoutEnv = 'gym' | 'home' | 'outdoor' | 'gym_home';
export type DietType = 'vegetarian' | 'vegan' | 'eggetarian' | 'non_vegetarian' | 'pescatarian';

export const GOALS: { value: Goal; title: string; desc: string; icon: IconName }[] = [
  { value: 'weight_loss', title: 'Weight loss', desc: 'Lose weight at a steady, sustainable pace', icon: 'trending-down' },
  { value: 'fat_loss', title: 'Fat loss', desc: 'Lose fat while protecting muscle', icon: 'flame' },
  { value: 'muscle_gain', title: 'Muscle gain', desc: 'Build size with a calorie surplus', icon: 'barbell' },
  { value: 'lean_muscle', title: 'Lean muscle', desc: 'Add muscle with minimal fat gain', icon: 'body' },
  { value: 'maintenance', title: 'Maintain weight', desc: 'Stay where you are and feel great', icon: 'swap-horizontal' },
  { value: 'strength', title: 'Strength', desc: 'Get stronger on the big lifts', icon: 'fitness' },
  { value: 'general_fitness', title: 'General fitness', desc: 'Move better, more energy, healthier habits', icon: 'heart' },
  { value: 'recomposition', title: 'Body recomposition', desc: 'Lose fat and gain muscle together', icon: 'sync' },
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' }, { value: 'unspecified', label: 'Prefer not to say' },
];

export const ACTIVITY: { value: Activity; title: string; desc: string }[] = [
  { value: 'sedentary', title: 'Sedentary', desc: 'Mostly sitting, little exercise' },
  { value: 'lightly_active', title: 'Lightly active', desc: 'Light exercise 1-3 days/week' },
  { value: 'moderately_active', title: 'Moderately active', desc: 'Exercise 3-5 days/week' },
  { value: 'very_active', title: 'Very active', desc: 'Hard exercise 6-7 days/week' },
  { value: 'extremely_active', title: 'Extremely active', desc: 'Athlete or physical job plus training' },
];

export const WORK_ROUTINES: { value: string; label: string; activity: Activity }[] = [
  { value: 'desk', label: 'Desk job', activity: 'sedentary' },
  { value: 'mixed', label: 'Mix of sitting and moving', activity: 'lightly_active' },
  { value: 'on_feet', label: 'On my feet', activity: 'moderately_active' },
  { value: 'physical', label: 'Physical labour', activity: 'very_active' },
];

export const EXPERIENCE: { value: Experience; label: string; desc: string }[] = [
  { value: 'beginner', label: 'Beginner', desc: 'New or returning, under 6 months' },
  { value: 'intermediate', label: 'Intermediate', desc: '6 months to 2 years of consistent training' },
  { value: 'advanced', label: 'Advanced', desc: '2+ years, comfortable with heavy compound lifts' },
];

export const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 7, label: 'Sun' },
];

export const WORKOUT_TIMES: { value: string; label: string }[] = [
  { value: '06:00', label: 'Early morning' }, { value: '09:00', label: 'Morning' }, { value: '14:00', label: 'Afternoon' },
  { value: '18:00', label: 'Evening' }, { value: '20:30', label: 'Night' },
];

export const DIETS: { value: DietType; label: string; icon: IconName }[] = [
  { value: 'non_vegetarian', label: 'Non-vegetarian', icon: 'restaurant' },
  { value: 'vegetarian', label: 'Vegetarian', icon: 'leaf' },
  { value: 'vegan', label: 'Vegan', icon: 'flower' },
  { value: 'eggetarian', label: 'Eggetarian', icon: 'egg' },
  { value: 'pescatarian', label: 'Pescatarian', icon: 'fish' },
];

export const CUISINES = [
  { value: 'indian', label: 'Indian' }, { value: 'asian', label: 'Asian' },
  { value: 'mediterranean', label: 'Mediterranean' }, { value: 'international', label: 'International' },
];

export const ALLERGY_SUGGESTIONS = ['peanuts', 'tree_nuts', 'milk', 'egg', 'gluten', 'soy', 'fish', 'shellfish', 'sesame'];
export const INTOLERANCE_SUGGESTIONS = ['lactose', 'gluten', 'fructose', 'caffeine'];
export const RESTRICTION_SUGGESTIONS = ['no onion/garlic', 'halal', 'jain', 'low sodium', 'low sugar'];

export const EQUIPMENT: { value: string; label: string }[] = [
  { value: 'bodyweight', label: 'Bodyweight' }, { value: 'dumbbells', label: 'Dumbbells' }, { value: 'barbell', label: 'Barbell' },
  { value: 'machines', label: 'Machines' }, { value: 'cables', label: 'Cables' }, { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'resistance_bands', label: 'Resistance bands' }, { value: 'pull_up_bar', label: 'Pull-up bar' }, { value: 'bench', label: 'Bench' },
];

export const INJURY_OPTIONS: { value: string; label: string }[] = [
  { value: 'knee', label: 'Knee' }, { value: 'lower_back', label: 'Lower back' }, { value: 'shoulder', label: 'Shoulder' },
  { value: 'wrist', label: 'Wrist' }, { value: 'elbow', label: 'Elbow' }, { value: 'neck', label: 'Neck' }, { value: 'ankle', label: 'Ankle' }, { value: 'hip', label: 'Hip' },
];

export const WORKOUT_ENVS: { value: WorkoutEnv; label: string; icon: IconName }[] = [
  { value: 'gym', label: 'Gym', icon: 'barbell' }, { value: 'home', label: 'Home', icon: 'home' },
  { value: 'outdoor', label: 'Outdoor', icon: 'trail-sign' }, { value: 'gym_home', label: 'Gym + Home', icon: 'swap-horizontal' },
];

export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }, { value: 'te', label: 'తెలుగు' },
  { value: 'ta', label: 'தமிழ்' }, { value: 'es', label: 'Español' },
];

export const COUNTRIES = ['India', 'United States', 'United Kingdom', 'UAE', 'Singapore', 'Australia', 'Canada', 'Germany'];
