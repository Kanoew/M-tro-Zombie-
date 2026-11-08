import Phaser from 'phaser';
import { CONFIG } from '../config';

/**
 * Formes simples générées en code : suffisent au prototype et restent lisibles
 * sur petit écran. Un vrai jeu de sprites les remplacera sous les mêmes clés.
 */
export function createTextures(scene: Phaser.Scene): void {
  const T = CONFIG.tile;

  const make = (
    key: string,
    draw: (g: Phaser.GameObjects.Graphics) => void,
    w = T,
    h = T,
  ) => {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
    // Tuiles en pixels francs ; les personnages et le décor peints restent lissés.
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  };

  make('street', (g) => {
    g.fillStyle(0x182030).fillRect(0, 0, T, T);
    g.fillStyle(0x1e2838).fillRect(0, 0, T, 1).fillRect(0, 0, 1, T);
  });
  make('floor', (g) => {
    g.fillStyle(0x2b3040).fillRect(0, 0, T, T);
    g.fillStyle(0x333a4c).fillRect(0, 0, T, 1).fillRect(0, 0, 1, T);
  });
  make('quay', (g) => {
    g.fillStyle(0x233238).fillRect(0, 0, T, T);
    g.fillStyle(0x2c3f46).fillRect(0, 0, T, 1).fillRect(0, 0, 1, T);
    g.fillStyle(0x1b272c).fillRect(T - 1, 0, 1, T).fillRect(0, T - 1, T, 1);
  });
  make('wall', (g) => {
    g.fillStyle(0x0a0e16).fillRect(0, 0, T, T);
    g.fillStyle(0x1f7a86).fillRect(0, 0, T, 2);
    g.fillStyle(0x121a26).fillRect(0, T - 3, T, 3);
  });
  make('door', (g) => {
    g.fillStyle(0x5c2a78).fillRect(0, 0, T, T);
    g.fillStyle(0xd264ff).fillRect(2, 2, T - 4, 2).fillRect(2, T - 4, T - 4, 2);
  });
  make('door_open', (g) => {
    g.fillStyle(0x1c1226).fillRect(0, 0, T, T);
    g.lineStyle(1, 0xd264ff).strokeRect(0.5, 0.5, T - 1, T - 1);
  });
  make('crate', (g) => {
    g.fillStyle(0x1f6f63).fillRect(1, 1, T - 2, T - 2);
    g.fillStyle(0x58e6cc).fillRect(1, 7, T - 2, 2).fillRect(7, 1, 2, T - 2);
  });
  make('crate_open', (g) => {
    g.fillStyle(0x12332e).fillRect(1, 1, T - 2, T - 2);
    g.lineStyle(1, 0x58e6cc).strokeRect(1.5, 1.5, T - 3, T - 3);
  });
  make(
    'arrow',
    (g) => {
      g.fillStyle(0xd8d0c0).fillRect(0, 1, 8, 1);
      g.fillStyle(0xffffff).fillRect(8, 0, 2, 3);
      g.fillStyle(0xff4f4f).fillRect(0, 0, 2, 3);
    },
    10,
    3,
  );
  make('terminal', (g) => {
    g.fillStyle(0x1a3a5c).fillRect(1, 1, T - 2, T - 2);
    g.fillStyle(0x58d0ff).fillRect(3, 3, T - 6, 6);
    g.fillStyle(0xff4f8b).fillRect(3, 11, 3, 2);
  });
}
