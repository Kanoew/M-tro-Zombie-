import Phaser from 'phaser';
import { gameState } from '../state/gameState';

const FONT = 'monospace';

interface CharacterCard {
  id: 'joanna' | 'locked';
  name: string;
  tag: string;
  available: boolean;
}

const CARDS: CharacterCard[] = [
  { id: 'joanna', name: 'JOANNA', tag: 'Survivante', available: true },
  { id: 'locked', name: '???', tag: 'Bientôt', available: false },
];

/** Écran de début : titre, choix du personnage (un seul disponible pour l'instant), départ. */
export class TitleScene extends Phaser.Scene {
  private frames: Phaser.GameObjects.Rectangle[] = [];
  private starting = false;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.starting = false;
    this.frames = [];

    // Fond : la rue du décor, lentement balayée.
    const bg = this.add.image(width / 2, height / 2, 'menu_bg');
    const cover = Math.max(width / bg.width, height / bg.height) * 1.12;
    bg.setScale(cover);
    this.tweens.add({
      targets: bg,
      x: { from: width / 2 + 90, to: width / 2 - 90 },
      duration: 16000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.add.rectangle(width / 2, height / 2, width, height, 0x05070f, 0.55);
    this.add.rectangle(width / 2, height - 260, width, 520, 0x05070f, 0.55);

    // Titre.
    const glow = (t: Phaser.GameObjects.Text, color: string) =>
      t.setShadow(0, 0, color, 28, true, true).setOrigin(0.5);
    const t1 = glow(
      this.add.text(width / 2, 150, 'DERNIER', { fontFamily: FONT, fontSize: '104px', fontStyle: 'bold', color: '#ffd5fb' }),
      '#ff4fd8',
    );
    const t2 = glow(
      this.add.text(width / 2, 262, 'MÉTRO', { fontFamily: FONT, fontSize: '104px', fontStyle: 'bold', color: '#d4f8ff' }),
      '#35d6ff',
    );
    this.tweens.add({ targets: t1, alpha: { from: 1, to: 0.78 }, duration: 140, yoyo: true, repeat: -1, repeatDelay: 2400, hold: 60 });
    this.tweens.add({ targets: t2, alpha: { from: 1, to: 0.85 }, duration: 90, yoyo: true, repeat: -1, repeatDelay: 3700 });
    this.add
      .text(width / 2, 354, "Jeu solo d'extraction et de survie zombie", {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#bcd4de',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 450, 'CHOISIS TON PERSONNAGE', { fontFamily: FONT, fontSize: '24px', color: '#8fe8f5' })
      .setOrigin(0.5);

    // Cartes personnage.
    const cardW = 300;
    const cardH = 500;
    const cy = 740;
    CARDS.forEach((card, i) => {
      const cx = width / 2 + (i === 0 ? -170 : 170);
      const frame = this.add
        .rectangle(cx, cy, cardW, cardH, 0x0a1020, 0.88)
        .setStrokeStyle(4, 0x3a4660)
        .setInteractive({ useHandCursor: card.available });
      this.frames.push(frame);
      const portrait = this.add.image(cx, cy - 30, 'joanna_portrait');
      portrait.setScale(Math.min((cardH - 120) / portrait.height, (cardW - 40) / portrait.width));
      if (!card.available) {
        portrait.setTintFill(0x0b1224).setAlpha(0.9);
        this.add
          .text(cx, cy - 30, '?', { fontFamily: FONT, fontSize: '160px', fontStyle: 'bold', color: '#35456a' })
          .setOrigin(0.5);
      }
      this.add
        .text(cx, cy + cardH / 2 - 62, card.name, {
          fontFamily: FONT,
          fontSize: '34px',
          fontStyle: 'bold',
          color: card.available ? '#ffffff' : '#5d6b8a',
        })
        .setOrigin(0.5);
      this.add
        .text(cx, cy + cardH / 2 - 28, card.tag, {
          fontFamily: FONT,
          fontSize: '20px',
          color: card.available ? '#8fe8f5' : '#ff9fc2',
        })
        .setOrigin(0.5);
      frame.on('pointerdown', () => {
        if (card.available) this.select(i);
        else this.cameras.main.shake(120, 0.004);
      });
    });
    this.select(0);

    // Bouton de départ.
    const btn = this.add
      .rectangle(width / 2, 1130, 480, 100, 0x14243c, 0.95)
      .setStrokeStyle(4, 0x58e6cc)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, 1130, 'COMMENCER', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#aefce8' })
      .setOrigin(0.5);
    this.tweens.add({ targets: [btn, label], alpha: { from: 1, to: 0.7 }, duration: 800, yoyo: true, repeat: -1 });
    btn.on('pointerdown', () => this.start());
    this.input.keyboard?.on('keydown-ENTER', () => this.start());
    this.input.keyboard?.on('keydown-SPACE', () => this.start());

    const build = __BUILD_ID__.slice(0, 16).replace('T', ' ');
    this.add
      .text(12, height - 10, `v${__APP_VERSION__} · ${build} UTC`, { fontFamily: FONT, fontSize: '16px', color: '#4a6a74' })
      .setOrigin(0, 1);
  }

  private select(i: number): void {
    this.frames.forEach((f, idx) => {
      const on = idx === i;
      f.setStrokeStyle(on ? 6 : 4, on ? 0x35d6ff : 0x3a4660);
    });
  }

  private start(): void {
    if (this.starting) return;
    this.starting = true;
    gameState.character = 'joanna'; // seul personnage disponible pour l'instant
    this.cameras.main.fadeOut(350, 5, 7, 15);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Mission'));
  }
}
