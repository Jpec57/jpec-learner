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
