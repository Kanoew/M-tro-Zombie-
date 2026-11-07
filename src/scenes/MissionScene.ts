import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Controls } from '../input/Controls';
import { createTextures } from '../render/textures';
import { buildMap, Entity } from '../world/map';

interface Interactable {
  entity: Entity;
  sprite: Phaser.Physics.Arcade.Sprite;
  label: string;
  /** Vrai tant que l'objet peut encore être utilisé. */
  active: boolean;
  use: () => void;
}

export interface NoiseEvent {
  x: number;
  y: number;
  radius: number;
  source: string;
}

/**
 * Lot 1 : déplacement, collisions et interactions dans le quartier.
 * Les caisses émettent déjà un événement 'noise' que le lot 2 branchera
 * sur les infectés.
 */
export class MissionScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private controls!: Controls;
  private interactables: Interactable[] = [];
  private facing = new Phaser.Math.Vector2(1, 0);
  private lastPrompt: string | null = null;
  private nextAttackAt = 0;

  constructor() {
    super({ key: 'Mission' });
  }

  create(): void {
    const T = CONFIG.tile;
    createTextures(this);
    const map = buildMap();

    this.cameras.main.setBackgroundColor(0x070b12);

    const solids = this.physics.add.staticGroup();

    // Sol et murs.
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = map.tiles[ty][tx];
        const x = tx * T + T / 2;
        const y = ty * T + T / 2;
        if (tile === 'wall') {
          solids.create(x, y, 'wall');
        } else {
          this.add.image(x, y, tile);
        }
      }
    }

    // Entités.
    let spawn = { x: T * 2, y: T * 2 };
    for (const e of map.entities) {
      const x = e.tx * T + T / 2;
      const y = e.ty * T + T / 2;
      switch (e.kind) {
        case 'spawn':
          spawn = { x, y };
          break;
        case 'door':
          this.addDoor(solids, e, x, y);
          break;
        case 'crate':
          this.addCrate(solids, e, x, y);
          break;
        case 'terminal':
          this.addStatic(solids, e, x, y, 'terminal', 'Borne du quai', () =>
            this.toast('Borne du quai : le lot 2 lancera la rame.'),
          true);
          break;
        case 'npc':
          this.addStatic(solids, e, x, y, 'npc', 'Parler', () =>
            this.toast('La mécanicienne : « Sortez-moi d\'ici. » (lot 2)'),
          true);
          break;
      }
    }

    // Joueur.
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'player');
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const s = CONFIG.player.bodySize;
    body.setSize(s, s).setOffset((16 - s) / 2, (16 - s) / 2);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, solids);

    const worldW = map.width * T;
    const worldH = map.height * T;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(CONFIG.view.zoom);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.controls = new Controls(this);
    this.registry.set('controls', this.controls);
    this.scene.launch('UI');
  }

  update(time: number): void {
    const v = this.controls.vector;
    this.player.setVelocity(v.x * CONFIG.player.speed, v.y * CONFIG.player.speed);
    if (v.lengthSq() > 0.04) this.facing.copy(v).normalize();

    const target = this.nearestInteractable();
    const prompt = target ? target.label : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.game.events.emit('prompt', prompt);
    }
    if (this.controls.consumeInteract() && target) target.use();

    if (this.controls.consumeAttack() && time >= this.nextAttackAt) {
      this.nextAttackAt = time + CONFIG.attack.cooldown;
      this.swing();
    }
  }

  private nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bestDist: number = CONFIG.interaction.range;
    for (const it of this.interactables) {
      if (!it.active) continue;
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        it.sprite.x,
        it.sprite.y,
      );
      if (d <= bestDist) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }

  private addDoor(
    solids: Phaser.Physics.Arcade.StaticGroup,
    e: Entity,
    x: number,
    y: number,
  ): void {
    const sprite = solids.create(x, y, e.open ? 'door_open' : 'door') as Phaser.Physics.Arcade.Sprite;
    const it: Interactable = {
      entity: e,
      sprite,
      label: 'Ouvrir la porte',
      active: !e.open,
      use: () => {
        it.active = false;
        sprite.setTexture('door_open');
        sprite.disableBody();
        this.toast('Porte ouverte.');
      },
    };
    if (e.open) sprite.disableBody();
    this.interactables.push(it);
  }

  private addCrate(
    solids: Phaser.Physics.Arcade.StaticGroup,
    e: Entity,
    x: number,
    y: number,
  ): void {
    const sprite = solids.create(x, y, 'crate') as Phaser.Physics.Arcade.Sprite;
    const it: Interactable = {
      entity: e,
      sprite,
      label: 'Fouiller la caisse',
      active: true,
      use: () => {
        it.active = false;
        sprite.setTexture('crate_open');
        this.emitNoise(x, y, CONFIG.noise.crateOpened, e.id);
        this.toast('Caisse ouverte. Ça fait du bruit.');
      },
    };
    this.interactables.push(it);
  }

  private addStatic(
    solids: Phaser.Physics.Arcade.StaticGroup,
    e: Entity,
    x: number,
    y: number,
    texture: string,
    label: string,
    use: () => void,
    reusable = false,
  ): void {
    const sprite = solids.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    const it: Interactable = {
      entity: e,
      sprite,
      label,
      active: true,
      use: () => {
        if (!reusable) it.active = false;
        use();
      },
    };
    this.interactables.push(it);
  }

  private emitNoise(x: number, y: number, radius: number, source: string): void {
    const event: NoiseEvent = { x, y, radius, source };
    this.game.events.emit('noise', event);

    // Repère visuel du rayon (utile pour régler le bruit aux essais).
    const ring = this.add.circle(x, y, 4).setStrokeStyle(1, 0xff4f8b, 0.9).setDepth(5);
    const grow = { r: 4 };
    this.tweens.add({
      targets: grow,
      r: radius,
      duration: 700,
      onUpdate: () => {
        ring.setRadius(grow.r);
        ring.setAlpha(1 - grow.r / radius);
      },
      onComplete: () => ring.destroy(),
    });
  }

  private swing(): void {
    const { range, arcDuration } = CONFIG.attack;
    const angle = this.facing.angle();
    const g = this.add.graphics().setDepth(11);
    g.lineStyle(2, 0xeaf6ff, 0.9);
    g.beginPath();
    g.arc(this.player.x, this.player.y, range * 0.8, angle - 0.9, angle + 0.9);
    g.strokePath();
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: arcDuration,
      onComplete: () => g.destroy(),
    });
    this.game.events.emit('attack', { x: this.player.x, y: this.player.y, angle, range });
  }

  private toast(message: string): void {
    this.game.events.emit('toast', message);
  }
}
