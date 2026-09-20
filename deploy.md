# Deploying to the VPS

The app is served at **https://learn.enter-train-me.fr**.

```
./deploy.sh
```

That's the whole routine. The script:

1. warns if you have unpushed commits or uncommitted changes (the server only sees what is on GitHub),
2. `git clone`s the repo on the VPS the first time, otherwise `git pull --ff-only` (skipped when already up to date),
3. `scp`s your local `.env` and `.env.local` to the server, mode `600`,
4. refuses to continue if the frontend would be built against `localhost` (i.e. `.env.local` is missing),
5. runs `docker compose -f docker-compose.prod.yml up -d --build --remove-orphans --wait`,
6. runs `alembic upgrade head` in the backend (needed when a deploy only changes migrations, since the backend only migrates on container start),
7. symlinks `deploy/nginx/learn.enter-train-me.fr.conf` into `/etc/nginx/sites-enabled/` (first time only), runs `nginx -t`, and reloads nginx. If the test fails, a newly created symlink is removed again so a bad config never stays enabled for the other sites,
8. prints `docker compose ps`,
9. runs `deploy/smoke_test.sh` against the public URL (see below). If it fails, `deploy.sh` exits non-zero.

Deploy target, all overridable per run, e.g. `DEPLOY_BRANCH=dev ./deploy.sh`:

| Variable        | Default              |
| --------------- | -------------------- |
| `DEPLOY_HOST`   | `root@147.93.63.253` |
| `DEPLOY_DIR`    | `/root/jpeclearner`  |
| `DEPLOY_BRANCH` | `main`               |

## Smoke test

`deploy/smoke_test.sh [url]` runs at the end of every deploy, from your machine against the public URL, so it covers Cloudflare and nginx as well as the containers. It is read-only (creates no data) and retries for up to 90s while a fresh deploy comes up. It checks that:

- `/` returns the SPA shell and a deep link (`/some/client/route`) falls back to it,
- the JS bundle targets `https://learn.enter-train-me.fr/api/v1` and has no `localhost:8000` left,
- `/api/v1/auth/me` returns a JSON 401 (nginx routes to the backend, auth is enforced),
- a login for an unknown user returns a clean 401 (backend can reach Postgres; a broken DB would be a 500),
- `/media/...` is answered by the backend (JSON 404) rather than the SPA.

Run it on its own any time with `deploy/smoke_test.sh`. `SKIP_SMOKE=1 ./deploy.sh` skips it, and `DEPLOY_URL=... ./deploy.sh` points it at another URL.

## Architecture

```
browser ── HTTPS ──> Cloudflare (proxied) ── HTTPS ──> host nginx (:443)
                                                          ├─ /api/, /media/ ─> backend   127.0.0.1:8000
                                                          └─ /              ─> frontend  127.0.0.1:5173 (nginx serving the built bundle)
                                                       db (127.0.0.1:5433), adminer (127.0.0.1:8080), ocr (internal only)
```

- `docker-compose.prod.yml` is the production stack. `docker-compose.yml` stays the dev setup (hot reload, Vite dev server).
- Everything is same-origin under `learn.enter-train-me.fr`; the containers only listen on `127.0.0.1`, so nothing but nginx is reachable from the internet.
- The nginx site lives in the repo: `deploy/nginx/learn.enter-train-me.fr.conf`. It uses the same Cloudflare origin certificate (`/etc/ssl/certs/cloudflare.crt`) as the other `enter-train-me.fr` sites.
- Cloudflare: `learn.enter-train-me.fr` is a proxied CNAME to `enter-train-me.fr` (already exists), and the zone's SSL mode is `full`. Nothing to configure there.

To enable the nginx site by hand instead of through the script:

```
ln -s /root/jpeclearner/deploy/nginx/learn.enter-train-me.fr.conf /etc/nginx/sites-enabled/learn.enter-train-me.fr
nginx -t && systemctl reload nginx
```

## Prerequisites (already true on the VPS as of writing)

- Ubuntu with Docker Engine + Compose v2.24+ (needed for multiple `--env-file`; the VPS has 2.34), `git`, and `nginx`.
- SSH access as root from your machine.
- Your local `ssh-agent` has the key that can read `Jpec57/jpec-learner` on GitHub (`ssh-add -l` to check). The script uses `ssh -A` so the server clones/pulls with your key and needs no credentials of its own.

### Alternative: a deploy key on the server

If you'd rather not forward your agent, create a read-only deploy key on the VPS and drop `-A` from the first `ssh` call in `deploy.sh`:

```
ssh root@147.93.63.253 'ssh-keygen -t ed25519 -N "" -f ~/.ssh/jpeclearner_deploy && cat ~/.ssh/jpeclearner_deploy.pub'
```

Add the printed public key at GitHub → repo → Settings → Deploy keys (read-only), then on the server add to `~/.ssh/config`:

```
Host github.com
  IdentityFile ~/.ssh/jpeclearner_deploy
```

## Env files

Compose is started with `--env-file .env --env-file .env.local`; later files win.

- **`.env`** is copied from your local `.env` on every deploy (same credentials as local). Don't edit it on the server, the next deploy overwrites it.
- **`.env.local`** holds the production overrides. It is copied from your local project root on every deploy; if it doesn't exist locally, an existing `.env.local` on the server is left untouched. Both files are gitignored. Local `docker compose up` (dev) only reads `.env`, so a local `.env.local` doesn't affect development.

Your `.env` points at `localhost`, so `.env.local` must contain at least:

```
VITE_API_BASE_URL=https://learn.enter-train-me.fr/api/v1
CORS_ORIGINS=https://learn.enter-train-me.fr
```

`VITE_API_BASE_URL` is baked into the frontend bundle at build time (it's used by the browser), so changing it requires a rebuild, which `./deploy.sh` does. Add any other overrides (different DB password, R2 bucket, …) to the same file.

## First deploy

1. Make sure everything (including `deploy.sh`, `docker-compose.prod.yml`, `deploy/`, the new Dockerfiles) is committed and pushed to `main`.
2. Check `.env.local` exists locally with the values above.
3. `./deploy.sh`

The first run builds the `ocr` image (PaddlePaddle + PyTorch CPU wheels), so expect several minutes. Later deploys reuse the Docker layer cache. The OCR models download on first use and persist in named volumes.

## Useful commands on the server

```
ssh root@147.93.63.253
cd /root/jpeclearner
alias dc='docker compose -f docker-compose.prod.yml --env-file .env --env-file .env.local'

dc ps
dc logs -f backend        # or frontend / ocr / db
dc restart backend
dc exec backend alembic current
dc exec db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

Adminer and Postgres only listen on the server's localhost. Reach them with an SSH tunnel from your machine:

```
ssh -L 8080:localhost:8080 -L 5433:localhost:5433 root@147.93.63.253
# then http://localhost:8080 (server "db") and localhost:5433
```

## Rolling back

The server is a plain git checkout, so to go back to an earlier commit:

```
cd /root/jpeclearner
git checkout <commit>
dc up -d --build
```

The next `./deploy.sh` switches back to the branch and pulls. `alembic upgrade head` does not undo migrations: downgrade them by hand (`dc exec backend alembic downgrade -1`) *before* checking out older code if a migration was involved.

## Notes

- **Shared host.** The VPS also runs other stacks (nginx on 80/443, apps on 3000/3004/3005/3057/9999). This project uses 127.0.0.1:5173, :8000, :5433 and :8080, which don't collide.
- **Timeouts.** Cloudflare cuts proxied requests at 100 seconds, so a very slow OCR scan can fail even though nginx allows 120s.
- **Uploads** are limited to 20 MB by nginx (`client_max_body_size`).
- **Docker cleanup.** Old image layers pile up over many deploys; reclaim space occasionally with `docker image prune -f` (only removes dangling images) after checking nothing else needs them.
