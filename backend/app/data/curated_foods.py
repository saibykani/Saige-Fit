"""Curated common foods, values per 100 g of the food as typically eaten (cooked/prepared).

These are approximate reference values compiled from typical published composition data
(IFCT / USDA ranges) and are meant as sensible defaults. Real recipes vary; the app labels
every figure as an estimate and lets users edit portions and add custom foods. Before launch,
replace/extend with licensed IFCT + USDA FoodData Central imports (see docs).

Diet code: V=vegan, VG=vegetarian (dairy), E=contains egg, F=fish, N=meat/poultry.
Columns: name, cuisine, diet, allergens, kcal, protein, carbs, fat, sat, fiber, sugar, sodium_mg,
         default_serving_g, serving_label, grams_per_unit
"""

DIET_TAGS = {
    "V": ["vegan", "vegetarian", "eggetarian", "non_vegetarian", "pescatarian"],
    "VG": ["vegetarian", "eggetarian", "non_vegetarian", "pescatarian"],
    "E": ["eggetarian", "non_vegetarian", "pescatarian"],
    "F": ["non_vegetarian", "pescatarian"],
    "N": ["non_vegetarian"],
}

FOODS = [
    # name, cuisine, diet, allergens, kcal, P, C, F, sat, fiber, sugar, Na, serving_g, label, g_per_unit
    ("Idli", "indian", "V", [], 130, 3.9, 27, 0.4, 0.1, 1.0, 0.5, 150, 80, "2 idlis", 40),
    ("Plain dosa", "indian", "V", [], 168, 3.9, 29, 3.7, 0.6, 1.5, 0.8, 200, 80, "1 dosa", 80),
    ("Upma", "indian", "V", ["gluten"], 150, 3.5, 22, 5.5, 1.0, 2.0, 1.5, 300, 200, "1 katori", 200),
    ("Poha", "indian", "V", [], 130, 2.6, 25, 2.5, 0.5, 1.5, 1.5, 250, 150, "1 plate", 150),
    ("Pesarattu", "indian", "V", [], 160, 7, 22, 4.5, 0.8, 3.0, 1.0, 220, 100, "1 pesarattu", 100),
    ("Pongal", "indian", "VG", ["milk"], 150, 4, 24, 4, 1.8, 1.5, 0.5, 280, 200, "1 katori", 200),
    ("Aloo paratha", "indian", "VG", ["gluten", "milk"], 260, 5.5, 36, 10.5, 4.5, 3.0, 1.5, 380, 90, "1 paratha", 90),
    ("Oats porridge (cooked in water)", "international", "V", ["gluten"], 71, 2.5, 12, 1.5, 0.3, 1.7, 0.3, 4, 250, "1 bowl", 250),
    ("Cooked white rice", "indian", "V", [], 130, 2.7, 28, 0.3, 0.1, 0.4, 0.1, 1, 150, "1 katori", 150),
    ("Roti / chapati", "indian", "V", ["gluten"], 297, 9.6, 50, 7.5, 1.3, 7.0, 1.5, 250, 40, "1 roti", 40),
    ("Dal (toor, cooked with tadka)", "indian", "V", [], 116, 6.8, 15, 3.2, 0.6, 4.0, 1.5, 300, 150, "1 katori", 150),
    ("Sambar", "indian", "V", [], 60, 2.8, 8, 1.8, 0.4, 2.5, 2.0, 350, 200, "1 katori", 200),
    ("Rasam", "indian", "V", [], 25, 0.8, 4, 0.6, 0.1, 0.8, 1.2, 300, 200, "1 katori", 200),
    ("Paneer", "indian", "VG", ["milk"], 296, 18, 3.4, 23, 14, 0, 2.0, 22, 100, "100 g", 100),
    ("Chicken curry", "indian", "N", [], 150, 14, 4, 8.5, 2.2, 1.0, 1.5, 420, 150, "1 katori", 150),
    ("Fish curry", "indian", "F", ["fish"], 120, 13, 3, 6, 1.2, 0.8, 1.0, 400, 150, "1 katori", 150),
    ("Mixed vegetable curry", "indian", "V", [], 90, 2.5, 9, 5, 0.8, 3.0, 3.0, 330, 150, "1 katori", 150),
    ("Curd / dahi (whole milk)", "indian", "VG", ["milk"], 61, 3.5, 4.7, 3.3, 2.1, 0, 4.7, 46, 100, "1 small bowl", 100),
    ("Chicken biryani", "indian", "N", [], 165, 8, 22, 5, 1.4, 1.0, 1.0, 450, 250, "1 plate", 250),
    ("Boiled egg", "international", "E", ["egg"], 155, 12.6, 1.1, 10.6, 3.3, 0, 1.1, 124, 50, "1 egg", 50),
    ("Sprouts (moong, boiled)", "indian", "V", [], 105, 7, 19, 0.4, 0.1, 7.6, 2.0, 2, 100, "1 katori", 100),
    ("Banana", "international", "V", [], 89, 1.1, 23, 0.3, 0.1, 2.6, 12, 1, 118, "1 medium", 118),
    ("Apple", "international", "V", [], 52, 0.3, 14, 0.2, 0, 2.4, 10, 1, 180, "1 medium", 180),
    ("Almonds", "international", "V", ["tree_nuts"], 579, 21, 22, 50, 3.8, 12.5, 4.4, 1, 28, "handful", 28),
    ("Peanuts (roasted)", "international", "V", ["peanuts"], 567, 26, 16, 49, 6.8, 8.5, 4.0, 6, 30, "handful", 30),
    ("Greek yogurt (plain)", "international", "VG", ["milk"], 59, 10, 3.6, 0.4, 0.1, 0, 3.2, 36, 170, "1 cup", 170),
    ("Whey protein powder", "international", "VG", ["milk"], 400, 80, 8, 6, 3.0, 0, 5, 300, 30, "1 scoop", 30),
    ("Grilled chicken breast", "international", "N", [], 165, 31, 0, 3.6, 1.0, 0, 0, 74, 120, "1 breast", 120),
    ("Chickpeas (boiled)", "indian", "V", [], 164, 8.9, 27, 2.6, 0.3, 7.6, 4.8, 7, 150, "1 katori", 150),
    ("Milk (whole)", "international", "VG", ["milk"], 61, 3.2, 4.8, 3.3, 1.9, 0, 5.0, 43, 250, "1 glass", 250),
    ("Tofu (firm)", "asian", "V", ["soy"], 76, 8, 1.9, 4.8, 0.7, 0.3, 0.6, 7, 100, "100 g", 100),
]
