import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Phaser is ~1.4 MB on its own and the game needs all of it on the first
    // frame, so splitting it would only add a round trip.
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Phaser is ~1.5 MB; the default 2 MB precache ceiling is too tight
        // once the game bundle is added to it.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Neonfall',
        short_name: 'Neonfall',
        description: 'Fall down the neon shaft. Tap to turn.',
        start_url: '.',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#03040C',
        theme_color: '#070A18',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
