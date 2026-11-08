import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Animator, setupCharacter } from '../render/characters';
import type { Nav } from '../world/nav';
import { PathMover } from './PathMover';

/** Survivant à escorter (la mécanicienne). Il suit le joueur une fois recruté. */
export class Companion extends Phaser.Physics.Arcade.Sprite {
  following = false;
  private readonly mover = new PathMover();
  private readonly animator: Animator;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly ctx: { nav: Nav; player: Phaser.GameObjects.Sprite },
  ) {
    super(scene, x, y, 'mecano_walk', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    setupCharacter(this);
    this.animator = new Animator(this, 'mecano');
    this.setDepth(this.y);
  }

  think(now: number, boardingTarget?: { x: number; y: number }): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.following) {
      this.setVelocity(0, 0);
    } else {
      const { nav, player } = this.ctx;
      const target = boardingTarget ?? player;
      const d = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (d > (boardingTarget ? 3 : CONFIG.companion.followDistance)) {
        this.mover.moveTo(this, nav, target.x, target.y, CONFIG.player.speed * CONFIG.companion.speedFactor, now, 350);
      } else {
        this.setVelocity(0, 0);
      }
    }
    this.animator.update(body.velocity.x, body.velocity.y);
    this.setDepth(this.y);
  }
}
