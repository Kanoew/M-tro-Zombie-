import Phaser from 'phaser';
import { CONFIG } from '../config';
import {
  UPGRADES,
  UPGRADE_ORDER,
  buyUpgrade,
  describeStock,
  gameState,
  sellStock,
  stockValue,
  upgradeCost,
  type UpgradeId,
} from '../state/gameState';

const K = CONFIG.ui.scale;
const FONT = 'monospace';

interface Button {
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  enabled: boolean;
}

interface UpgradeRow {
  id: UpgradeId;
  title: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  button: Button;
}

/**
 * Panneau du refuge : vendre le stock, acheter les améliorations de l'atelier,
 * repartir. Il n'a pas de règles à lui : il appelle les fonctions de
 * `gameState` et se redessine.
 *
 * Séance 1 : ouvert depuis le bilan. Séance 3 : le même panneau sera ouvert
 * par la mécanicienne et le comptoir du refuge où l'on se déplace.
 */
export class RefugePanel {
  readonly layer: Phaser.GameObjects.Container;
  private credits!: Phaser.GameObjects.Text;
  private stock!: Phaser.GameObjects.Text;
  private sell!: Button;
  private workshopNote!: Phaser.GameObjects.Text;
  private rows: UpgradeRow[] = [];
  private feedback!: Phaser.GameObjects.Text;
  private feedbackTimer?: Phaser.Time.TimerEvent;

  constructor(
    private scene: Phaser.Scene,
    private onDepart: () => void,
    private onBack: () => void,
  ) {
    const { width, height } = scene.scale;
    const items: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      items.push(o);
      return o;
    };

    // Fond opaque : le bilan, en dessous, ne doit pas transparaître.
    add(scene.add.rectangle(width / 2, height / 2, width, height, 0x070b12, 1).setInteractive());
    add(
      scene.add
        .text(width / 2, 58 * K, 'REFUGE', { fontFamily: FONT, fontSize: `${24 * K}px`, color: '#8fe8f5', fontStyle: 'bold' })
        .setOrigin(0.5),
    );

    // Crédits et stock.
    this.credits = add(
      scene.add.text(width / 2, 96 * K, '', { fontFamily: FONT, fontSize: `${16 * K}px`, color: '#ffe27a', fontStyle: 'bold' }).setOrigin(0.5),
    );
    this.stock = add(
      scene.add
        .text(width / 2, 120 * K, '', {
          fontFamily: FONT,
          fontSize: `${11 * K}px`,
          color: '#cfe9ee',
          align: 'center',
          wordWrap: { width: width - 40 * K },
        })
        .setOrigin(0.5, 0),
    );
    this.sell = this.makeButton(width / 2, 174 * K, 260 * K, 32 * K, 0xffd24a, () => this.doSell(), items);

    // Atelier.
    add(
      scene.add
        .text(width / 2, 212 * K, 'ATELIER DE LA MÉCANICIENNE', { fontFamily: FONT, fontSize: `${12 * K}px`, color: '#58e6cc', fontStyle: 'bold' })
        .setOrigin(0.5),
    );
    this.workshopNote = add(
      scene.add
        .text(width / 2, 230 * K, '', { fontFamily: FONT, fontSize: `${10 * K}px`, color: '#ff9fc2', align: 'center', wordWrap: { width: width - 40 * K } })
        .setOrigin(0.5, 0),
    );

    const left = 24 * K;
    UPGRADE_ORDER.forEach((id, i) => {
      const y = 272 * K + i * 58 * K;
      add(scene.add.rectangle(width / 2, y + 14 * K, width - 32 * K, 50 * K, 0x0d1626, 0.9).setStrokeStyle(1 * K, 0x24405a));
      const title = add(scene.add.text(left, y, '', { fontFamily: FONT, fontSize: `${13 * K}px`, color: '#ffffff', fontStyle: 'bold' }));
      const detail = add(scene.add.text(left, y + 18 * K, '', { fontFamily: FONT, fontSize: `${10 * K}px`, color: '#9fc4cc' }));
      const button = this.makeButton(width - 70 * K, y + 14 * K, 96 * K, 30 * K, 0x58e6cc, () => this.doBuy(id), items);
      this.rows.push({ id, title, detail, button });
    });

    this.feedback = add(
      scene.add
        .text(width / 2, 456 * K, '', { fontFamily: FONT, fontSize: `${11 * K}px`, color: '#ffffff', align: 'center', wordWrap: { width: width - 40 * K } })
        .setOrigin(0.5),
    );

    const depart = this.makeButton(width / 2, height - 108 * K, 200 * K, 36 * K, 0x58e6cc, () => this.onDepart(), items);
    depart.text.setText('REPARTIR');
    const back = this.makeButton(width / 2, height - 62 * K, 200 * K, 32 * K, 0x8fe8f5, () => this.onBack(), items);
    back.text.setText('RETOUR AU BILAN');

    this.layer = scene.add.container(0, 0, items).setDepth(110).setVisible(false);
  }

  get visible(): boolean {
    return this.layer.visible;
  }

  show(): void {
    this.feedback.setText('');
    this.refresh();
    this.layer.setVisible(true);
  }

  hide(): void {
    this.layer.setVisible(false);
  }

  /** Raccourci clavier : vendre. */
  sellShortcut(): void {
    if (this.sell.enabled) this.doSell();
  }

  /** Raccourci clavier : touches 1, 2, 3 pour les améliorations. */
  buyShortcut(index: number): void {
    const row = this.rows[index];
    if (row) this.doBuy(row.id);
  }

  private refresh(): void {
    const value = stockValue(gameState.stock);
    this.credits.setText(`${gameState.credits} CR`);
    this.stock.setText(`Stock : ${describeStock(gameState.stock)}`);
    this.sell.text.setText(value > 0 ? `VENDRE LE STOCK  +${value} CR` : 'RIEN À VENDRE');
    this.setEnabled(this.sell, value > 0);

    const open = gameState.rescued.mecanicienne;
    this.workshopNote.setText(open ? '' : 'Fermé : ramène la mécanicienne au refuge pour l\'ouvrir.');
    for (const row of this.rows) {
      const def = UPGRADES[row.id];
      const lvl = gameState.upgrades[row.id];
      const max = def.costs.length;
      const cost = upgradeCost(row.id);
      row.title.setText(`${def.name.toUpperCase()}  ${'■'.repeat(lvl)}${'□'.repeat(max - lvl)}`);
      row.detail.setText(cost === null ? `${def.describe(lvl)} · niveau max` : `${def.describe(lvl)} → ${def.describe(lvl + 1)}`);
      row.button.text.setText(cost === null ? 'MAX' : `${cost} CR`);
      this.setEnabled(row.button, open && cost !== null && gameState.credits >= cost);
      row.title.setAlpha(open ? 1 : 0.45);
      row.detail.setAlpha(open ? 1 : 0.45);
    }
  }

  private doSell(): void {
    const gained = sellStock();
    this.say(gained > 0 ? `Vendu : +${gained} CR.` : 'Rien à vendre.', '#ffe27a');
    this.refresh();
  }

  private doBuy(id: UpgradeId): void {
    const result = buyUpgrade(id);
    const messages = {
      ok: [`${UPGRADES[id].name} amélioré : ${UPGRADES[id].describe(gameState.upgrades[id])}.`, '#7dffb2'],
      locked: ["L'atelier est fermé tant que la mécanicienne n'est pas au refuge.", '#ff9fc2'],
      max: ['Déjà au niveau maximal.', '#9fc4cc'],
      poor: ['Pas assez de crédits.', '#ff7b7b'],
    } as const;
    const [text, color] = messages[result];
    this.say(text, color);
    this.refresh();
  }

  private say(text: string, color: string): void {
    this.feedback.setText(text).setColor(color);
    this.feedbackTimer?.remove();
    this.feedbackTimer = this.scene.time.delayedCall(3000, () => this.feedback.setText(''));
  }

  private setEnabled(b: Button, on: boolean): void {
    b.enabled = on;
    b.rect.setAlpha(on ? 1 : 0.35);
    b.text.setAlpha(on ? 1 : 0.45);
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    onTap: () => void,
    items: Phaser.GameObjects.GameObject[],
  ): Button {
    const rect = this.scene.add
      .rectangle(x, y, w, h, 0x14243c, 0.95)
      .setStrokeStyle(2 * K, color)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(x, y, '', { fontFamily: FONT, fontSize: `${12 * K}px`, fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    const button: Button = { rect, text, enabled: true };
    // Un bouton grisé reste cliquable : l'atelier explique pourquoi il refuse.
    rect.on('pointerdown', onTap);
    items.push(rect, text);
    return button;
  }
}
