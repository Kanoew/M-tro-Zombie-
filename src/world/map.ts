import { CONFIG } from '../config';

export type Tile = 'wall' | 'street' | 'floor' | 'quay';
export type EntityKind = 'door' | 'crate' | 'terminal' | 'npc' | 'spawn' | 'infected';

export interface Entity {
  kind: EntityKind;
  id: string;
  tx: number;
  ty: number;
  /** Portes uniquement : ouverte dès le départ. */
  open?: boolean;
  /** Portes uniquement : coincée, la forcer fait du bruit. */
  forced?: boolean;
  /** Bâtiment qui contient l'entité (absent dans la rue). */
  building?: string;
}

export interface Building {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  door: [number, number];
  forced: boolean;
  open: boolean;
}

export interface MapData {
  width: number;
  height: number;
  tiles: Tile[][];
  entities: Entity[];
  buildings: Building[];
}

/** Carte en paysage : 96 x 56 tuiles, jouée dans une fenêtre portrait qui suit le joueur. */
export const MAP_SIZE = { width: 96, height: 56 };

/** Zone d'embarquement de la rame, en tuiles (bornes incluses). */
export const TRAIN_ZONE = { x0: 60, y0: 50, x1: 90, y1: 52 };

/** Borne du quai. */
export const TERMINAL_TILE = { tx: 75, ty: 47 };

/** Points d'entrée des renforts attirés par la rame (tuiles de rue, près des bords). */
export const REINFORCEMENT_TILES: [number, number][] = [
  [3, 17], [3, 38], [93, 17], [93, 38], [36, 17], [56, 38], [18, 40], [66, 17],
];

type Rng = () => number;

/** Les bâtiments, rangée par rangée. Les portes donnent sur les rues. */
const BUILDINGS: Omit<Building, 'open'>[] = [
  // Rangée nord (portes au sud).
  { id: 'garage', x: 2, y: 2, w: 14, h: 10, door: [8, 11], forced: false },
  { id: 'clinique', x: 20, y: 2, w: 12, h: 10, door: [25, 11], forced: true },
  { id: 'entrepot', x: 37, y: 2, w: 16, h: 10, door: [44, 11], forced: true },
  { id: 'bar', x: 58, y: 2, w: 12, h: 10, door: [63, 11], forced: false },
  { id: 'bureaux', x: 74, y: 2, w: 20, h: 10, door: [83, 11], forced: true },
  // Rangée centrale (portes au sud).
  { id: 'immeuble', x: 2, y: 20, w: 14, h: 12, door: [8, 31], forced: true },
  { id: 'supermarche', x: 20, y: 20, w: 16, h: 12, door: [27, 31], forced: true },
  { id: 'atelier', x: 41, y: 20, w: 14, h: 12, door: [47, 31], forced: true },
  { id: 'hotel', x: 60, y: 20, w: 12, h: 12, door: [65, 31], forced: false },
  { id: 'serveurs', x: 76, y: 20, w: 18, h: 12, door: [84, 31], forced: true },
  // Rangée sud : refuge (porte ouverte à l'est), puis deux bâtiments (portes au nord).
  { id: 'refuge', x: 2, y: 44, w: 13, h: 10, door: [14, 49], forced: false },
  { id: 'depot', x: 20, y: 44, w: 16, h: 10, door: [27, 44], forced: true },
  { id: 'commissariat', x: 38, y: 44, w: 15, h: 10, door: [45, 44], forced: true },
];

/**
 * Construit le quartier. La structure est fixe ; le contenu des bâtiments
 * (pièce vide, caisses, infectés) est tiré à chaque sortie, donc on ne sait
 * jamais ce qu'il y a derrière une porte fermée. L'atelier abrite toujours la
 * mécanicienne.
 */
export function buildMap(rng: Rng = Math.random): MapData {
  const { width, height } = MAP_SIZE;
  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Tile => 'street'),
  );
  const entities: Entity[] = [];
  const buildings: Building[] = [];
  const taken = new Set<number>();
  const key = (x: number, y: number) => y * width + x;

  for (let x = 0; x < width; x++) {
    tiles[0][x] = 'wall';
    tiles[height - 1][x] = 'wall';
  }
  for (let y = 0; y < height; y++) {
    tiles[y][0] = 'wall';
    tiles[y][width - 1] = 'wall';
  }

  for (const b of BUILDINGS) {
    const building: Building = { ...b, open: b.id === 'refuge' };
    buildings.push(building);
    for (let ty = b.y; ty < b.y + b.h; ty++) {
      for (let tx = b.x; tx < b.x + b.w; tx++) {
        const edge = tx === b.x || ty === b.y || tx === b.x + b.w - 1 || ty === b.y + b.h - 1;
        tiles[ty][tx] = edge ? 'wall' : 'floor';
      }
    }
    tiles[b.door[1]][b.door[0]] = 'floor';
    entities.push({
      kind: 'door',
      id: `door-${b.id}`,
      tx: b.door[0],
      ty: b.door[1],
      open: building.open,
      forced: b.forced,
      building: b.id,
    });
  }

  // Quai (sud-est) : la rame s'y arrête, la borne est au nord.
  for (let ty = 46; ty <= 53; ty++) {
    for (let tx = 56; tx <= 93; tx++) {
      tiles[ty][tx] = 'quay';
    }
  }
  entities.push({ kind: 'terminal', id: 'borne-quai', tx: TERMINAL_TILE.tx, ty: TERMINAL_TILE.ty });
  taken.add(key(TERMINAL_TILE.tx, TERMINAL_TILE.ty));

  // Départ dans le refuge.
  entities.push({ kind: 'spawn', id: 'spawn', tx: 4, ty: 49 });
  taken.add(key(4, 49));

  const pick = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

  /** Tuile libre à l'intérieur d'un bâtiment, loin de la porte. */
  const freeInside = (b: Building): [number, number] | null => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const tx = pick(b.x + 1, b.x + b.w - 2);
      const ty = pick(b.y + 1, b.y + b.h - 2);
      if (Math.abs(tx - b.door[0]) + Math.abs(ty - b.door[1]) < 4) continue;
      if (taken.has(key(tx, ty))) continue;
      taken.add(key(tx, ty));
      return [tx, ty];
    }
    return null;
  };

  let crateN = 0;
  let infectedN = 0;
  const addCrate = (tx: number, ty: number, building?: string) =>
    entities.push({ kind: 'crate', id: `caisse-${++crateN}`, tx, ty, building });
  const addInfected = (tx: number, ty: number, building?: string) =>
    entities.push({ kind: 'infected', id: `infecte-${++infectedN}`, tx, ty, building });

  for (const b of buildings) {
    if (b.id === 'refuge') continue;
    if (b.id === 'atelier') {
      const npc = freeInside(b);
      if (npc) entities.push({ kind: 'npc', id: 'mecanicienne', tx: npc[0], ty: npc[1], building: b.id });
      for (let i = 0; i < 2; i++) {
        const c = freeInside(b);
        if (c) addCrate(c[0], c[1], b.id);
      }
      for (let i = 0; i < 2; i++) {
        const z = freeInside(b);
        if (z) addInfected(z[0], z[1], b.id);
      }
      continue;
    }
    const roll = rng();
    if (roll < CONFIG.world.buildingEmptyChance) continue; // pièce vide
    const infested = roll >= CONFIG.world.buildingEmptyChance + CONFIG.world.buildingLootChance;
    const crates = infested ? pick(0, 2) : pick(1, 3);
    for (let i = 0; i < crates; i++) {
      const c = freeInside(b);
      if (c) addCrate(c[0], c[1], b.id);
    }
    if (infested) {
      for (let i = 0, n = pick(1, 3); i < n; i++) {
        const z = freeInside(b);
        if (z) addInfected(z[0], z[1], b.id);
      }
    }
  }

  /** Tuile de rue libre, loin du refuge et de la borne. */
  const freeStreet = (): [number, number] | null => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const tx = pick(2, width - 3);
      const ty = pick(2, height - 3);
      if (tiles[ty][tx] !== 'street' || taken.has(key(tx, ty))) continue;
      if (Math.hypot(tx - 4, ty - 49) < 16) continue; // pas dans le refuge
      if (Math.hypot(tx - TERMINAL_TILE.tx, ty - TERMINAL_TILE.ty) < 6) continue; // ni sur la borne
      taken.add(key(tx, ty));
      return [tx, ty];
    }
    return null;
  };
  for (let i = 0; i < CONFIG.world.streetInfected; i++) {
    const s = freeStreet();
    if (s) addInfected(s[0], s[1]);
  }
  for (let i = 0; i < CONFIG.world.streetCrates; i++) {
    const s = freeStreet();
    if (s) addCrate(s[0], s[1]);
  }

  return { width, height, tiles, entities, buildings };
}
