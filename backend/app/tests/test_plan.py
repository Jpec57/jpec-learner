from app.services.assistant import orchestrator
from app.services.assistant.providers import ProviderResult, ToolCall
from app.services.plan import classify_section, normalize_title, parse_plan, weakness_score

PLAN = """# CPGE maths

Intro prose that is not a section.

## Algèbre linéaire
- [x] Espaces vectoriels
- [ ] Déterminants

### Matrices
- [ ] Rang

## Analyse

```
## not a heading
- [ ] not a milestone
```

#### too deep, ignored
"""


# --- parsing / matching / scoring (pure) -------------------------------------


def test_parse_plan_extracts_sections_and_checklists():
    sections = parse_plan(PLAN)
    assert [(s.level, s.title) for s in sections] == [
        (2, "Algèbre linéaire"),
        (3, "Matrices"),
        (2, "Analyse"),
    ]
    assert [(i.text, i.done) for i in sections[0].checklist] == [
        ("Espaces vectoriels", True),
        ("Déterminants", False),
    ]
    assert [i.text for i in sections[1].checklist] == ["Rang"]
    assert sections[2].checklist == []  # fenced code is ignored


def test_parse_plan_handles_empty_input():
    assert parse_plan(None) == []
    assert parse_plan("") == []
    assert parse_plan("just prose, no headings\n- [ ] orphan item") == []


def test_normalize_title_ignores_case_accents_and_punctuation():
    assert normalize_title("Algèbre  linéaire!") == normalize_title("algebre lineaire")
    assert normalize_title("Suites & séries") == "suites series"


def test_classify_and_score_order_weak_before_gaps_before_shaky():
    kwargs = dict(total_items=10, due_count=2)
    weak = classify_section(has_content=True, reviewed_items=5, avg_level=2, lapse_rate=0.6)
    gap = classify_section(has_content=False, reviewed_items=0, avg_level=0, lapse_rate=None)
    fresh = classify_section(has_content=True, reviewed_items=0, avg_level=1, lapse_rate=None)
    shaky = classify_section(has_content=True, reviewed_items=5, avg_level=3, lapse_rate=0.1)
    solid = classify_section(has_content=True, reviewed_items=9, avg_level=7, lapse_rate=0.05)
    assert (weak, gap, fresh, shaky, solid) == ("weak", "no_content", "not_started", "in_progress", "solid")

    scores = [
        weakness_score(status=weak, avg_level=2, lapse_rate=0.6, **kwargs),
        weakness_score(status=gap, avg_level=0, lapse_rate=None, **kwargs),
        weakness_score(status=fresh, avg_level=1, lapse_rate=None, **kwargs),
        weakness_score(status=shaky, avg_level=3, lapse_rate=0.1, **kwargs),
        weakness_score(status=solid, avg_level=7, lapse_rate=0.05, **kwargs),
    ]
    assert scores == sorted(scores, reverse=True)
    assert len(set(scores)) == len(scores)


def test_lapse_rate_needs_enough_recent_reviews():
    # 2 of 2 reviews failed is too little evidence to call a section weak.
    assert (
        classify_section(has_content=True, reviewed_items=2, avg_level=1, lapse_rate=None) == "in_progress"
    )


# --- API ---------------------------------------------------------------------


async def _register_and_login(client, email: str) -> dict:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _make_deck(client, headers) -> str:
    resp = await client.post(
        "/api/v1/categories", json={"name": "Maths", "deck_type": "scientific"}, headers=headers
    )
    return resp.json()["id"]


async def _make_group_with_cards(client, headers, category_id, title, n_cards) -> tuple[str, list[dict]]:
    group = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": title},
            headers=headers,
        )
    ).json()
    cards = []
    for i in range(n_cards):
        resp = await client.post(
            "/api/v1/cards",
            json={
                "category_id": category_id,
                "lesson_node_id": group["id"],
                "front_text": f"{title} exercise {i}",
                "back_text": "solution",
            },
            headers=headers,
        )
        cards.append(resp.json())
    return group["id"], cards


async def _review_state_id(client, headers, card_id) -> str:
    resp = await client.get("/api/v1/reviews/state", params={"card_id": card_id}, headers=headers)
    return resp.json()["id"]


async def test_plan_roundtrip_partial_update_and_clear(client):
    headers = await _register_and_login(client, "plan-owner@example.com")
    category_id = await _make_deck(client, headers)

    empty = await client.get(f"/api/v1/categories/{category_id}/plan", headers=headers)
    assert empty.json() == {"goal": None, "plan_markdown": None}

    put = await client.put(
        f"/api/v1/categories/{category_id}/plan",
        json={"goal": "  Master year-1 maths ", "plan_markdown": PLAN},
        headers=headers,
    )
    assert put.status_code == 200
    assert put.json() == {"goal": "Master year-1 maths", "plan_markdown": PLAN}

    # Sending only the goal leaves the plan alone.
    only_goal = await client.put(
        f"/api/v1/categories/{category_id}/plan", json={"goal": "New goal"}, headers=headers
    )
    assert only_goal.json() == {"goal": "New goal", "plan_markdown": PLAN}

    # Blank text / explicit null clears.
    cleared = await client.put(
        f"/api/v1/categories/{category_id}/plan", json={"goal": None, "plan_markdown": "  \n"}, headers=headers
    )
    assert cleared.json() == {"goal": None, "plan_markdown": None}


async def test_plan_is_owner_only_for_writes_and_hidden_when_private(client):
    owner = await _register_and_login(client, "plan-a@example.com")
    other = await _register_and_login(client, "plan-b@example.com")
    category_id = await _make_deck(client, owner)

    assert (await client.get(f"/api/v1/categories/{category_id}/plan", headers=other)).status_code == 404
    assert (
        await client.put(f"/api/v1/categories/{category_id}/plan", json={"goal": "x"}, headers=other)
    ).status_code == 404

    await client.patch(f"/api/v1/categories/{category_id}", json={"is_public": True}, headers=owner)
    assert (await client.get(f"/api/v1/categories/{category_id}/plan", headers=other)).status_code == 200
    assert (
        await client.put(f"/api/v1/categories/{category_id}/plan", json={"goal": "x"}, headers=other)
    ).status_code == 403


async def test_progress_links_sections_by_title_and_flags_gaps_and_weakness(client):
    headers = await _register_and_login(client, "plan-progress@example.com")
    category_id = await _make_deck(client, headers)

    # "Algebre lineaire" (no accents) must still match the "Algèbre linéaire" heading.
    algebra_id, algebra_cards = await _make_group_with_cards(
        client, headers, category_id, "Algebre lineaire", 4
    )
    await client.put(
        f"/api/v1/categories/{category_id}/plan",
        json={"goal": "Master maths", "plan_markdown": PLAN},
        headers=headers,
    )

    before = (await client.get(f"/api/v1/categories/{category_id}/plan/progress", headers=headers)).json()
    by_title = {s["title"]: s for s in before["sections"]}
    assert before["goal"] == "Master maths"
    assert by_title["Algèbre linéaire"]["node_id"] == algebra_id
    assert by_title["Algèbre linéaire"]["status"] == "not_started"
    assert by_title["Algèbre linéaire"]["total_items"] == 4
    assert [i["done"] for i in by_title["Algèbre linéaire"]["checklist"]] == [True, False]
    assert by_title["Analyse"]["status"] == "no_content"
    assert by_title["Analyse"]["node_id"] is None
    assert by_title["Matrices"]["status"] == "no_content"
    assert before["weakest_cards"] == []

    # Fail the same cards repeatedly: enough recent reviews at rating 1 => weak.
    for card in algebra_cards[:3]:
        state_id = await _review_state_id(client, headers, card["id"])
        for _ in range(2):
            resp = await client.post(
                f"/api/v1/reviews/{state_id}/submit", json={"rating": 1}, headers=headers
            )
            assert resp.status_code == 200

    after = (await client.get(f"/api/v1/categories/{category_id}/plan/progress", headers=headers)).json()
    algebra = {s["title"]: s for s in after["sections"]}["Algèbre linéaire"]
    assert algebra["status"] == "weak"
    assert algebra["reviewed_items"] == 3
    assert algebra["lapse_rate"] == 1.0
    assert algebra["weakness_score"] >= 0.7
    assert len(after["weakest_cards"]) == 3
    assert after["weakest_cards"][0]["lapses"] == 2
    assert {c["card_id"] for c in after["weakest_cards"]} <= {c["id"] for c in algebra_cards}


async def test_progress_subtopic_prefers_match_inside_its_chapter(client):
    headers = await _register_and_login(client, "plan-nested@example.com")
    category_id = await _make_deck(client, headers)

    async def make_group(title, parent_id=None):
        payload = {"category_id": category_id, "node_kind": "group", "title": title}
        if parent_id:
            payload["parent_id"] = parent_id
        return (await client.post("/api/v1/hierarchy", json=payload, headers=headers)).json()["id"]

    algebra = await make_group("Algèbre")
    analysis = await make_group("Analyse")
    algebra_ex = await make_group("Exercices", algebra)
    analysis_ex = await make_group("Exercices", analysis)

    await client.put(
        f"/api/v1/categories/{category_id}/plan",
        json={"plan_markdown": "## Analyse\n### Exercices\n## Algèbre\n### Exercices\n"},
        headers=headers,
    )
    sections = (
        await client.get(f"/api/v1/categories/{category_id}/plan/progress", headers=headers)
    ).json()["sections"]
    assert [s["node_id"] for s in sections] == [analysis, analysis_ex, algebra, algebra_ex]


# --- assistant tools / coach mode -------------------------------------------


async def test_plan_tools_via_execute_tool(client):
    from app.db.base import get_db
    from app.main import app
    from app.models.user import User
    from app.services.assistant.tools import TOOL_SPECS, execute_tool

    headers = await _register_and_login(client, "plan-tools@example.com")
    category_id = await _make_deck(client, headers)

    assert {"get_plan", "update_plan", "get_plan_progress"} <= {t.name for t in TOOL_SPECS}

    async for db in app.dependency_overrides[get_db]():
        from sqlalchemy import select

        user = await db.scalar(select(User).where(User.email == "plan-tools@example.com"))

        empty = await execute_tool(db, user, "get_plan", {"category_id": category_id})
        assert empty.ok and "No goal or plan" in empty.summary

        bad = await execute_tool(db, user, "update_plan", {"category_id": category_id})
        assert not bad.ok

        bad_uuid = await execute_tool(db, user, "get_plan", {"category_id": "nope"})
        assert not bad_uuid.ok and "UUID" in bad_uuid.summary

        updated = await execute_tool(
            db, user, "update_plan", {"category_id": category_id, "plan_markdown": "## Analyse\n"}
        )
        assert updated.ok and "plan_markdown" in updated.summary

        got = await execute_tool(db, user, "get_plan", {"category_id": category_id})
        assert "## Analyse" in got.summary

        progress = await execute_tool(db, user, "get_plan_progress", {"category_id": category_id})
        assert progress.ok and "Analyse [no_content]" in progress.summary


async def test_coach_mode_injects_snapshot_and_uses_more_tool_headroom(client, monkeypatch):
    headers = await _register_and_login(client, "plan-coach@example.com")
    category_id = await _make_deck(client, headers)
    await _make_group_with_cards(client, headers, category_id, "Analyse", 2)
    await client.put(
        f"/api/v1/categories/{category_id}/plan",
        json={"goal": "Pass the concours", "plan_markdown": "## Analyse\n## Probabilités\n"},
        headers=headers,
    )
    await client.put(
        "/api/v1/assistant/credential", json={"provider": "claude", "api_key": "sk-fake"}, headers=headers
    )

    seen = {}

    class FakeProvider:
        async def start(self, *, system, history, tools):
            seen["system"] = system
            seen["tools"] = {t.name for t in tools}
            return ProviderResult(
                text=None,
                tool_calls=[ToolCall(id="c1", name="get_plan_progress", arguments={"category_id": category_id})],
            )

        async def continue_with_tool_results(self, results):
            seen["tool_result"] = results[0].content
            return ProviderResult(text="Start with Probabilités: it has no content yet.", tool_calls=[])

    monkeypatch.setattr(orchestrator, "build_provider", lambda provider, api_key, model: FakeProvider())

    resp = await client.post(
        "/api/v1/assistant/chat",
        json={
            "messages": [{"role": "user", "content": "Assess me"}],
            "category_id": category_id,
            "mode": "coach",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["message"]["content"].startswith("Start with Probabilités")

    assert "personal teacher" in seen["system"]
    assert "Goal: Pass the concours" in seen["system"]
    assert "Probabilités [no_content]" in seen["system"]
    assert "Analyse [not_started]" in seen["system"]
    assert {"get_plan", "update_plan", "get_plan_progress", "create_cards_bulk"} <= seen["tools"]
    assert "Probabilités [no_content]" in seen["tool_result"]


async def test_builder_mode_is_unchanged_by_default(client, monkeypatch):
    headers = await _register_and_login(client, "plan-builder@example.com")
    await client.put(
        "/api/v1/assistant/credential", json={"provider": "claude", "api_key": "sk-fake"}, headers=headers
    )
    seen = {}

    class FakeProvider:
        async def start(self, *, system, history, tools):
            seen["system"] = system
            return ProviderResult(text="ok", tool_calls=[])

    monkeypatch.setattr(orchestrator, "build_provider", lambda provider, api_key, model: FakeProvider())
    resp = await client.post(
        "/api/v1/assistant/chat", json={"messages": [{"role": "user", "content": "hi"}]}, headers=headers
    )
    assert resp.status_code == 200
    assert "study-materials assistant" in seen["system"]
    assert "personal teacher" not in seen["system"]
