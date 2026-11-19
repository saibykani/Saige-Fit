export const GOALS = [
  { value: 'weight_loss', label: 'Weight loss' },
  { value: 'fat_loss', label: 'Fat loss' },
  { value: 'muscle_gain', label: 'Muscle gain' },
  { value: 'lean_muscle', label: 'Lean muscle' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'strength', label: 'Strength' },
  { value: 'general_fitness', label: 'General fitness' },
  { value: 'recomposition', label: 'Recomposition' },
];
export const ACTIVITY = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'lightly_active', label: 'Lightly active' },
  { value: 'moderately_active', label: 'Moderately active' },
  { value: 'very_active', label: 'Very active' },
  { value: 'extremely_active', label: 'Extremely active' },
];
export const EXPERIENCE = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
export const WORKOUT_ENV = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'gym_home', label: 'Gym + home' },
];
export const DIET_TYPES = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'non_vegetarian', label: 'Non-vegetarian' },
  { value: 'pescatarian', label: 'Pescatarian' },
];
export const goalLabel = (v?: string | null) => GOALS.find((g) => g.value === v)?.label ?? 'Set a goal';

export const FEATURE_LABELS: Record<string, string> = {
  manual_food_log: 'Manual food logging',
  basic_workout_plan: 'Basic workout planner',
  basic_progress: 'Basic progress tracking',
  ai_food_scan: 'AI food scanning',
  ai_meal_suggestions: 'AI meal suggestions & diet plans',
  personalized_workouts: 'Personalized workout schedules',
  advanced_analytics: 'Advanced analytics',
  ai_assistant: 'AI fitness assistant',
  advanced_coaching: 'Advanced AI coaching',
  weekly_ai_report: 'Personalized weekly reports',
  nutrition_insights: 'Advanced nutrition insights',
  workout_analytics: 'Detailed workout analytics',
};
