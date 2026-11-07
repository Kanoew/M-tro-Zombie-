import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Nav } from '../world/nav';
import { PathMover } from './PathMover';

/** Survivant à escorter (la mécanicienne). Il suit le joueur une fois recruté. */
export class Companion extends Phaser.Physics.Arcade.Sprite {
  following = false;
  private readonly mover = new PathMover();

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly ctx: { nav: Nav; player: Phaser.GameObjects.Sprite },
  ) {
    super(scene, x, y, 'npc');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setSize(10, 10).setOffset(3, 3);
    this.setDepth(9);
  }

  think(now: number): void {
    if (!this.following) {
      this.setVelocity(0, 0);
      return;
    }
    const { nav, player } = this.ctx;
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (d > CONFIG.companion.followDistance) {
      this.mover.moveTo(this, nav, player.x, player.y, CONFIG.player.speed * CONFIG.companion.speedFactor, now, 350);
    } else {
      this.setVelocity(0, 0);
    }
  }
}
