import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Controls } from '../input/Controls';
import type { HudData, MissionEnd } from '../ui/events';

const K = CONFIG.ui.scale; // l'interface est dessinée en 360x640 puis multipliée par K
const JOY_RADIUS = 48 * K;
const FONT = 'monospace';
const RESULT_LOCK_MS = 700; // évite de fermer le bilan par un appui encore en cours

const BAR_X = 20 * K;
const BAR_W = 112 * K;
const DAY_X = 154 * K;
const SPRINT_W = 44 * K;

// Barre du jour : jour, crépuscule, nuit et aube.
const DAY_W = 130 * K;
const DAY_H = 6 * K;
const DAY_SPAN = CONFIG.time.dawnAt + CONFIG.extraction.closingSeconds; // jour, crépuscule, nuit, puis une minute d'aube

/** Teinte de la lumière selon l'heure : blanche le jour, orangée au crépuscule, bleue la nuit. */
const LIGHT_STOPS: [number, number][] = [
  [0, 0xffffff],
  [CONFIG.time.duskAt - 15, 0xffffff],
  [CONFIG.time.duskAt + 40, 0xffc79a],
  [CONFIG.time.nightAt - 5, 0xb98ab8],
  [CONFIG.time.nightAt + 30, 0x6573b0],
  [CONFIG.time.dawnAt - 20, 0x6573b0],
  [CONFIG.time.dawnAt + 25, 0xf3cfdc], // aube rosée
];

function lightAt(elapsed: number): number {
  const stops = LIGHT_STOPS;
  if (elapsed <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (elapsed <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const a = Phaser.Display.Color.IntegerToColor(c0);
      const b = Phaser.Display.Color.IntegerToColor(c1);
      const k = Math.round(((elapsed - t0) / (t1 - t0)) * 100);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, k);
      return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Interface en portrait : joystick tactile (moitié gauche), boutons
 * d'attaque, d'interaction et de course, HUD, pause et bilan.
 * Elle écoute les événements de la mission et alimente les Controls.
 */
export class UIScene extends Phaser.Scene {
  private joyId: number | null = null;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyBase!: Phaser.GameObjects.Arc;
  private joyKnob!: Phaser.GameObjects.Arc;
  private kitText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;

  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpGhost!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private stFill!: Phaser.GameObjects.Rectangle;
  private stFrame!: Phaser.GameObjects.Rectangle;
  private hud: HudData | null = null;
  private hpShown = CONFIG.player.maxHp;
  private stShown = CONFIG.player.stamina.max;

  private rain!: Phaser.GameObjects.TileSprite;
  private tint!: Phaser.GameObjects.Rectangle;
  private dayMarker!: Phaser.GameObjects.Rectangle;
  private dayLabel!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Rectangle;

  private pauseLayer!: Phaser.GameObjects.Container;
  private paused = false;

  private resultLayer!: Phaser.GameObjects.Container;
  private resultTitle!: Phaser.GameObjects.Text;
  private resultBody!: Phaser.GameObjects.Text;
  private resultVisible = false;
  private resultShownAt = 0;

  constructor() {
    super({ key: 'UI' });
  }

  private get controls(): Controls {
    // Relu à chaque usage : la mission recrée ses Controls à chaque tentative.
    return this.registry.get('controls') as Controls;
  }

  create(): void {
    const { width, height } = this.scale;
    this.input.addPointer(2);
    this.resultVisible = false;
    this.paused = false;
    this.hud = null;
    this.hpShown = CONFIG.player.maxHp;
    this.stShown = CONFIG.player.stamina.max;

    this.buildAtmosphere(width, height);
    this.buildHud();

    this.toastText = this.add
      .text(width / 2, 120 * K, '', {
        fontFamily: FONT,
        fontSize: `${12 * K}px`,
        color: '#ffffff',
        backgroundColor: '#070b12cc',
        padding: { x: 6 * K, y: 3 * K },
        align: 'center',
        wordWrap: { width: width - 40 * K },
      })
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.promptText = this.add
      .text(width / 2, height - 150 * K, '', {
        fontFamily: FONT,
        fontSize: `${12 * K}px`,
        color: '#ff9fc2',
        backgroundColor: '#070b12cc',
        padding: { x: 6 * K, y: 3 * K },
      })
      .setOrigin(0.5)
      .setVisible(false);

    // Version affichée : permet de vérifier quel déploiement est chargé.
    const build = __BUILD_ID__.slice(0, 16).replace('T', ' ');
    this.add
      .text(6 * K, height - 6 * K, `v${__APP_VERSION__} · ${build} UTC`, {
        fontFamily: FONT,
        fontSize: `${9 * K}px`,
        color: '#4a6a74',
      })
      .setOrigin(0, 1);

    // Joystick flottant.
    this.joyBase = this.add
      .circle(0, 0, JOY_RADIUS, 0x8fe8f5, 0.12)
      .setStrokeStyle(2 * K, 0x8fe8f5, 0.5)
      .setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 20 * K, 0x8fe8f5, 0.45).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.resultVisible || this.paused) return;
      if (this.joyId === null && p.x < width * 0.55 && p.y > height * 0.3) this.startJoy(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id === this.joyId) this.moveJoy(p);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id === this.joyId) this.endJoy();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    // Boutons d'action : attaquer, interagir, courir (maintenu).
    this.addButton(width - 52 * K, height - 56 * K, 28 * K, 'ATQ', 0xff4f8b, () => this.controls.queueAttack());
    this.addButton(width - 112 * K, height - 96 * K, 28 * K, 'ACT', 0x58e6cc, () => this.controls.queueInteract());
    this.addButton(
      width - 52 * K,
      height - 128 * K - 20 * K,
      26 * K,
      'COURIR',
      0xffd24a,
      () => (this.controls.touchSprint = true),
      () => (this.controls.touchSprint = false),
      9,
    );

    this.buildPauseLayer(width, height);
    this.buildResultLayer(width, height);

    // Événements du jeu.
    const onPrompt = (label: string | null) => {
      if (this.resultVisible) return;
      this.promptText.setText(label ?? '').setVisible(!!label);
    };
    const onToast = (message: string) => this.showToast(message);
    const onHud = (hud: HudData) => this.renderHud(hud);
    const onEnd = (end: MissionEnd) => this.showResult(end);
    const onStart = () => this.hideResult();
    const g = this.game.events;
    g.on('prompt', onPrompt);
    g.on('toast', onToast);
    g.on('hud', onHud);
    g.on('mission-end', onEnd);
    g.on('mission-start', onStart);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      g.off('prompt', onPrompt);
      g.off('toast', onToast);
      g.off('hud', onHud);
      g.off('mission-end', onEnd);
      g.off('mission-start', onStart);
    });

    // Raccourcis clavier depuis le bilan.
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (!this.resultVisible) {
        if (ev.code === 'Escape') this.setPaused(!this.paused);
        return;
      }
      if (ev.code === 'KeyR') this.openRefuge();
      if (ev.code === 'KeyE' || ev.code === 'Space' || ev.code === 'Enter') this.requestRestart();
      if (ev.code === 'KeyM' || ev.code === 'Escape') this.requestMenu();
    });
  }

  update(_time: number, delta: number): void {
    if (this.paused) return;
    // Pluie en surimpression, et barres qui glissent vers leur valeur.
    this.rain.tilePositionX -= delta * 0.05;
    this.rain.tilePositionY -= delta * 0.9;
    if (this.hud) {
      const k = Math.min(1, delta / 120);
      this.hpShown += (this.hud.hp - this.hpShown) * k;
      this.stShown += (this.hud.stamina - this.stShown) * Math.min(1, delta / 60);
      this.drawBars(this.hud);
    }
  }

  // --- Ambiance ------------------------------------------------------------

  private buildAtmosphere(width: number, height: number): void {
    if (!this.textures.exists('rain')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.lineStyle(2, 0xbfd8ff, 0.55);
      const rng = new Phaser.Math.RandomDataGenerator(['pluie']);
      for (let i = 0; i < 26; i++) {
        const x = rng.between(0, 256);
        const y = rng.between(0, 256);
        const len = rng.between(14, 30);
        g.lineBetween(x, y, x - len * 0.18, y + len);
        g.lineBetween(x + 256, y, x + 256 - len * 0.18, y + len);
      }
      g.generateTexture('rain', 256, 256);
      g.destroy();
    }
    this.rain = this.add.tileSprite(width / 2, height / 2, width, height, 'rain').setAlpha(0.2).setDepth(-5);

    // Lumière du jour : multiplie l'image du monde (blanc = rien, orange = crépuscule, bleu = nuit).
    this.tint = this.add
      .rectangle(width / 2, height / 2, width, height, 0xffffff, 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(-6)
      // Le mélange « multiplier » n'est fiable qu'en WebGL : en rendu 2D (secours), pas de teinte.
      .setVisible(this.game.renderer.type === Phaser.WEBGL);

    // Éclairs lointains : double éclat, rare.
    this.flash = this.add.rectangle(width / 2, height / 2, width, height, 0xcfd8ff, 0).setDepth(-4);
    const schedule = () => {
      this.time.delayedCall(Phaser.Math.Between(9000, 22000), () => {
        this.tweens.add({
          targets: this.flash,
          alpha: { from: 0, to: 0.16 },
          duration: 60,
          yoyo: true,
          repeat: 1,
          repeatDelay: 90,
          onComplete: schedule,
        });
      });
    };
    schedule();
  }

  // --- HUD -----------------------------------------------------------------

  private buildHud(): void {
    const { width, height } = this.scale;
    this.add.rectangle(12 * K, 12 * K, width - 24 * K, 88 * K, 0x070b12, 0.91)
      .setOrigin(0)
      .setStrokeStyle(K, 0x263c49);

    const hpY = 31 * K;
    const hpH = 7 * K;
    this.add.text(BAR_X, 18 * K, 'PV', { fontFamily: FONT, fontSize: `${10 * K}px`, color: '#ffd9de' });
    this.hpText = this.add
      .text(BAR_X + BAR_W, 17 * K, '', { fontFamily: FONT, fontSize: `${11 * K}px`, color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(1, 0);
    this.add.rectangle(BAR_X, hpY, BAR_W, hpH, 0x351923).setOrigin(0);
    this.hpGhost = this.add.rectangle(BAR_X, hpY, BAR_W, hpH, 0xffffff, 0.55).setOrigin(0);
    this.hpFill = this.add.rectangle(BAR_X, hpY, BAR_W, hpH, 0xe5384b).setOrigin(0);

    // Endurance contextuelle, au-dessus de la commande de course.
    const stX = width - 52 * K - SPRINT_W / 2;
    const stY = height - 181 * K;
    this.stFrame = this.add.rectangle(stX, stY, SPRINT_W, 3 * K, 0x131722, 0.9).setOrigin(0).setVisible(false);
    this.stFill = this.add.rectangle(stX, stY, SPRINT_W, 3 * K, 0xf2d04a).setOrigin(0).setVisible(false);

    const dayY = hpY;
    const seg = (from: number, to: number, color: number) =>
      this.add
        .rectangle(DAY_X + (from / DAY_SPAN) * DAY_W, dayY, ((to - from) / DAY_SPAN) * DAY_W, DAY_H, color)
        .setOrigin(0);
    seg(0, CONFIG.time.duskAt, 0xf2c14e);
    seg(CONFIG.time.duskAt, CONFIG.time.nightAt, 0xff7a2f);
    seg(CONFIG.time.nightAt, CONFIG.time.dawnAt, 0x4a5fc1);
    seg(CONFIG.time.dawnAt, DAY_SPAN, 0xffb3c7);
    // Repère du dernier appel de la rame.
    this.add.rectangle(DAY_X + (CONFIG.time.lastCallAt / DAY_SPAN) * DAY_W, dayY - 2 * K, K, DAY_H + 4 * K, 0xff3b3b).setOrigin(0.5, 0);
    this.dayMarker = this.add.rectangle(DAY_X, dayY - 2 * K, 2 * K, DAY_H + 4 * K, 0xffffff).setOrigin(0.5, 0);
    this.dayLabel = this.add
      .text(DAY_X, 18 * K, 'JOUR', { fontFamily: FONT, fontSize: `${10 * K}px`, color: '#f2c14e' });

    const pause = this.add.rectangle(width - 43 * K, 39 * K, 48 * K, 46 * K, 0x14243c)
      .setStrokeStyle(K, 0x385361)
      .setInteractive({ useHandCursor: true });
    pause.on('pointerdown', () => this.setPaused(true));
    this.add.rectangle(pause.x - 3 * K, pause.y, 3 * K, 13 * K, 0xcfe9ee);
    this.add.rectangle(pause.x + 3 * K, pause.y, 3 * K, 13 * K, 0xcfe9ee);

    this.add.rectangle(BAR_X, 48 * K, 258 * K, K, 0x263c49).setOrigin(0);
    this.objectiveText = this.add.text(BAR_X, 55 * K, '', {
      fontFamily: FONT, fontSize: `${13 * K}px`, color: '#e6f4f8', fontStyle: 'bold',
    });
    this.kitText = this.add.text(BAR_X, 78 * K, '', {
      fontFamily: FONT, fontSize: `${10 * K}px`, color: '#a7b6c0',
    });
  }

  private renderHud(h: HudData): void {
    if (!this.hud) {
      this.hpShown = h.hp;
      this.stShown = h.stamina;
    }
    this.hud = h;
    this.tint.setFillStyle(lightAt(h.elapsed), 1);
    this.dayMarker.setX(DAY_X + Math.min(1, h.elapsed / DAY_SPAN) * DAY_W);
    const t = CONFIG.time;
    const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    // Le crépuscule annonce le dernier appel ; la nuit compte jusqu'au premier métro.
    const labels: Record<HudData['phase'], [string, string]> = {
      day: ['JOUR', '#f2c14e'],
      dusk: h.elapsed < t.lastCallAt ? [`DERNIER APPEL ${clock(t.lastCallAt - h.elapsed)}`, '#ff9a4a'] : ['PLUS DE RAME', '#ff6b6b'],
      night: [`NUIT · AUBE ${clock(t.dawnAt - h.elapsed)}`, '#8aa0ff'],
      dawn: ['AUBE', '#ffb3c7'],
    };
    const [label, color] = labels[h.phase];
    this.dayLabel.setText(label).setColor(color);
    const b = h.butin;
    this.kitText.setText(`${h.weapon.toUpperCase()} · MAT ${b.materials} · VAL ${b.valuables} · RARE ${b.rare}`);
    const countdown = h.extraction === null ? '' : ` · ${clock(h.extraction)}`;
    this.objectiveText.setText(h.objective + countdown)
      .setColor(h.extraction === null ? '#e6f4f8' : h.extraction <= 10 ? '#ff8a8a' : '#ffe27a');
  }

  private drawBars(h: HudData): void {
    const hpRatio = Math.max(0, h.hp / h.maxHp);
    const shown = Math.max(0, this.hpShown / h.maxHp);
    this.hpFill.setSize(Math.max(0.01, BAR_W * hpRatio), this.hpFill.height);
    this.hpFill.setFillStyle(hpRatio > 0.5 ? 0xe5384b : hpRatio > 0.25 ? 0xff7a2f : 0xff2a2a);
    this.hpGhost.setSize(Math.max(0.01, BAR_W * Math.max(shown, hpRatio)), this.hpGhost.height);
    this.hpText.setText(`${Math.ceil(h.hp)}/${h.maxHp}`);
    // Alerte : barre qui pulse sous 25 % de vie.
    this.hpFill.setAlpha(hpRatio <= 0.25 ? 0.65 + 0.35 * Math.sin(this.time.now / 110) : 1);

    const stRatio = Math.max(0, this.stShown / h.maxStamina);
    const showStamina = h.exhausted || stRatio < 0.99;
    this.stFrame.setVisible(showStamina);
    this.stFill.setVisible(showStamina);
    this.stFill.setSize(Math.max(0.01, SPRINT_W * stRatio), this.stFill.height);
    this.stFill.setFillStyle(h.exhausted ? 0xff7a2f : 0xf2d04a);
    this.stFrame.setStrokeStyle(h.exhausted ? 2 * K : 0, 0xff7a2f, 0.9);
  }

  // --- Pause ---------------------------------------------------------------

  private buildPauseLayer(width: number, height: number): void {
    const x = width / 2;
    const y = height / 2;
    const shade = this.add.rectangle(x, y, width, height, 0x070b12, 0.8).setInteractive();
    const panel = this.add.rectangle(x, y, width - 56 * K, 152 * K, 0x0d1727)
      .setStrokeStyle(K, 0x385361);
    const title = this.add.text(x, y - 42 * K, 'PAUSE', {
      fontFamily: FONT, fontSize: `${24 * K}px`, color: '#e6f4f8', fontStyle: 'bold',
    }).setOrigin(0.5);
    const resume = this.add.rectangle(x, y + 31 * K, 206 * K, 48 * K, 0x15323c)
      .setStrokeStyle(K, 0x58e6cc)
      .setInteractive({ useHandCursor: true });
    resume.on('pointerup', () => this.setPaused(false));
    const label = this.add.text(resume.x, resume.y, 'REPRENDRE', {
      fontFamily: FONT, fontSize: `${14 * K}px`, color: '#e6f4f8', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.pauseLayer = this.add.container(0, 0, [shade, panel, title, resume, label])
      .setDepth(99)
      .setVisible(false);
  }

  private setPaused(paused: boolean): void {
    if (this.resultVisible || this.paused === paused) return;
    this.paused = paused;
    this.pauseLayer.setVisible(paused);
    if (paused) {
      this.endJoy();
      this.controls.touchSprint = false;
      this.controls.consumeInteract();
      this.controls.consumeAttack();
      this.controls.consumeSwitch();
      this.scene.get('Mission').input.keyboard?.resetKeys();
      this.scene.pause('Mission');
    } else {
      this.scene.resume('Mission');
    }
  }

  // --- Bilan ---------------------------------------------------------------

  private buildResultLayer(width: number, height: number): void {
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x070b12, 0.88).setInteractive();
    this.resultTitle = this.add
      .text(width / 2, height * 0.2, '', { fontFamily: FONT, fontSize: `${24 * K}px`, color: '#ffffff' })
      .setOrigin(0.5);
    this.resultBody = this.add
      .text(width / 2, height * 0.27, '', {
        fontFamily: FONT,
        fontSize: `${13 * K}px`,
        color: '#cfe9ee',
        align: 'center',
        wordWrap: { width: width - 56 * K },
        lineSpacing: 6 * K,
      })
      .setOrigin(0.5, 0);

    const mkButton = (y: number, label: string, color: number, onTap: () => void) => {
      const rect = this.add
        .rectangle(width / 2, y, 180 * K, 34 * K, 0x14243c, 0.95)
        .setStrokeStyle(2 * K, color)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerdown', onTap);
      const text = this.add
        .text(width / 2, y, label, { fontFamily: FONT, fontSize: `${14 * K}px`, fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5);
      return [rect, text];
    };
    const refuge = mkButton(height * 0.8 - 46 * K, 'REFUGE', 0xffd24a, () => this.openRefuge());
    const again = mkButton(height * 0.8, 'REPARTIR', 0x58e6cc, () => this.requestRestart());
    const menu = mkButton(height * 0.8 + 46 * K, 'MENU', 0x8fe8f5, () => this.requestMenu());
    this.resultLayer = this.add
      .container(0, 0, [shade, this.resultTitle, this.resultBody, ...refuge, ...again, ...menu])
      .setVisible(false);
    this.resultLayer.setDepth(100);
  }

  private showResult(end: MissionEnd): void {
    this.endJoy();
    this.controls.touchSprint = false;
    this.resultVisible = true;
    this.resultShownAt = this.time.now;
    this.resultTitle.setText(end.title).setColor(end.success ? '#7dffb2' : '#ff7b7b');
    this.resultBody.setText([end.reason, '', ...end.lines].join('\n'));
    this.resultLayer.setVisible(true);
    this.promptText.setVisible(false);
  }

  private hideResult(): void {
    this.hud = null;
    this.resultVisible = false;
    this.resultLayer.setVisible(false);
  }

  /** Retour au refuge par le métro : vente, atelier, puis nouvelle sortie depuis le portail. */
  private openRefuge(): void {
    if (!this.resultVisible || this.time.now - this.resultShownAt < RESULT_LOCK_MS) return;
    this.resultVisible = false;
    this.scene.stop('Mission');
    this.scene.start('Refuge'); // arrête aussi cette scène d'interface
  }

  private requestRestart(): void {
    if (!this.resultVisible || this.time.now - this.resultShownAt < RESULT_LOCK_MS) return;
    this.resultVisible = false;
    this.game.events.emit('mission-restart');
  }

  private requestMenu(): void {
    if (!this.resultVisible || this.time.now - this.resultShownAt < RESULT_LOCK_MS) return;
    this.resultVisible = false;
    this.scene.stop('Mission');
    this.scene.start('Title'); // arrête aussi cette scène d'interface
  }

  // --- Commandes -----------------------------------------------------------

  private addButton(
    x: number,
    y: number,
    radius: number,
    label: string,
    color: number,
    onPress: () => void,
    onRelease?: () => void,
    fontSize = 11,
  ): void {
    const btn = this.add
      .circle(x, y, radius, color, 0.25)
      .setStrokeStyle(2 * K, color, 0.8)
      .setInteractive();
    this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: `${fontSize * K}px`, color: '#ffffff' })
      .setOrigin(0.5);
    btn.on('pointerdown', () => {
      if (this.paused || this.resultVisible) return;
      btn.setFillStyle(color, 0.6);
      onPress();
    });
    const up = () => {
      btn.setFillStyle(color, 0.25);
      onRelease?.();
    };
    btn.on('pointerup', up);
    btn.on('pointerout', up);
  }

  private startJoy(p: Phaser.Input.Pointer): void {
    this.joyId = p.id;
    this.joyOrigin.set(p.x, p.y);
    this.joyBase.setPosition(p.x, p.y).setVisible(true);
    this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    this.moveJoy(p);
  }

  private moveJoy(p: Phaser.Input.Pointer): void {
    const delta = new Phaser.Math.Vector2(p.x - this.joyOrigin.x, p.y - this.joyOrigin.y);
    const len = Math.min(delta.length(), JOY_RADIUS);
    if (delta.lengthSq() > 0) delta.normalize().scale(len);
    this.joyKnob.setPosition(this.joyOrigin.x + delta.x, this.joyOrigin.y + delta.y);
    // Zone morte : petits mouvements ignorés.
    const strength = len / JOY_RADIUS;
    this.controls.touch.copy(strength < 0.15 ? new Phaser.Math.Vector2() : delta.scale(1 / len || 0));
    if (strength >= 0.15) this.controls.touch.scale(strength);
  }

  private endJoy(): void {
    this.joyId = null;
    this.joyBase.setVisible(false);
    this.joyKnob.setVisible(false);
    this.controls?.touch.set(0, 0);
  }

  private showToast(message: string): void {
    this.toastText.setText(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(2600, () => this.toastText.setVisible(false));
  }
}
