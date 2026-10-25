async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_line_results_accumulate_per_user(client):
    headers = await _register_and_login(client, "chess@example.com")
    other = await _register_and_login(client, "chess-other@example.com")

    assert (await client.get("/api/v1/chess/progress", headers=headers)).json() == []

    line = {"course_id": "italian", "line_id": "giuoco-piano"}
    await client.post("/api/v1/chess/progress", json={**line, "flawless": False}, headers=headers)
    resp = await client.post("/api/v1/chess/progress", json={**line, "flawless": True}, headers=headers)
    assert resp.status_code == 200
    assert resp.json() == [{**line, "completed": 2, "flawless": 1}]

    # Another user's progress is separate.
    assert (await client.get("/api/v1/chess/progress", headers=other)).json() == []


async def test_import_merges_and_reset_clears_one_course_or_all(client):
    headers = await _register_and_login(client, "chess-import@example.com")
    await client.post(
        "/api/v1/chess/progress", json={"course_id": "italian", "line_id": "a", "flawless": True}, headers=headers
    )
    resp = await client.post(
        "/api/v1/chess/progress/import",
        json={
            "lines": [
                {"course_id": "italian", "line_id": "a", "completed": 2, "flawless": 5},
                {"course_id": "sicilian", "line_id": "b", "completed": 1, "flawless": 0},
                {"course_id": "sicilian", "line_id": "never", "completed": 0, "flawless": 0},
            ]
        },
        headers=headers,
    )
    assert resp.json() == [
        {"course_id": "italian", "line_id": "a", "completed": 3, "flawless": 3},
        {"course_id": "sicilian", "line_id": "b", "completed": 1, "flawless": 0},
    ]

    reset = await client.request("DELETE", "/api/v1/chess/progress", params={"course_id": "italian"}, headers=headers)
    assert reset.status_code == 204
    remaining = (await client.get("/api/v1/chess/progress", headers=headers)).json()
    assert [row["course_id"] for row in remaining] == ["sicilian"]

    await client.request("DELETE", "/api/v1/chess/progress", headers=headers)
    assert (await client.get("/api/v1/chess/progress", headers=headers)).json() == []
