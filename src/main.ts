import Phaser from 'phaser';
import { CONFIG } from './config';
import { MissionScene } from './scenes/MissionScene';
import { UIScene } from './scenes/UIScene';

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
(window as unknown as { __game: Phaser.Game }).__game = game;
