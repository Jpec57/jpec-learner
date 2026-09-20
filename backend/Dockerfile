# Production image: code is baked in (no bind mount) and uvicorn runs without
# --reload. Dockerfile.dev is the hot-reload variant used by docker-compose.yml.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# --proxy-headers: trust X-Forwarded-* from the host nginx / Cloudflare in front.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
