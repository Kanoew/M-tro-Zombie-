import Phaser from 'phaser';
import { CONFIG } from '../config';
import { TRACK, TRAIN_DOOR } from '../world/map';

const T = CONFIG.tile;
const CAR_WIDTH = 22 * T;
const CAR_HEIGHT = 5 * T;
const DOOR_WIDTH = (TRAIN_DOOR.x1 - TRAIN_DOOR.x0 + 1) * T;
const DOOR_X = TRAIN_DOOR.x0 * T + DOOR_WIDTH / 2;
const TRACK_TOP = TRACK.y0 * T;
const CAR_LEFT = DOOR_X - CAR_WIDTH / 2;
const OFFSCREEN = (TRACK.x1 + 1) * T - CAR_LEFT;

/** Voie horizontale et bande de sécurité, sous les personnages et la rame. */
export function drawMetroTracks(scene: Phaser.Scene): void {
  const left = TRACK.x0 * T;
  const width = (TRACK.x1 - TRACK.x0 + 1) * T;
  const height = (TRACK.y1 - TRACK.y0 + 1) * T;
  const track = scene.add.graphics().setPosition(left, TRACK_TOP).setDepth(-9);
  track.fillStyle(0x141b23).fillRect(0, 0, width, height);
  track.fillStyle(0x1d2931).fillRect(0, 8, width, 76);
  track.fillStyle(0x344047);
  for (let x = 3; x < width; x += 15) track.fillRect(x, 11, 7, 69);
  for (const y of [19, 62]) {
    track.fillStyle(0x0a1018).fillRect(0, y - 2, width, 8);
    track.fillStyle(0x546773).fillRect(0, y, width, 4);
    track.fillStyle(0x9ba8ac).fillRect(0, y, width, 1);
  }
  track.fillStyle(0x45535a).fillRect(0, 88, width, 2);
  track.fillStyle(0x745824).fillRect(0, -8, width, 8);
  track.fillStyle(0xc6a144).fillRect(0, -7, width, 5);
  track.fillStyle(0xf2ce78).fillRect(0, -2, width, 1);
}

/** La vue du dessus garde le plancher de la cabine sous les personnages. */
export class MetroView {
  private readonly car: Phaser.GameObjects.Container;
  private readonly left: Phaser.GameObjects.Container;
  private readonly right: Phaser.GameObjects.Container;
  private readonly threshold: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene) {
    const body = scene.add.image(0, 0, 'train_overhead')
      .setOrigin(0)
      .setDisplaySize(CAR_WIDTH, CAR_HEIGHT);
    this.threshold = scene.add.rectangle(CAR_WIDTH / 2, 2, DOOR_WIDTH, 4, 0xffc37b).setAlpha(0);
    const panel = (x: number) => scene.add.container(x, 3, [
      scene.add.rectangle(0, 0, DOOR_WIDTH / 2, 11, 0x263640).setStrokeStyle(1, 0x92a2aa),
      scene.add.rectangle(0, -1, DOOR_WIDTH / 2 - 6, 4, 0x14282f).setStrokeStyle(0.6, 0x537b82),
    ]);
    this.left = panel(CAR_WIDTH / 2 - DOOR_WIDTH / 4);
    this.right = panel(CAR_WIDTH / 2 + DOOR_WIDTH / 4);
    this.car = scene.add.container(CAR_LEFT, TRACK_TOP, [body, this.threshold, this.left, this.right]).setDepth(-7);
  }

  depart(): void {
    this.scene.tweens.add({
      targets: this.car, x: CAR_LEFT + OFFSCREEN, delay: 900, duration: 1800, ease: 'Cubic.easeIn',
    });
  }

  arrive(onOpen: () => void): void {
    this.scene.tweens.killTweensOf(this.car);
    this.car.setX(CAR_LEFT + OFFSCREEN);
    this.scene.tweens.add({
      targets: this.car, x: CAR_LEFT, duration: 1600, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: this.left, x: this.left.x - DOOR_WIDTH / 2, duration: 240 });
        this.scene.tweens.add({
          targets: this.right, x: this.right.x + DOOR_WIDTH / 2, duration: 240,
          onComplete: () => {
            this.threshold.setAlpha(0.9);
            onOpen();
          },
        });
      },
    });
  }

  warn(blink: boolean): void {
    this.threshold.setFillStyle(blink ? 0xff6659 : 0xffc37b);
  }

  seal(): void {
    this.left.setX(CAR_WIDTH / 2 - DOOR_WIDTH / 4);
    this.right.setX(CAR_WIDTH / 2 + DOOR_WIDTH / 4);
    this.threshold.setAlpha(0);
  }
}
