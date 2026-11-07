/**
 * Armes et personnages jouables.
 *
 * Une arme est une ligne de données : le jeu ne connaît que `kind`. Pour en
 * ajouter une (pistolet, couteau...), il suffit d'ajouter une entrée ici et de
 * la mettre dans le `loadout` d'un personnage. Le bruit de chaque tir attire
 * les infectés (0 = silencieux).
 */
export type WeaponKind = 'melee' | 'ranged';

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  damage: number;
  cooldownMs: number;
  /** Mêlée : portée de l'arc. Distance : portée maximale du projectile. */
  range: number;
  /** Rayon de bruit à chaque usage, en px. 0 = silencieux. */
  noise: number;
  /** Mêlée : demi-ouverture de l'arc (rad). */
  halfAngle?: number;
  /** Mêlée : durée de l'arc affiché (ms). */
  swingMs?: number;
  /** Distance : vitesse du projectile (px/s). */
  projectileSpeed?: number;
  /** Distance : délai entre l'appui et le départ du projectile (ms), calé sur l'animation. */
  windupMs?: number;
  /** Distance : durée du geste (ms) ; le joueur est ralenti pendant ce temps. */
  gestureMs?: number;
  /** Distance : vitesse de déplacement pendant le geste (1 = normale). */
  moveFactor?: number;
  /** Distance : visée assistée, demi-angle (rad) autour de la direction du joueur. */
  aimCone?: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  epee: {
    id: 'epee',
    name: 'Épée',
    kind: 'melee',
    damage: 15,
    cooldownMs: 350,
    range: 26,
    noise: 0,
    halfAngle: 1.0,
    swingMs: 140,
  },
  arc: {
    id: 'arc',
    name: 'Arc',
    kind: 'ranged',
    damage: 20, // un infecté (30 PV) tombe en deux flèches
    cooldownMs: 800,
    range: 170,
    noise: 0, // silencieux
    projectileSpeed: 270,
    windupMs: 215, // la flèche part à la 4e pose de l'animation
    gestureMs: 430,
    moveFactor: 0.25,
    aimCone: 0.7,
  },
};

export type CharacterId = 'joanna';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Armes de départ ; la première est équipée. */
  loadout: string[];
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  joanna: { id: 'joanna', name: 'Joanna', loadout: ['arc'] },
};
