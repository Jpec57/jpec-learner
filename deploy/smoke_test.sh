#!/usr/bin/env bash
# Smoke test for a deployed JpecLearner, run against the public URL so the
# whole path (Cloudflare -> host nginx -> containers) is exercised. Read-only:
# it creates no data. Called by deploy.sh; also usable on its own:
#
#   deploy/smoke_test.sh [base-url]     (default: https://learn.enter-train-me.fr)
#
# Exits non-zero if any check fails.
set -uo pipefail

BASE="${1:-https://learn.enter-train-me.fr}"
BASE="${BASE%/}"
RETRY_SECONDS="${SMOKE_RETRY_SECONDS:-90}"   # containers/nginx/Cloudflare may need a moment

failed=0
pass() { printf '  \033[32mok\033[0m    %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; failed=1; }

# Retry until the site answers at all (a fresh deploy is briefly unavailable).
wait_for_site() {
  local deadline=$((SECONDS + RETRY_SECONDS)) code
  while :; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/" || true)
    [ "$code" = 200 ] && return 0
    [ "$SECONDS" -ge "$deadline" ] && { echo "  last status from $BASE/: $code"; return 1; }
    sleep 3
  done
}

# check <description> <expected status> <curl args...>  -> body left in $body
check() {
  local desc=$1 want=$2; shift 2
  local out code
  out=$(curl -s --max-time 20 -w '\n%{http_code}' "$@") || { fail "$desc (curl error)"; body=""; return; }
  code=${out##*$'\n'}; body=${out%$'\n'*}
  if [ "$code" = "$want" ]; then pass "$desc ($code)"; else fail "$desc: expected $want, got $code"; fi
}

echo "Smoke test: $BASE"

if ! wait_for_site; then
  fail "site did not return 200 within ${RETRY_SECONDS}s"
  exit 1
fi

# 1. Frontend served, is the SPA shell.
check "frontend index" 200 "$BASE/"
if grep -q 'id="root"' <<<"$body"; then pass "index.html is the SPA shell"; else fail "index.html missing #root"; fi

# 2. Client-side routes fall back to index.html.
check "SPA deep link" 200 "$BASE/some/client/route"

# 3. The bundle was built against the public API URL, not localhost.
asset=$(grep -o '/assets/[^"]*\.js' <<<"$body" | head -1)
if [ -n "$asset" ]; then
  js=$(curl -s --max-time 30 "$BASE$asset")
  if grep -q "$BASE/api/v1" <<<"$js"; then pass "bundle targets $BASE/api/v1"; else fail "bundle does not contain $BASE/api/v1"; fi
  if grep -q 'localhost:8000' <<<"$js"; then fail "bundle still references localhost:8000"; else pass "bundle has no localhost API reference"; fi
else
  fail "could not find a JS asset in index.html"
fi

# 4. Nginx routes /api/ to the backend (JSON 401, not the SPA's HTML).
check "API reachable, auth enforced" 401 "$BASE/api/v1/auth/me"
if grep -q '"detail"' <<<"$body"; then pass "API answers with JSON from the backend"; else fail "API response is not backend JSON"; fi

# 5. Backend <-> Postgres: a login for an unknown user must be a clean 401
#    (it queries the DB; a broken connection would be a 500).
check "database reachable (login unknown user)" 401 \
  -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"smoke-test@jpec-smoke.com","password":"not-a-real-password"}'

# 6. /media/ is routed to the backend's static files (JSON 404, not the SPA).
check "media routed to backend" 404 "$BASE/media/__smoke_test_missing__.png"
if grep -q '"detail"' <<<"$body"; then pass "media 404 comes from the backend"; else fail "media 404 is not backend JSON (routed to SPA?)"; fi

if [ "$failed" = 0 ]; then
  printf '\n\033[1;32mSmoke test passed\033[0m\n'
else
  printf '\n\033[1;31mSmoke test FAILED\033[0m\n'
  exit 1
fi
