import React from 'react';
import { View } from 'react-native';
import { Card, Reveal, Screen, Text } from '@/ui';

const ITEMS: { title: string; body: string }[] = [
  { title: 'Not medical advice', body: 'Saige Fit gives general fitness and nutrition guidance for healthy adults. It does not diagnose, treat or prevent any condition. Talk to a doctor or registered dietitian before big changes, and if you are pregnant, have a medical condition, take medication or have an eating disorder history.' },
  { title: 'Calorie and macro targets', body: 'Targets use the Mifflin-St Jeor equation and standard activity multipliers. They are estimates. We cap deficits and never go below safe minimums. If you are underweight we do not apply a deficit.' },
  { title: 'Food scanning', body: 'Photos cannot reveal exact portions, oils, or ingredients, so scan results are estimates. Nutrition values come from our food database, not from the AI. Always review and adjust items before saving.' },
  { title: 'Workouts', body: 'Start light, use good form and stop if something hurts. Plans avoid exercises that conflict with the limitations you report, but they are not a substitute for professional guidance. Calories burned are rough estimates.' },
  { title: 'Hydration', body: 'Your water target is an adjustable guide, not a universal medical requirement. Needs vary with climate, activity and health.' },
  { title: 'Progress photos', body: 'Photos are private to you. We do not estimate body fat from photos. Enter a body fat percentage only if you measured it another way.' },
  { title: 'Seek urgent help', body: 'If you feel chest pain, dizziness, fainting, or severe pain, stop exercising and get medical help. If you are struggling with disordered eating, please reach out to a healthcare professional or a local support line.' },
];

export default function About() {
  return (
    <Screen title="Help & disclaimers" subtitle="How Saige Fit works" back tabBar={false}>
      {ITEMS.map((it, i) => (
        <Reveal key={it.title} index={i}>
          <Card><View style={{ gap: 6 }}><Text v="heading">{it.title}</Text><Text v="body" muted>{it.body}</Text></View></Card>
        </Reveal>
      ))}
    </Screen>
  );
}
