import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Companion } from '../entities/Companion';
import { Infected, type InfectedContext, type Phase } from '../entities/Infected';
import { Controls } from '../input/Controls';
import { Animator, NEON_KEYS, setupCharacter } from '../render/characters';
import { createTextures } from '../render/textures';
import {
  currentWeapon,
  cycleWeapon,
  describeStock,
  gameState,
  settleFailure,
  settleSuccess,
  startMission,
  playerStats,
  stockValue,
  weaponDamage,
} from '../state/gameState';
import type { HudData, MissionEnd } from '../ui/events';
import type { WeaponDef } from '../weapons';
import {
  buildMap,
  QUAY,
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
 * qu'il y a dedans tant que la porte n'est pas ouverte. Le jour baisse au fil
 * de la sortie (jour, crépuscule, nuit).
 *
 * Les règles (bruit, extraction, bilan) vivent ici et dans `state/` ; le rendu
 * et les entrées sont ailleurs (textures, Controls, UIScene).
 */
/** 330 -> "5:30". */
const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

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
  private arrows!: Phaser.Physics.Arcade.Group;
  private companion: Companion | null = null;
  private buildingViews = new Map<string, BuildingView>();
  private facing = new Phaser.Math.Vector2(1, 0);
  private lastPrompt: string | null = null;
  private nextAttackAt = 0;
  private shootUntil = 0;
  private nextHudAt = 0;
  private now = 0;

  private elapsed = 0;
  private lastPhase: Phase = 'day';

  private maxHp = CONFIG.player.maxHp;
  private maxStamina = CONFIG.player.stamina.max;
  private hp = CONFIG.player.maxHp;
  private stamina = CONFIG.player.stamina.max;
  private exhausted = false;
  private sprinting = false;
  private lastSprintAt = -99999;

  private ended = false;
  private callEndsAt: number | null = null;
  /** Vrai quand la rame qui attend est le premier métro du matin (bonus de survie). */
  private morningTrain = false;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private nextWaveAt = 0;
  private nextWaitNoiseAt = 0;
  private nextReinforceAt = 0;
  private train!: Phaser.GameObjects.Image;
  private trainBaseX = 0;
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
    this.elapsed = 0;
    this.lastPhase = 'day';
    // Améliorations de l'atelier : lues une fois au départ de la sortie.
    const stats = playerStats();
    this.maxHp = stats.maxHp;
    this.maxStamina = stats.maxStamina;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.exhausted = false;
    this.sprinting = false;
    this.lastSprintAt = -99999;
    this.callEndsAt = null;
    this.morningTrain = false;
    this.nextWaveAt = 0;
    this.interactables = [];
    this.infected = [];
    this.companion = null;
    this.buildingViews = new Map();
    this.quayLights = [];
    this.lastPrompt = null;
    this.nextAttackAt = 0;
    this.shootUntil = 0;
    this.nextHudAt = 0;

    const map = buildMap();
    this.map = map;
    this.nav = new Nav(map, T);
    const worldW = map.width * T;
    const worldH = map.height * T;
    this.cameras.main.setBackgroundColor(0x070b12);
    this.cameras.main.fadeIn(350, 5, 7, 15);

    const solids = this.physics.add.staticGroup();
    this.solids = solids;
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
    this.arrows = this.physics.add.group({ allowGravity: false });
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
          this.addStatic(solids, e, x, y, 'terminal', () => this.terminalLabel(), () => this.callTrain(), true);
          // La borne est dessinée par le socle et le pilier peints (voir buildGround).
          this.interactables[this.interactables.length - 1].sprite.setVisible(false);
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
    this.physics.add.collider(this.infectedGroup, solids);
    this.physics.add.collider(this.infectedGroup, this.infectedGroup);

    // Flèches : arrêtées par les murs, les portes fermées et les caisses ; blessent les infectés.
    this.physics.add.overlap(this.arrows, solids, (arrow) => (arrow as Phaser.GameObjects.GameObject).destroy());
    this.physics.add.overlap(this.arrows, this.infectedGroup, (arrow, inf) => {
      const a = arrow as Phaser.Physics.Arcade.Sprite;
      (inf as Infected).takeHit(a.getData('damage') as number, a.rotation, this.now);
      a.destroy();
    });

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

    // On descend de la rame : elle repart vers l'est.
    this.train.setAlpha(1);
    this.tweens.add({ targets: this.train, x: this.trainBaseX + 230, alpha: 0, delay: 900, duration: 1800, ease: 'Cubic.easeIn' });
    this.time.delayedCall(600, () =>
      this.toast(`La rame repart. Reviens appeler la borne avant ${clock(CONFIG.time.lastCallAt)}.`),
    );
  }

  update(time: number, delta: number): void {
    this.now = time;
    this.fog.tilePositionX += delta * 0.006;
    this.fog.tilePositionY += delta * 0.002;
    if (this.ended) return;

    // Horloge du jour.
    this.elapsed += delta / 1000;
    const phase = this.phase();
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.game.events.emit('phase-change', { phase, elapsed: this.elapsed });
      const talk: Record<Phase, string> = {
        day: '',
        dusk: `Talkie : « Le jour baisse. Dernier appel de la rame à ${clock(CONFIG.time.lastCallAt)}. »`,
        night: 'Talkie : « Plus aucune rame avant l\'aube. Des caisses de ravitaillement sont tombées dans la rue. »',
        dawn: 'Talkie : « Le premier métro arrive ! Monte, vite. »',
      };
      this.toast(talk[phase]);
      if (phase === 'night') this.dropNightCrates();
      if (phase === 'dawn' && this.callEndsAt === null) this.callTrain(true);
    }

    // Déplacement, course et endurance.
    const weapon = currentWeapon();
    const shooting = time < this.shootUntil;
    const v = this.controls.vector;
    const moving = v.lengthSq() > 0.04;
    const st = CONFIG.player.stamina;
    if (this.exhausted && this.stamina >= st.exhaustedUntil) this.exhausted = false;
    this.sprinting = moving && !shooting && this.controls.sprintHeld && !this.exhausted && this.stamina > 0;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - (st.drain * delta) / 1000);
      this.lastSprintAt = time;
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.sprinting = false;
      }
    } else if (time - this.lastSprintAt >= st.regenDelayMs) {
      this.stamina = Math.min(this.maxStamina, this.stamina + (st.regen * delta) / 1000);
    }
    let speed = CONFIG.player.speed * (this.sprinting ? CONFIG.player.sprintFactor : 1);
    if (shooting) speed *= weapon.moveFactor ?? 1;
    this.player.setVelocity(v.x * speed, v.y * speed);
    if (moving && !shooting) this.facing.copy(v).normalize();
    if (!shooting) this.playerAnim.update(v.x * speed, v.y * speed, this.sprinting ? 1.5 : 1);
    this.player.setDepth(this.player.y);

    const target = this.nearestInteractable();
    const prompt = target ? labelOf(target) : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.game.events.emit('prompt', prompt);
    }
    if (this.controls.consumeInteract() && target) target.use();
    if (this.controls.consumeSwitch() && gameState.loadout.length > 1) {
      this.toast(`Arme : ${cycleWeapon().name}`);
    }
    if (this.controls.consumeAttack()) this.attack(time);

    for (const inf of this.infected) inf.think(time, delta);
    this.companion?.think(time);
    this.updateExtraction(time);
    this.updateNightWaves(time);

    if (time >= this.nextHudAt) {
      this.nextHudAt = time + 100;
      this.game.events.emit('hud', this.hudData(time));
    }
  }

  /** Jour, crépuscule (le talkie prévient, la lumière change), nuit (ils entendent plus loin). */
  private phase(): Phase {
    const t = CONFIG.time;
    if (this.elapsed >= t.dawnAt) return 'dawn';
    if (this.elapsed >= t.nightAt) return 'night';
    return this.elapsed >= t.duskAt ? 'dusk' : 'day';
  }

  // --- Décor ---------------------------------------------------------------

  /** Sol, camp, murs, toits qui cachent les bâtiments, néons, quai et ambiance. */
  private buildGround(
    map: MapData,
    solids: Phaser.Physics.Arcade.StaticGroup,
    worldW: number,
    worldH: number,
  ): void {
    const T = CONFIG.tile;
    this.add.tileSprite(0, 0, worldW, worldH, 'ground').setOrigin(0).setTileScale(0.36).setDepth(-20);

    // Quai.
    this.add
      .tileSprite(QUAY.x0 * T, QUAY.y0 * T, (QUAY.x1 - QUAY.x0 + 1) * T, (QUAY.y1 - QUAY.y0 + 1) * T, 'quay')
      .setOrigin(0)
      .setDepth(-10);

    // Murs : ceux des bâtiments restent cachés sous les toits tant qu'une porte est fermée ;
    // ceux du camp sont invisibles (l'illustration les remplace) mais bloquent.
    const camp = map.buildings.find((b) => b.id === 'refuge');
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.tiles[ty][tx] !== 'wall') continue;
        const w = solids.create(tx * T + T / 2, ty * T + T / 2, 'wall').setDepth(0);
        const inCamp = camp && tx >= camp.x && tx < camp.x + camp.w && ty >= camp.y && ty < camp.y + camp.h;
        if (inCamp) w.setVisible(false);
      }
    }

    // Obstacles décrits en px (aucun dans la rue depuis que le refuge est une scène à part).
    for (const b of map.blockers) {
      const blk = solids.create(b.x + b.w / 2, b.y + b.h / 2, 'wall');
      blk.setVisible(false).setDisplaySize(b.w, b.h).refreshBody();
    }

    map.buildings.forEach((b, i) => {
      if (b.id === 'refuge') {
        this.buildingViews.set(b.id, { roof: null as never, trim: null as never, revealed: true });
        return;
      }
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
    });

    // Quai : entrée de métro au nord, borne au centre (socle posé au sol, pilier par-dessus).
    const tx = TERMINAL_TILE.tx * T + T / 2;
    const ty = TERMINAL_TILE.ty * T + T / 2;
    this.add.image(tx, (QUAY.y0 + 2) * T, 'metro').setOrigin(0.5, 1).setScale(0.36).setDepth((QUAY.y0 + 2) * T);
    this.add.image(tx, ty, 'terminal_ring').setScale(0.2).setDepth(-8);
    this.add.image(tx, ty + 2, 'terminal_pillar').setOrigin(0.497, 0.868).setScale(0.2).setDepth(ty + 2);

    // Bannières de quarantaine, lumières de secours.
    const banners: [number, number][] = [[36, 17], [62, 39], [12, 38], [90, 42], [30, 54]];
    for (const [bx, by] of banners) {
      this.add.image(bx * T, by * T, 'banner').setScale(0.3).setDepth(by * T);
    }
    for (const [lx, ly] of [[58, 44], [91, 44]] as [number, number][]) {
      const light = this.add.circle(lx * T, ly * T, 22, 0xff2a2a, 0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(3000);
      this.tweens.add({ targets: light, alpha: { from: 0.05, to: 0.35 }, duration: 700, yoyo: true, repeat: -1 });
      this.quayLights.push(light);
    }

    // Rame (détourée de l'illustration) : elle arrive du bord droit quand on l'appelle.
    const z = TRAIN_ZONE;
    this.add
      .tileSprite(z.x0 * T, z.y0 * T - 8, (z.x1 - z.x0 + 1) * T, 6, 'hazard')
      .setOrigin(0)
      .setDepth(-9);
    const zx = ((z.x0 + z.x1 + 1) / 2) * T;
    const zBottom = (z.y1 + 1) * T - 4;
    this.trainBaseX = zx;
    this.train = this.add
      .image(zx, zBottom, 'train')
      .setOrigin(0.5, 1)
      .setScale(0.3)
      .setAlpha(0)
      .setDepth(z.y0 * T);
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
    if (e.building === 'refuge') sprite.setVisible(false); // le portail est dans l'illustration
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

  /** `night` : caisse de ravitaillement larguée à la tombée de la nuit (butin meilleur, lueur cyan). */
  private addCrate(solids: Phaser.Physics.Arcade.StaticGroup, e: Entity, x: number, y: number, night = false): void {
    const sprite = solids.create(x, y, 'crate') as Phaser.Physics.Arcade.Sprite;
    sprite.setDepth(y);
    let glow: Phaser.GameObjects.Arc | null = null;
    if (night) {
      sprite.setTint(0x8ff4ff);
      glow = this.add.circle(x, y, 9, 0x35d6ff, 0.35).setDepth(y - 1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.5 }, scale: { from: 0.9, to: 1.3 }, duration: 700, yoyo: true, repeat: -1 });
    }
    const it: Interactable = {
      entity: e,
      sprite,
      label: night ? 'Fouiller la caisse de nuit' : 'Fouiller la caisse',
      active: true,
      use: () => {
        it.active = false;
        sprite.setTexture('crate_open');
        glow?.destroy();
        const found = this.rollLoot(night);
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

  private rollLoot(night = false): string {
    const L = CONFIG.loot;
    const rareChance = night ? CONFIG.night.rareChance : L.rareChance;
    const valuableChance = night ? CONFIG.night.valuableChance : L.valuableChance;
    const r = Math.random();
    const butin = gameState.butin;
    if (r < rareChance) {
      butin.rare += 1;
      return 'une pièce rare';
    }
    if (r < rareChance + valuableChance) {
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

  /** Attaque avec l'arme équipée : coup à l'arc de cercle ou tir, selon `kind`. */
  private attack(time: number): void {
    const weapon = currentWeapon();
    if (time < this.nextAttackAt) return;
    this.nextAttackAt = time + weapon.cooldownMs;
    if (weapon.noise > 0) this.emitNoise(this.player.x, this.player.y, weapon.noise, `arme-${weapon.id}`);
    if (weapon.kind === 'melee') this.swing(weapon);
    else this.shoot(weapon, time);
  }

  private swing(w: WeaponDef): void {
    const halfAngle = w.halfAngle ?? 1;
    const angle = this.facing.angle();
    const px = this.player.x;
    const py = this.player.y;

    const g = this.add.graphics().setDepth(3300);
    g.lineStyle(1, 0xeaf6ff, 0.9);
    g.beginPath();
    g.arc(px, py - 8, w.range * 0.8, angle - halfAngle, angle + halfAngle);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: w.swingMs ?? 140, onComplete: () => g.destroy() });

    for (const inf of this.infected) {
      if (inf.dead) continue;
      if (Phaser.Math.Distance.Between(px, py, inf.x, inf.y) > w.range + 6) continue;
      const toward = Math.atan2(inf.y - py, inf.x - px);
      if (Math.abs(Phaser.Math.Angle.Wrap(toward - angle)) <= halfAngle) {
        inf.takeHit(weaponDamage(w), toward, this.now);
      }
    }
    this.infected = this.infected.filter((i) => !i.dead);
    this.game.events.emit('attack', { x: px, y: py, angle, range: w.range });
  }

  /** Arme à distance : geste animé, puis la flèche part à la pose de relâchement. */
  private shoot(w: WeaponDef, time: number): void {
    const aim = this.aimDirection(w);
    this.facing.copy(aim);
    this.shootUntil = time + (w.gestureMs ?? 400);
    this.player.setFlipX(aim.x < 0);
    this.player.play('joanna-shoot', true);
    this.time.delayedCall(w.windupMs ?? 200, () => {
      if (!this.ended) this.fireProjectile(aim, w);
    });
    this.game.events.emit('attack', { x: this.player.x, y: this.player.y, angle: aim.angle(), range: w.range });
  }

  /** Visée assistée : l'infecté visible le plus proche dans le cône devant le joueur, sinon tout droit. */
  private aimDirection(w: WeaponDef): Phaser.Math.Vector2 {
    const base = this.facing.clone().normalize();
    const px = this.player.x;
    const py = this.player.y;
    let best: Infected | null = null;
    let bestDist = Infinity;
    for (const inf of this.infected) {
      if (inf.dead) continue;
      const d = Phaser.Math.Distance.Between(px, py, inf.x, inf.y);
      if (d > w.range + 16 || d >= bestDist) continue;
      const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(inf.y - py, inf.x - px) - base.angle()));
      if (off > (w.aimCone ?? 0.5)) continue;
      if (!this.nav.los(px, py, inf.x, inf.y)) continue;
      best = inf;
      bestDist = d;
    }
    if (!best) return base;
    // Petite avance sur une cible en mouvement : là où elle sera quand la flèche arrive.
    const body = best.body as Phaser.Physics.Arcade.Body;
    const flight = (w.windupMs ?? 0) / 1000 + bestDist / (w.projectileSpeed ?? 250);
    return new Phaser.Math.Vector2(
      best.x + body.velocity.x * flight - px,
      best.y + body.velocity.y * flight - py,
    ).normalize();
  }

  private fireProjectile(dir: Phaser.Math.Vector2, w: WeaponDef): void {
    const speed = w.projectileSpeed ?? 250;
    const arrow = this.arrows.create(this.player.x + dir.x * 10, this.player.y + dir.y * 10, 'arrow') as Phaser.Physics.Arcade.Sprite;
    arrow.setRotation(dir.angle());
    arrow.setDepth(this.player.y + 0.5);
    arrow.setData('damage', weaponDamage(w));
    arrow.setVelocity(dir.x * speed, dir.y * speed);
    this.time.delayedCall((w.range / speed) * 1000, () => {
      if (arrow.active) arrow.destroy();
    });
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

  /** Vrai entre le dernier appel (7:30) et l'aube : la borne ne fait plus venir de rame. */
  private noMoreTrains(): boolean {
    const t = CONFIG.time;
    return this.elapsed >= t.lastCallAt && this.elapsed < t.dawnAt;
  }

  private terminalLabel(): string {
    if (this.callEndsAt !== null) return this.morningTrain ? 'Premier métro à quai' : 'Rame en approche';
    return this.noMoreTrains() ? 'Plus de rame avant l\'aube' : 'Appeler la rame';
  }

  /** `morning` : le premier métro du matin, qui arrive seul à l'aube. */
  private callTrain(morning = false): void {
    if (this.callEndsAt !== null) {
      this.toast(`La rame est là. Fermeture des portes dans ${this.secondsLeft()} s.`);
      return;
    }
    if (!morning && this.noMoreTrains()) {
      this.toast('La borne ne répond plus. Le prochain métro passera à l\'aube.');
      return;
    }
    this.morningTrain = morning;
    const X = CONFIG.extraction;
    this.callEndsAt = this.now + X.closingSeconds * 1000;
    this.nextWaitNoiseAt = this.now + X.waitNoiseEveryMs;
    this.nextReinforceAt = this.now + 2500;
    const t = this.terminalPos();
    this.emitNoise(t.x, t.y, CONFIG.noise.quayAnnouncement, 'annonce-quai', CONFIG.noise.quayVisual);
    this.toast(
      morning
        ? `Premier métro du matin. Fermeture des portes dans ${X.closingSeconds} s.`
        : `Rame appelée. Fermeture des portes dans ${X.closingSeconds} s. Tous les infectés arrivent.`,
    );

    // La rame glisse jusqu'au quai.
    this.train.setX(this.trainBaseX + 230);
    this.tweens.add({ targets: this.train, alpha: 1, duration: 900 });
    this.tweens.add({ targets: this.train, x: this.trainBaseX, duration: 1600, ease: 'Cubic.easeOut' });
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
      this.train.setTint(blink ? 0xff8d8d : 0xffffff);
    }
    if (left <= 0) this.closeDoors();
  }

  /**
   * Un nouvel infecté entre par un bord de carte, hors de vue, et file vers la
   * borne (ou vers `target` : la nuit, les alentours du joueur).
   */
  private spawnReinforcement(target?: { x: number; y: number }, maxAlive = CONFIG.extraction.reinforceMaxAlive): void {
    const X = CONFIG.extraction;
    if (this.infected.filter((i) => !i.dead).length >= maxAlive) return;
    const T = CONFIG.tile;
    const far = REINFORCEMENT_TILES.map(([tx, ty]) => ({ x: tx * T + T / 2, y: ty * T + T / 2 })).filter(
      (p) => Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y) >= X.reinforceMinDistance,
    );
    if (!far.length) return;
    const p = far[Math.floor(Math.random() * far.length)];
    const inf = this.spawnInfected(p.x, p.y);
    const t = target ?? this.terminalPos();
    inf.hear(t.x, t.y, CONFIG.noise.quayWaiting);
  }

  // --- Nuit ----------------------------------------------------------------

  /** La nuit, des rôdeurs arrivent en continu, de plus en plus vite jusqu'à l'aube. */
  private updateNightWaves(time: number): void {
    if (this.phase() !== 'night' || this.callEndsAt !== null) return;
    if (time < this.nextWaveAt) return;
    const N = CONFIG.night;
    const t = CONFIG.time;
    const k = Phaser.Math.Clamp((this.elapsed - t.nightAt) / (t.dawnAt - t.nightAt), 0, 1);
    this.nextWaveAt = time + Phaser.Math.Linear(N.waveEveryStartMs, N.waveEveryEndMs, k);
    const spread = N.waveTargetSpread;
    const target = {
      x: this.player.x + Phaser.Math.Between(-spread, spread),
      y: this.player.y + Phaser.Math.Between(-spread, spread),
    };
    this.spawnReinforcement(target, N.waveMaxAlive);
  }

  /** À la tombée de la nuit, des caisses de ravitaillement apparaissent dans la rue. */
  private dropNightCrates(): void {
    const N = CONFIG.night;
    const T = CONFIG.tile;
    const { width, height, tiles } = this.map;
    let placed = 0;
    for (let attempt = 0; attempt < 400 && placed < N.crates; attempt++) {
      const tx = Phaser.Math.Between(2, width - 3);
      const ty = Phaser.Math.Between(2, height - 3);
      if (tiles[ty][tx] !== 'street' || this.nav.blocked(tx, ty)) continue;
      if (tx < 30 && ty > 34) continue; // pas devant le camp
      if (Math.hypot(tx - TERMINAL_TILE.tx, ty - TERMINAL_TILE.ty) < 6) continue;
      const x = tx * T + T / 2;
      const y = ty * T + T / 2;
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < N.crateMinDistance) continue;
      if (this.interactables.some((it) => Phaser.Math.Distance.Between(x, y, it.sprite.x, it.sprite.y) < 3 * T)) continue;
      this.nav.addSolid(tx, ty);
      this.addCrate(this.solids, { kind: 'crate', id: `caisse-nuit-${placed}`, tx, ty }, x, y, true);
      placed++;
    }
  }

  private inTrainZone(x: number, y: number): boolean {
    const T = CONFIG.tile;
    const z = TRAIN_ZONE;
    return x >= z.x0 * T && x < (z.x1 + 1) * T && y >= z.y0 * T && y < (z.y1 + 1) * T;
  }

  /** Fermeture des portes : le bilan d'extraction est validé ici, une seule fois. */
  private closeDoors(): void {
    if (this.inTrainZone(this.player.x, this.player.y)) {
      this.finish(true, this.morningTrain ? 'Le premier métro part avec vous. Vous avez tenu toute la nuit.' : 'La rame part avec vous.');
    } else {
      this.finish(
        false,
        this.morningTrain
          ? 'Le premier métro est reparti sans vous. Personne ne viendra.'
          : 'Rame ratée : les portes se sont fermées sans vous.',
      );
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
      // Nuit survécue : le butin du premier métro est multiplié.
      if (this.morningTrain) {
        const k = CONFIG.morning.lootBonus;
        const b = gameState.butin;
        gameState.butin = { materials: Math.round(b.materials * k), valuables: Math.round(b.valuables * k), rare: Math.round(b.rare * k) };
        lines.push(`Nuit survécue : butin x${String(k).replace('.', ',')}.`);
      }
      const gained = { ...gameState.butin };
      const mechanicAboard = !!c && c.following && this.inTrainZone(c.x, c.y);
      settleSuccess(mechanicAboard);
      lines.push(`Butin ramené : ${describeStock(gained)}.`);
      if (mechanicAboard) lines.push('Mécanicienne : à bord. Sauvetage validé. L\'atelier ouvre au refuge.');
      else if (c) lines.push('Mécanicienne : restée sur place. Le sauvetage reste ouvert.');
      lines.push(`Stock au refuge : ${stockValue(gameState.stock)} CR à vendre.`);
    } else {
      const lost = { ...gameState.butin };
      settleFailure();
      lines.push(`Butin perdu : ${describeStock(lost)}.`);
      lines.push(`Acquis conservés : ${currentWeapon().name}, stock ${describeStock(gameState.stock)}.`);
      if (c) lines.push('Mécanicienne : toujours à sauver.');
    }
    // Dernier état du HUD avant le bilan (sinon il garde les PV d'avant le coup fatal).
    this.game.events.emit('hud', this.hudData(this.now));
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
      maxHp: this.maxHp,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      exhausted: this.exhausted,
      weapon: currentWeapon().name,
      phase: this.phase(),
      elapsed: this.elapsed,
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
