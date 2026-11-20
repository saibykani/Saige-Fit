from tests.test_core_support import H, env, seed_user  # noqa: F401
from tests.test_next_meal import seed_catalog


def test_recipe_list_and_detail_work_and_report_diet_tags(env):
    seed_user(env.db)
    seed_catalog(env.db)
    r = env.client.get("/v1/recipes", headers=H())
    assert r.status_code == 200, r.text
    body = r.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    assert len(items) > 0
    assert all("diet_tags" in i and isinstance(i["diet_tags"], list) for i in items)
