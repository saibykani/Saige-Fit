"""Deterministic diet planning engine (pure functions, no I/O).

Nutrition is NEVER invented here: every number comes from a food's per-100 g record via
nutrition_engine.Nutrients.scaled(). The engine only chooses foods and portion sizes.
All outputs are estimates for healthy adults, not medical advice.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

from app.services.nutrition_engine import Nutrients, sum_nutrients

SLOTS = ["early_morning", "breakfast", "mid_morning", "lunch", "evening_snack", "dinner"]
SLOTS_BY_MEALS = {
    2: ["lunch", "dinner"],
    3: ["breakfast", "lunch", "dinner"],
    4: ["breakfast", "lunch", "evening_snack", "dinner"],
    5: ["breakfast", "mid_morning", "lunch", "evening_snack", "dinner"],
    6: SLOTS, 7: SLOTS,
}
SLOT_SHARE = {"early_morning": 0.05, "breakfast": 0.22, "mid_morning": 0.08, "lunch": 0.32, "evening_snack": 0.10, "dinner": 0.28}
SLOT_TIME = {"early_morning": "06:30", "breakfast": "08:00", "mid_morning": "10:30", "lunch": "13:00", "evening_snack": "17:00", "dinner": "20:00"}
KCAL_TOLERANCE = 0.05
PROTEIN_TOLERANCE = 0.10
TRAINING_CARB_SHIFT = 0.08  # share of daily kcal moved from other sources into carbs on training days

MAINS = {"bmain", "protein", "gravy", "combo", "veg", "legume"}
ROLE_PRIORITY = ["bmain", "combo", "protein", "carb", "gravy", "legume", "veg", "fruit", "nut", "shake", "dairy"]

# slot -> list of template variants; each variant is a list of requirements (role options, in order of preference)
TEMPLATES: dict[str, list[list[tuple[str, ...]]]] = {
    "early_morning": [[("drink", "fruit"), ("nut",)], [("fruit",), ("nut", "snack")]],
    "breakfast": [[("bmain",), ("bside",)], [("bmain",), ("bside",), ("fruit",)]],
    "mid_morning": [[("fruit",), ("nut", "snack")], [("snack",), ("fruit",)]],
    "lunch": [[("carb",), ("protein", "legume", "gravy"), ("gravy", "veg"), ("dairy",)],
              [("carb",), ("protein",), ("veg", "gravy")],
              [("combo",), ("dairy",)]],
    "evening_snack": [[("snack",), ("fruit", "nut")], [("shake", "snack"), ("fruit",)]],
    "dinner": [[("carb",), ("protein", "legume"), ("veg", "gravy")],
               [("carb",), ("gravy", "legume"), ("veg",)],
               [("combo",)]],
}
SLOT_ROLES = {
    "early_morning": ["drink", "fruit", "nut"], "breakfast": ["bmain", "bside"], "mid_morning": ["fruit", "nut", "snack"],
    "lunch": ["carb", "protein", "gravy", "combo", "veg", "legume"], "evening_snack": ["snack", "fruit", "nut", "shake"],
    "dinner": ["carb", "protein", "gravy", "combo", "veg", "legume"],
}

# ---------- preference normalisation ----------
ALLERGEN_SYNONYMS = {
    "milk": "milk", "dairy": "milk", "lactose": "milk", "gluten": "gluten", "wheat": "gluten", "egg": "egg", "eggs": "egg",
    "fish": "fish", "seafood": "fish", "shellfish": "fish", "peanut": "peanuts", "peanuts": "peanuts", "groundnut": "peanuts",
    "nut": "nuts", "nuts": "nuts", "tree": "tree_nuts", "almond": "tree_nuts", "almonds": "tree_nuts", "soy": "soy", "soya": "soy",
}


def normalise_allergens(items: list[str] | None) -> set[str]:
    out: set[str] = set()
    for raw in items or []:
        for tok in re.findall(r"[a-z_]+", (raw or "").lower()):
            a = ALLERGEN_SYNONYMS.get(tok)
            if a == "nuts":
                out |= {"tree_nuts", "peanuts"}
            elif a:
                out.add(a)
    return out


def excluded_words(restrictions: list[str] | None, disliked: list[str] | None) -> set[str]:
    """Words that must not appear as a token in a food name (from 'no rice', 'avoid paneer', disliked foods)."""
    words: set[str] = set()
    for raw in list(restrictions or []) + list(disliked or []):
        for tok in re.findall(r"[a-z]+", (raw or "").lower()):
            if tok not in {"no", "avoid", "without", "dont", "don", "t", "eat", "free", "and", "the", "any", "food", "foods", "diet"} and len(tok) > 2:
                words.add(tok)
    return words


# ---------- foods ----------
@dataclass
class Food:
    id: str
    name: str
    n100: Nutrients
    roles: set[str]
    diet_tags: list[str]
    allergens: set[str]
    default_g: float
    label: str | None
    gpu: float | None
    cuisine: str | None = None
    cost_tier: int = 2  # 1 cheap .. 3 premium (soft preference only)

    @property
    def tokens(self) -> set[str]:
        return set(re.findall(r"[a-z]+", self.name.lower()))

    @property
    def step(self) -> float:
        return round(self.gpu / 2, 1) if self.gpu and self.gpu <= 130 else 10.0

    def nutrients(self, grams: float) -> Nutrients:
        return self.n100.scaled(grams)


_KW = [
    ("bmain", {"idli", "dosa", "upma", "poha", "pesarattu", "pongal", "paratha", "oats"}),
    ("carb", {"rice", "roti", "chapati"}),
    ("protein", {"chicken", "paneer", "tofu", "egg", "fish"}),
    ("gravy", {"dal", "sambar", "rasam"}),
    ("legume", {"chickpeas", "sprouts", "dal"}),
    ("fruit", {"banana", "apple"}),
    ("nut", {"almonds", "peanuts"}),
    ("dairy", {"curd", "yogurt", "milk", "dahi"}),
    ("shake", {"whey"}),
]
_BSIDE = {"egg", "curd", "yogurt", "milk", "sprouts", "dahi", "tofu"}
_SNACK = {"sprouts", "egg", "yogurt", "whey", "almonds", "peanuts", "chickpeas", "banana", "apple", "curd"}
_CHEAP = {"rice", "roti", "dal", "idli", "dosa", "poha", "upma", "sambar", "rasam", "oats", "banana", "egg", "curd", "peanuts", "chickpeas", "sprouts"}
_PREMIUM = {"almonds", "fish", "whey", "chicken", "paneer", "tofu", "yogurt"}


def classify(name: str, n: Nutrients) -> set[str]:
    toks = set(re.findall(r"[a-z]+", name.lower()))
    if "biryani" in toks:
        return {"combo"}
    roles = {role for role, kws in _KW if toks & kws}
    if "vegetable" in toks or ("veg" in toks and "curry" in toks):
        roles.add("veg")
    if toks & _BSIDE:
        roles.add("bside")
    if toks & _SNACK:
        roles.add("snack")
    if "milk" in toks:
        roles.add("drink")
    if not roles:  # unknown food (imports / custom): infer from macros per 100 g
        kcal = max(n.kcal, 1.0)
        p, c, f = n.protein_g * 4 / kcal, n.carbs_g * 4 / kcal, n.fat_g * 9 / kcal
        if n.kcal < 120 and (n.sugar_g or 0) >= 6:
            roles = {"fruit", "snack"}
        elif f >= 0.5:
            roles = {"nut", "snack"}
        elif p >= 0.3:
            roles = {"protein", "snack"}
        elif c >= 0.6:
            roles = {"carb"} if n.kcal >= 100 else {"snack"}
        else:
            roles = {"veg"}
    return roles


def build_foods(rows: list[dict]) -> list[Food]:
    """rows: food_items with embedded food_nutrition (list or dict), as returned by the Rest client."""
    out = []
    for r in rows:
        nut = r.get("food_nutrition")
        nut = nut[0] if isinstance(nut, list) and nut else nut
        if not nut or not nut.get("kcal"):
            continue

        def opt(k):
            return None if nut.get(k) is None else float(nut[k])
        n = Nutrients(float(nut["kcal"]), float(nut["protein_g"]), float(nut["carbs_g"]), float(nut["fat_g"]),
                      opt("sat_fat_g"), opt("fiber_g"), opt("sugar_g"), opt("sodium_mg"))
        toks = set(re.findall(r"[a-z]+", r["name"].lower()))
        tier = 1 if toks & _CHEAP else 3 if toks & _PREMIUM else 2
        out.append(Food(
            id=str(r["id"]), name=r["name"], n100=n, roles=classify(r["name"], n),
            diet_tags=list(r.get("diet_tags") or []), allergens={a.lower() for a in (r.get("allergens") or [])},
            default_g=float(r.get("default_serving_g") or 100), label=r.get("serving_label"),
            gpu=float(r["grams_per_unit"]) if r.get("grams_per_unit") else None, cuisine=r.get("cuisine"), cost_tier=tier))
    return out


@dataclass
class Prefs:
    diet_type: str = "non_vegetarian"
    allergies: list[str] = field(default_factory=list)
    intolerances: list[str] = field(default_factory=list)
    restrictions: list[str] = field(default_factory=list)
    liked: list[str] = field(default_factory=list)
    disliked: list[str] = field(default_factory=list)
    cuisines: list[str] = field(default_factory=list)
    meals_per_day: int = 4
    budget: float | None = None


@dataclass
class DietTargets:
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float = 25.0


def allowed_foods(foods: list[Food], p: Prefs) -> list[Food]:
    banned = normalise_allergens(p.allergies) | normalise_allergens(p.intolerances)
    words = excluded_words(p.restrictions, p.disliked)
    return [f for f in foods
            if p.diet_type in f.diet_tags and not (f.allergens & banned) and not (f.tokens & words)]


# ---------- selection ----------
def _sort_key(f: Food, p: Prefs):
    liked = any(w in f.name.lower() for w in (x.lower() for x in p.liked if x))
    cuisine_ok = (not p.cuisines) or (f.cuisine in p.cuisines) or f.cuisine == "international"
    return (0 if liked else 1, 0 if cuisine_ok else 1, f.cost_tier if p.budget is not None else 0, f.name)


@dataclass
class Item:
    food: Food
    grams: float
    slot: str
    role: str
    lo: float = 0.0
    hi: float = 0.0

    @property
    def n(self) -> Nutrients:
        return self.food.nutrients(self.grams)


def _pick(pool: list[Food], idx: int, taken: set[str]) -> Food | None:
    if not pool:
        return None
    for k in range(len(pool)):
        f = pool[(idx + k) % len(pool)]
        if f.id not in taken:
            return f
    return None


def _round_q(f: Food, q: float) -> float:
    s = f.step
    return max(s, round(q / s) * s)


def _choose_items(slot: str, variant: int, rot: int, allowed: list[Food], p: Prefs, used_mains: set[str]) -> list[Item]:
    pools: dict[str, list[Food]] = {}

    def pool(role: str) -> list[Food]:
        if role not in pools:
            pools[role] = sorted([f for f in allowed if role in f.roles], key=lambda f: _sort_key(f, p))
        return pools[role]

    reqs = TEMPLATES[slot][variant % len(TEMPLATES[slot])]
    if any(("combo",) == r for r in reqs) and not pool("combo"):
        reqs = TEMPLATES[slot][0]
    items: list[Item] = []
    taken: set[str] = set()
    for k, options in enumerate(reqs):
        chosen = None
        for opt in options:  # first option with a usable food wins; rotation spreads choices across days
            cands = [f for f in pool(opt) if f.id not in taken and (not (f.roles & MAINS) or f.id not in used_mains or opt in ("carb", "dairy", "drink", "fruit", "nut"))]
            if p.budget is not None and cands:  # soft budget preference: skip the priciest tier when cheaper foods exist
                floor = min(f.cost_tier for f in cands)
                cands = [f for f in cands if f.cost_tier <= floor + 1]
            if cands:
                chosen = (opt, cands[(rot + k) % len(cands)])
                break
        if not chosen:
            continue
        role, f = chosen
        taken.add(f.id)
        if f.roles & MAINS:
            used_mains.add(f.id)
        items.append(Item(f, f.default_g, slot, role))
    return items


def _bounds(it: Item) -> None:
    big = it.role in ("carb", "protein", "combo", "bmain", "gravy", "legume", "bside", "shake", "boost")
    it.lo = max(it.food.step, round(0.4 * it.food.default_g / it.food.step) * it.food.step)
    it.hi = (3.0 if big else 2.0) * it.food.default_g


@dataclass
class DayResult:
    meals: list[tuple[str, list[Item]]]
    targets: DietTargets
    totals: Nutrients
    warnings: list[str]


def _fit(items: list[Item], t: DietTargets, slot_share: dict[str, float], carb_target: float, *, w_carb: float, w_prot: float) -> None:
    """Coordinate descent on portion sizes. Cost balances kcal, protein, carbs and per-meal calorie shares."""
    for it in items:
        _bounds(it)
    k0 = sum(i.n.kcal for i in items) or 1.0
    f0 = max(0.4, min(3.0, t.kcal / k0))
    for it in items:
        it.grams = min(it.hi, max(it.lo, _round_q(it.food, it.grams * f0)))
    per = [(i.n.kcal, i.n.protein_g, i.n.carbs_g) for i in items]
    tot = [sum(x[j] for x in per) for j in range(3)]
    slots = sorted(slot_share)
    sk = {s: sum(per[x][0] for x, i in enumerate(items) if i.slot == s) for s in slots}

    def cost(tk, tp, tc, skd):
        c = 4.0 * abs(tk - t.kcal) / t.kcal
        c += w_prot * max(0.0, abs(tp - t.protein_g) / max(t.protein_g, 1) - 0.03)
        c += w_carb * abs(tc - carb_target) / max(carb_target, 1)
        c += 0.8 * sum(abs(skd[s] - slot_share[s] * t.kcal) for s in slots) / t.kcal
        return c

    cur = cost(*tot, sk)
    for _ in range(600):
        best = None
        for x, it in enumerate(items):
            for d in (-1, 1):
                q = it.grams + d * it.food.step
                if q < it.lo - 1e-9 or q > it.hi + 1e-9:
                    continue
                n = it.food.nutrients(q)
                dk, dp, dc = n.kcal - per[x][0], n.protein_g - per[x][1], n.carbs_g - per[x][2]
                skd = dict(sk)
                skd[it.slot] += dk
                c = cost(tot[0] + dk, tot[1] + dp, tot[2] + dc, skd)
                if c < cur - 1e-9 and (best is None or c < best[0]):
                    best = (c, x, q, n, dk, dp, dc)
        if not best:
            break
        c, x, q, n, dk, dp, dc = best
        items[x].grams = q
        per[x] = (n.kcal, n.protein_g, n.carbs_g)
        tot = [tot[0] + dk, tot[1] + dp, tot[2] + dc]
        sk[items[x].slot] += dk
        cur = c


BOOST_SLOTS = {"main": ["dinner", "lunch", "breakfast"], "snack": ["evening_snack", "mid_morning", "breakfast", "dinner", "lunch"]}


def _boost_protein(items: list[Item], allowed: list[Food], slots: list[str]) -> bool:
    """Add the most protein-dense allowed food not already in the day. Returns False when nothing suitable is left."""
    have = {i.food.id for i in items}
    dens = lambda f: f.n100.protein_g * 4 / f.n100.kcal  # noqa: E731
    cands = sorted([f for f in allowed if f.id not in have and f.n100.kcal > 0 and dens(f) >= 0.2], key=lambda f: (-dens(f), f.name))
    for f in cands:
        kind = "snack" if f.roles & {"shake", "dairy", "snack", "fruit", "nut"} and not f.roles & {"protein", "combo"} else "main"
        slot = next((s for s in BOOST_SLOTS[kind] if s in slots), slots[0])
        it = Item(f, f.default_g, slot, "boost")
        items.append(it)
        return True
    return False


def build_day(allowed: list[Food], p: Prefs, t: DietTargets, day_idx: int, training: bool) -> DayResult:
    slots = SLOTS_BY_MEALS[max(2, min(7, p.meals_per_day))]
    share_total = sum(SLOT_SHARE[s] for s in slots)
    share = {s: SLOT_SHARE[s] / share_total for s in slots}
    used_mains: set[str] = set()
    items: list[Item] = []
    for si, slot in enumerate(slots):
        items += _choose_items(slot, day_idx + si, day_idx * 3 + si, allowed, p, used_mains)
    if not items:
        raise ValueError("Not enough foods match your dietary preferences to build a plan")
    shift = TRAINING_CARB_SHIFT * t.kcal / 4 if training else 0.0
    carb_target = t.carbs_g + shift
    _fit(items, t, share, carb_target, w_carb=1.2, w_prot=2.0)
    warnings: list[str] = []
    total = sum_nutrients([i.n for i in items])
    for _ in range(3):  # protein short? add the densest allowed protein source and refit (never exceeds 3 additions)
        if (t.protein_g - total.protein_g) / t.protein_g <= PROTEIN_TOLERANCE * 0.8:
            break
        if not _boost_protein(items, allowed, slots):
            break
        _fit(items, t, share, carb_target, w_carb=0.6, w_prot=4.0)
        total = sum_nutrients([i.n for i in items])
    if abs(total.kcal - t.kcal) / t.kcal > KCAL_TOLERANCE or abs(total.protein_g - t.protein_g) / t.protein_g > PROTEIN_TOLERANCE:
        _fit(items, t, share, carb_target, w_carb=0.0, w_prot=4.0)  # last pass: ignore the carb nudge
        total = sum_nutrients([i.n for i in items])
    if abs(total.kcal - t.kcal) / t.kcal > KCAL_TOLERANCE:
        warnings.append(f"Calories are {round(100 * (total.kcal - t.kcal) / t.kcal):+d}% from target with the foods available for your preferences.")
    if abs(total.protein_g - t.protein_g) / t.protein_g > PROTEIN_TOLERANCE:
        warnings.append(f"Protein is {round(100 * (total.protein_g - t.protein_g) / t.protein_g):+d}% from target with the foods available for your preferences.")
    meals = [(s, [i for i in items if i.slot == s]) for s in slots]
    return DayResult([(s, m) for s, m in meals if m], t, total, warnings)


# ---------- instructions & alternatives ----------
_PREP = [
    ({"egg"}, "Boil for 9-10 minutes, cool in water and peel."),
    ({"rice"}, "Steam or boil until fluffy; weigh the cooked portion."),
    ({"roti", "chapati"}, "Cook on a hot tawa with minimal oil."),
    ({"dal"}, "Pressure cook until soft, then temper with cumin and garlic using a little oil."),
    ({"grilled"}, "Season and grill until the juices run clear (75 C / 165 F inside)."),
    ({"chicken"}, "Simmer with onion-tomato masala until cooked through."),
    ({"fish"}, "Simmer gently with tamarind or tomato for 8-10 minutes until the fish flakes."),
    ({"paneer"}, "Cube and lightly sear, or stir into a curry at the end."),
    ({"tofu"}, "Press, cube and pan-sear until golden."),
    ({"curd", "dahi", "yogurt"}, "Use plain, unsweetened; add salt or cumin if you like."),
    ({"whey"}, "Mix one scoop with water or milk and shake well."),
    ({"milk"}, "Serve warm or cold, unsweetened."),
    ({"sprouts"}, "Steam or boil for about 5 minutes and season lightly."),
    ({"chickpeas"}, "Boil until tender; drain and season with cumin and lemon."),
    ({"almonds", "peanuts"}, "Measure a small handful; choose unsalted, dry-roasted."),
    ({"banana", "apple"}, "Wash and eat whole."),
    ({"oats"}, "Cook in water until creamy; add fruit or nuts from your plan if you like."),
    ({"sambar", "rasam"}, "Warm through and serve hot."),
    ({"vegetable"}, "Cook vegetables until tender-crisp with minimal oil."),
    ({"biryani"}, "Reheat gently with a splash of water."),
    ({"idli", "dosa", "upma", "poha", "pesarattu", "pongal", "paratha"}, "Serve freshly made and warm."),
]


def prep_text(f: Food) -> str:
    for kws, text in _PREP:
        if f.tokens & kws:
            return text
    return "Prepare simply with minimal added oil and weigh the portion as eaten."


def quantity_label(f: Food, grams: float) -> str:
    mult = grams / f.default_g if f.default_g else 1
    base = f.label or "serving"
    if 0.95 <= mult <= 1.05:
        return f"{base} ({round(grams)} g)"
    return f"~{mult:.1f} x {base} ({round(grams)} g)"


def item_dict(f: Food, grams: float) -> dict:
    n = f.nutrients(grams)
    return {"food_id": f.id, "name": f.name, "quantity_g": round(grams, 1), "quantity_label": quantity_label(f, grams),
            "kcal": n.kcal, "protein_g": n.protein_g, "carbs_g": n.carbs_g, "fat_g": n.fat_g}


def primary_role(f: Food, preferred: str | None = None) -> str:
    if preferred and preferred in f.roles:
        return preferred
    return next((r for r in ROLE_PRIORITY if r in f.roles), "snack")


def alternatives_for(item_food: Food, grams: float, pool: list[Food], exclude_ids: set[str], n: int = 2, role: str | None = None) -> list[dict]:
    """Foods portioned to match the original item's calories; closest protein ranks first.
    Prefers the same role; widens to related roles (then to any allowed food) when the role has too few options."""
    role = primary_role(item_food, role)
    target = item_food.nutrients(grams)
    snackish = bool(item_food.roles & {"snack", "fruit", "nut", "dairy", "shake", "drink"})
    stages = [
        lambda c: role in c.roles and c.id not in exclude_ids,
        lambda c: role in c.roles,
        lambda c: bool(c.roles & item_food.roles) or (snackish and "snack" in c.roles),
        lambda c: True,
    ]
    picked: list[tuple[float, str, Food, float]] = []
    seen: set[str] = {item_food.id}
    for ok in stages:
        scored = []
        for c in pool:
            if c.id in seen or not ok(c):
                continue
            q = min(3.0 * c.default_g, max(c.step, round((target.kcal / (c.n100.kcal / 100.0)) / c.step) * c.step))
            cn = c.nutrients(q)
            err = abs(cn.kcal - target.kcal) / max(target.kcal, 1) + abs(cn.protein_g - target.protein_g) / max(target.protein_g + 5, 1)
            scored.append((err, c.name, c, q))
        scored.sort(key=lambda x: (x[0], x[1]))
        for row in scored:
            if len(picked) >= n:
                break
            picked.append(row)
            seen.add(row[2].id)
        if len(picked) >= n:
            break
    return [item_dict(c, q) for _, _, c, q in picked[:n]]


def to_plan_rows(result: DayResult, pool: list[Food]) -> list[dict]:
    """Flatten a built day into row dicts (one per food item) with instructions + 2 alternatives each."""
    rows = []
    day_ids = {i.food.id for _, items in result.meals for i in items}
    for slot, items in result.meals:
        for it in items:
            d = item_dict(it.food, it.grams)
            d.update(meal_type=slot, scheduled_time=SLOT_TIME[slot], instructions=prep_text(it.food),
                     alternatives=alternatives_for(it.food, it.grams, pool, day_ids, 2, it.role))
            rows.append(d)
    return rows


def generate_plan(foods: list[Food], p: Prefs, t: DietTargets, days: int, training_flags: list[bool]) -> list[DayResult]:
    """training_flags[i] says whether day i is a workout day (shifts carbs up, calories unchanged)."""
    allowed = allowed_foods(foods, p)
    if len(allowed) < 3:
        raise ValueError("Not enough foods match your dietary preferences to build a plan")
    return [build_day(allowed, p, t, d, training_flags[d % len(training_flags)]) for d in range(days)]


def swap_candidates(current_food: Food, grams: float, role: str | None, allowed: list[Food], exclude_ids: set[str], n: int = 4) -> list[dict]:
    return alternatives_for(current_food, grams, allowed, exclude_ids, n, role)


def pick_random(cands: list[dict], rng: random.Random | None = None) -> dict | None:
    return (rng or random).choice(cands) if cands else None


# ---------- "what should I eat next" ----------
def next_slot(hour: int) -> str:
    if hour < 7:
        return "early_morning"
    if hour < 10:
        return "breakfast"
    if hour < 12:
        return "mid_morning"
    if hour < 16:
        return "lunch"
    if hour < 19:
        return "evening_snack"
    return "dinner"


def recommendations(allowed: list[Food], remaining: dict, hour: int, n: int = 6) -> dict:
    """Rank foods that help fill what is LEFT today (kcal, protein, carbs, fat, fiber) with a human reason."""
    slot = next_slot(hour)
    rem_k = remaining["kcal"]
    out = {"slot": slot, "suggestions": [], "message": None}
    if rem_k <= 60:
        out["message"] = "You've reached today's calorie target. If you're still hungry, choose vegetables, fruit or plain water."
        return out
    rem_p, rem_c, rem_f = max(0.0, remaining["protein_g"]), max(0.0, remaining["carbs_g"]), max(0.0, remaining["fat_g"])
    p_need = min(1.0, rem_p / max(remaining.get("protein_target", rem_p) or rem_p, 1))
    roles = set(SLOT_ROLES[slot])
    cap = min(rem_k * 0.6, 700.0)
    scored = []
    for f in allowed:
        if not (f.roles & roles):
            continue
        q = f.default_g
        n_ = f.nutrients(q)
        if n_.kcal > cap:  # shrink to fit
            q = max(f.step, int((cap / (f.n100.kcal / 100.0)) / f.step) * f.step)
            n_ = f.nutrients(q)
        if n_.kcal <= 0 or q < f.default_g * 0.4:
            continue
        gain_p = min(n_.protein_g, rem_p) / max(rem_p, 1.0)
        gain_c = min(n_.carbs_g, rem_c) / max(rem_c, 1.0)
        over = max(0.0, n_.fat_g - rem_f) / max(rem_f + 10, 1.0)
        fit = 1 - abs(n_.kcal - min(rem_k * 0.35, 450)) / max(rem_k, 1)
        score = (2.5 * p_need + 0.5) * gain_p + 0.8 * gain_c + 0.3 * fit - 0.8 * over + 0.02 * (n_.fiber_g or 0)
        scored.append((score, f, q, n_))
    scored.sort(key=lambda x: (-x[0], x[1].name))
    per_role: dict[str, int] = {}
    for score, f, q, n_ in scored:
        r = primary_role(f)
        if per_role.get(r, 0) >= 2:
            continue
        per_role[r] = per_role.get(r, 0) + 1
        fib = n_.fiber_g or 0
        if rem_p > 5 and n_.protein_g >= 5:
            reason = f"Adds {round(n_.protein_g)} g protein ({round(100 * min(1, n_.protein_g / rem_p))}% of the {round(rem_p)} g you still need)"
            reason += (f" and {round(fib)} g fibre" if fib >= 4 else "") + f" for {round(n_.kcal)} kcal."
        else:
            reason = f"A {round(n_.kcal)} kcal option that fits the {round(rem_k)} kcal you have left." + (f" Provides {round(fib)} g fibre." if fib >= 4 else "")
        d = item_dict(f, q)
        d["reason"] = reason
        out["suggestions"].append(d)
        if len(out["suggestions"]) >= n:
            break
    if not out["suggestions"]:
        out["message"] = "No foods match your preferences for this time of day; try the food search to log something specific."
    return out
