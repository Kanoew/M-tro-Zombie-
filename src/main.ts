import Phaser from 'phaser';
import { CONFIG } from './config';
import { MissionScene } from './scenes/MissionScene';
import { UIScene } from './scenes/UIScene';
import { gameState } from './state/gameState';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: CONFIG.view.width,
  height: CONFIG.view.height,
  backgroundColor: '#070b12',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MissionScene, UIScene],
});

// Accès de debug pour les essais dans le navigateur.
(window as unknown as { __game: Phaser.Game; __dm: object }).__game = game;
(window as unknown as { __dm: object }).__dm = { CONFIG, gameState };

/**
 * Cache périmé : GitHub Pages sert index.html avec un cache de plusieurs
 * minutes. version.json est relu sans cache ; si le build publié n'est pas
 * celui chargé, la page se recharge une seule fois.
 */
async function reloadIfStale(): Promise<void> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const remote = (await res.json()) as { build?: string };
    if (!remote.build || remote.build === __BUILD_ID__) return;
    const key = `dm-reloaded-${remote.build}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    location.reload();
  } catch {
    // Hors ligne, mode dev ou stockage bloqué : on joue avec la version chargée.
  }
}
void reloadIfStale();
