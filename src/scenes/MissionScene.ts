import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Companion } from '../entities/Companion';
import { Infected, type InfectedContext, type Phase } from '../entities/Infected';
import { Controls } from '../input/Controls';
import { Animator, NEON_KEYS, setupCharacter } from '../render/characters';
import { createTextures } from '../render/textures';
import {
  describeStock,
  gameState,
  settleFailure,
  settleSuccess,
  startMission,
} from '../state/gameState';
import type { HudData, MissionEnd } from '../ui/events';
import {
  buildMap,
  REINFORCEMENT_TILES,
  TERMINAL_TILE,
  TRAIN_ZONE,
  type Entity,
  type MapData,
} from '../world/map';
import { Nav } from '../world/nav';

interface Interactable {
  entity: Entity;
  sprite: Phaser.GameObjects.Sprite;
  label: string | (() => string);
  /** Vrai tant que l'objet peut encore être utilisé. */
  active: boolean;
  use: () => void;
}

interface BuildingView {
  roof: Phaser.GameObjects.TileSprite;
  trim: Phaser.GameObjects.Rectangle;
  revealed: boolean;
}

export interface NoiseEvent {
  x: number;
  y: number;
  radius: number;
  source: string;
}

const NEON_COLORS = [0xff4fd8, 0x35d6ff, 0xb06bff, 0xff6b6b, 0x58e6cc];
const labelOf = (it: Interactable) => (typeof it.label === 'function' ? it.label() : it.label);

/**
 * Une sortie sur le terrain : fouiller, faire du bruit, éviter ou combattre
 * les infectés, escorter la mécanicienne, appeler la rame et tenir 60 secondes.
 *
 * Les bâtiments fermés sont recouverts par leur toit : on ne sait pas ce
 * qu'il y a dedans tant que la porte n'est pas ouverte.
 *
 * Les règles (bruit, extraction, bilan) vivent ici et dans `state/` ; le rendu
 * et les entrées sont ailleurs (textures, Controls, UIScene).
 */
export class MissionScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerAnim!: Animator;
  private controls!: Controls;
  private nav!: Nav;
  private map!: MapData;
  private interactables: Interactable[] = [];
  private infected: Infected[] = [];
  private infectedGroup!: Phaser.Physics.Arcade.Group;
  private infectedCtx!: InfectedContext;
  private companion: Companion | null = null;
  private buildingViews = new Map<string, BuildingView>();
  private facing = new Phaser.Math.Vector2(1, 0);
  private lastPrompt: string | null = null;
  private nextAttackAt = 0;
  private nextHudAt = 0;
  private now = 0;

  private hp = CONFIG.player.maxHp;
  private stamina = CONFIG.player.stamina.max;
  private exhausted = false;
  private sprinting = false;
  private lastSprintAt = -99999;

  private ended = false;
  private callEndsAt: number | null = null;
  private nextWaitNoiseAt = 0;
  private nextReinforceAt = 0;
  private train!: Phaser.GameObjects.Rectangle;
  private trainWindows!: Phaser.GameObjects.Rectangle;
  private fog!: Phaser.GameObjects.TileSprite;
  private quayLights: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super({ key: 'Mission' });
  }

  create(): void {
    const T = CONFIG.tile;
    createTextures(this);
    startMission();

    this.ended = false;
    this.hp = CONFIG.player.maxHp;
    this.stamina = CONFIG.player.stamina.max;
    this.exhausted = false;
    this.sprinting = false;
    this.lastSprintAt = -99999;
    this.callEndsAt = null;
    this.interactables = [];
    this.infected = [];
    this.companion = null;
    this.buildingViews = new Map();
    this.quayLights = [];
    this.lastPrompt = null;
    this.nextAttackAt = 0;
    this.nextHudAt = 0;

    const map = buildMap();
    this.map = map;
    this.nav = new Nav(map, T);
    const worldW = map.width * T;
    const worldH = map.height * T;
    this.cameras.main.setBackgroundColor(0x070b12);
    this.cameras.main.fadeIn(350, 5, 7, 15);

    const solids = this.physics.add.staticGroup();
    this.buildGround(map, solids, worldW, worldH);

    // Joueur.
    const spawnEnt = map.entities.find((e) => e.kind === 'spawn');
    const spawn = spawnEnt
      ? { x: spawnEnt.tx * T + T / 2, y: spawnEnt.ty * T + T / 2 }
      : { x: T * 2, y: T * 2 };
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'joanna_walk', 0);
    setupCharacter(this.player);
    this.playerAnim = new Animator(this.player, 'joanna');
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, solids);

    // Entités.
    this.infectedGroup = this.physics.add.group();
    this.infectedCtx = {
      nav: this.nav,
      player: this.player,
      phase: (): Phase => this.phase(),
      sprinting: () => this.sprinting,
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
        case 'infected':
          this.spawnInfected(x, y);
          break;
        default:
      }
    }
    if (gameState.rescued.mecanicienne) {
      const e: Entity = { kind: 'npc', id: 'mecanicienne-refuge', tx: 6, ty: 47 };
      const mx = e.tx * T + T / 2;
      const my = e.ty * T + T / 2;
      const npc = this.add.sprite(mx, my, 'mecano_walk', 0).setScale(CONFIG.sprites.scale).setOrigin(0.5, CONFIG.sprites.originY).setDepth(my);
      this.interactables.push({
        entity: e,
        sprite: npc,
        label: 'Mécanicienne',
        active: true,
        use: () => this.toast("La mécanicienne : « L'atelier sera prêt bientôt. »"),
      });
    }
    this.physics.add.collider(this.infectedGroup, solids);
    this.physics.add.collider(this.infectedGroup, this.infectedGroup);

    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(CONFIG.view.zoom);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.fog = this.add
      .tileSprite(0, 0, worldW, worldH, 'fog')
      .setOrigin(0)
      .setTileScale(1.3)
      .setAlpha(0.34)
      .setDepth(3500);

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
    this.fog.tilePositionX += delta * 0.006;
    this.fog.tilePositionY += delta * 0.002;
    if (this.ended) return;

    // Déplacement, course et endurance.
    const v = this.controls.vector;
    const moving = v.lengthSq() > 0.04;
    const st = CONFIG.player.stamina;
    if (this.exhausted && this.stamina >= st.exhaustedUntil) this.exhausted = false;
    this.sprinting = moving && this.controls.sprintHeld && !this.exhausted && this.stamina > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - (st.drain * delta) / 1000);
      this.lastSprintAt = time;
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.sprinting = false;
      }
    } else if (time - this.lastSprintAt >= st.regenDelayMs) {
      this.stamina = Math.min(st.max, this.stamina + (st.regen * delta) / 1000);
    }
    const speed = CONFIG.player.speed * (this.sprinting ? CONFIG.player.sprintFactor : 1);
    this.player.setVelocity(v.x * speed, v.y * speed);
    if (moving) this.facing.copy(v).normalize();
    this.playerAnim.update(v.x * speed, v.y * speed, this.sprinting ? 1.5 : 1);
    this.player.setDepth(this.player.y);

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

  // --- Décor ---------------------------------------------------------------

  /** Sol, sols intérieurs, murs, toits qui cachent les bâtiments, néons et ambiance. */
  private buildGround(
    map: MapData,
    solids: Phaser.Physics.Arcade.StaticGroup,
    worldW: number,
    worldH: number,
  ): void {
    const T = CONFIG.tile;
    this.add.tileSprite(0, 0, worldW, worldH, 'ground').setOrigin(0).setTileScale(0.36).setDepth(-20);

    // Quai.
    this.add.tileSprite(56 * T, 46 * T, 38 * T, 8 * T, 'quay').setOrigin(0).setDepth(-10);

    // Murs (ceux des bâtiments restent cachés sous les toits tant qu'une porte est fermée).
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.tiles[ty][tx] === 'wall') solids.create(tx * T + T / 2, ty * T + T / 2, 'wall').setDepth(0);
      }
    }

    map.buildings.forEach((b, i) => {
      const px = b.x * T;
      const py = b.y * T;
      const pw = b.w * T;
      const ph = b.h * T;
      const bottom = py + ph;
      this.add.tileSprite(px, py, pw, ph, 'floor').setOrigin(0).setDepth(-10);

      const color = NEON_COLORS[i % NEON_COLORS.length];
      // Enseignes au néon posées sur le toit : visibles de loin, sans rien révéler.
      const sign = (key: string, x: number, y: number, scale: number) => {
        const s = this.add.image(x, y, key).setScale(scale).setBlendMode(Phaser.BlendModes.SCREEN).setDepth(bottom + 0.4);
        this.tweens.add({
          targets: s,
          alpha: { from: 1, to: 0.55 },
          duration: Phaser.Math.Between(90, 220),
          yoyo: true,
          repeat: -1,
          repeatDelay: Phaser.Math.Between(900, 4200),
        });
      };
      if (b.id !== 'refuge') {
        const roof = this.add
          .tileSprite(px, py, pw, ph, i % 2 ? 'roof_a' : 'roof_b')
          .setOrigin(0)
          .setTileScale(0.3)
          .setTint(0xa79cc4)
          .setDepth(bottom);
        const trim = this.add
          .rectangle(px + pw / 2, py + ph / 2, pw - 1.5, ph - 1.5)
          .setStrokeStyle(1.4, color, 0.95)
          .setDepth(bottom + 0.1);
        this.buildingViews.set(b.id, { roof, trim, revealed: false });
        sign(NEON_KEYS[i % NEON_KEYS.length], px + pw * 0.22, bottom - 20, 0.2);
        sign(NEON_KEYS[(i + 3) % NEON_KEYS.length], px + pw * 0.78, bottom - 20, 0.2);
      } else {
        this.buildingViews.set(b.id, { roof: null as never, trim: null as never, revealed: true });
      }
    });

    // Entrée de métro au-dessus de la borne, bannières de quarantaine, lumières de secours.
    const tx = TERMINAL_TILE.tx * T + T / 2;
    this.add.image(tx, 46 * T + 4, 'metro').setOrigin(0.5, 1).setScale(0.36).setDepth(46 * T - 1);
    const banners: [number, number][] = [[36, 17], [62, 38], [12, 38], [90, 42], [30, 54]];
    for (const [bx, by] of banners) {
      this.add.image(bx * T, by * T, 'banner').setScale(0.3).setDepth(by * T);
    }
    for (const [lx, ly] of [[58, 48], [91, 48]] as [number, number][]) {
      const light = this.add.circle(lx * T, ly * T, 22, 0xff2a2a, 0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(3000);
      this.tweens.add({ targets: light, alpha: { from: 0.05, to: 0.35 }, duration: 700, yoyo: true, repeat: -1 });
      this.quayLights.push(light);
    }

    // Rame (visible une fois appelée).
    const z = TRAIN_ZONE;
    const zw = (z.x1 - z.x0 + 1) * T;
    const zh = (z.y1 - z.y0 + 1) * T;
    const zx = z.x0 * T + zw / 2;
    const zy = z.y0 * T + zh / 2;
    this.train = this.add.rectangle(zx, zy, zw, zh, 0x2e3a52).setStrokeStyle(1.4, 0x58d0ff).setDepth(1).setAlpha(0);
    this.trainWindows = this.add.rectangle(zx, z.y0 * T + 6, zw - 12, 4, 0xffe27a).setDepth(1.1).setAlpha(0);
  }

  /** Lève le toit d'un bâtiment : son contenu apparaît. */
  private revealBuilding(id: string | undefined): void {
    const view = id ? this.buildingViews.get(id) : undefined;
    if (!view || view.revealed) return;
    view.revealed = true;
    this.tweens.add({
      targets: [view.roof, view.trim],
      alpha: 0,
      duration: 500,
      onComplete: () => {
        view.roof.destroy();
        view.trim.destroy();
      },
    });
  }

  // --- Objets du monde -----------------------------------------------------

  private addDoor(solids: Phaser.Physics.Arcade.StaticGroup, e: Entity, x: number, y: number): void {
    const b = this.map.buildings.find((bb) => bb.id === e.building);
    const bottom = b ? (b.y + b.h) * CONFIG.tile : y;
    const sprite = solids.create(x, y, e.open ? 'door_open' : 'door') as Phaser.Physics.Arcade.Sprite;
    // Fermée, la porte reste visible au-dessus du toit ; ouverte, on passe par-dessus.
    sprite.setDepth(e.open ? -0.5 : bottom + 0.5);
    const it: Interactable = {
      entity: e,
      sprite,
      label: e.forced ? 'Forcer la porte' : 'Ouvrir la porte',
      active: !e.open,
      use: () => {
        it.active = false;
        sprite.setTexture('door_open');
        sprite.setDepth(-0.5);
        sprite.disableBody();
        this.nav.openDoor(e.tx, e.ty);
        this.revealBuilding(e.building);
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
    sprite.setDepth(y);
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
    sprite.setDepth(y);
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

  private spawnInfected(x: number, y: number): Infected {
    const inf = new Infected(this, x, y, this.infectedCtx);
    this.infectedGroup.add(inf);
    this.infected.push(inf);
    return inf;
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

  /** `radius` : portée d'écoute ; `visualRadius` : taille de l'onde affichée. */
  private emitNoise(x: number, y: number, radius: number, source: string, visualRadius = radius): void {
    for (const inf of this.infected) inf.hear(x, y, radius);
    const event: NoiseEvent = { x, y, radius, source };
    this.game.events.emit('noise', event);

    // Repère visuel du rayon (utile pour régler le bruit aux essais).
    const ring = this.add.circle(x, y, 4).setStrokeStyle(0.8, 0xff4f8b, 0.9).setDepth(3200);
    const grow = { r: 4 };
    this.tweens.add({
      targets: grow,
      r: visualRadius,
      duration: 700,
      onUpdate: () => {
        ring.setRadius(grow.r);
        ring.setAlpha(1 - grow.r / visualRadius);
      },
      onComplete: () => ring.destroy(),
    });
  }

  private swing(): void {
    const { range, arcDuration, halfAngle, damage } = CONFIG.attack;
    const angle = this.facing.angle();
    const px = this.player.x;
    const py = this.player.y;

    const g = this.add.graphics().setDepth(3300);
    g.lineStyle(1, 0xeaf6ff, 0.9);
    g.beginPath();
    g.arc(px, py - 8, range * 0.8, angle - halfAngle, angle + halfAngle);
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

  private terminalPos(): { x: number; y: number } {
    const T = CONFIG.tile;
    return { x: TERMINAL_TILE.tx * T + T / 2, y: TERMINAL_TILE.ty * T + T / 2 };
  }

  private callTrain(): void {
    if (this.callEndsAt !== null) {
      this.toast(`La rame est là. Fermeture des portes dans ${this.secondsLeft()} s.`);
      return;
    }
    const X = CONFIG.extraction;
    this.callEndsAt = this.now + X.closingSeconds * 1000;
    this.nextWaitNoiseAt = this.now + X.waitNoiseEveryMs;
    this.nextReinforceAt = this.now + 2500;
    const t = this.terminalPos();
    this.emitNoise(t.x, t.y, CONFIG.noise.quayAnnouncement, 'annonce-quai', CONFIG.noise.quayVisual);
    this.toast(`Rame appelée. Fermeture des portes dans ${X.closingSeconds} s. Tous les infectés arrivent.`);

    const slide = { dx: 140 };
    const baseX = this.train.x;
    this.train.setX(baseX + slide.dx);
    this.trainWindows.setX(baseX + slide.dx);
    this.tweens.add({ targets: [this.train, this.trainWindows], alpha: 1, duration: 900 });
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
    for (const light of this.quayLights) light.setAlpha(0.4);
  }

  private secondsLeft(): number {
    return this.callEndsAt === null ? 0 : Math.max(0, Math.ceil((this.callEndsAt - this.now) / 1000));
  }

  private updateExtraction(time: number): void {
    if (this.callEndsAt === null) return;
    const X = CONFIG.extraction;
    const left = this.callEndsAt - time;

    // Tant que la rame attend, le quai fait du bruit : les infectés encore en vie y convergent...
    if (time >= this.nextWaitNoiseAt) {
      this.nextWaitNoiseAt = time + X.waitNoiseEveryMs;
      const t = this.terminalPos();
      this.emitNoise(t.x, t.y, CONFIG.noise.quayWaiting, 'rame-en-attente', CONFIG.noise.quayVisual);
    }
    // ... et d'autres arrivent des bords de la carte.
    if (time >= this.nextReinforceAt) {
      this.nextReinforceAt = time + X.reinforceEveryMs;
      this.spawnReinforcement();
    }

    // Les portes clignotent sur les 10 dernières secondes.
    if (left < 10000) {
      const blink = Math.floor(left / 300) % 2 === 0;
      this.train.setStrokeStyle(1.4, blink ? 0xff4f4f : 0x58d0ff);
    }
    if (left <= 0) this.closeDoors();
  }

  /** Un nouvel infecté entre par un bord de carte, hors de vue, et file vers la borne. */
  private spawnReinforcement(): void {
    const X = CONFIG.extraction;
    if (this.infected.filter((i) => !i.dead).length >= X.reinforceMaxAlive) return;
    const T = CONFIG.tile;
    const far = REINFORCEMENT_TILES.map(([tx, ty]) => ({ x: tx * T + T / 2, y: ty * T + T / 2 })).filter(
      (p) => Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y) >= X.reinforceMinDistance,
    );
    if (!far.length) return;
    const p = far[Math.floor(Math.random() * far.length)];
    const inf = this.spawnInfected(p.x, p.y);
    const t = this.terminalPos();
    inf.hear(t.x, t.y, CONFIG.noise.quayWaiting);
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
      stamina: this.stamina,
      maxStamina: CONFIG.player.stamina.max,
      exhausted: this.exhausted,
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
