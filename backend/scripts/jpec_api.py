"""Minimal client for the jpeclearner HTTP API, shared by the import scripts.

Standard library only, so the scripts run on the host without the backend's
virtualenv. Every write goes through the API, which keeps validation, hierarchy
paths and review-state enrolment in one place.
"""

import json
import mimetypes
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

DEFAULT_API = "http://localhost:8000/api/v1"


class ApiError(RuntimeError):
    pass


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    # ------------------------------------------------------------- transport

    def _send(self, method: str, path: str, data: bytes | None, content_type: str | None, params: dict | None):
        url = self.base + path
        if params:
            url += "?" + "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items() if v is not None)
        headers = {}
        if content_type:
            headers["Content-Type"] = content_type
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = response.read()
        except urllib.error.HTTPError as error:
            raise ApiError(f"{method} {path} -> {error.code}: {error.read().decode(errors='replace')}") from error
        except urllib.error.URLError as error:
            raise ApiError(f"Cannot reach the API at {self.base} ({error.reason}). Is `docker compose up` running?") from error
        return json.loads(payload) if payload else None

    def request(self, method: str, path: str, body: dict | None = None, params: dict | None = None):
        data = json.dumps(body).encode() if body is not None else None
        return self._send(method, path, data, "application/json", params)

    def upload(self, path: str, file_path: Path, fields: dict[str, str]):
        """POST a multipart/form-data request with one `file` part plus text fields."""
        boundary = uuid.uuid4().hex
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        parts: list[bytes] = []
        for name, value in fields.items():
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
            )
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n".encode()
        )
        parts.append(file_path.read_bytes())
        parts.append(f"\r\n--{boundary}--\r\n".encode())
        return self._send("POST", path, b"".join(parts), f"multipart/form-data; boundary={boundary}", None)

    # ------------------------------------------------------------------ auth

    def login(self, email: str, password: str) -> None:
        self.token = self.request("POST", "/auth/login", {"email": email, "password": password})["access_token"]

    # ------------------------------------------------------------ categories

    def find_or_create_category(self, name: str, deck_type: str | None = None) -> str:
        for category in self.request("GET", "/categories"):
            if category["name"].casefold() == name.casefold():
                return category["id"]
        body: dict = {"name": name}
        if deck_type:
            body["deck_type"] = deck_type
        return self.request("POST", "/categories", body)["id"]

    # ------------------------------------------------------------- hierarchy

    def children(self, category_id: str, parent_id: str | None) -> list[dict]:
        return self.request("GET", "/hierarchy", params={"category_id": category_id, "parent_id": parent_id})

    def find_or_create_node(
        self,
        category_id: str,
        parent_id: str | None,
        title: str,
        kind: str = "group",
        *,
        order_index: int | None = None,
        body_markdown: str | None = None,
        siblings: list[dict] | None = None,
    ) -> tuple[dict, bool]:
        """Returns (node, created). Matches an existing sibling by kind and title (case-insensitive)."""
        title = title[:200]
        for node in siblings if siblings is not None else self.children(category_id, parent_id):
            if node["node_kind"] == kind and node["title"].casefold() == title.casefold():
                return node, False
        body: dict = {"category_id": category_id, "parent_id": parent_id, "node_kind": kind, "title": title}
        if order_index is not None:
            body["order_index"] = order_index
        if kind == "lesson" and body_markdown is not None:
            body["body_markdown"] = body_markdown
        return self.request("POST", "/hierarchy", body), True

    def find_or_create_group(self, category_id: str, parent_id: str | None, title: str) -> str:
        return self.find_or_create_node(category_id, parent_id, title, "group")[0]["id"]

    def update_node(self, node_id: str, **fields) -> dict:
        return self.request("PATCH", f"/hierarchy/{node_id}", fields)

    # ----------------------------------------------------------------- cards

    def cards(self, category_id: str, node_id: str) -> list[dict]:
        cards: list[dict] = []
        offset = 0
        while True:
            page = self.request(
                "GET",
                "/cards",
                params={"category_id": category_id, "lesson_node_id": node_id, "limit": 100, "offset": offset},
            )
            cards.extend(page["items"])
            offset += 100
            if offset >= page["total"]:
                return cards

    def existing_fronts(self, category_id: str, node_id: str) -> set[str]:
        return {card["front_text"] for card in self.cards(category_id, node_id)}

    def create_card(self, category_id: str, node_id: str, front: str, back: str, hint: str | None = None) -> dict:
        return self.request(
            "POST",
            "/cards",
            {
                "category_id": category_id,
                "lesson_node_id": node_id,
                "front_text": front,
                "back_text": back,
                "hint": hint,
                "answer_mode": "reveal",
            },
        )

    def update_card(self, card_id: str, **fields) -> dict:
        return self.request("PATCH", f"/cards/{card_id}", fields)

    # ---------------------------------------------------------------- images

    def upload_image(self, file_path: Path, *, card_id: str | None = None, lesson_node_id: str | None = None) -> dict:
        fields = {"card_id": card_id} if card_id else {"lesson_node_id": lesson_node_id}
        return self.upload("/images", file_path, fields)

    def delete_image(self, image_id: str) -> None:
        self.request("DELETE", f"/images/{image_id}")
