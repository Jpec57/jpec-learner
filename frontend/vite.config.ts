import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Enabled in dev too (not just `vite build`) since this app runs via
      // `docker compose up` / `vite dev` rather than a production build+serve.
      devOptions: { enabled: true },
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "JpecLearner",
        short_name: "JpecLearner",
        description: "Spaced-repetition learning for Maths, Japanese, and more.",
        theme_color: "#4f46e5",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Folds the Phase 7 push-notification handler stub into the generated
        // service worker (see public/push-handlers.js).
        importScripts: ["push-handlers.js"],
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
        // The chess engine (~7MB) is too big to precache for every user; it is
        // cached the first time a chess board is opened instead (see below).
        globIgnores: ["**/stockfish-*.wasm"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/stockfish-.*\.wasm$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "chess-engine",
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // /api/ is intentionally NOT cached: every response is per-user and
          // authenticated via the Authorization header, but Workbox's cache key
          // is the request URL alone. Caching it risks serving one account's
          // data to another on the same device after a login switch, or a
          // stale response after any network hiccup (NetworkFirst falls back
          // to cache on timeout). Offline API access was never a requirement.
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/media/"),
            handler: "CacheFirst",
            options: {
              cacheName: "media-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
});
