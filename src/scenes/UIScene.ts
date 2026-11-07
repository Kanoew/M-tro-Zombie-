import Phaser from 'phaser';
import { Controls } from '../input/Controls';
import type { HudData, MissionEnd } from '../ui/events';

const JOY_RADIUS = 48;
const FONT = 'monospace';
const RESULT_LOCK_MS = 700; // évite de fermer le bilan par un appui encore en cours

/**
 * Interface en portrait : joystick tactile (moitié gauche), boutons
 * d'interaction et d'attaque, HUD, compte à rebours de la rame et bilan.
 * Elle ne contient aucune règle de jeu : elle écoute des événements du jeu
 * et alimente les Controls.
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

    this.hudText = this.add
      .text(8, 8, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8fe8f5',
        backgroundColor: '#070b12aa',
        padding: { x: 4, y: 2 },
        lineSpacing: 2,
      })
      .setScrollFactor(0);

    this.timerText = this.add
      .text(width - 8, 8, '', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffe27a',
        backgroundColor: '#070b12cc',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0)
      .setVisible(false);

    this.toastText = this.add
      .text(width / 2, 84, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#070b12cc',
        padding: { x: 6, y: 3 },
        align: 'center',
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.promptText = this.add
      .text(width / 2, height - 150, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ff9fc2',
        backgroundColor: '#070b12cc',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    // Version affichée : permet de vérifier quel déploiement est chargé.
    const build = __BUILD_ID__.slice(0, 16).replace('T', ' ');
    this.add
      .text(6, height - 6, `v${__APP_VERSION__} · ${build} UTC`, {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#4a6a74',
      })
      .setOrigin(0, 1);

    // Joystick flottant.
    this.joyBase = this.add
      .circle(0, 0, JOY_RADIUS, 0x8fe8f5, 0.12)
      .setStrokeStyle(2, 0x8fe8f5, 0.5)
      .setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 20, 0x8fe8f5, 0.45).setVisible(false);

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

    // Boutons d'action.
    this.addButton(width - 52, height - 56, 28, 'ATQ', 0xff4f8b, () => this.controls.queueAttack());
    this.addButton(width - 112, height - 96, 28, 'ACT', 0x58e6cc, () => this.controls.queueInteract());

    this.buildResultLayer(width, height);

    // Événements du jeu.
    const onPrompt = (label: string | null) => {
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

    // Redémarrage au clavier depuis le bilan.
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (!this.resultVisible || ev.repeat) return;
      if (ev.code === 'KeyE' || ev.code === 'Space' || ev.code === 'Enter') this.requestRestart();
    });
  }

  private renderHud(h: HudData): void {
    const escort = {
      none: '',
      waiting: '\nMÉCANICIENNE : À SAUVER',
      following: '\nMÉCANICIENNE : AVEC VOUS',
      rescued: '\nMÉCANICIENNE : AU REFUGE',
    }[h.escort];
    const b = h.butin;
    this.hudText.setText(
      `VIE ${h.hp}/${h.maxHp}   ${h.weapon.toUpperCase()}\n` +
        `BUTIN  MAT ${b.materials} · VAL ${b.valuables} · RARE ${b.rare}` +
        escort,
    );
    if (h.extraction === null) {
      this.timerText.setVisible(false);
    } else {
      const m = Math.floor(h.extraction / 60);
      const s = String(h.extraction % 60).padStart(2, '0');
      this.timerText
        .setText(`RAME ${m}:${s}`)
        .setColor(h.extraction <= 10 ? '#ff6666' : '#ffe27a')
        .setVisible(true);
    }
  }

  private buildResultLayer(width: number, height: number): void {
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x070b12, 0.88).setInteractive();
    shade.on('pointerdown', () => this.requestRestart());
    this.resultTitle = this.add
      .text(width / 2, height * 0.3, '', { fontFamily: FONT, fontSize: '24px', color: '#ffffff' })
      .setOrigin(0.5);
    this.resultBody = this.add
      .text(width / 2, height * 0.4, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfe9ee',
        align: 'center',
        wordWrap: { width: width - 56 },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0);
    const hint = this.add
      .text(width / 2, height * 0.78, 'Touchez pour repartir du refuge', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8fe8f5',
      })
      .setOrigin(0.5);
    this.resultLayer = this.add.container(0, 0, [shade, this.resultTitle, this.resultBody, hint]).setVisible(false);
    this.resultLayer.setDepth(100);
  }

  private showResult(end: MissionEnd): void {
    this.endJoy();
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
  }

  private requestRestart(): void {
    if (!this.resultVisible || this.time.now - this.resultShownAt < RESULT_LOCK_MS) return;
    this.resultVisible = false;
    this.game.events.emit('mission-restart');
  }

  private addButton(
    x: number,
    y: number,
    radius: number,
    label: string,
    color: number,
    onPress: () => void,
  ): void {
    const btn = this.add
      .circle(x, y, radius, color, 0.25)
      .setStrokeStyle(2, color, 0.8)
      .setInteractive();
    this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '11px', color: '#ffffff' })
      .setOrigin(0.5);
    btn.on('pointerdown', () => {
      btn.setFillStyle(color, 0.6);
      onPress();
    });
    const up = () => btn.setFillStyle(color, 0.25);
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
