import { defineConfig } from 'vite';

// base relative : le build marche sur GitHub Pages (sous-dossier du dépôt).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
