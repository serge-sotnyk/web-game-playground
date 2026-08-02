import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      injectRegister: null,
      manifest: {
        name: 'Flux Flip',
        short_name: 'Flux Flip',
        description: 'Flip polarity and thread the reactor gates.',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#071225',
        background_color: '#071225',
        start_url: './',
        scope: './',
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
      workbox: {
        // Manifest icons and the webmanifest are injected by the plugin; glob the remaining output.
        globPatterns: ['**/*.{html,js,css,svg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
