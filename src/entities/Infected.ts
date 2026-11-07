import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Animator, setupCharacter } from '../render/characters';
import type { Nav } from '../world/nav';
import { HpBar } from './HpBar';
import { PathMover } from './PathMover';

export type Phase = 'day' | 'dusk' | 'night';

export interface InfectedContext {
  nav: Nav;
  player: Phaser.GameObjects.Sprite;
  phase: () => Phase;
  sprinting: () => boolean;
  hitPlayer: (damage: number, fromX: number, fromY: number) => void;
}

type Mode = 'wander' | 'investigate' | 'chase';

/**
 * L'unique type d'infecté du prototype.
 * - Il erre autour de son point d'origine.
 * - Il se dirige vers un bruit à portée, puis s'y attarde.
 * - Il poursuit le joueur qu'il voit (portée selon le jour ou la nuit, plus
 *   grande si le joueur court), l'abandonne s'il le perd de vue, et continue
 *   par toute entrée ouverte.
 */
export class Infected extends Phaser.Physics.Arcade.Sprite {
  hp = CONFIG.infected.hp;
  dead = false;
  mode: Mode = 'wander';

  private readonly mover = new PathMover();
  private readonly animator: Animator;
  private readonly bar: HpBar;
  private readonly home: Phaser.Math.Vector2;
  private readonly target = new Phaser.Math.Vector2();
  private readonly lastSeen = new Phaser.Math.Vector2();
  private readonly heading = new Phaser.Math.Vector2();
  private loseMs = 0;
  private lingerMs = 0;
  private nextHeadingAt = 0;
  private knockUntil = 0;
  private nextHitAt = 0;
  private attackUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly ctx: InfectedContext) {
    super(scene, x, y, 'zombie', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    setupCharacter(this);
    this.animator = new Animator(this, 'zombie');
    this.bar = new HpBar(scene);
    this.home = new Phaser.Math.Vector2(x, y);
    this.syncVisual();
  }

  /** Un bruit retentit : l'infecté à portée va voir (sauf s'il poursuit déjà le joueur). */
  hear(x: number, y: number, radius: number): void {
    if (this.dead || this.mode === 'chase') return;
    const factor = this.ctx.phase() === 'night' ? CONFIG.infected.noiseHearingFactorNight : 1;
    if (Phaser.Math.Distance.Between(this.x, this.y, x, y) <= radius * factor) {
      this.beginInvestigate(x, y);
    }
  }

  takeHit(damage: number, angle: number, now: number): void {
    if (this.dead) return;
    this.hp -= damage;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (this.active) this.clearTint();
    });
    if (this.hp <= 0) {
      this.dead = true;
      this.bar.destroy();
      this.disableBody(true, true);
      return;
    }
    this.setVelocity(Math.cos(angle) * 160, Math.sin(angle) * 160);
    this.knockUntil = now + CONFIG.infected.knockbackMs;
    this.mode = 'chase';
    this.lastSeen.set(this.ctx.player.x, this.ctx.player.y);
    this.loseMs = 0;
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.dead) this.syncVisual();
  }

  /** Profondeur selon les pieds (les toits des bâtiments fermés passent devant) et barre de vie. */
  private syncVisual(): void {
    this.setDepth(this.y);
    const top = this.y - this.displayHeight * CONFIG.sprites.originY;
    this.bar.set(this.x, top - 2.5, this.hp / CONFIG.infected.hp, this.y);
  }

  think(now: number, dt: number): void {
    if (this.dead) return;
    const vel = this.body as Phaser.Physics.Arcade.Body;
    if (now < this.knockUntil) return;
    const C = CONFIG.infected;
    const { nav, player } = this.ctx;
    const night = this.ctx.phase() === 'night';
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    if (d <= C.contactRange && now >= this.nextHitAt) {
      this.nextHitAt = now + C.contactCooldownMs;
      this.attackUntil = now + 520;
      this.setFlipX(player.x < this.x);
      this.play('zombie-attack', true);
      this.ctx.hitPlayer(C.contactDamage, this.x, this.y);
    }

    let detect = night ? C.detectionRadiusNight : C.detectionRadiusDay;
    if (this.ctx.sprinting()) detect *= C.sprintDetectionFactor;
    const sees = d <= detect && nav.los(this.x, this.y, player.x, player.y);
    if (sees) {
      if (this.mode !== 'chase') this.mover.reset();
      this.mode = 'chase';
      this.lastSeen.set(player.x, player.y);
      this.loseMs = 0;
    } else if (this.mode === 'chase') {
      this.loseMs += dt;
      if (this.loseMs >= C.loseTrackMs) this.beginInvestigate(this.lastSeen.x, this.lastSeen.y);
    }

    const speed = C.speed * (night ? C.speedNightFactor : 1);
    switch (this.mode) {
      case 'chase': {
        const tx = sees ? player.x : this.lastSeen.x;
        const ty = sees ? player.y : this.lastSeen.y;
        this.mover.moveTo(this, nav, tx, ty, speed, now, 300);
        break;
      }
      case 'investigate': {
        const ok = this.mover.moveTo(this, nav, this.target.x, this.target.y, speed * 0.8, now);
        const arrived =
          !ok || Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 8;
        if (arrived) {
          this.setVelocity(0, 0);
          this.lingerMs += dt;
          if (this.lingerMs >= C.lingerMs) {
            this.mode = 'wander';
            this.home.set(this.x, this.y);
          }
        }
        break;
      }
      default:
        this.wander(now);
    }

    if (now >= this.attackUntil) this.animator.update(vel.velocity.x, vel.velocity.y);
  }

  private beginInvestigate(x: number, y: number): void {
    this.mode = 'investigate';
    this.target.set(x, y);
    this.lingerMs = 0;
    this.mover.reset();
  }

  private wander(now: number): void {
    if (now >= this.nextHeadingAt) {
      this.nextHeadingAt = now + Phaser.Math.Between(1500, 3000);
      const away = Phaser.Math.Distance.Between(this.x, this.y, this.home.x, this.home.y);
      if (away > 70) {
        this.heading.set(this.home.x - this.x, this.home.y - this.y).normalize();
      } else if (Math.random() < 0.35) {
        this.heading.set(0, 0);
      } else {
        this.heading.setToPolar(Math.random() * Math.PI * 2, 1);
      }
    }
    const s = CONFIG.infected.wanderSpeed;
    this.setVelocity(this.heading.x * s, this.heading.y * s);
  }
}
