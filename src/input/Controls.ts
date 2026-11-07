import Phaser from 'phaser';

type KeyMap = Record<string, Phaser.Input.Keyboard.Key>;

/**
 * Entrées du joueur, indépendantes du rendu et des règles :
 * clavier (ZQSD, WASD, flèches) et tactile (joystick + boutons, alimentés
 * par l'interface). Les actions sont mises en file puis consommées une fois.
 */
export class Controls {
  /** Vecteur du joystick tactile, norme entre 0 et 1. */
  readonly touch = new Phaser.Math.Vector2(0, 0);
  /** Bouton de course tactile maintenu. */
  touchSprint = false;

  private readonly keys: KeyMap;
  private readonly shift: Phaser.Input.Keyboard.Key;
  private interactQueued = false;
  private attackQueued = false;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Clavier indisponible');
    this.keys = kb.addKeys('Z,Q,S,D,W,A,UP,DOWN,LEFT,RIGHT') as KeyMap;
    this.shift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    // Actions sur événements : un appui très bref n'est jamais perdu.
    const onAction = (queue: () => void) => (ev: KeyboardEvent) => {
      if (!ev.repeat) queue();
    };
    const interact = onAction(() => this.queueInteract());
    const attack = onAction(() => this.queueAttack());
    kb.on('keydown-E', interact);
    kb.on('keydown-SPACE', interact);
    kb.on('keydown-F', attack);
    kb.on('keydown-J', attack);
  }

  /** Course demandée (Maj au clavier, bouton COURIR au tactile). */
  get sprintHeld(): boolean {
    return this.shift.isDown || this.touchSprint;
  }

  get vector(): Phaser.Math.Vector2 {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.Q.isDown || k.A.isDown || k.LEFT.isDown) x -= 1;
    if (k.D.isDown || k.RIGHT.isDown) x += 1;
    if (k.Z.isDown || k.W.isDown || k.UP.isDown) y -= 1;
    if (k.S.isDown || k.DOWN.isDown) y += 1;
    const v = new Phaser.Math.Vector2(x, y);
    if (v.lengthSq() > 0) return v.normalize();
    return v.copy(this.touch);
  }

  queueInteract(): void {
    this.interactQueued = true;
  }

  queueAttack(): void {
    this.attackQueued = true;
  }

  consumeInteract(): boolean {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  consumeAttack(): boolean {
    const v = this.attackQueued;
    this.attackQueued = false;
    return v;
  }
}
