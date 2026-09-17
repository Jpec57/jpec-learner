async def _register_and_login(client, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "password123", "display_name": email}
    )
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_category_visibility_between_users(client):
    owner_headers = await _register_and_login(client, "owner@example.com")
    other_headers = await _register_and_login(client, "other@example.com")

    create_resp = await client.post(
        "/api/v1/categories", json={"name": "Private Maths"}, headers=owner_headers
    )
    assert create_resp.status_code == 201
    category_id = create_resp.json()["id"]

    forbidden = await client.get(f"/api/v1/categories/{category_id}", headers=other_headers)
    assert forbidden.status_code == 404

    patch_resp = await client.patch(
        f"/api/v1/categories/{category_id}", json={"is_public": True}, headers=owner_headers
    )
    assert patch_resp.status_code == 200

    now_visible = await client.get(f"/api/v1/categories/{category_id}", headers=other_headers)
    assert now_visible.status_code == 200

    edit_denied = await client.patch(
        f"/api/v1/categories/{category_id}", json={"name": "Hijacked"}, headers=other_headers
    )
    assert edit_denied.status_code == 403


async def test_hierarchy_tree_move_and_cycle_prevention(client):
    headers = await _register_and_login(client, "tree@example.com")

    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]

    a = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "A"},
            headers=headers,
        )
    ).json()
    b = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "parent_id": a["id"], "node_kind": "group", "title": "B"},
            headers=headers,
        )
    ).json()
    lesson = (
        await client.post(
            "/api/v1/hierarchy",
            json={
                "category_id": category_id,
                "parent_id": b["id"],
                "node_kind": "lesson",
                "title": "L",
                "body_markdown": "line one\nline two",
            },
            headers=headers,
        )
    ).json()
    assert lesson["body_markdown"] == "line one\nline two"

    roots = (
        await client.get(f"/api/v1/hierarchy?category_id={category_id}", headers=headers)
    ).json()
    assert len(roots) == 1
    assert roots[0]["has_children"] is True

    # A node cannot become its own descendant's child.
    cycle_resp = await client.post(
        f"/api/v1/hierarchy/{a['id']}/move", json={"new_parent_id": b["id"]}, headers=headers
    )
    assert cycle_resp.status_code == 400

    # Lessons cannot have children.
    invalid_parent_resp = await client.post(
        "/api/v1/hierarchy",
        json={"category_id": category_id, "parent_id": lesson["id"], "node_kind": "group", "title": "X"},
        headers=headers,
    )
    assert invalid_parent_resp.status_code == 400

    # Move B (and its lesson subtree) to root; A should end up childless.
    move_resp = await client.post(
        f"/api/v1/hierarchy/{b['id']}/move", json={"new_parent_id": None}, headers=headers
    )
    assert move_resp.status_code == 200
    assert move_resp.json()["parent_id"] is None

    a_children = (
        await client.get(
            f"/api/v1/hierarchy?category_id={category_id}&parent_id={a['id']}", headers=headers
        )
    ).json()
    assert a_children == []

    b_children = (
        await client.get(
            f"/api/v1/hierarchy?category_id={category_id}&parent_id={b['id']}", headers=headers
        )
    ).json()
    assert [n["id"] for n in b_children] == [lesson["id"]]

    # Cascade delete: deleting B removes the lesson underneath it too.
    delete_resp = await client.delete(f"/api/v1/hierarchy/{b['id']}", headers=headers)
    assert delete_resp.status_code == 204
    gone_resp = await client.get(f"/api/v1/hierarchy/{lesson['id']}", headers=headers)
    assert gone_resp.status_code == 404


async def test_sibling_titles_must_be_unique(client):
    headers = await _register_and_login(client, "siblings@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]

    first = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "Analysis"},
            headers=headers,
        )
    ).json()

    # Same title at the same (root) level is rejected...
    dup_root_resp = await client.post(
        "/api/v1/hierarchy",
        json={"category_id": category_id, "node_kind": "group", "title": "Analysis"},
        headers=headers,
    )
    assert dup_root_resp.status_code == 409

    # ...even with incidental leading/trailing whitespace...
    dup_whitespace_resp = await client.post(
        "/api/v1/hierarchy",
        json={"category_id": category_id, "node_kind": "group", "title": "  Analysis  "},
        headers=headers,
    )
    assert dup_whitespace_resp.status_code == 409

    # ...but the same title is fine at a different level (nested under "Analysis").
    nested_resp = await client.post(
        "/api/v1/hierarchy",
        json={
            "category_id": category_id,
            "parent_id": first["id"],
            "node_kind": "group",
            "title": "Analysis",
        },
        headers=headers,
    )
    assert nested_resp.status_code == 201

    # Renaming a second sibling to collide is also rejected.
    second = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "Algebra"},
            headers=headers,
        )
    ).json()
    rename_conflict_resp = await client.patch(
        f"/api/v1/hierarchy/{second['id']}", json={"title": "Analysis"}, headers=headers
    )
    assert rename_conflict_resp.status_code == 409

    # And moving a node under a parent that already has that title is rejected too.
    third = (
        await client.post(
            "/api/v1/hierarchy",
            json={
                "category_id": category_id,
                "parent_id": second["id"],
                "node_kind": "group",
                "title": "Analysis",
            },
            headers=headers,
        )
    ).json()
    move_conflict_resp = await client.post(
        f"/api/v1/hierarchy/{third['id']}/move", json={"new_parent_id": None}, headers=headers
    )
    assert move_conflict_resp.status_code == 409


async def test_unclassified_title_is_reserved_at_root_only(client):
    headers = await _register_and_login(client, "unclassified@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]

    create_resp = await client.post(
        "/api/v1/hierarchy",
        json={"category_id": category_id, "node_kind": "group", "title": "Unclassified"},
        headers=headers,
    )
    assert create_resp.status_code == 400

    # Case-insensitive, and matches the system-created node too (see cards.py
    # resolving lesson_node_id=None) -- renaming into collision is rejected.
    group = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "Vocab"},
            headers=headers,
        )
    ).json()
    rename_resp = await client.patch(
        f"/api/v1/hierarchy/{group['id']}", json={"title": "unclassified"}, headers=headers
    )
    assert rename_resp.status_code == 400

    # Nested (non-root) nodes may use the name freely -- the reservation only
    # matters where get_or_create_unclassified_node actually looks.
    nested_resp = await client.post(
        "/api/v1/hierarchy",
        json={"category_id": category_id, "parent_id": group["id"], "node_kind": "group", "title": "Unclassified"},
        headers=headers,
    )
    assert nested_resp.status_code == 201


async def test_hierarchy_flat_lists_every_node_in_category(client):
    headers = await _register_and_login(client, "flat@example.com")
    category_id = (
        await client.post("/api/v1/categories", json={"name": "Maths"}, headers=headers)
    ).json()["id"]
    group = (
        await client.post(
            "/api/v1/hierarchy",
            json={"category_id": category_id, "node_kind": "group", "title": "Analysis"},
            headers=headers,
        )
    ).json()
    await client.post(
        "/api/v1/hierarchy",
        json={"category_id": category_id, "parent_id": group["id"], "node_kind": "lesson", "title": "Limits"},
        headers=headers,
    )

    flat_resp = await client.get(f"/api/v1/hierarchy/flat?category_id={category_id}", headers=headers)
    assert flat_resp.status_code == 200
    titles = {node["title"] for node in flat_resp.json()}
    assert titles == {"Analysis", "Limits"}
