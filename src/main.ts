import Phaser from 'phaser';
import { CONFIG } from './config';
import { BootScene } from './scenes/BootScene';
import { MissionScene } from './scenes/MissionScene';
import { RefugeScene } from './scenes/RefugeScene';
import { RefugeUIScene } from './scenes/RefugeUIScene';
import { TitleScene } from './scenes/TitleScene';
import { UIScene } from './scenes/UIScene';
import { gameState, load, resetSave } from './state/gameState';
import { TERMINAL_TILE, TRAIN_ZONE } from './world/map';

// ?renderer=canvas force le rendu 2D (utile pour les essais automatisés sans carte graphique).
const forceCanvas = new URLSearchParams(window.location.search).get('renderer') === 'canvas';

// Acquis du refuge (crédits, stock, améliorations, survivants) relus avant tout.
load();

const game = new Phaser.Game({
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'app',
  width: CONFIG.view.width,
  height: CONFIG.view.height,
  backgroundColor: '#070b12',
  // Personnages et décor peints : lissage actif. Les tuiles dessinées en code restent nettes (voir textures.ts).
  pixelArt: false,
  antialias: true,
  input: { activePointers: 3 },
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, RefugeScene, RefugeUIScene, MissionScene, UIScene],
});

// Accès de debug pour les essais dans le navigateur.
(window as unknown as { __game: Phaser.Game; __dm: object }).__game = game;
(window as unknown as { __dm: object }).__dm = { CONFIG, gameState, resetSave, TERMINAL_TILE, TRAIN_ZONE };

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
