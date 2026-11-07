import Phaser from 'phaser';
import type { Nav, Point } from '../world/nav';

/** Suit un chemin de la grille vers une cible, avec recalcul régulier. */
export class PathMover {
  private path: Point[] = [];
  private nextRepathAt = 0;
  private reachable = true;

  reset(): void {
    this.path = [];
    this.nextRepathAt = 0;
    this.reachable = true;
  }

  /** Avance vers (tx, ty). Renvoie false si la cible est inaccessible. */
  moveTo(
    sprite: Phaser.Physics.Arcade.Sprite,
    nav: Nav,
    tx: number,
    ty: number,
    speed: number,
    now: number,
    repathMs = 400,
  ): boolean {
    if (now >= this.nextRepathAt) {
      this.nextRepathAt = now + repathMs;
      const p = nav.path(sprite.x, sprite.y, tx, ty);
      this.reachable = p !== null;
      this.path = p ?? [];
    }
    if (!this.reachable) {
      sprite.setVelocity(0, 0);
      return false;
    }
    while (this.path.length > 1 && Phaser.Math.Distance.Between(sprite.x, sprite.y, this.path[0].x, this.path[0].y) < 4) {
      this.path.shift();
    }
    const wp = this.path[0] ?? { x: tx, y: ty };
    const d = Phaser.Math.Distance.Between(sprite.x, sprite.y, wp.x, wp.y);
    if (d < 3) {
      sprite.setVelocity(0, 0);
      return true;
    }
    sprite.setVelocity(((wp.x - sprite.x) / d) * speed, ((wp.y - sprite.y) / d) * speed);
    return true;
  }
}
