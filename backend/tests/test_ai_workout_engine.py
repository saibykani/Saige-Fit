import itertools

import pytest

from app.data.exercises_seed import EXERCISES
from app.services import workout_engine as we


def catalog():
    return [{"id": f"ex-{i}", "name": e["name"], "muscle_group": e["muscle_group"], "equipment": e["equipment"],
             "difficulty": e["difficulty"], "is_compound": e["is_compound"],
             "contraindications": e["contraindications"]} for i, e in enumerate(EXERCISES)]


CAT = catalog()
BY_ID = {e["id"]: e for e in CAT}


def plan(**kw):
    base = dict(catalog=CAT, goal="muscle_gain", experience="intermediate", env="gym", equipment=[], injuries=[],
                training_days=4, workout_days=[], minutes=60)
    base.update(kw)
    return we.generate_plan(**base)


def names(day):
    return [BY_ID[i["exercise_id"]]["name"] for i in day.exercises]


# ---------- seed quality ----------
def test_seed_library_is_rich_and_consistent():
    assert len(EXERCISES) >= 70
    groups = {e["muscle_group"] for e in EXERCISES}
    assert {"chest", "back", "quads", "hamstrings", "glutes", "shoulders", "biceps", "triceps", "core", "cardio"} <= groups
    allowed_eq = {"barbell", "dumbbell", "cable", "machine", "bodyweight", "bands", "kettlebell", "pullup_bar"}
    allowed_contra = {"knee", "lower_back", "shoulder", "wrist", "elbow", "neck", "hip", "ankle"}
    names_ = {e["name"] for e in EXERCISES}
    assert len(names_) == len(EXERCISES)
    for e in EXERCISES:
        assert 2 <= len(e["instructions"]) <= 6, e["name"]
        assert 2 <= len(e["common_mistakes"]) <= 3, e["name"]
        assert e["equipment"] and set(e["equipment"]) <= allowed_eq, e["name"]
        assert set(e["contraindications"]) <= allowed_contra, e["name"]
        assert e["alternatives"] and set(e["alternatives"]) <= names_, e["name"]
        assert e["name"] not in e["alternatives"]


# ---------- safety ----------
@pytest.mark.parametrize("injury,tag", [("knee pain", "knee"), ("lower back disc", "lower_back"), ("rotator cuff", "shoulder"),
                                        ("sore wrist", "wrist"), ("tennis elbow", "elbow")])
def test_never_selects_contraindicated_exercises(injury, tag):
    for days in (2, 3, 4, 5, 6):
        p = plan(injuries=[injury], training_days=days)
        for d in p.days:
            for i in d.exercises:
                assert tag not in BY_ID[i["exercise_id"]]["contraindications"], (injury, d.focus, BY_ID[i["exercise_id"]]["name"])
    assert any("left out" in n for n in plan(injuries=[injury]).notes)


def test_multiple_injuries_all_respected_and_unknown_text_noted():
    p = plan(injuries=["bad knees", "back surgery", "weird thing"], training_days=5)
    for d in p.days:
        for i in d.exercises:
            assert not ({"knee", "lower_back"} & set(BY_ID[i["exercise_id"]]["contraindications"]))
    assert any("weird thing" in n for n in p.notes)


def test_injury_tag_mapping():
    tags, unknown = we.injury_tags(["Knee pain", "lumbar disc issue", "xyz", ""])
    assert tags == {"knee", "lower_back"} and unknown == ["xyz"]


def test_is_safe():
    assert not we.is_safe({"contraindications": ["knee"]}, {"knee"})
    assert we.is_safe({"contraindications": ["wrist"]}, {"knee"})


# ---------- equipment & difficulty ----------
def test_home_bodyweight_only_plan_uses_only_bodyweight():
    p = plan(env="home", equipment=[], experience="beginner", training_days=3)
    for d in p.days:
        for n in names(d):
            assert BY_ID[next(e["id"] for e in CAT if e["name"] == n)]["equipment"] == ["bodyweight"], n


def test_home_with_dumbbells_and_bands_allowed():
    eq = we.available_equipment("home", ["Dumbbells", "resistance bands"])
    assert eq == {"bodyweight", "dumbbell", "bands"}
    p = plan(env="home", equipment=["dumbbells", "resistance bands"], training_days=4)
    used = {e for d in p.days for i in d.exercises for e in BY_ID[i["exercise_id"]]["equipment"]}
    assert used <= {"bodyweight", "dumbbell", "bands"}


def test_difficulty_never_exceeds_experience():
    p = plan(experience="beginner", training_days=5)
    for d in p.days:
        for i in d.exercises:
            assert we.RANK[BY_ID[i["exercise_id"]]["difficulty"]] == 0


def test_pullup_bar_only_when_owned_at_home():
    p = plan(env="home", equipment=[], experience="advanced", training_days=4)
    assert all("pullup_bar" not in BY_ID[i["exercise_id"]]["equipment"] for d in p.days for i in d.exercises)


# ---------- scheduling & recovery ----------
@pytest.mark.parametrize("n", [1, 2, 3, 4, 5, 6, 7])
def test_plan_has_seven_days_and_right_number_of_training_days(n):
    p = plan(training_days=n)
    assert [d.weekday for d in p.days] == list(range(1, 8))
    trained = [d for d in p.days if not d.is_rest]
    assert len(trained) == min(n, 6)
    assert all(d.exercises for d in trained)
    assert any(d.is_rest for d in p.days)  # always at least one recovery day


def _adjacent_overlap(p):
    by = {d.weekday: d for d in p.days if not d.is_rest}
    return [(a, b) for a, d in by.items() for b in [a % 7 + 1] if b in by and d.groups & by[b].groups]


@pytest.mark.parametrize("n", [2, 3, 4, 5, 6])
@pytest.mark.parametrize("pref", [[], [1, 2, 3], [5, 6, 7], [1, 2, 3, 4, 5, 6, 7], [7, 1, 2]])
def test_no_same_muscle_group_on_consecutive_days(n, pref):
    p = plan(training_days=n, workout_days=pref)
    assert _adjacent_overlap(p) == []


def test_consecutive_days_request_switches_to_ppl_not_full_body():
    p = plan(training_days=3, workout_days=[1, 2, 3])
    assert p.split == ["push", "pull", "legs"]
    assert plan(training_days=3, workout_days=[]).split == ["full"] * 3


def test_respects_preferred_days_when_count_matches():
    p = plan(training_days=3, workout_days=[2, 4, 6])
    assert [d.weekday for d in p.days if not d.is_rest] == [2, 4, 6]


def test_pick_weekdays_spreads_and_fills():
    assert we.pick_weekdays([], 3) == [1, 3, 5] or we._gaps(tuple(we.pick_weekdays([], 3))) >= 2
    got = we.pick_weekdays([3], 3)
    assert 3 in got and len(got) == 3


def test_seven_days_capped_at_six_with_note():
    p = plan(training_days=7)
    assert sum(not d.is_rest for d in p.days) == 6
    assert any("maximum of 6" in n for n in p.notes)


def test_bro_split_only_for_advanced_hypertrophy_five_days():
    assert plan(training_days=5, experience="advanced").split == ["chest", "back", "legs", "shoulders", "arms"]
    assert plan(training_days=5, experience="intermediate").split[0] == "push"


def test_repeated_templates_vary_exercises():
    p = plan(training_days=4)
    uppers = [d for d, s in zip([d for d in p.days if not d.is_rest], p.split) if s == "upper"]
    assert names(uppers[0]) != names(uppers[1])


def test_active_recovery_for_fat_loss_and_rest_otherwise():
    fl = plan(goal="fat_loss", training_days=3)
    assert any(d.focus == "Active recovery" and d.is_rest and len(d.exercises) == 1 for d in fl.days)
    assert any(d.focus == "Rest & recovery" and not d.exercises for d in fl.days)
    mg = plan(goal="muscle_gain", training_days=5)
    assert all(d.focus == "Rest & recovery" for d in mg.days if d.is_rest)


# ---------- time, volume, prescriptions ----------
@pytest.mark.parametrize("minutes", [30, 45, 60, 90])
def test_session_length_fits_workout_minutes(minutes):
    for goal in ("strength", "muscle_gain", "fat_loss", "general_fitness"):
        p = plan(minutes=minutes, goal=goal, training_days=4)
        for d in p.days:
            if not d.is_rest:
                assert d.estimated_minutes <= minutes + 2, (minutes, goal, d.focus, d.estimated_minutes)


def test_very_short_sessions_still_get_at_least_two_exercises():
    for d in plan(minutes=20, training_days=3).days:
        if not d.is_rest:
            assert len(d.exercises) >= 2


def test_beginners_get_conservative_volume():
    p = plan(experience="beginner", goal="strength", training_days=3)
    for d in p.days:
        assert len(d.exercises) <= 5 + 1
        for i in d.exercises:
            ex = BY_ID[i["exercise_id"]]
            if ex["muscle_group"] not in ("cardio",):
                assert i["sets"] <= (3 if ex["is_compound"] else 2) or ex["name"] in we.TIMED


def test_goal_based_prescriptions():
    squat = {"name": "Barbell back squat", "muscle_group": "quads", "is_compound": True}
    curl = {"name": "Dumbbell curl", "muscle_group": "biceps", "is_compound": False}
    s = we.prescribe(squat, "strength", "intermediate")
    assert s["reps"] == "4-6" and s["rest_s"] >= 150 and 3 <= s["sets"] <= 5
    h = we.prescribe(squat, "muscle_gain", "intermediate")
    assert h["reps"] == "6-10" and 90 <= h["rest_s"] <= 120
    f = we.prescribe(curl, "fat_loss", "intermediate")
    assert f["reps"] == "12-15" and f["rest_s"] <= 60
    assert we.prescribe({"name": "Plank", "muscle_group": "core", "is_compound": False}, "strength", "beginner")["reps"].endswith("s")
    assert we.prescribe({"name": "Brisk walk", "muscle_group": "cardio", "is_compound": False}, "fat_loss", "beginner")["reps"] == "15 min"


def test_no_loads_are_prescribed():
    for d in plan().days:
        for i in d.exercises:
            assert set(i) == {"exercise_id", "sets", "reps", "rest_s"}


def test_fat_loss_day_ends_with_cardio_finisher_when_time_allows():
    p = plan(goal="fat_loss", minutes=90, training_days=3)
    trained = [d for d in p.days if not d.is_rest]
    assert any(BY_ID[d.exercises[-1]["exercise_id"]]["muscle_group"] == "cardio" for d in trained)


def test_big_lifts_come_before_isolation_and_core_last():
    d = next(d for d in plan(training_days=4, goal="muscle_gain").days if not d.is_rest)
    comp_flags = [BY_ID[i["exercise_id"]]["is_compound"] for i in d.exercises if BY_ID[i["exercise_id"]]["muscle_group"] != "core"]
    assert comp_flags == sorted(comp_flags, reverse=True)


def test_basic_free_plan_is_fixed_fullbody_beginner():
    a = plan(basic=True, goal="muscle_gain", experience="advanced", training_days=6, minutes=90)
    b = plan(basic=True, goal="fat_loss", experience="beginner", training_days=2, minutes=60)
    assert a.name == "Starter full-body plan"
    assert [d.weekday for d in a.days if not d.is_rest] == [1, 3, 5]
    assert [names(d) for d in a.days] == [names(d) for d in b.days]
    assert all(we.RANK[BY_ID[i["exercise_id"]]["difficulty"]] == 0 for d in a.days for i in d.exercises)
    # still injury-safe
    c = plan(basic=True, injuries=["knee"])
    assert all("knee" not in BY_ID[i["exercise_id"]]["contraindications"] for d in c.days for i in d.exercises)


def test_all_injuries_still_yield_a_safe_plan_and_tiny_catalog_raises():
    inj = ["wrist", "knee", "shoulder", "lower back", "elbow", "ankle", "neck", "hip"]
    p = plan(env="home", equipment=[], injuries=inj, training_days=3)
    tags = {"wrist", "knee", "shoulder", "lower_back", "elbow", "ankle", "neck", "hip"}
    for d in p.days:
        for i in d.exercises:
            assert not (tags & set(BY_ID[i["exercise_id"]]["contraindications"]))
    with pytest.raises(ValueError):
        plan(catalog=CAT[:3])


# ---------- session maths ----------
def test_epley_and_pr_logic():
    assert we.epley_1rm(100, 5) == pytest.approx(116.667, rel=1e-3)
    assert we.pr_score(100, 5) > we.pr_score(100, 3)
    assert we.pr_score(0, 12) == 12.0 and we.pr_score(50, 0) == 0.0
    assert we.is_new_pr([], 100, 5) is False  # baseline, not a PR
    assert we.is_new_pr([we.pr_score(100, 5)], 105, 5) is True
    assert we.is_new_pr([we.pr_score(100, 5)], 100, 5) is False
    assert we.is_new_pr([we.pr_score(100, 5)], 90, 5) is False


def test_kcal_and_completion():
    assert we.kcal_estimate(80, 60) == 360
    assert we.kcal_estimate(80, -5) == 0
    assert we.completion_pct(9, 12) == 75 and we.completion_pct(5, 0) == 0 and we.completion_pct(20, 12) == 100
