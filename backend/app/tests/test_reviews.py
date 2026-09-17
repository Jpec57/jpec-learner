async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_card_is_auto_enrolled_and_appears_due_immediately(client):
    headers = await _register_and_login(client, "srs-owner@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "2+2", "back_text": "4"},
            headers=headers,
        )
    ).json()

    state_resp = await client.get(f"/api/v1/reviews/state?card_id={card['id']}", headers=headers)
    assert state_resp.status_code == 200
    state = state_resp.json()
    assert state["repetitions"] == 0
    assert state["current_level"] == 1

    due_resp = await client.get(f"/api/v1/reviews/due?category_id={category_id}", headers=headers)
    assert due_resp.status_code == 200
    due_items = due_resp.json()
    assert len(due_items) == 1
    assert due_items[0]["card_id"] == card["id"]
    assert due_items[0]["front_text"] == "2+2"


async def test_submit_review_updates_interval_and_removes_from_due_until_next_due_date(client):
    headers = await _register_and_login(client, "srs-review@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "2+2", "back_text": "4"},
            headers=headers,
        )
    ).json()
    state = (
        await client.get(f"/api/v1/reviews/state?card_id={card['id']}", headers=headers)
    ).json()

    submit_resp = await client.post(
        f"/api/v1/reviews/{state['id']}/submit", json={"rating": 3}, headers=headers
    )
    assert submit_resp.status_code == 200
    updated = submit_resp.json()
    assert updated["repetitions"] == 1
    assert updated["interval_days"] == 1
    assert updated["last_rating"] == 3
    assert updated["last_reviewed_at"] is not None

    # Interval is 1 day out, so it should no longer show up in the due queue right now.
    due_resp = await client.get(f"/api/v1/reviews/due?category_id={category_id}", headers=headers)
    assert due_resp.json() == []

    invalid_rating_resp = await client.post(
        f"/api/v1/reviews/{state['id']}/submit", json={"rating": 7}, headers=headers
    )
    assert invalid_rating_resp.status_code == 422


async def test_enroll_in_public_card_is_explicit_and_isolated_per_user(client):
    owner_headers = await _register_and_login(client, "public-owner@example.com")
    other_headers = await _register_and_login(client, "public-other@example.com")

    category_id = (
        await client.post(
            "/api/v1/categories", json={"name": "Maths", "is_public": True}, headers=owner_headers
        )
    ).json()["id"]
    card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "q", "back_text": "a", "is_public": True},
            headers=owner_headers,
        )
    ).json()

    # The other user is not auto-enrolled just because the card is public.
    not_enrolled_resp = await client.get(
        f"/api/v1/reviews/state?card_id={card['id']}", headers=other_headers
    )
    assert not_enrolled_resp.status_code == 404

    enroll_resp = await client.post(
        "/api/v1/reviews/enroll", json={"card_id": card["id"]}, headers=other_headers
    )
    assert enroll_resp.status_code == 201
    other_state = enroll_resp.json()

    # Enrolling twice is idempotent (no duplicate row / conflict).
    enroll_again_resp = await client.post(
        "/api/v1/reviews/enroll", json={"card_id": card["id"]}, headers=other_headers
    )
    assert enroll_again_resp.status_code == 201
    assert enroll_again_resp.json()["id"] == other_state["id"]

    # Each user's review progress is independent.
    await client.post(f"/api/v1/reviews/{other_state['id']}/submit", json={"rating": 5}, headers=other_headers)
    owner_state = (
        await client.get(f"/api/v1/reviews/state?card_id={card['id']}", headers=owner_headers)
    ).json()
    assert owner_state["repetitions"] == 0

    # A private card cannot be enrolled into by a non-owner.
    await client.patch(f"/api/v1/categories/{category_id}", json={"is_public": False}, headers=owner_headers)
    private_card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "q2", "back_text": "a2"},
            headers=owner_headers,
        )
    ).json()
    denied_resp = await client.post(
        "/api/v1/reviews/enroll", json={"card_id": private_card["id"]}, headers=other_headers
    )
    assert denied_resp.status_code == 404


async def test_upcoming_buckets_group_overdue_items_into_the_current_hour(client):
    headers = await _register_and_login(client, "upcoming@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    await client.post(
        "/api/v1/cards",
        json={"category_id": category_id, "front_text": "q", "back_text": "a"},
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/reviews/upcoming?category_id={category_id}&hours=6", headers=headers
    )
    assert resp.status_code == 200
    buckets = resp.json()
    assert len(buckets) == 7  # current hour plus the next 6

    # A freshly auto-enrolled card is due immediately, so it lands in the
    # first (current-hour) bucket, not spread across the horizon.
    assert buckets[0]["count"] == 1
    assert sum(b["count"] for b in buckets[1:]) == 0


async def test_due_queue_can_be_filtered_by_content_type(client):
    headers = await _register_and_login(client, "type-filter@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    await client.post(
        "/api/v1/cards",
        json={"category_id": category_id, "front_text": "q", "back_text": "a"},
        headers=headers,
    )
    await client.post(
        "/api/v1/hierarchy",
        json={"category_id": category_id, "node_kind": "lesson", "title": "Limits"},
        headers=headers,
    )

    both_resp = await client.get(f"/api/v1/reviews/due?category_id={category_id}", headers=headers)
    assert {item["item_kind"] for item in both_resp.json()} == {"card", "lesson"}

    cards_only_resp = await client.get(
        f"/api/v1/reviews/due?category_id={category_id}&types=card", headers=headers
    )
    assert {item["item_kind"] for item in cards_only_resp.json()} == {"card"}

    lessons_only_resp = await client.get(
        f"/api/v1/reviews/due?category_id={category_id}&types=lesson", headers=headers
    )
    assert {item["item_kind"] for item in lessons_only_resp.json()} == {"lesson"}


async def test_insights_surface_struggling_and_stale_items(client):
    headers = await _register_and_login(client, "insights@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]

    struggling_card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "hard one", "back_text": "a"},
            headers=headers,
        )
    ).json()
    untouched_card = (
        await client.post(
            "/api/v1/cards",
            json={"category_id": category_id, "front_text": "never reviewed", "back_text": "b"},
            headers=headers,
        )
    ).json()

    state = (
        await client.get(f"/api/v1/reviews/state?card_id={struggling_card['id']}", headers=headers)
    ).json()
    # Good once (repetitions -> 1) then Hard (soft fail: keeps repetitions,
    # lowers ease) -- a card can only be "struggling" (low ease) after having
    # been reviewed at least once, per the SM-2 soft-fail branch.
    await client.post(f"/api/v1/reviews/{state['id']}/submit", json={"rating": 3}, headers=headers)
    await client.post(f"/api/v1/reviews/{state['id']}/submit", json={"rating": 2}, headers=headers)

    resp = await client.get(f"/api/v1/reviews/insights?category_id={category_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["struggling"]) == 1
    assert body["struggling"][0]["card_id"] == struggling_card["id"]
    assert body["struggling"][0]["ease_factor"] < 2.5

    # The never-reviewed card is the most stale (last_reviewed_at is null,
    # sorts first); the touched card is also present but reviewed more recently.
    stale_ids = [item["card_id"] for item in body["stale"]]
    assert stale_ids[0] == untouched_card["id"]
    assert body["stale"][0]["last_reviewed_at"] is None
