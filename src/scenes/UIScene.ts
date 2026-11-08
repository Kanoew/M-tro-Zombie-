import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Controls } from '../input/Controls';
import type { HudData, MissionEnd } from '../ui/events';
import { RefugePanel } from '../ui/RefugePanel';

const K = CONFIG.ui.scale; // l'interface est dessinée en 360x640 puis multipliée par K
const JOY_RADIUS = 48 * K;
const FONT = 'monospace';
const RESULT_LOCK_MS = 700; // évite de fermer le bilan par un appui encore en cours

const BAR_X = 64 * K;
const BAR_W = 130 * K;

// Barre du jour (haut à droite) : jour, crépuscule, nuit.
const DAY_W = 100 * K;
const DAY_H = 6 * K;
const DAY_SPAN = CONFIG.time.dawnAt + 60; // jour, crépuscule, nuit, puis une minute d'aube

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
 * d'attaque, d'interaction et de course, vie et endurance, butin, compte à
 * rebours de la rame, bilan. Elle ne contient aucune règle de jeu : elle
 * écoute des événements du jeu et alimente les Controls.
 */
export class UIScene extends Phaser.Scene {
  private joyId: number | null = null;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyBase!: Phaser.GameObjects.Arc;
  private joyKnob!: Phaser.GameObjects.Arc;
  private hudText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
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

  private resultLayer!: Phaser.GameObjects.Container;
  private resultTitle!: Phaser.GameObjects.Text;
  private resultBody!: Phaser.GameObjects.Text;
  private resultVisible = false;
  private resultShownAt = 0;
  private refuge!: RefugePanel;

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
    this.hud = null;
    this.hpShown = CONFIG.player.maxHp;
    this.stShown = CONFIG.player.stamina.max;

    this.buildAtmosphere(width, height);
    this.buildHud();

    this.timerText = this.add
      .text(width - 8 * K, 32 * K, '', {
        fontFamily: FONT,
        fontSize: `${16 * K}px`,
        color: '#ffe27a',
        backgroundColor: '#070b12cc',
        padding: { x: 6 * K, y: 3 * K },
      })
      .setOrigin(1, 0)
      .setVisible(false);

    this.toastText = this.add
      .text(width / 2, 128 * K, '', {
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
      if (this.resultVisible) return;
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

    this.buildResultLayer(width, height);
    this.refuge = new RefugePanel(
      this,
      () => this.requestRestart(),
      () => this.refuge.hide(),
    );

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
      if (!this.resultVisible || ev.repeat) return;
      if (this.refuge.visible) {
        // Refuge : V vend, 1-2-3 améliorent, E ou Entrée repartent, Échap revient au bilan.
        if (ev.code === 'KeyV') this.refuge.sellShortcut();
        if (ev.code === 'Digit1' || ev.code === 'Numpad1') this.refuge.buyShortcut(0);
        if (ev.code === 'Digit2' || ev.code === 'Numpad2') this.refuge.buyShortcut(1);
        if (ev.code === 'Digit3' || ev.code === 'Numpad3') this.refuge.buyShortcut(2);
        if (ev.code === 'KeyE' || ev.code === 'Enter') this.requestRestart();
        if (ev.code === 'Escape') this.refuge.hide();
        return;
      }
      if (ev.code === 'KeyR') this.openRefuge();
      if (ev.code === 'KeyE' || ev.code === 'Space' || ev.code === 'Enter') this.requestRestart();
      if (ev.code === 'KeyM' || ev.code === 'Escape') this.requestMenu();
    });
  }

  update(_time: number, delta: number): void {
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
    // Médaillon du visage.
    const cx = 36 * K;
    const cy = 36 * K;
    this.add.circle(cx, cy, 29 * K, 0x070b12, 0.85);
    const face = this.add.image(cx, cy + 1 * K, 'joanna_face');
    face.setScale((54 * K) / face.width);
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillCircle(cx, cy, 26 * K);
    face.setMask(maskShape.createGeometryMask());
    this.add.circle(cx, cy, 28 * K).setStrokeStyle(2 * K, 0x35d6ff, 0.9);

    // Vie : fond, traînée (dégâts récents), jauge, graduations, valeur.
    const hpY = 18 * K;
    const hpH = 15 * K;
    this.add.rectangle(BAR_X - 2 * K, hpY - 2 * K, BAR_W + 4 * K, hpH + 4 * K, 0x05070c, 0.9).setOrigin(0);
    this.hpGhost = this.add.rectangle(BAR_X, hpY, BAR_W, hpH, 0xffffff, 0.55).setOrigin(0);
    this.hpFill = this.add.rectangle(BAR_X, hpY, BAR_W, hpH, 0xe5384b).setOrigin(0);
    const ticks = this.add.graphics();
    ticks.lineStyle(1 * K, 0x05070c, 0.55);
    for (let i = 1; i < 10; i++) ticks.lineBetween(BAR_X + (BAR_W * i) / 10, hpY, BAR_X + (BAR_W * i) / 10, hpY + hpH);
    this.add.text(BAR_X + 3 * K, hpY + hpH / 2, 'PV', { fontFamily: FONT, fontSize: `${9 * K}px`, color: '#ffd9de', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.hpText = this.add
      .text(BAR_X + BAR_W - 3 * K, hpY + hpH / 2, '', { fontFamily: FONT, fontSize: `${10 * K}px`, color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(1, 0.5);

    // Endurance.
    const stY = hpY + hpH + 6 * K;
    const stH = 9 * K;
    this.stFrame = this.add.rectangle(BAR_X - 2 * K, stY - 2 * K, BAR_W + 4 * K, stH + 4 * K, 0x05070c, 0.9).setOrigin(0);
    this.stFill = this.add.rectangle(BAR_X, stY, BAR_W, stH, 0xf2d04a).setOrigin(0);
    this.add.text(BAR_X + 3 * K, stY + stH / 2, 'END', { fontFamily: FONT, fontSize: `${7 * K}px`, color: '#3b3200', fontStyle: 'bold' }).setOrigin(0, 0.5);

    // Barre du jour : segments jour / crépuscule / nuit et curseur.
    const dayX = this.scale.width - 8 * K - DAY_W;
    const dayY = 12 * K;
    const seg = (from: number, to: number, color: number) =>
      this.add
        .rectangle(dayX + (from / DAY_SPAN) * DAY_W, dayY, ((to - from) / DAY_SPAN) * DAY_W, DAY_H, color)
        .setOrigin(0);
    this.add.rectangle(dayX - 2 * K, dayY - 2 * K, DAY_W + 4 * K, DAY_H + 4 * K, 0x05070c, 0.9).setOrigin(0);
    seg(0, CONFIG.time.duskAt, 0xf2c14e);
    seg(CONFIG.time.duskAt, CONFIG.time.nightAt, 0xff7a2f);
    seg(CONFIG.time.nightAt, CONFIG.time.dawnAt, 0x4a5fc1);
    seg(CONFIG.time.dawnAt, DAY_SPAN, 0xffb3c7);
    // Repère du dernier appel de la rame.
    this.add.rectangle(dayX + (CONFIG.time.lastCallAt / DAY_SPAN) * DAY_W, dayY - 2 * K, 1 * K, DAY_H + 4 * K, 0xff3b3b).setOrigin(0.5, 0);
    this.dayMarker = this.add.rectangle(dayX, dayY - 3 * K, 2 * K, DAY_H + 6 * K, 0xffffff).setOrigin(0.5, 0);
    this.dayLabel = this.add
      .text(this.scale.width - 8 * K, dayY + DAY_H + 4 * K, 'JOUR', { fontFamily: FONT, fontSize: `${8 * K}px`, color: '#f2c14e' })
      .setOrigin(1, 0);

    // Butin, survivante.
    this.hudText = this.add
      .text(8 * K, 78 * K, '', {
        fontFamily: FONT,
        fontSize: `${10 * K}px`,
        color: '#8fe8f5',
        backgroundColor: '#070b12aa',
        padding: { x: 4 * K, y: 2 * K },
        lineSpacing: 2 * K,
      })
      .setScrollFactor(0);
  }

  private renderHud(h: HudData): void {
    this.hud = h;
    this.tint.setFillStyle(lightAt(h.elapsed), 1);
    const dayX = this.scale.width - 8 * K - DAY_W;
    this.dayMarker.setX(dayX + Math.min(1, h.elapsed / DAY_SPAN) * DAY_W);
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
    const escort = {
      none: '',
      waiting: '\nMÉCANICIENNE : À SAUVER',
      following: '\nMÉCANICIENNE : AVEC VOUS',
      rescued: '\nMÉCANICIENNE : AU REFUGE',
    }[h.escort];
    const b = h.butin;
    this.hudText.setText(
      `${h.weapon.toUpperCase()}\n` + `BUTIN  MAT ${b.materials} · VAL ${b.valuables} · RARE ${b.rare}` + escort,
    );
    if (h.extraction === null) {
      this.timerText.setVisible(false);
    } else {
      const m = Math.floor(h.extraction / 60);
      const s = String(h.extraction % 60).padStart(2, '0');
      this.timerText
        .setText(`RAME ${m}:${s}`)
        .setColor(h.extraction <= 10 ? '#ff6666' : '#ffe27a')
        .setVisible(!this.resultVisible);
    }
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
    this.stFill.setSize(Math.max(0.01, BAR_W * stRatio), this.stFill.height);
    this.stFill.setFillStyle(h.exhausted ? 0xff7a2f : 0xf2d04a);
    this.stFrame.setStrokeStyle(h.exhausted ? 2 * K : 0, 0xff7a2f, 0.9);
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
    this.timerText.setVisible(false);
  }

  private hideResult(): void {
    this.resultVisible = false;
    this.resultLayer.setVisible(false);
    this.refuge?.hide();
  }

  private openRefuge(): void {
    if (!this.resultVisible || this.time.now - this.resultShownAt < RESULT_LOCK_MS) return;
    this.refuge.show();
  }

  private requestRestart(): void {
    if (!this.resultVisible || this.time.now - this.resultShownAt < RESULT_LOCK_MS) return;
    this.resultVisible = false;
    this.refuge.hide();
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
