import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the build also works when deployed under a subpath.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      // The generated service worker takes over immediately, but nothing in the
      // app reloads the page for it — a run in progress is never interrupted.
      // Fresh assets are picked up on the next navigation. See NOTES.md.
      registerType: 'autoUpdate',
      injectRegister: null,
      // The globPatterns below already sweep everything in public/, so neither
      // `includeAssets` nor the automatic manifest-icon pass is needed — both
      // would only add duplicate precache entries.
      includeManifestIcons: false,
      workbox: {
        // `webmanifest` is omitted deliberately: the plugin precaches the
        // manifest itself, and matching it here would double the entry.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // No runtime caching rules: the game never talks to the network.
        runtimeCaching: [],
      },
      manifest: {
        name: 'Flux Flip',
        short_name: 'Flux Flip',
        description: 'Flip polarity and thread the reactor gates.',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#071225',
        background_color: '#071225',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
