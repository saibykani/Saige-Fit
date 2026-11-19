import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ChipGroup, Field, Chip, PressableScale, Reveal, Sheet, Text } from '@/ui';
import { fromISODate, toISODate } from '@/features/common/date';
import { ageFrom, useOnboarding } from './store';
import {
  ACTIVITY, ALLERGY_SUGGESTIONS, COUNTRIES, CUISINES, DAYS, DIETS, EQUIPMENT, EXPERIENCE, GENDERS, GOALS, INJURY_OPTIONS,
  INTOLERANCE_SUGGESTIONS, LANGUAGES, RESTRICTION_SUGGESTIONS, WORKOUT_ENVS, WORKOUT_TIMES, WORK_ROUTINES,
} from './options';
import { ChipInput, ChoiceCard, Group, NumberStepper, StepHeader } from './widgets';

/* ---------- 1. Personal ---------- */
export function StepPersonal() {
  const t = useTheme();
  const { data, set } = useOnboarding();
  const [iosPicker, setIosPicker] = useState(false);
  const age = ageFrom(data.date_of_birth);

  const pickAvatar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!r.canceled && r.assets[0]) set({ avatar_uri: r.assets[0].uri });
  };
  const openDob = () => {
    const cur = data.date_of_birth ? fromISODate(data.date_of_birth) : new Date(2000, 0, 1);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: cur, mode: 'date', maximumDate: new Date(), minimumDate: new Date(1920, 0, 1),
        onChange: (e, d) => { if (e.type === 'set' && d) set({ date_of_birth: toISODate(d) }); },
      });
    } else setIosPicker(true);
  };

  return (
    <View style={{ gap: 22 }}>
      <StepHeader title="Let's get to know you" subtitle="This personalises your calorie and training targets." />
      <Reveal index={0} style={{ alignItems: 'center' }}>
        <PressableScale onPress={pickAvatar} accessibilityRole="button" accessibilityLabel="Choose profile photo">
          <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: t.surface, borderWidth: 2, borderColor: t.accent, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {data.avatar_uri ? <Image source={{ uri: data.avatar_uri }} style={{ width: 104, height: 104 }} contentFit="cover" /> : <Ionicons name="camera-outline" size={34} color={t.accent} />}
          </View>
          <Text v="caption" muted style={{ textAlign: 'center', marginTop: 8 }}>{data.avatar_uri ? 'Change photo' : 'Add photo (optional)'}</Text>
        </PressableScale>
      </Reveal>
      <Reveal index={1}><Field label="Full name" value={data.full_name} onChangeText={(v) => set({ full_name: v })} autoCapitalize="words" autoComplete="name" placeholder="Your name" /></Reveal>
      <Reveal index={2}>
        <Group label="Date of birth">
          <PressableScale onPress={openDob} accessibilityRole="button" accessibilityLabel="Choose date of birth" hapticStyle="select">
            <View style={{ height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text v="bodyStrong" color={data.date_of_birth ? t.text : t.textFaint}>
                {data.date_of_birth ? fromISODate(data.date_of_birth).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Select date'}
              </Text>
              <Text v="caption" accent>{age !== null ? `${age} years` : ''}</Text>
            </View>
          </PressableScale>
        </Group>
      </Reveal>
      <Reveal index={3}>
        <Group label="Gender (used for calorie formulas)">
          <ChipGroup options={GENDERS} value={data.gender} onChange={(v) => set({ gender: v })} />
        </Group>
      </Reveal>
      <Reveal index={4}>
        <Group label="Country">
          <Field value={data.country} onChangeText={(v) => set({ country: v })} placeholder="Where do you live?" autoCapitalize="words" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {COUNTRIES.map((c) => <Chip key={c} label={c} selected={data.country === c} onPress={() => set({ country: c })} />)}
          </View>
        </Group>
      </Reveal>
      <Reveal index={5}>
        <Group label="Preferred language">
          <ChipGroup options={LANGUAGES} value={data.language} onChange={(v) => set({ language: v })} />
        </Group>
      </Reveal>
      <Sheet visible={iosPicker} onClose={() => setIosPicker(false)} title="Date of birth">
        <DateTimePicker value={data.date_of_birth ? fromISODate(data.date_of_birth) : new Date(2000, 0, 1)} mode="date" display="spinner"
          maximumDate={new Date()} minimumDate={new Date(1920, 0, 1)} themeVariant={t.mode as 'dark' | 'light'}
          onChange={(_, d) => { if (d) set({ date_of_birth: toISODate(d) }); }} />
        <View style={{ height: 12 }} />
        <Button title="Done" onPress={() => setIosPicker(false)} />
      </Sheet>
    </View>
  );
}

/* ---------- 2. Body ---------- */
function OptionalStepper({ label, value, onChange, defaultValue, min, max, step, unit, hint }: {
  label: string; value: number | null; onChange: (v: number | null) => void; defaultValue: number; min: number; max: number; step: number; unit: string; hint?: string;
}) {
  if (value === null) {
    return (
      <Card onPress={() => onChange(defaultValue)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong">{label} (optional)</Text>
          {hint ? <Text v="caption" muted>{hint}</Text> : null}
        </View>
        <Ionicons name="add-circle" size={26} color="#9AA3AD" />
      </Card>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <NumberStepper label={label} value={value} onChange={(v) => onChange(v)} min={min} max={max} step={step} unit={unit} decimals={step < 1 ? 1 : 0} />
      <PressableScale onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} style={{ alignSelf: 'flex-end' }}>
        <Text v="caption" muted>Remove</Text>
      </PressableScale>
    </View>
  );
}

export function StepBody() {
  const t = useTheme();
  const { data, set } = useOnboarding();
  const bmi = data.weight_kg / ((data.height_cm / 100) ** 2);
  return (
    <View style={{ gap: 18 }}>
      <StepHeader title="Your measurements" subtitle="Tap a number to type it, or use the buttons." />
      <Reveal index={0}><NumberStepper label="Current weight" value={data.weight_kg} onChange={(v) => set({ weight_kg: v })} min={25} max={400} step={0.5} unit="kg" decimals={1} /></Reveal>
      <Reveal index={1}><NumberStepper label="Height" value={data.height_cm} onChange={(v) => set({ height_cm: v })} min={80} max={250} step={1} unit="cm" /></Reveal>
      <Reveal index={2}><NumberStepper label="Target weight" value={data.target_weight_kg} onChange={(v) => set({ target_weight_kg: v })} min={25} max={400} step={0.5} unit="kg" decimals={1} /></Reveal>
      {Number.isFinite(bmi) && bmi > 5 && bmi < 80 ? (
        <Reveal index={3}>
          <Text v="caption" muted style={{ textAlign: 'center' }}>Quick preview: BMI <Text v="caption" color={t.accent}>{bmi.toFixed(1)}</Text>. Your full summary comes at the end.</Text>
        </Reveal>
      ) : null}
      <Reveal index={4}><OptionalStepper label="Body fat" value={data.body_fat_pct} onChange={(v) => set({ body_fat_pct: v })} defaultValue={20} min={2} max={70} step={0.5} unit="%" hint="Only if you've measured it, we won't guess from photos" /></Reveal>
      <Reveal index={5}><OptionalStepper label="Waist" value={data.waist_cm} onChange={(v) => set({ waist_cm: v })} defaultValue={80} min={30} max={250} step={0.5} unit="cm" hint="Helps track body composition over time" /></Reveal>
    </View>
  );
}

/* ---------- 3. Goals ---------- */
export function StepGoals() {
  const { data, set } = useOnboarding();
  return (
    <View style={{ gap: 12 }}>
      <StepHeader title="What's your main goal?" subtitle="You can change this any time." />
      {GOALS.map((g, i) => (
        <Reveal key={g.value} index={i}><ChoiceCard title={g.title} desc={g.desc} icon={g.icon} selected={data.goal === g.value} onPress={() => set({ goal: g.value })} /></Reveal>
      ))}
    </View>
  );
}

/* ---------- 4. Lifestyle ---------- */
export function StepLifestyle() {
  const { data, set } = useOnboarding();
  return (
    <View style={{ gap: 22 }}>
      <StepHeader title="Your lifestyle" subtitle="So your targets match how you actually live." />
      <Reveal index={0}>
        <Group label="Daily work routine">
          <ChipGroup options={WORK_ROUTINES.map((w) => ({ value: w.value, label: w.label }))} value={data.work_routine}
            onChange={(v: string) => {
              const w = WORK_ROUTINES.find((x) => x.value === v);
              set({ work_routine: v, ...(w && !data.activity_touched ? { activity_level: w.activity } : {}) });
            }} />
        </Group>
      </Reveal>
      <Reveal index={1}>
        <Group label="Overall activity level">
          <View style={{ gap: 10 }}>
            {ACTIVITY.map((a) => <ChoiceCard key={a.value} title={a.title} desc={a.desc} selected={data.activity_level === a.value} onPress={() => set({ activity_level: a.value, activity_touched: true })} />)}
          </View>
        </Group>
      </Reveal>
      <Reveal index={2}><NumberStepper label="Average sleep" value={data.sleep_hours} onChange={(v) => set({ sleep_hours: v })} min={3} max={12} step={0.5} unit="hours" decimals={1} /></Reveal>
      <Reveal index={3}>
        <Group label="Workout experience">
          <View style={{ gap: 10 }}>
            {EXPERIENCE.map((e) => <ChoiceCard key={e.value} title={e.label} desc={e.desc} selected={data.experience === e.value} onPress={() => set({ experience: e.value })} />)}
          </View>
        </Group>
      </Reveal>
      <Reveal index={4}>
        <Group label="Days you can work out">
          <ChipGroup multi options={DAYS.map((d) => ({ value: String(d.value), label: d.label }))} value={data.workout_days.map(String)}
            onChange={(v: string[]) => {
              const days = v.map(Number).sort((a, b) => a - b);
              set({ workout_days: days, training_days: Math.min(data.training_days, Math.max(1, days.length)) });
            }} />
        </Group>
      </Reveal>
      <Reveal index={5}>
        <Group label="Preferred workout time">
          <ChipGroup options={WORKOUT_TIMES} value={data.preferred_workout_time} onChange={(v) => set({ preferred_workout_time: v })} />
        </Group>
      </Reveal>
    </View>
  );
}

/* ---------- 5. Diet ---------- */
export function StepDiet() {
  const { data, set } = useOnboarding();
  return (
    <View style={{ gap: 22 }}>
      <StepHeader title="How do you eat?" subtitle="Meals and suggestions will respect all of this." />
      <Reveal index={0}><Group label="Diet type"><ChipGroup options={DIETS} value={data.diet_type} onChange={(v) => set({ diet_type: v })} /></Group></Reveal>
      <Reveal index={1}><ChipInput label="Food allergies" values={data.allergies} onChange={(v) => set({ allergies: v })} suggestions={ALLERGY_SUGGESTIONS} placeholder="e.g. peanuts" /></Reveal>
      <Reveal index={2}><ChipInput label="Food intolerances" values={data.intolerances} onChange={(v) => set({ intolerances: v })} suggestions={INTOLERANCE_SUGGESTIONS} /></Reveal>
      <Reveal index={3}><ChipInput label="Dietary restrictions" values={data.restrictions} onChange={(v) => set({ restrictions: v })} suggestions={RESTRICTION_SUGGESTIONS} /></Reveal>
      <Reveal index={4}><ChipInput label="Foods you love" values={data.liked_foods} onChange={(v) => set({ liked_foods: v })} placeholder="e.g. paneer, idli" /></Reveal>
      <Reveal index={5}><ChipInput label="Foods you avoid" values={data.disliked_foods} onChange={(v) => set({ disliked_foods: v })} placeholder="e.g. mushroom" /></Reveal>
      <Reveal index={6}>
        <Group label="Preferred cuisines">
          <ChipGroup multi options={CUISINES} value={data.cuisines} onChange={(v) => set({ cuisines: v })} />
        </Group>
      </Reveal>
      <Reveal index={7}><NumberStepper label="Meals per day" value={data.meals_per_day} onChange={(v) => set({ meals_per_day: v })} min={2} max={7} step={1} unit="meals" /></Reveal>
      <Reveal index={8}>
        <View style={{ gap: 6 }}>
          {data.monthly_budget === null ? (
            <Card onPress={() => set({ monthly_budget: 5000 })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><Text v="bodyStrong">Monthly food budget (optional)</Text><Text v="caption" muted>Helps pick affordable meals, in your local currency</Text></View>
              <Ionicons name="add-circle" size={26} color="#9AA3AD" />
            </Card>
          ) : (
            <>
              <NumberStepper label="Monthly food budget" value={data.monthly_budget} onChange={(v) => set({ monthly_budget: v })} min={0} max={1000000} step={500} unit="/ month" />
              <PressableScale onPress={() => set({ monthly_budget: null })} accessibilityRole="button" accessibilityLabel="Remove budget" style={{ alignSelf: 'flex-end' }}><Text v="caption" muted>Remove</Text></PressableScale>
            </>
          )}
        </View>
      </Reveal>
    </View>
  );
}

/* ---------- 6. Workout ---------- */
export function StepWorkout() {
  const { data, set } = useOnboarding();
  const maxDays = Math.max(1, data.workout_days.length);
  return (
    <View style={{ gap: 22 }}>
      <StepHeader title="How do you train?" subtitle="We'll build a weekly plan around your setup." />
      <Reveal index={0}><Group label="Where"><ChipGroup options={WORKOUT_ENVS} value={data.workout_env} onChange={(v) => set({ workout_env: v })} /></Group></Reveal>
      <Reveal index={1}><Group label="Available equipment"><ChipGroup multi options={EQUIPMENT} value={data.equipment} onChange={(v) => set({ equipment: v })} /></Group></Reveal>
      <Reveal index={2}><NumberStepper label="Workout length" value={data.workout_minutes} onChange={(v) => set({ workout_minutes: v })} min={15} max={120} step={5} unit="min" /></Reveal>
      <Reveal index={3}><NumberStepper label={`Training days per week (max ${maxDays})`} value={Math.min(data.training_days, maxDays)} onChange={(v) => set({ training_days: Math.min(v, maxDays) })} min={1} max={maxDays} step={1} unit="days" /></Reveal>
      <Reveal index={4}>
        <Group label="Injuries or limitations (optional)">
          <ChipGroup multi options={INJURY_OPTIONS} value={data.injuries} onChange={(v) => set({ injuries: v })} />
          <Text v="caption" muted>We'll avoid exercises that conflict with these. This isn't medical advice, so check with a professional about any injury.</Text>
        </Group>
      </Reveal>
    </View>
  );
}
