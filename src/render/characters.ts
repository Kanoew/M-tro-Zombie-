import Phaser from 'phaser';
import { CONFIG } from '../config';

export type Dir = 'down' | 'side' | 'up';
export const INFECTED_SHEET = 'zombie-outlined';
const ZOMBIE_SHEET = { key: 'zombie', file: 'zombie.png', frameWidth: 124, frameHeight: 112 };

/** Planches (colonnes x rangées) : rangées = face, profil droit, dos. */
const SHEETS: { key: string; file: string; frameWidth: number; frameHeight: number }[] = [
  { key: 'joanna_walk', file: 'joanna_walk.png', frameWidth: 150, frameHeight: 112 },
  { key: 'joanna_idle', file: 'joanna_idle.png', frameWidth: 150, frameHeight: 112 },
  { key: 'joanna_shoot', file: 'joanna_shoot.png', frameWidth: 150, frameHeight: 112 },
  { key: 'mecano_walk', file: 'mecano_walk.png', frameWidth: 120, frameHeight: 112 },
  ZOMBIE_SHEET,
];

export const IMAGES: [string, string][] = [
  ['ground', 'ground.jpg'],
  ['fog', 'fog.png'],
  ['roof_a', 'roof_a.png'],
  ['roof_b', 'roof_b.png'],
  ['neon_pink_v', 'neon_pink_v.png'],
  ['neon_purple_v', 'neon_purple_v.png'],
  ['neon_cyan_top', 'neon_cyan_top.png'],
  ['neon_cyan_v', 'neon_cyan_v.png'],
  ['neon_pink_h', 'neon_pink_h.png'],
  ['neon_metro', 'neon_metro.png'],
  ['neon_shop', 'neon_shop.png'],
  ['banner', 'banner.png'],
  ['metro', 'metro.png'],
  ['train', 'train.png'],
  ['terminal_ring', 'terminal_ring.png'],
  ['terminal_pillar', 'terminal_pillar.png'],
  ['camp', 'camp.jpg'],
  ['menu_bg', 'menu_bg.jpg'],
  ['joanna_portrait', 'joanna_portrait.png'],
  ['joanna_face', 'joanna_face.png'],
];

export const NEON_KEYS = [
  'neon_pink_v',
  'neon_purple_v',
  'neon_cyan_top',
  'neon_cyan_v',
  'neon_pink_h',
  'neon_shop',
];

export function loadArt(scene: Phaser.Scene): void {
  scene.load.setPath('art/');
  for (const s of SHEETS) {
    scene.load.spritesheet(s.key, s.file, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
  }
  for (const [key, file] of IMAGES) scene.load.image(key, file);
}

/** Animations globales : `<perso>-walk|idle-<down|side|up>`, plus `zombie-attack`. */
export function createAnimations(scene: Phaser.Scene): void {
  createInfectedOutline(scene);
  const anims = scene.anims;
  const dirs: Dir[] = ['down', 'side', 'up'];

  const row = (key: string, r: number) =>
    anims.generateFrameNumbers(key, { start: r * 4, end: r * 4 + 3 });

  dirs.forEach((d, r) => {
    anims.create({ key: `joanna-walk-${d}`, frames: row('joanna_walk', r), frameRate: 9, repeat: -1 });
    anims.create({ key: `joanna-idle-${d}`, frames: row('joanna_idle', r), frameRate: 3, repeat: -1 });
    anims.create({ key: `mecano-walk-${d}`, frames: row('mecano_walk', r), frameRate: 9, repeat: -1 });
    anims.create({
      key: `mecano-idle-${d}`,
      frames: [{ key: 'mecano_walk', frame: r * 4 }],
      frameRate: 1,
      repeat: -1,
    });
    anims.create({ key: `zombie-walk-${d}`, frames: row(INFECTED_SHEET, r), frameRate: 6, repeat: -1 });
    anims.create({
      key: `zombie-idle-${d}`,
      frames: [{ key: INFECTED_SHEET, frame: r * 4 }],
      frameRate: 1,
      repeat: -1,
    });
  });
  anims.create({ key: 'zombie-attack', frames: row(INFECTED_SHEET, 3), frameRate: 9, repeat: 0 });
  // Tir à l'arc (profil droit) : 6 poses, la flèche part à la 4e.
  anims.create({
    key: 'joanna-shoot',
    frames: anims.generateFrameNumbers('joanna_shoot', { start: 0, end: 5 }),
    frameRate: 14,
    repeat: 0,
  });
}

/** Contour précalculé une fois, commun aux rendus Canvas et WebGL. */
function createInfectedOutline(scene: Phaser.Scene): void {
  const source = scene.textures.get(ZOMBIE_SHEET.key).getSourceImage() as HTMLImageElement;
  const texture = scene.textures.createCanvas(INFECTED_SHEET, source.width, source.height)!;
  const silhouette = document.createElement('canvas');
  silhouette.width = source.width;
  silhouette.height = source.height;
  const mask = silhouette.getContext('2d')!;
  mask.drawImage(source, 0, 0);
  mask.globalCompositeOperation = 'source-in';
  mask.fillStyle = '#ffc19d';
  mask.fillRect(0, 0, source.width, source.height);

  // La planche laisse au moins trois pixels transparents autour de chaque pose.
  const ctx = texture.getContext();
  for (const [x, y] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    ctx.drawImage(silhouette, x, y);
  }
  ctx.drawImage(source, 0, 0);
  texture.refresh();
  scene.textures.addSpriteSheet(INFECTED_SHEET, texture, ZOMBIE_SHEET);
}

/** Échelle, origine aux pieds et zone de collision d'un personnage peint. */
export function setupCharacter(sprite: Phaser.Physics.Arcade.Sprite, scale = CONFIG.sprites.scale): void {
  const { originY, bodySize } = CONFIG.sprites;
  sprite.setScale(scale);
  sprite.setOrigin(0.5, originY);
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  const size = bodySize / scale; // en pixels de texture : le corps suit l'échelle du sprite
  body.setSize(size, size);
  body.setOffset(sprite.width * 0.5 - size / 2, sprite.height * originY - size / 2);
}

/** Choisit l'animation selon le mouvement : face, dos ou profil (retourné à gauche). */
export class Animator {
  dir: Dir = 'down';

  constructor(
    private readonly sprite: Phaser.GameObjects.Sprite,
    private readonly prefix: string,
  ) {}

  update(vx: number, vy: number, timeScale = 1): void {
    const moving = vx * vx + vy * vy > 4;
    if (moving) {
      this.dir = Math.abs(vy) > Math.abs(vx) * 1.2 ? (vy > 0 ? 'down' : 'up') : 'side';
      if (this.dir === 'side') this.sprite.setFlipX(vx < 0);
    }
    const key = `${this.prefix}-${moving ? 'walk' : 'idle'}-${this.dir}`;
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key, true);
    this.sprite.anims.timeScale = timeScale;
  }
}
