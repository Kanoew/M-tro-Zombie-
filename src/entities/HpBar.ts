import Phaser from 'phaser';

const W = 18;
const H = 2.4;

/** Petite barre de vie au-dessus d'un personnage, dans le monde (cachée par les toits). */
export class HpBar {
  private readonly back: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.back = scene.add.rectangle(0, 0, W + 1.6, H + 1.6, 0x05070c, 0.85);
    this.fill = scene.add.rectangle(0, 0, W, H, 0x6bd36b).setOrigin(0, 0.5);
  }

  /** (x, y) : sommet de la tête. `depth` doit suivre celui du personnage. */
  set(x: number, y: number, ratio: number, depth: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    this.back.setPosition(x, y).setDepth(depth + 0.2);
    this.fill
      .setPosition(x - W / 2, y)
      .setDepth(depth + 0.3)
      .setSize(Math.max(0.01, W * r), H)
      .setFillStyle(r > 0.55 ? 0x6bd36b : r > 0.25 ? 0xf2c14e : 0xff4f4f);
  }

  destroy(): void {
    this.back.destroy();
    this.fill.destroy();
  }
}
