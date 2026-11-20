// Compact demo datasets: foods (per 100 g) and recipes. Recipe nutrition is computed from foods, never typed twice.
export type DietTag = 'vegetarian' | 'vegan' | 'eggetarian' | 'non_vegetarian' | 'pescatarian';
// id, name, serving label, serving g, kcal, protein, carbs, fat, fiber, category, diet tags, allergens
type F = [string, string, string, number, number, number, number, number, number, string, DietTag[], string[]];
const V: DietTag[] = ['vegetarian', 'eggetarian', 'pescatarian', 'non_vegetarian'];
const VG: DietTag[] = ['vegan', 'vegetarian', 'eggetarian', 'pescatarian', 'non_vegetarian'];
const EG: DietTag[] = ['eggetarian', 'non_vegetarian'];
const NV: DietTag[] = ['non_vegetarian'];
const PS: DietTag[] = ['pescatarian', 'non_vegetarian'];

const RAW: F[] = [
  ['f_roti', 'Roti (whole wheat chapati)', '1 roti', 40, 297, 9.8, 51, 6.7, 7.4, 'Grains', VG, ['gluten']],
  ['f_rice', 'Cooked white rice', '1 katori', 150, 130, 2.7, 28, 0.3, 0.4, 'Grains', VG, []],
  ['f_brownrice', 'Cooked brown rice', '1 katori', 150, 123, 2.7, 25.6, 1, 1.8, 'Grains', VG, []],
  ['f_oats', 'Rolled oats (dry)', '1/2 cup', 40, 379, 13, 67, 6.5, 10, 'Grains', VG, ['gluten']],
  ['f_poha', 'Poha (cooked)', '1 plate', 180, 130, 2.6, 24, 2.6, 1.5, 'Grains', VG, []],
  ['f_upma', 'Upma', '1 plate', 200, 120, 3, 19, 3.5, 1.8, 'Grains', V, ['gluten']],
  ['f_idli', 'Idli', '1 idli', 40, 130, 4, 26, 0.6, 1, 'Grains', VG, []],
  ['f_dosa', 'Plain dosa', '1 dosa', 90, 168, 3.9, 29, 3.7, 1.2, 'Grains', VG, []],
  ['f_paratha', 'Aloo paratha', '1 paratha', 100, 260, 5.5, 36, 10, 3, 'Grains', V, ['gluten']],
  ['f_bread', 'Whole wheat bread', '1 slice', 30, 247, 13, 41, 3.4, 7, 'Grains', VG, ['gluten']],
  ['f_dal', 'Toor dal (cooked)', '1 katori', 150, 116, 6.8, 18, 1.8, 4.5, 'Pulses', VG, []],
  ['f_moong', 'Moong dal (cooked)', '1 katori', 150, 105, 7, 19, 0.4, 7.6, 'Pulses', VG, []],
  ['f_rajma', 'Rajma (cooked)', '1 katori', 150, 127, 8.7, 22.8, 0.5, 6.4, 'Pulses', VG, []],
  ['f_chana', 'Chole / chickpeas (cooked)', '1 katori', 150, 164, 8.9, 27, 2.6, 7.6, 'Pulses', VG, []],
  ['f_sambar', 'Sambar', '1 katori', 150, 55, 2.8, 8, 1.4, 2, 'Pulses', VG, []],
  ['f_paneer', 'Paneer', '100 g', 100, 265, 18, 1.2, 20.8, 0, 'Dairy', V, ['milk']],
  ['f_curd', 'Curd / dahi (whole milk)', '1 katori', 150, 61, 3.5, 4.7, 3.3, 0, 'Dairy', V, ['milk']],
  ['f_milk', 'Milk (toned)', '1 glass', 250, 58, 3.1, 4.7, 3.1, 0, 'Dairy', V, ['milk']],
  ['f_greekyog', 'Greek yogurt (plain)', '1 cup', 170, 59, 10, 3.6, 0.4, 0, 'Dairy', V, ['milk']],
  ['f_ghee', 'Ghee', '1 tsp', 5, 900, 0, 0, 100, 0, 'Fats', V, ['milk']],
  ['f_whey', 'Whey protein powder', '1 scoop', 30, 400, 80, 8, 6, 0, 'Supplements', V, ['milk']],
  ['f_egg', 'Egg (boiled)', '1 egg', 50, 155, 12.6, 1.1, 10.6, 0, 'Protein', EG, ['egg']],
  ['f_omelette', 'Masala omelette', '2 eggs', 120, 160, 10.5, 2.5, 12, 0.4, 'Protein', EG, ['egg']],
  ['f_chicken', 'Chicken breast (cooked)', '100 g', 100, 165, 31, 0, 3.6, 0, 'Protein', NV, []],
  ['f_chickencurry', 'Chicken curry', '1 katori', 150, 150, 14, 5, 8, 1, 'Protein', NV, []],
  ['f_fish', 'Fish curry (rohu)', '1 katori', 150, 120, 14, 3, 5.5, 0.5, 'Protein', PS, ['fish']],
  ['f_tofu', 'Tofu (firm)', '100 g', 100, 144, 17, 3, 8.7, 2.3, 'Protein', VG, ['soy']],
  ['f_sprouts', 'Sprouts salad', '1 bowl', 100, 90, 7, 14, 0.6, 4, 'Pulses', VG, []],
  ['f_alugobi', 'Aloo gobi', '1 katori', 150, 95, 2.4, 11, 4.8, 2.6, 'Vegetables', VG, []],
  ['f_palak', 'Palak (spinach, cooked)', '1 katori', 100, 41, 4, 4.3, 1.4, 2.4, 'Vegetables', VG, []],
  ['f_salad', 'Cucumber tomato salad', '1 bowl', 120, 20, 0.9, 4, 0.2, 1.2, 'Vegetables', VG, []],
  ['f_broccoli', 'Broccoli (steamed)', '1 cup', 90, 35, 2.4, 7, 0.4, 3.3, 'Vegetables', VG, []],
  ['f_sweetpot', 'Sweet potato (boiled)', '1 medium', 130, 86, 1.6, 20, 0.1, 3, 'Vegetables', VG, []],
  ['f_banana', 'Banana', '1 medium', 118, 89, 1.1, 23, 0.3, 2.6, 'Fruit', VG, []],
  ['f_apple', 'Apple', '1 medium', 180, 52, 0.3, 14, 0.2, 2.4, 'Fruit', VG, []],
  ['f_mango', 'Mango', '1 cup', 165, 60, 0.8, 15, 0.4, 1.6, 'Fruit', VG, []],
  ['f_almond', 'Almonds', '10 nuts', 12, 579, 21, 22, 50, 12.5, 'Nuts', VG, ['tree nuts']],
  ['f_pbutter', 'Peanut butter', '1 tbsp', 16, 588, 25, 20, 50, 6, 'Nuts', VG, ['peanuts']],
  ['f_peanuts', 'Roasted peanuts', '1 handful', 30, 585, 24, 21, 49, 8, 'Nuts', VG, ['peanuts']],
  ['f_biryani', 'Veg biryani', '1 plate', 250, 150, 3.5, 24, 4.5, 2, 'Mains', V, []],
  ['f_chbiryani', 'Chicken biryani', '1 plate', 300, 170, 9, 21, 5.5, 1, 'Mains', NV, []],
  ['f_khichdi', 'Dal khichdi', '1 bowl', 250, 110, 4.5, 19, 1.8, 2, 'Mains', VG, []],
  ['f_samosa', 'Samosa', '1 piece', 60, 262, 4.5, 28, 14, 2, 'Snacks', VG, ['gluten']],
  ['f_chai', 'Masala chai (with sugar)', '1 cup', 150, 50, 1.5, 7.5, 1.8, 0, 'Drinks', V, ['milk']],
  ['f_buttermilk', 'Chaas (buttermilk)', '1 glass', 250, 25, 1.5, 3, 0.8, 0, 'Drinks', V, ['milk']],
  ['f_coconutw', 'Coconut water', '1 glass', 240, 19, 0.7, 3.7, 0.2, 1.1, 'Drinks', VG, []],
  ['f_dark', 'Dark chocolate (70%)', '2 squares', 20, 598, 7.8, 46, 43, 11, 'Snacks', V, ['milk']],
];

export interface DemoFood {
  id: string; name: string; brand: string | null; serving_label: string; grams_per_unit: number; default_serving_g: number;
  allergens: string[]; diet_tags: string[]; category: string; custom?: boolean;
  food_nutrition: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sat_fat_g: number | null; sugar_g: number | null; sodium_mg: number | null };
}
export const mkFood = (id: string, name: string, serving_label: string, g: number, kcal: number, p: number, c: number, f: number, fi: number,
  category: string, diet_tags: string[], allergens: string[]): DemoFood => ({
  id, name, brand: null, serving_label, grams_per_unit: g, default_serving_g: g, allergens, diet_tags, category,
  food_nutrition: { kcal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: fi, sat_fat_g: null, sugar_g: null, sodium_mg: null },
});
export const FOODS: DemoFood[] = RAW.map((r) => mkFood(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11]));
export const FOOD_BY_ID: Record<string, DemoFood> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// A small "USDA" set (shape-compatible, imported on demand into the local food list).
export const USDA: (DemoFood & { fdc_id: number })[] = [
  { ...mkFood('usda_168874', 'Chicken thigh, roasted (USDA)', '100 g', 100, 209, 26, 0, 10.9, 0, 'Protein', ['non_vegetarian'], []), fdc_id: 168874 },
  { ...mkFood('usda_170567', 'Almond milk, unsweetened (USDA)', '1 cup', 240, 15, 0.6, 0.6, 1.2, 0.3, 'Drinks', ['vegan'], ['tree nuts']), fdc_id: 170567 },
  { ...mkFood('usda_171688', 'Apple, raw with skin (USDA)', '1 medium', 182, 52, 0.3, 13.8, 0.2, 2.4, 'Fruit', ['vegan'], []), fdc_id: 171688 },
  { ...mkFood('usda_173944', 'Salmon, Atlantic, cooked (USDA)', '100 g', 100, 206, 22, 0, 12.4, 0, 'Protein', ['pescatarian'], ['fish']), fdc_id: 173944 },
  { ...mkFood('usda_175167', 'Egg, whole, cooked (USDA)', '1 large', 50, 155, 13, 1.1, 11, 0, 'Protein', ['eggetarian'], ['egg']), fdc_id: 175167 },
  { ...mkFood('usda_169704', 'Quinoa, cooked (USDA)', '1 cup', 185, 120, 4.4, 21.3, 1.9, 2.8, 'Grains', ['vegan'], []), fdc_id: 169704 },
];

export const BARCODES: Record<string, string> = { '8901058852257': 'f_oats', '8901030895562': 'f_whey', '8901262150170': 'f_peanuts', '8906002470031': 'f_buttermilk' };

export interface DemoRecipe {
  id: string; name: string; description: string; servings: number; prep_minutes: number; diet_tags: string[];
  ingredients: { food_id: string; grams: number }[]; steps: string[];
}
const R = (id: string, name: string, description: string, prep_minutes: number, diet_tags: DietTag[], ingredients: [string, number][], steps: string[], servings = 1): DemoRecipe =>
  ({ id, name, description, servings, prep_minutes, diet_tags, ingredients: ingredients.map(([food_id, grams]) => ({ food_id, grams })), steps });

export const RECIPES: DemoRecipe[] = [
  R('r_poha', 'Vegetable Poha', 'Light, quick Indian breakfast with peanuts and curry leaves.', 15, VG, [['f_poha', 200], ['f_peanuts', 15], ['f_curd', 100]], ['Rinse the flattened rice and drain.', 'Temper mustard seeds, curry leaves and chopped vegetables.', 'Fold in poha, turmeric and salt; steam 2 minutes.', 'Top with peanuts and serve with curd.']),
  R('r_oats', 'Banana Peanut Butter Oats', 'Creamy oats with banana and a spoon of peanut butter.', 10, V, [['f_oats', 50], ['f_milk', 200], ['f_banana', 100], ['f_pbutter', 16]], ['Simmer oats in milk for 5 minutes.', 'Slice banana on top.', 'Swirl in peanut butter and serve warm.']),
  R('r_omelette', 'Masala Omelette with Toast', 'High-protein egg breakfast with onion, chilli and coriander.', 10, EG, [['f_omelette', 120], ['f_bread', 60]], ['Whisk eggs with onion, green chilli, coriander and salt.', 'Cook in a lightly oiled pan until set.', 'Serve with toasted whole wheat bread.']),
  R('r_idli', 'Idli Sambar', 'Steamed rice-lentil cakes with a hearty vegetable sambar.', 20, VG, [['f_idli', 160], ['f_sambar', 200]], ['Steam idli batter for 12 minutes.', 'Simmer sambar with vegetables and tamarind.', 'Serve hot together.']),
  R('r_dalrice', 'Dal Tadka with Rice', 'Comfort-food staple: yellow dal, ghee tadka and steamed rice.', 30, VG, [['f_dal', 200], ['f_rice', 180], ['f_ghee', 5], ['f_salad', 100]], ['Pressure cook toor dal until soft.', 'Temper cumin, garlic and chilli in ghee.', 'Pour over dal; serve with rice and salad.']),
  R('r_paneerroti', 'Palak Paneer with Roti', 'Protein-rich spinach gravy with cubes of paneer.', 30, V, [['f_palak', 150], ['f_paneer', 80], ['f_roti', 80]], ['Blanch and blend spinach.', 'Saute onion, tomato and spices; add puree.', 'Add paneer cubes and simmer 5 minutes.', 'Serve with hot rotis.']),
  R('r_chicken', 'Grilled Chicken Rice Bowl', 'Lean chicken breast with brown rice and steamed broccoli.', 25, NV, [['f_chicken', 150], ['f_brownrice', 180], ['f_broccoli', 100]], ['Marinate chicken in curd, turmeric and pepper.', 'Grill 6 minutes per side.', 'Assemble over rice with steamed broccoli.']),
  R('r_chickencurry', 'Home-style Chicken Curry', 'Light onion-tomato curry, great with roti.', 40, NV, [['f_chickencurry', 250], ['f_roti', 80], ['f_salad', 100]], ['Brown onions, add ginger-garlic and spices.', 'Add chicken and tomatoes; cook covered 25 minutes.', 'Garnish with coriander.']),
  R('r_fish', 'Fish Curry with Rice', 'Coastal-style fish curry with omega-3 rich rohu.', 35, PS, [['f_fish', 250], ['f_rice', 150]], ['Marinate fish with turmeric and salt.', 'Simmer in a coconut-tomato masala 12 minutes.', 'Serve with rice.']),
  R('r_rajma', 'Rajma Chawal Bowl', 'Slow-simmered kidney beans over brown rice.', 40, VG, [['f_rajma', 200], ['f_brownrice', 150], ['f_curd', 100]], ['Soak and pressure cook rajma.', 'Simmer in onion-tomato masala for 15 minutes.', 'Serve over rice with curd.']),
  R('r_chole', 'Chole with Roti', 'Spiced chickpea curry, high fibre and filling.', 35, VG, [['f_chana', 200], ['f_roti', 80], ['f_salad', 100]], ['Cook soaked chickpeas until tender.', 'Simmer with chole masala, tomato and onion.', 'Serve with rotis and salad.']),
  R('r_khichdi', 'Moong Dal Khichdi', 'Gentle one-pot meal with ghee, easy to digest.', 25, V, [['f_khichdi', 300], ['f_curd', 100]], ['Cook rice and moong dal together with turmeric.', 'Finish with a ghee-cumin tadka.', 'Serve with curd.']),
  R('r_tofu', 'Tofu Veggie Stir-fry', 'Vegan high-protein stir-fry with broccoli over brown rice.', 20, VG, [['f_tofu', 150], ['f_broccoli', 120], ['f_brownrice', 150]], ['Press and cube tofu; pan-fry until golden.', 'Stir-fry broccoli with garlic and soy.', 'Combine and serve over rice.']),
  R('r_smoothie', 'Protein Banana Smoothie', 'Post-workout shake with whey, banana and milk.', 5, V, [['f_whey', 30], ['f_banana', 118], ['f_milk', 250]], ['Blend everything with ice until smooth.', 'Serve immediately.']),
  R('r_sprouts', 'Sprouts Chaat', 'Crunchy, fibre-rich snack with lemon and chaat masala.', 10, VG, [['f_sprouts', 150], ['f_salad', 80]], ['Toss sprouts with chopped onion, tomato and cucumber.', 'Season with lemon, chaat masala and coriander.']),
  R('r_yogurt', 'Greek Yogurt Fruit Bowl', 'Protein-packed snack with fruit and almonds.', 5, V, [['f_greekyog', 170], ['f_apple', 90], ['f_almond', 12]], ['Spoon yogurt into a bowl.', 'Top with chopped apple and almonds.']),
];
