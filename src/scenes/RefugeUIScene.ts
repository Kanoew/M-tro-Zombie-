import Phaser from 'phaser';
import { CONFIG } from '../config';
import type { Controls } from '../input/Controls';
import { gameState } from '../state/gameState';
import { RankPanel } from '../ui/RankPanel';
import { RefugePanel } from '../ui/RefugePanel';

const K = CONFIG.ui.scale;
const FONT = 'monospace';
const JOY_RADIUS = 48 * K;

/**
 * Interface du refuge : crédits en haut, joystick à gauche, bouton ACT à
 * droite, invite et messages, et le panneau vente / atelier. Comme l'interface
 * de la rue, elle ne contient aucune règle : elle alimente les Controls et
 * écoute les événements du refuge.
 */
export class RefugeUIScene extends Phaser.Scene {
  private joyId: number | null = null;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyBase!: Phaser.GameObjects.Arc;
  private joyKnob!: Phaser.GameObjects.Arc;
  private header!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;
  private panel!: RefugePanel;
  private ranks!: RankPanel;

  constructor() {
    super({ key: 'RefugeUI' });
  }

  private get controls(): Controls {
    return this.registry.get('controls') as Controls;
  }

  create(): void {
    const { width, height } = this.scale;
    this.joyId = null;

    this.add.rectangle(width / 2, 0, width, 52 * K, 0x070b12, 0.85).setOrigin(0.5, 0);
    this.add.text(12 * K, 17 * K, 'REFUGE', { fontFamily: FONT, fontSize: `${16 * K}px`, color: '#8fe8f5', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.add.text(12 * K, 32 * K, `Rang le plus haut : ${gameState.highestRank}`, {
      fontFamily: FONT, fontSize: `${10 * K}px`, color: '#a7b6c0',
    });
    this.header = this.add
      .text(width - 12 * K, 23 * K, '', { fontFamily: FONT, fontSize: `${14 * K}px`, color: '#ffe27a', fontStyle: 'bold' })
      .setOrigin(1, 0.5);

    this.toastText = this.add
      .text(width / 2, 60 * K, '', {
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
        align: 'center',
        wordWrap: { width: width - 40 * K },
      })
      .setOrigin(0.5)
      .setVisible(false);

    // Joystick flottant (moitié gauche) et bouton ACT.
    this.joyBase = this.add.circle(0, 0, JOY_RADIUS, 0x8fe8f5, 0.12).setStrokeStyle(2 * K, 0x8fe8f5, 0.5).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 20 * K, 0x8fe8f5, 0.45).setVisible(false);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.panel.visible || this.ranks.visible) return;
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

    const act = this.add.circle(width - 70 * K, height - 90 * K, 30 * K, 0x58e6cc, 0.25).setStrokeStyle(2 * K, 0x58e6cc, 0.8).setInteractive();
    this.add.text(act.x, act.y, 'ACT', { fontFamily: FONT, fontSize: `${12 * K}px`, color: '#ffffff' }).setOrigin(0.5);
    act.on('pointerdown', () => {
      if (this.panel.visible || this.ranks.visible) return;
      act.setFillStyle(0x58e6cc, 0.6);
      this.controls?.queueInteract();
    });
    const up = () => act.setFillStyle(0x58e6cc, 0.25);
    act.on('pointerup', up);
    act.on('pointerout', up);

    const openRanks = () => {
      this.endJoy();
      this.promptText.setVisible(false);
      this.panel.hide();
      this.ranks.setVisible(true);
    };
    this.ranks = new RankPanel(this, (rank) => this.game.events.emit('refuge-depart', rank), () => this.closePanel());
    this.panel = new RefugePanel(
      this,
      openRanks,
      () => this.closePanel(),
      'FERMER',
    );

    // Clavier : panneau ouvert -> V vend, 1-2-3 améliorent, Échap ferme.
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (this.ranks.visible) {
        if (ev.code === 'Escape') this.closePanel();
        const digit = /^(?:Digit|Numpad)([1-6])$/.exec(ev.code);
        if (digit) this.ranks.select(Number(digit[1]) - 1);
        return;
      }
      if (!this.panel.visible) return;
      if (ev.code === 'KeyV') this.panel.sellShortcut();
      if (ev.code === 'Digit1' || ev.code === 'Numpad1') this.panel.buyShortcut(0);
      if (ev.code === 'Digit2' || ev.code === 'Numpad2') this.panel.buyShortcut(1);
      if (ev.code === 'Digit3' || ev.code === 'Numpad3') this.panel.buyShortcut(2);
      if (ev.code === 'Escape') this.closePanel();
    });

    const g = this.game.events;
    const onPrompt = (label: string | null) => {
      if (this.panel.visible || this.ranks.visible) return;
      this.promptText.setText(label ? `${label}  [ACT]` : '').setVisible(!!label);
    };
    const onToast = (message: string) => this.showToast(message);
    const onEnter = (e: { text: string }) => this.showToast(e.text);
    const onOpen = () => {
      this.endJoy();
      this.promptText.setVisible(false);
      this.panel.show();
    };
    g.on('prompt', onPrompt);
    g.on('toast', onToast);
    g.on('refuge-enter', onEnter);
    g.on('refuge-open-panel', onOpen);
    g.on('refuge-open-ranks', openRanks);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      g.off('prompt', onPrompt);
      g.off('toast', onToast);
      g.off('refuge-enter', onEnter);
      g.off('refuge-open-panel', onOpen);
      g.off('refuge-open-ranks', openRanks);
    });
  }

  update(): void {
    this.header.setText(`${gameState.credits} CR`);
  }

  private closePanel(): void {
    this.panel.hide();
    this.ranks.setVisible(false);
    this.game.events.emit('refuge-panel-closed');
  }

  private showToast(message: string): void {
    this.toastText.setText(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(3200, () => this.toastText.setVisible(false));
  }

  private startJoy(p: Phaser.Input.Pointer): void {
    this.joyId = p.id;
    this.joyOrigin.set(p.x, p.y);
    this.joyBase.setPosition(p.x, p.y).setVisible(true);
    this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    this.moveJoy(p);
  }

  private moveJoy(p: Phaser.Input.Pointer): void {
    const dx = p.x - this.joyOrigin.x;
    const dy = p.y - this.joyOrigin.y;
    const distance = Math.hypot(dx, dy);
    const scale = JOY_RADIUS / Math.max(JOY_RADIUS, distance);
    const x = dx * scale;
    const y = dy * scale;
    this.joyKnob.setPosition(this.joyOrigin.x + x, this.joyOrigin.y + y);
    const touch = this.controls?.touch;
    if (distance < JOY_RADIUS * 0.15) touch?.set(0, 0);
    else touch?.set(x / JOY_RADIUS, y / JOY_RADIUS);
  }

  private endJoy(): void {
    this.joyId = null;
    this.joyBase?.setVisible(false);
    this.joyKnob?.setVisible(false);
    this.controls?.touch.set(0, 0);
  }
}
