async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_theme_rollup_and_category_totals(client):
    headers = await _register_and_login(client, "prog-owner@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]

    analysis = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "Analysis"},
            headers=headers,
        )
    ).json()
    lesson = (
        await client.post(
            "/api/v1/hierarchy",
            json={
                "category_id": category_id,
                "parent_id": analysis["id"],
                "node_kind": "lesson",
                "title": "Limits",
            },
            headers=headers,
        )
    ).json()
    card_in_theme = (
        await client.post(
            "/api/v1/cards",
            json={
                "category_id": category_id,
                "lesson_node_id": lesson["id"],
                "front_text": "q1",
                "back_text": "a1",
            },
            headers=headers,
        )
    ).json()
    standalone_card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "q2", "back_text": "a2"},
            headers=headers,
        )
    ).json()

    levels_resp = await client.get("/api/v1/progression/levels")
    assert levels_resp.status_code == 200
    levels = levels_resp.json()
    assert len(levels) == 10
    assert levels[0] == {"level": 1, "name_en": "Novice", "name_fr": "Novice", "icon_key": "seedling"}

    progression_resp = await client.get(
        f"/api/v1/progression/categories/{category_id}", headers=headers
    )
    assert progression_resp.status_code == 200
    progression = progression_resp.json()

    # Everything (lesson, card-in-lesson, standalone card) is auto-enrolled and due now.
    assert progression["total_items"] == 3
    assert progression["total_due"] == 3
    assert progression["streak_days"] == 0  # no reviews submitted yet

    # The standalone card has no lesson_node_id of its own -- it lands in the
    # auto-created "Unclassified" bucket, which is why it now shows up as its
    # own theme rather than being invisible to progression tracking.
    assert len(progression["themes"]) == 2
    theme = next(t for t in progression["themes"] if t["node_id"] == analysis["id"])
    # The theme subtree covers the lesson node itself plus the card attached to it (not the standalone card).
    assert theme["total_items"] == 2
    assert theme["due_count"] == 2
    assert theme["avg_level"] == 1.0

    unclassified_theme = next(t for t in progression["themes"] if t["title"] == "Unclassified")
    assert unclassified_theme["total_items"] == 1
    assert unclassified_theme["due_count"] == 1

    # Review the in-theme card with a strong rating; the theme's avg level should rise
    # while the standalone card (outside any theme) is untouched.
    state = (
        await client.get(f"/api/v1/reviews/state?card_id={card_in_theme['id']}", headers=headers)
    ).json()
    await client.post(f"/api/v1/reviews/{state['id']}/submit", json={"rating": 3}, headers=headers)

    progression_after = (
        await client.get(f"/api/v1/progression/categories/{category_id}", headers=headers)
    ).json()
    theme_after = next(t for t in progression_after["themes"] if t["node_id"] == analysis["id"])
    assert theme_after["due_count"] == 1  # the lesson node is still due, the card isn't anymore
    assert theme_after["total_items"] == 2
    assert progression_after["streak_days"] == 1
    assert progression_after["total_due"] == 2  # lesson + standalone card still due

    # level_distribution is zero-filled for all 10 levels; the reviewed card
    # moved from level 1 to level 2 (SM-2 "Good" on a first review -> repetitions=1).
    distribution = {row["level"]: row["count"] for row in progression_after["level_distribution"]}
    assert len(distribution) == 10
    assert distribution[2] == 1
    assert distribution[1] == 2  # lesson node + standalone card, still untouched


async def test_node_progression_endpoint_works_for_any_node_not_just_roots(client):
    headers = await _register_and_login(client, "node-prog@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    analysis = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "Analysis"},
            headers=headers,
        )
    ).json()
    subgroup = (
        await client.post(
            "/api/v1/hierarchy",
            json={
                "category_id": category_id,
                "parent_id": analysis["id"],
                "node_kind": "group",
                "title": "Limits",
            },
            headers=headers,
        )
    ).json()
    await client.post(
        "/api/v1/cards",
        json={"category_id": category_id, "lesson_node_id": subgroup["id"], "front_text": "q", "back_text": "a"},
        headers=headers,
    )

    resp = await client.get(f"/api/v1/progression/nodes/{subgroup['id']}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["node_id"] == subgroup["id"]
    assert body["title"] == "Limits"
    assert body["total_items"] == 1


async def test_progression_visibility_denied_for_private_category(client):
    owner_headers = await _register_and_login(client, "prog-priv-owner@example.com")
    other_headers = await _register_and_login(client, "prog-priv-other@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Private"}, headers=owner_headers)
    ).json()["id"]

    denied_resp = await client.get(
        f"/api/v1/progression/categories/{category_id}", headers=other_headers
    )
    assert denied_resp.status_code == 404
