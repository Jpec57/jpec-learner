from app.services import push as push_service


async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_subscribe_is_idempotent_and_scoped_per_endpoint(client):
    headers = await _register_and_login(client, "push@example.com")
    payload = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc123",
        "keys": {"p256dh": "fake-p256dh", "auth": "fake-auth"},
    }

    first_resp = await client.post("/api/v1/notifications/subscribe", json=payload, headers=headers)
    assert first_resp.status_code == 204

    # Re-subscribing with the same endpoint (e.g. browser refreshed the subscription)
    # updates in place rather than erroring or duplicating.
    second_resp = await client.post("/api/v1/notifications/subscribe", json=payload, headers=headers)
    assert second_resp.status_code == 204

    unsubscribe_resp = await client.request(
        "DELETE",
        "/api/v1/notifications/subscribe",
        params={"endpoint": payload["endpoint"]},
        headers=headers,
    )
    assert unsubscribe_resp.status_code == 204

    # Unsubscribing again (already gone) is a no-op, not an error.
    unsubscribe_again_resp = await client.request(
        "DELETE",
        "/api/v1/notifications/subscribe",
        params={"endpoint": payload["endpoint"]},
        headers=headers,
    )
    assert unsubscribe_again_resp.status_code == 204


async def test_due_count_aggregates_across_categories(client):
    headers = await _register_and_login(client, "duecount@example.com")

    cat_a = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    cat_b = (
        await client.post("/api/v1/categories", json={"name": "Japanese"}, headers=headers)
    ).json()["id"]

    zero_resp = await client.get("/api/v1/reviews/due-count", headers=headers)
    assert zero_resp.json()["total_due"] == 0

    await client.post(
        "/api/v1/cards",
        json={"category_id": cat_a, "front_text": "q1", "back_text": "a1"},
        headers=headers,
    )
    await client.post(
        "/api/v1/cards",
        json={"category_id": cat_b, "front_text": "q2", "back_text": "a2"},
        headers=headers,
    )

    two_resp = await client.get("/api/v1/reviews/due-count", headers=headers)
    assert two_resp.json()["total_due"] == 2


async def test_due_digest_sends_once_per_day(client, monkeypatch):
    headers = await _register_and_login(client, "digest@example.com")
    cat_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    await client.post(
        "/api/v1/cards",
        json={"category_id": cat_id, "front_text": "q1", "back_text": "a1"},
        headers=headers,
    )
    await client.post(
        "/api/v1/notifications/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fcm/send/digest-test",
            "keys": {"p256dh": "fake-p256dh", "auth": "fake-auth"},
        },
        headers=headers,
    )

    sent = []
    monkeypatch.setattr(push_service, "webpush", lambda **kwargs: sent.append(kwargs))

    await push_service.run_due_digest(session_factory=client.session_factory)
    assert len(sent) == 1

    # A second run right away must not re-send -- the 24h cooldown suppresses it
    # even though the card is still due.
    await push_service.run_due_digest(session_factory=client.session_factory)
    assert len(sent) == 1


async def test_due_digest_skips_users_without_due_reviews(client, monkeypatch):
    headers = await _register_and_login(client, "nodue@example.com")
    await client.post(
        "/api/v1/notifications/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fcm/send/nodue-test",
            "keys": {"p256dh": "fake-p256dh", "auth": "fake-auth"},
        },
        headers=headers,
    )

    sent = []
    monkeypatch.setattr(push_service, "webpush", lambda **kwargs: sent.append(kwargs))

    await push_service.run_due_digest(session_factory=client.session_factory)
    assert sent == []
