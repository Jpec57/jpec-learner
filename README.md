# JpecLearner

Anki-style spaced-repetition learning app (Maths, Japanese, …), built as a mobile-friendly PWA.

- `backend/` — FastAPI + PostgreSQL, JWT auth, SRS engine.
- `frontend/` — React + Vite PWA.

## Development

```
cp .env.example .env   # first time only
docker compose up -d --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000 (docs at `/docs`)
- Adminer (DB browser): http://localhost:8080 (server `db`, user/db from `.env`)

## Migrations

```
docker compose exec backend alembic revision --autogenerate -m "message"
docker compose exec backend alembic upgrade head
```

## Tests

```
docker compose exec backend pytest -q
```

## Build plan

See `/Users/jpec/.claude/plans/clever-scribbling-meteor.md` for the full architecture and phased build plan.
