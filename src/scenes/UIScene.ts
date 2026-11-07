import Phaser from 'phaser';
import { CONFIG } from '../config';
import { Controls } from '../input/Controls';

const JOY_RADIUS = 48;
const FONT = 'monospace';

/**
 * Interface en portrait : joystick tactile (moitié gauche), boutons
 * d'interaction et d'attaque, vie, arme, état du jour. Elle ne contient aucune
 * règle de jeu : elle écoute des événements et alimente les Controls.
 */
export class UIScene extends Phaser.Scene {
  private controls!: Controls;
  private joyId: number | null = null;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyBase!: Phaser.GameObjects.Arc;
  private joyKnob!: Phaser.GameObjects.Arc;
  private promptText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'UI' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.controls = this.registry.get('controls') as Controls;
    this.input.addPointer(2);

    // HUD.
    this.add
      .text(8, 8, `VIE ${CONFIG.player.maxHp}   ÉPÉE   JOUR`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8fe8f5',
        backgroundColor: '#070b12aa',
        padding: { x: 4, y: 2 },
      })
      .setScrollFactor(0);

    this.toastText = this.add
      .text(width / 2, 44, '', {
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

    // Joystick flottant.
    this.joyBase = this.add
      .circle(0, 0, JOY_RADIUS, 0x8fe8f5, 0.12)
      .setStrokeStyle(2, 0x8fe8f5, 0.5)
      .setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 20, 0x8fe8f5, 0.45).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
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

    // Événements du jeu.
    const onPrompt = (label: string | null) => {
      this.promptText.setText(label ?? '').setVisible(!!label);
    };
    const onToast = (message: string) => this.showToast(message);
    this.game.events.on('prompt', onPrompt);
    this.game.events.on('toast', onToast);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('prompt', onPrompt);
      this.game.events.off('toast', onToast);
    });
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
    this.controls.touch.set(0, 0);
  }

  private showToast(message: string): void {
    this.toastText.setText(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(2200, () => this.toastText.setVisible(false));
  }
}
