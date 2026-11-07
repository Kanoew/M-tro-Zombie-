import Phaser from 'phaser';
import { createAnimations, loadArt } from '../render/characters';

/** Charge les planches et le décor, puis ouvre l'écran titre. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add
      .text(width / 2, height / 2 - 30, 'CHARGEMENT', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#8fe8f5',
      })
      .setOrigin(0.5);
    const frame = this.add.rectangle(width / 2, height / 2 + 20, 400, 16).setStrokeStyle(2, 0x8fe8f5);
    const bar = this.add.rectangle(width / 2 - 198, height / 2 + 20, 1, 12, 0xff4fd8).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => bar.setSize(Math.max(1, 396 * p), 12));
    this.load.on('loaderror', (file: Phaser.Loader.File) => label.setText(`Fichier manquant : ${file.key}`));
    this.events.once('shutdown', () => frame.destroy());
    loadArt(this);
  }

  create(): void {
    createAnimations(this);
    this.scene.start('Title');
  }
}
