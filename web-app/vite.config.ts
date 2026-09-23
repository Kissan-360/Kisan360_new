import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // index.html already links /manifest.json from public/, so leave one
      // source of truth for the manifest rather than generating a second.
      manifest: false,
      includeAssets: ['kisan360-mark.png', 'logo192.png', 'logo512.png', 'apple-touch-icon.png', 'farmer-ramesh.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The trained grader (mobileNetV2, ~8.8 MB across three shards) is
        // deliberately NOT precached. Precaching it would attach a heavy
        // download to the install step for exactly the users with the worst
        // connections — the ones this app exists for. It is fetched on first
        // use instead, and cropGrader.ts already degrades to rule-based
        // grading when that fetch fails.
        // Also excluded: the TF.js runtime chunk (~1.1 MB, emitted as
        // `assets/dist-<hash>.js` because cropGrader.ts imports
        // '@tensorflow/tfjs' dynamically). It is only needed on the grading
        // screen, so precaching it would charge every farmer for a feature most
        // visits never touch. It is cache-first on first use instead — and if
        // that fetch fails offline, grading falls back to the AGMARK rules.
        // (This glob tracks an emitted name; if a build ever renames it the
        // result is a heavier install, never a broken app.)
        globIgnores: ['**/models/**', '**/assets/dist-*.js'],
        navigateFallback: '/index.html',
        // The shell must never answer an API call.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // The TF.js runtime, fetched the first time a farmer opens the
            // grader and kept thereafter (immutable, hash-named URL).
            urlPattern: ({ url }) => /\/assets\/dist-[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kisan360-ml-runtime-v1',
              expiration: { maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Read-only market data: stale-while-revalidate. A farmer on a
            // patchy connection gets the last good prices immediately and a
            // refresh in the background — and the provenance chip on screen
            // already reports how old those numbers are, so serving them is
            // honest rather than misleading.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/market/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'kisan360-market-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Everything else (auth, lots, offers, payments, grievances) is a
            // live transaction. Serving it from a cache would be wrong, so it
            // is explicitly network-only rather than relying on the default.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      // Keep the service worker out of `npm run dev`: it would mask HMR and the
      // browser harness would measure a cached page instead of the real one.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  define: {
    'process.env.REACT_APP_API_URL': JSON.stringify(process.env.VITE_API_URL || '/api'),
    // Build stamp: lets anyone verify which bundle a deployment serves
    // (Settings → About). Render rebuilds on every push; a stale page means
    // the deploy hasn't landed or the browser cached the old bundle.
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
});
