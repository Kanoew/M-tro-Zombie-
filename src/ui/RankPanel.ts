import Phaser from 'phaser';
import { CONFIG, RANKS, type Rank } from '../config';
import { isRankOpen } from '../state/gameState';

const K = CONFIG.ui.scale;
const FONT = 'monospace';

/** Choix tactile ou clavier des portes du refuge. */
export class RankPanel {
  private readonly layer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, private readonly choose: (rank: Rank) => void, close: () => void) {
    const { width, height } = scene.scale;
    const cx = width / 2;
    const items: Phaser.GameObjects.GameObject[] = [];
    const label = (x: number, y: number, text: string, size: number, color: string) => {
      items.push(scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size * K}px`, color }).setOrigin(0.5));
    };
    items.push(scene.add.rectangle(cx, height / 2, width, height, 0x070b12, 0.85).setInteractive());
    items.push(scene.add.rectangle(cx, height / 2, 324 * K, 360 * K, 0x0d1626).setStrokeStyle(K, 0x385361));
    label(cx, 172 * K, 'PORTES DE RANG', 20, '#d4f8ff');
    label(cx, 202 * K, 'Une extraction ouvre la porte suivante', 11, '#a7b6c0');

    RANKS.forEach((rank, i) => {
      const x = cx + (i % 2 === 0 ? -75 : 75) * K;
      const y = (254 + Math.floor(i / 2) * 66) * K;
      const open = isRankOpen(rank);
      const card = scene.add.rectangle(x, y, 138 * K, 56 * K, open ? 0x15323c : 0x131a28)
        .setStrokeStyle(K, open ? 0x58e6cc : 0x304051);
      if (open) card.setInteractive({ useHandCursor: true }).on('pointerup', () => this.select(i));
      items.push(card);
      label(x, y - 10 * K, `PORTE ${rank}`, 15, open ? '#e6f4f8' : '#778a98');
      const multiplier = CONFIG.ranks[rank].lootValue.toLocaleString('fr-FR');
      label(x, y + 11 * K, open ? `BUTIN ×${multiplier}` : 'VERROUILLÉE', 10, open ? '#ffe27a' : '#778a98');
    });
    const back = scene.add.rectangle(cx, 465 * K, 170 * K, 44 * K, 0x14243c)
      .setStrokeStyle(K, 0x52717f).setInteractive({ useHandCursor: true });
    back.on('pointerup', close);
    items.push(back);
    label(cx, back.y, 'RETOUR', 13, '#e6f4f8');
    this.layer = scene.add.container(0, 0, items).setDepth(120).setVisible(false);
  }

  get visible(): boolean {
    return this.layer.visible;
  }

  setVisible(visible: boolean): void {
    this.layer.setVisible(visible);
  }

  select(index: number): void {
    const rank = RANKS[index];
    if (this.visible && rank && isRankOpen(rank)) this.choose(rank);
  }
}
