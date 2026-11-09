import Phaser from 'phaser';
import { CONFIG, type Rank } from '../config';
import { Controls } from '../input/Controls';
import { Animator, setupCharacter } from '../render/characters';
import { gameState, isRankOpen, stockResaleValue } from '../state/gameState';
import { CAMP_IMAGE_WIDTH, campBlockers } from '../world/map';

/** Largeur du refuge dans le monde (px), comme l'ancien camp : 20 tuiles. */
const CAMP_W = 20 * CONFIG.tile;
/** Le refuge est petit : la caméra est plus proche que dans la rue. */
const ZOOM = 5;

/** Repère dans l'illustration d'origine (2000 px de large) -> position dans le monde. */
const at = (ix: number, iy: number) => ({ x: (ix * CAMP_W) / CAMP_IMAGE_WIDTH, y: (iy * CAMP_W) / CAMP_IMAGE_WIDTH });

/** Points d'intérêt du refuge, placés sur l'illustration. */
const SPOTS = {
  spawn: at(1040, 700), // entre les deux barrières, en arrivant de la rame
  comptoir: at(700, 860), // sous le poste informatique bleu : on y vend le stock
  mecano: at(1400, 470), // devant l'établi
  portail: at(975, 885), // le portail mène au quai
};

type SpotId = 'comptoir' | 'mecano' | 'portail';

interface Spot {
  id: SpotId;
  x: number;
  y: number;
  label: () => string;
}

/**
 * Le refuge, accessible seulement en métro. On s'y déplace comme dans la rue,
 * sans infectés : le comptoir vend le stock, la mécanicienne améliore
 * l'équipement (une fois sauvée), le portail mène à la rame et à la sortie
 * suivante. L'interface (joystick, ACT, panneau) vit dans `RefugeUI`.
 */
export class RefugeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private anim!: Animator;
  private controls!: Controls;
  private spots: Spot[] = [];
  private lastPrompt: string | null = null;
  private busy = false;
  private departing = false;

  constructor() {
    super({ key: 'Refuge' });
  }

  create(): void {
    this.busy = false;
    this.departing = false;
    this.lastPrompt = null;
    const src = this.textures.get('camp').getSourceImage();
    const campH = (CAMP_W * src.height) / src.width;
    const T = CONFIG.tile;

    this.cameras.main.setBackgroundColor(0x05070c);
    this.add.image(0, 0, 'camp').setOrigin(0).setDisplaySize(CAMP_W, campH).setDepth(-10);

    // Gros meubles : mêmes zones de collision que l'ancien camp.
    const solids = this.physics.add.staticGroup();
    for (const b of campBlockers(0, 0, CAMP_W)) {
      const blk = solids.create(b.x + b.w / 2, b.y + b.h / 2, 'wall') as Phaser.Physics.Arcade.Sprite;
      blk.setVisible(false).setDisplaySize(b.w, b.h).refreshBody();
    }
    // Murs d'enceinte (une tuile) et grillage au sud : on ne sort que par le portail.
    this.physics.world.setBounds(T, T, CAMP_W - 2 * T, 9 * T);

    // Mécanicienne, si elle a été ramenée.
    const rescued = gameState.rescued.mecanicienne;
    if (rescued) {
      // Elle se tient devant l'établi ; on lui parle depuis le repère au sol, à côté.
      const pos = at(1300, 430);
      const m = this.add
        .sprite(pos.x, pos.y, 'mecano_walk', 0)
        .setScale(CONFIG.sprites.scale)
        .setOrigin(0.5, CONFIG.sprites.originY)
        .setDepth(pos.y);
      m.setFlipX(true);
    }

    this.player = this.physics.add.sprite(SPOTS.spawn.x, SPOTS.spawn.y, 'joanna_walk', 0);
    setupCharacter(this.player);
    this.anim = new Animator(this.player, 'joanna');
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, solids);

    this.spots = [
      { id: 'comptoir', ...SPOTS.comptoir, label: () => `Comptoir : vendre le stock (${stockResaleValue()} CR)` },
      {
        id: 'mecano',
        ...SPOTS.mecano,
        label: () => (gameState.rescued.mecanicienne ? 'Mécanicienne : atelier' : 'Établi (personne pour s\'en servir)'),
      },
      { id: 'portail', ...SPOTS.portail, label: () => 'Portail : choisir une porte' },
    ];
    // Repères discrets au sol.
    for (const s of this.spots) {
      const ring = this.add.circle(s.x, s.y, 5).setStrokeStyle(0.6, 0x58e6cc, 0.8).setDepth(s.y - 20);
      this.tweens.add({ targets: ring, alpha: { from: 0.9, to: 0.3 }, duration: 900, yoyo: true, repeat: -1 });
    }

    // En portrait, le refuge est moins haut que l'écran : on le centre verticalement.
    const viewH = this.scale.height / ZOOM;
    const padY = Math.max(0, (viewH - campH) / 2);
    this.cameras.main.setBounds(0, -padY, CAMP_W, Math.max(campH, viewH));
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.fadeIn(350, 5, 7, 15);

    this.controls = new Controls(this);
    this.registry.set('controls', this.controls);

    const onDepart = (rank: Rank) => this.depart(rank);
    const onClose = () => { if (!this.departing) this.busy = false; };
    this.game.events.on('refuge-depart', onDepart);
    this.game.events.on('refuge-panel-closed', onClose);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('refuge-depart', onDepart);
      this.game.events.off('refuge-panel-closed', onClose);
    });

    if (!this.scene.isActive('RefugeUI')) this.scene.launch('RefugeUI');
    this.scene.bringToTop('RefugeUI');
    this.game.events.emit('refuge-enter', {
      text: rescued
        ? 'Refuge. Vends ton stock au comptoir, la mécanicienne t\'attend à l\'établi.'
        : 'Refuge. Vends ton stock au comptoir. L\'établi attend une mécanicienne.',
    });
  }

  update(): void {
    if (this.busy) {
      this.player.setVelocity(0, 0);
      this.anim.update(0, 0, 1);
      this.controls.consumeInteract();
      return;
    }
    const v = this.controls.vector;
    const speed = CONFIG.player.speed * 0.8;
    this.player.setVelocity(v.x * speed, v.y * speed);
    this.anim.update(v.x * speed, v.y * speed, 1);
    this.player.setDepth(this.player.y);

    const spot = this.nearestSpot();
    const prompt = spot ? spot.label() : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.game.events.emit('prompt', prompt);
    }
    if (this.controls.consumeInteract() && spot) this.use(spot);
  }

  private nearestSpot(): Spot | null {
    let best: Spot | null = null;
    let bestD: number = CONFIG.interaction.range;
    for (const s of this.spots) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private use(spot: Spot): void {
    if (spot.id === 'portail') {
      this.busy = true;
      this.lastPrompt = null;
      this.game.events.emit('refuge-open-ranks');
      return;
    }
    if (spot.id === 'mecano' && !gameState.rescued.mecanicienne) {
      this.game.events.emit('toast', 'Personne pour se servir de l\'établi. La mécanicienne est coincée dans l\'atelier, en ville.');
      return;
    }
    this.busy = true;
    this.game.events.emit('prompt', null);
    this.lastPrompt = null;
    this.game.events.emit('refuge-open-panel');
  }

  /** Le portail mène à la rame : nouvelle sortie. */
  private depart(rank: Rank): void {
    if (this.departing || !this.busy || !isRankOpen(rank)) return;
    this.departing = true;
    this.busy = true;
    this.cameras.main.fadeOut(350, 5, 7, 15);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('RefugeUI');
      this.scene.start('Mission', { rank });
    });
  }
}
