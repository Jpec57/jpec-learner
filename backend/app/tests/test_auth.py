async def test_register_login_me_refresh_logout(client):
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "flow@example.com", "password": "password123", "display_name": "Flow"},
    )
    assert register_resp.status_code == 201
    assert register_resp.json()["email"] == "flow@example.com"

    duplicate_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "flow@example.com", "password": "password123"},
    )
    assert duplicate_resp.status_code == 409

    login_resp = await client.post(
        "/api/v1/auth/login", json={"email": "flow@example.com", "password": "password123"}
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    assert tokens["access_token"]
    assert tokens["refresh_token"]

    bad_login_resp = await client.post(
        "/api/v1/auth/login", json={"email": "flow@example.com", "password": "wrong"}
    )
    assert bad_login_resp.status_code == 401

    me_resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "flow@example.com"

    no_auth_resp = await client.get("/api/v1/auth/me")
    assert no_auth_resp.status_code == 401

    refresh_resp = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh_resp.status_code == 200
    new_tokens = refresh_resp.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    reuse_resp = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert reuse_resp.status_code == 401

    logout_resp = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": new_tokens["refresh_token"]}
    )
    assert logout_resp.status_code == 204

    revoked_refresh_resp = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": new_tokens["refresh_token"]}
    )
    assert revoked_refresh_resp.status_code == 401


async def test_update_me_changes_locale_and_display_name(client):
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "settings@example.com", "password": "password123", "locale": "fr"},
    )
    assert register_resp.json()["locale"] == "fr"

    login_resp = await client.post(
        "/api/v1/auth/login", json={"email": "settings@example.com", "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    update_resp = await client.patch(
        "/api/v1/auth/me", json={"locale": "en", "display_name": "Jean"}, headers=headers
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["locale"] == "en"
    assert update_resp.json()["display_name"] == "Jean"

    me_resp = await client.get("/api/v1/auth/me", headers=headers)
    assert me_resp.json()["locale"] == "en"

    invalid_resp = await client.patch("/api/v1/auth/me", json={"locale": "de"}, headers=headers)
    assert invalid_resp.status_code == 422
