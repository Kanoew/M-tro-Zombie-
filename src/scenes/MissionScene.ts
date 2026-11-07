import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Companion } from '../entities/Companion';
import { Infected, type Phase } from '../entities/Infected';
import { Controls } from '../input/Controls';
import { createTextures } from '../render/textures';
import {
  describeStock,
  gameState,
  settleFailure,
  settleSuccess,
  startMission,
} from '../state/gameState';
import type { HudData, MissionEnd } from '../ui/events';
import { buildMap, TRAIN_ZONE, type Entity } from '../world/map';
import { Nav } from '../world/nav';

interface Interactable {
  entity: Entity;
  sprite: Phaser.GameObjects.Sprite;
  label: string | (() => string);
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

const labelOf = (it: Interactable) => (typeof it.label === 'function' ? it.label() : it.label);

/**
 * Une sortie sur le terrain : fouiller, faire du bruit, éviter ou combattre
 * les infectés, escorter la mécanicienne, appeler la rame et tenir 60 secondes.
 *
 * Les règles (bruit, extraction, bilan) vivent ici et dans `state/` ; le rendu
 * et les entrées sont ailleurs (textures, Controls, UIScene).
 */
export class MissionScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private controls!: Controls;
  private nav!: Nav;
  private interactables: Interactable[] = [];
  private infected: Infected[] = [];
  private companion: Companion | null = null;
  private facing = new Phaser.Math.Vector2(1, 0);
  private lastPrompt: string | null = null;
  private nextAttackAt = 0;
  private nextHudAt = 0;
  private now = 0;

  private hp = CONFIG.player.maxHp;
  private ended = false;
  private callEndsAt: number | null = null;
  private train!: Phaser.GameObjects.Rectangle;
  private trainWindows!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'Mission' });
  }

  create(): void {
    const T = CONFIG.tile;
    createTextures(this);
    startMission();

    this.ended = false;
    this.hp = CONFIG.player.maxHp;
    this.callEndsAt = null;
    this.interactables = [];
    this.infected = [];
    this.companion = null;
    this.lastPrompt = null;
    this.nextAttackAt = 0;
    this.nextHudAt = 0;

    const map = buildMap();
    this.nav = new Nav(map, T);
    this.cameras.main.setBackgroundColor(0x070b12);

    const solids = this.physics.add.staticGroup();

    // Sol et murs.
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = map.tiles[ty][tx];
        const x = tx * T + T / 2;
        const y = ty * T + T / 2;
        if (tile === 'wall') solids.create(x, y, 'wall');
        else this.add.image(x, y, tile);
      }
    }

    // Rame (visible une fois appelée).
    const z = TRAIN_ZONE;
    const zw = (z.x1 - z.x0 + 1) * T;
    const zh = (z.y1 - z.y0 + 1) * T;
    const zx = z.x0 * T + zw / 2;
    const zy = z.y0 * T + zh / 2;
    this.train = this.add.rectangle(zx, zy, zw, zh, 0x2e3a52).setStrokeStyle(2, 0x58d0ff).setDepth(4).setAlpha(0);
    this.trainWindows = this.add.rectangle(zx, z.y0 * T + 6, zw - 12, 4, 0xffe27a).setDepth(4).setAlpha(0);

    // Joueur.
    const spawnEnt = map.entities.find((e) => e.kind === 'spawn');
    const spawn = spawnEnt
      ? { x: spawnEnt.tx * T + T / 2, y: spawnEnt.ty * T + T / 2 }
      : { x: T * 2, y: T * 2 };
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'player');
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const s = CONFIG.player.bodySize;
    body.setSize(s, s).setOffset((16 - s) / 2, (16 - s) / 2);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, solids);

    // Entités.
    const infectedGroup = this.physics.add.group();
    const ctx = {
      nav: this.nav,
      player: this.player,
      phase: (): Phase => this.phase(),
      hitPlayer: (dmg: number, fx: number, fy: number) => this.hitPlayer(dmg, fx, fy),
    };

    for (const e of map.entities) {
      const x = e.tx * T + T / 2;
      const y = e.ty * T + T / 2;
      switch (e.kind) {
        case 'door':
          this.addDoor(solids, e, x, y);
          break;
        case 'crate':
          this.addCrate(solids, e, x, y);
          break;
        case 'terminal':
          this.addStatic(solids, e, x, y, 'terminal', () => (this.callEndsAt === null ? 'Appeler la rame' : 'Rame en approche'), () => this.callTrain(), true);
          break;
        case 'npc':
          if (!gameState.rescued.mecanicienne) this.addCompanion(solids, e, x, y);
          break;
        case 'infected': {
          const inf = new Infected(this, x, y, ctx);
          infectedGroup.add(inf);
          this.infected.push(inf);
          break;
        }
        default:
      }
    }
    if (gameState.rescued.mecanicienne) {
      const e: Entity = { kind: 'npc', id: 'mecanicienne-refuge', tx: 4, ty: 31 };
      this.addStatic(
        solids, e, e.tx * T + T / 2, e.ty * T + T / 2, 'npc', 'Mécanicienne',
        () => this.toast("La mécanicienne : « L'atelier sera prêt bientôt. »"), true,
      );
    }
    this.physics.add.collider(infectedGroup, solids);
    this.physics.add.collider(infectedGroup, infectedGroup);

    const worldW = map.width * T;
    const worldH = map.height * T;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(CONFIG.view.zoom);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.controls = new Controls(this);
    this.registry.set('controls', this.controls);

    const onRestart = () => this.scene.restart();
    this.game.events.on('mission-restart', onRestart);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('mission-restart', onRestart);
    });

    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    this.game.events.emit('mission-start');
    this.game.events.emit('prompt', null);
  }

  update(time: number, delta: number): void {
    this.now = time;
    if (this.ended) return;

    const v = this.controls.vector;
    this.player.setVelocity(v.x * CONFIG.player.speed, v.y * CONFIG.player.speed);
    if (v.lengthSq() > 0.04) this.facing.copy(v).normalize();

    const target = this.nearestInteractable();
    const prompt = target ? labelOf(target) : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.game.events.emit('prompt', prompt);
    }
    if (this.controls.consumeInteract() && target) target.use();

    if (this.controls.consumeAttack() && time >= this.nextAttackAt) {
      this.nextAttackAt = time + CONFIG.attack.cooldown;
      this.swing();
    }

    for (const inf of this.infected) inf.think(time, delta);
    this.companion?.think(time);
    this.updateExtraction(time);

    if (time >= this.nextHudAt) {
      this.nextHudAt = time + 100;
      this.game.events.emit('hud', this.hudData(time));
    }
  }

  /** Lot 3 : l'horloge du jour fournira la phase. Pour l'instant, toujours le jour. */
  private phase(): Phase {
    return 'day';
  }

  // --- Objets du monde -----------------------------------------------------

  private addDoor(solids: Phaser.Physics.Arcade.StaticGroup, e: Entity, x: number, y: number): void {
    const sprite = solids.create(x, y, e.open ? 'door_open' : 'door') as Phaser.Physics.Arcade.Sprite;
    const it: Interactable = {
      entity: e,
      sprite,
      label: e.forced ? 'Forcer la porte' : 'Ouvrir la porte',
      active: !e.open,
      use: () => {
        it.active = false;
        sprite.setTexture('door_open');
        sprite.disableBody();
        this.nav.openDoor(e.tx, e.ty);
        if (e.forced) {
          this.emitNoise(x, y, CONFIG.noise.forcedDoor, e.id);
          this.toast('Porte forcée. Ça résonne.');
        } else {
          this.toast('Porte ouverte.');
        }
      },
    };
    if (e.open) sprite.disableBody();
    this.interactables.push(it);
  }

  private addCrate(solids: Phaser.Physics.Arcade.StaticGroup, e: Entity, x: number, y: number): void {
    const sprite = solids.create(x, y, 'crate') as Phaser.Physics.Arcade.Sprite;
    const it: Interactable = {
      entity: e,
      sprite,
      label: 'Fouiller la caisse',
      active: true,
      use: () => {
        it.active = false;
        sprite.setTexture('crate_open');
        const found = this.rollLoot();
        this.emitNoise(x, y, CONFIG.noise.crateOpened, e.id);
        this.toast(`Caisse ouverte : ${found}. Ça fait du bruit.`);
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
    label: string | (() => string),
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

  private addCompanion(solids: Phaser.Physics.Arcade.StaticGroup, e: Entity, x: number, y: number): void {
    const companion = new Companion(this, x, y, { nav: this.nav, player: this.player });
    this.physics.add.collider(companion, solids);
    this.companion = companion;
    const it: Interactable = {
      entity: e,
      sprite: companion,
      label: 'Escorter la mécanicienne',
      active: true,
      use: () => {
        it.active = false;
        companion.following = true;
        this.toast('La mécanicienne vous suit. Ramenez-la à la rame.');
      },
    };
    this.interactables.push(it);
  }

  private rollLoot(): string {
    const L = CONFIG.loot;
    const r = Math.random();
    const butin = gameState.butin;
    if (r < L.rareChance) {
      butin.rare += 1;
      return 'une pièce rare';
    }
    if (r < L.rareChance + L.valuableChance) {
      butin.valuables += 1;
      return 'un objet de valeur';
    }
    const n = Phaser.Math.Between(L.materialsMin, L.materialsMax);
    butin.materials += n;
    return `${n} matériaux`;
  }

  // --- Bruit, combat -------------------------------------------------------

  private emitNoise(x: number, y: number, radius: number, source: string): void {
    for (const inf of this.infected) inf.hear(x, y, radius);
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
    const { range, arcDuration, halfAngle, damage } = CONFIG.attack;
    const angle = this.facing.angle();
    const px = this.player.x;
    const py = this.player.y;

    const g = this.add.graphics().setDepth(11);
    g.lineStyle(2, 0xeaf6ff, 0.9);
    g.beginPath();
    g.arc(px, py, range * 0.8, angle - halfAngle, angle + halfAngle);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: arcDuration, onComplete: () => g.destroy() });

    for (const inf of this.infected) {
      if (inf.dead) continue;
      if (Phaser.Math.Distance.Between(px, py, inf.x, inf.y) > range + 6) continue;
      const toward = Math.atan2(inf.y - py, inf.x - px);
      if (Math.abs(Phaser.Math.Angle.Wrap(toward - angle)) <= halfAngle) {
        inf.takeHit(damage, toward, this.now);
      }
    }
    this.infected = this.infected.filter((i) => !i.dead);
    this.game.events.emit('attack', { x: px, y: py, angle, range });
  }

  private hitPlayer(damage: number, _fromX: number, _fromY: number): void {
    if (this.ended) return;
    this.hp = Math.max(0, this.hp - damage);
    this.cameras.main.shake(120, 0.006);
    this.player.setTint(0xff6666);
    this.time.delayedCall(110, () => this.player.clearTint());
    if (this.hp <= 0) this.finish(false, 'Vous êtes mort.');
  }

  // --- Extraction ----------------------------------------------------------

  private callTrain(): void {
    if (this.callEndsAt !== null) {
      this.toast(`La rame arrive. Fermeture des portes dans ${this.secondsLeft()} s.`);
      return;
    }
    const closing = CONFIG.extraction.closingSeconds;
    this.callEndsAt = this.now + closing * 1000;
    const term = this.interactables.find((i) => i.entity.kind === 'terminal');
    if (term) this.emitNoise(term.sprite.x, term.sprite.y, CONFIG.noise.quayAnnouncement, 'annonce-quai');
    this.toast(`Rame appelée. Fermeture des portes dans ${closing} s. Les infectés arrivent.`);

    const slide = { dx: 140 };
    const baseX = this.train.x;
    this.train.setX(baseX + slide.dx);
    this.trainWindows.setX(baseX + slide.dx);
    this.tweens.add({
      targets: [this.train, this.trainWindows],
      alpha: 1,
      duration: 900,
    });
    this.tweens.add({
      targets: slide,
      dx: 0,
      duration: 1400,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.train.setX(baseX + slide.dx);
        this.trainWindows.setX(baseX + slide.dx);
      },
    });
  }

  private secondsLeft(): number {
    return this.callEndsAt === null ? 0 : Math.max(0, Math.ceil((this.callEndsAt - this.now) / 1000));
  }

  private updateExtraction(time: number): void {
    if (this.callEndsAt === null) return;
    const left = this.callEndsAt - time;
    // Les portes clignotent sur les 10 dernières secondes.
    if (left < 10000) {
      const blink = Math.floor(left / 300) % 2 === 0;
      this.train.setStrokeStyle(2, blink ? 0xff4f4f : 0x58d0ff);
    }
    if (left <= 0) this.closeDoors();
  }

  private inTrainZone(x: number, y: number): boolean {
    const T = CONFIG.tile;
    const z = TRAIN_ZONE;
    return x >= z.x0 * T && x < (z.x1 + 1) * T && y >= z.y0 * T && y < (z.y1 + 1) * T;
  }

  /** Fermeture des portes : le bilan d'extraction est validé ici, une seule fois. */
  private closeDoors(): void {
    if (this.inTrainZone(this.player.x, this.player.y)) {
      this.finish(true, 'La rame part avec vous.');
    } else {
      this.finish(false, 'Rame ratée : les portes se sont fermées sans vous.');
    }
  }

  private finish(success: boolean, reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.callEndsAt = null;
    this.player.setVelocity(0, 0);
    this.infected.forEach((i) => i.setVelocity(0, 0));
    this.companion?.setVelocity(0, 0);

    const lines: string[] = [];
    const c = this.companion;
    if (success) {
      const gained = { ...gameState.butin };
      const mechanicAboard = !!c && c.following && this.inTrainZone(c.x, c.y);
      settleSuccess(mechanicAboard);
      lines.push(`Butin ramené : ${describeStock(gained)}.`);
      if (mechanicAboard) lines.push('Mécanicienne : à bord. Sauvetage validé.');
      else if (c) lines.push('Mécanicienne : restée sur place. Le sauvetage reste ouvert.');
    } else {
      const lost = { ...gameState.butin };
      settleFailure();
      lines.push(`Butin perdu : ${describeStock(lost)}.`);
      lines.push(`Acquis conservés : ${gameState.weapon}, stock ${describeStock(gameState.stock)}.`);
      if (c) lines.push('Mécanicienne : toujours à sauver.');
    }
    const payload: MissionEnd = {
      success,
      title: success ? 'RETOUR RÉUSSI' : 'ÉCHEC',
      reason,
      lines,
    };
    this.game.events.emit('mission-end', payload);
  }

  // --- Interface -----------------------------------------------------------

  private hudData(time: number): HudData {
    let escort: HudData['escort'] = 'none';
    if (gameState.rescued.mecanicienne) escort = 'rescued';
    else if (this.companion) escort = this.companion.following ? 'following' : 'waiting';
    return {
      hp: this.hp,
      maxHp: CONFIG.player.maxHp,
      weapon: gameState.weapon,
      butin: { ...gameState.butin },
      extraction: this.callEndsAt === null ? null : Math.max(0, Math.ceil((this.callEndsAt - time) / 1000)),
      escort,
    };
  }

  private nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bestDist: number = CONFIG.interaction.range;
    for (const it of this.interactables) {
      if (!it.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.sprite.x, it.sprite.y);
      if (d <= bestDist) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }

  private toast(message: string): void {
    this.game.events.emit('toast', message);
  }
}
