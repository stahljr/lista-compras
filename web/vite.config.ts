import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // O alias "@" e a convencao que os componentes do shadcn/ui usam nos imports;
  // sem ele, cada componente colado de fora precisa ter os caminhos reescritos.
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone-192.png', 'icone-512.png', 'icone-apple.png'],
      manifest: {
        name: 'Lista de Compras',
        short_name: 'Lista',
        description: 'Nossa lista de compras, com preços de Angeloni, Festval, Muffato e Condor',
        lang: 'pt-BR',
        theme_color: '#1d4ed8',
        background_color: '#f4f6fb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Fotos dos produtos: cache longo, sao imutaveis e pesam no 4G.
            urlPattern: /^https:\/\/.*\.(vteximg|vtexassets)\.com\.br\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-produtos',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // A fonte tambem precisa valer offline, senao dentro do mercado o
            // app volta para a fonte do sistema e muda de cara.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fontes',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/edge\.osuper\.com\.br\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-produtos',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Carrinho, listas e compra: o app abre com o ultimo estado conhecido
            // mesmo sem sinal dentro do mercado, e revalida quando a rede volta.
            urlPattern: /\/api\/(lists|trips)(\/|$|\?)/,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'dados-lista',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
