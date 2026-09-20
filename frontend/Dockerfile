# Production image: build the Vite bundle, serve it as static files.
# (Dockerfile.dev is the hot-reload dev server used by docker-compose.yml.)
FROM node:22-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@10.28.1

# Frozen install straight from pnpm-lock.yaml (includes every platform's native
# optional deps, e.g. rollup/esbuild for the x86-64 VPS as well as arm64 Macs).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Baked into the bundle at build time, so it must be the public API URL as seen
# by the browser (e.g. https://learn.enter-train-me.fr/api/v1).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
