import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };
// Identifiant unique de ce build (change à chaque déploiement).
const buildId = new Date().toISOString();

/** Publie version.json à côté du jeu : la page s'en sert pour détecter un cache périmé. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, build: buildId }),
      });
    },
  };
}

// base relative : le build marche sur GitHub Pages (sous-dossier du dépôt).
export default defineConfig({
  base: './',
  plugins: [versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: { chunkSizeWarningLimit: 1500 },
});
