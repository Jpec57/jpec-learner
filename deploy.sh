#!/usr/bin/env bash
# Deploy JpecLearner to the VPS: sync the repo (git pull), copy the env files,
# rebuild/restart the production compose stack, apply DB migrations and
# (re)install the host nginx site, then smoke-test the public URL.
#
#   ./deploy.sh
#
# Overridable through the environment:
#   DEPLOY_HOST    ssh target            (default: root@147.93.63.253)
#   DEPLOY_DIR     checkout path on VPS  (default: /root/jpeclearner)
#   DEPLOY_BRANCH  branch to deploy      (default: main)
#   DEPLOY_URL     public URL to smoke-test (default: https://learn.enter-train-me.fr)
#   SKIP_SMOKE=1   skip the post-deploy smoke test
#
# See deploy.md for the one-time setup and the env file layout.
set -euo pipefail

cd "$(dirname "$0")"

HOST="${DEPLOY_HOST:-root@147.93.63.253}"
REMOTE_DIR="${DEPLOY_DIR:-/root/jpeclearner}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO_URL="$(git remote get-url origin)"
SITE_URL="${DEPLOY_URL:-https://learn.enter-train-me.fr}"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Local sanity checks ----------------------------------------------------
[ -f .env ] || die ".env not found (cp .env.example .env and fill it in)"

# The server pulls from GitHub, so it only ever sees what has been pushed.
git fetch --quiet origin "$BRANCH" || warn "could not fetch origin/$BRANCH"
if [ -n "$(git log "origin/$BRANCH..HEAD" --oneline 2>/dev/null)" ]; then
  warn "local commits not pushed to origin/$BRANCH -- they will NOT be deployed:"
  git log "origin/$BRANCH..HEAD" --oneline >&2
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  warn "uncommitted changes in the working tree -- they will NOT be deployed"
fi

# --- 1. Sync the repo on the server -----------------------------------------
# -A forwards your local ssh-agent so the server can clone/pull the private
# GitHub repo without a key of its own (skip it if you set up a deploy key).
log "Syncing $REPO_URL ($BRANCH) -> $HOST:$REMOTE_DIR"
ssh -A "$HOST" bash -s -- "$REMOTE_DIR" "$BRANCH" "$REPO_URL" <<'REMOTE'
set -euo pipefail
dir=$1 branch=$2 repo=$3
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"

if [ ! -d "$dir/.git" ]; then
  echo "First deploy: cloning"
  mkdir -p "$(dirname "$dir")"
  git clone --branch "$branch" "$repo" "$dir"
else
  cd "$dir"
  git fetch origin "$branch"
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ]; then
    echo "Already up to date ($(git rev-parse --short HEAD))"
  else
    git checkout "$branch"
    git pull --ff-only origin "$branch"
  fi
fi
REMOTE

# --- 2. Copy env files ------------------------------------------------------
# .env is always overwritten from the local copy. .env.local (per-server
# overrides, loaded after .env so it wins) is only pushed if it exists locally;
# otherwise a .env.local already on the server is left alone.
log "Copying env files"
scp -q .env "$HOST:$REMOTE_DIR/.env"
ssh "$HOST" "chmod 600 '$REMOTE_DIR/.env'"
if [ -f .env.local ]; then
  scp -q .env.local "$HOST:$REMOTE_DIR/.env.local"
  ssh "$HOST" "chmod 600 '$REMOTE_DIR/.env.local'"
  echo "Copied .env and .env.local"
else
  echo "Copied .env (no local .env.local; server's own, if any, is kept)"
fi

# --- 3. Build & restart the stack, migrate, install the nginx site ----------
log "Building and starting containers"
ssh "$HOST" bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
cd "$1"

# --env-file disables compose's implicit .env loading, so list both; later
# files override earlier ones.
env_args=(--env-file .env)
[ -f .env.local ] && env_args+=(--env-file .env.local)
compose() { docker compose -f docker-compose.prod.yml "${env_args[@]}" "$@"; }

# The frontend bakes VITE_API_BASE_URL into the bundle; a localhost value means
# .env.local (with the public URL) is missing, and the site would be broken.
if compose config | grep -Eq 'VITE_API_BASE_URL: .*localhost'; then
  echo "error: VITE_API_BASE_URL points at localhost. Create .env.local (see deploy.md)." >&2
  exit 1
fi

# </dev/null everywhere: this script arrives on ssh's stdin, and docker would
# otherwise swallow the rest of it (the nginx step silently never ran).
compose up -d --build --remove-orphans --wait --wait-timeout 300 </dev/null

# The backend only runs `alembic upgrade head` when its container starts. If a
# deploy changed just migrations, compose leaves the container untouched, so
# run it explicitly (a no-op when already up to date).
compose exec -T backend alembic upgrade head </dev/null

# Host nginx: symlink the site from the repo, validate, reload. A broken config
# never stays enabled (that would also break every other site on reload).
site=learn.enter-train-me.fr
src="$PWD/deploy/nginx/$site.conf"
link="/etc/nginx/sites-enabled/$site"
created=0
if [ -e "$link" ] && [ ! -L "$link" ]; then
  echo "error: $link exists and is not a symlink; refusing to replace it" >&2
  exit 1
fi
if [ "$(readlink "$link" || true)" != "$src" ]; then
  ln -sfn "$src" "$link"
  created=1
fi
if nginx -t; then
  systemctl reload nginx
else
  [ "$created" = 1 ] && rm -f "$link"
  echo "error: nginx config invalid; site not enabled" >&2
  exit 1
fi

echo
compose ps
REMOTE

# --- 4. Smoke test ----------------------------------------------------------
# Runs from here against the public URL (Cloudflare -> nginx -> containers).
# Set SKIP_SMOKE=1 to skip. A failure makes the whole deploy exit non-zero.
if [ "${SKIP_SMOKE:-0}" != 1 ]; then
  log "Smoke test"
  deploy/smoke_test.sh "$SITE_URL" || die "smoke test failed -- the deploy is live but broken; see output above (logs: dc logs on the server, see deploy.md)"
fi

log "Deployed $(git rev-parse --short "origin/$BRANCH") -> $SITE_URL"
