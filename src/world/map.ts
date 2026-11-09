import { CONFIG } from '../config';

export type Tile = 'wall' | 'street' | 'floor' | 'quay' | 'track';
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

/** Rectangle plein invisible (en px monde) : meubles du camp, qui bloquent le joueur et les infectés. */
export interface Blocker {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapData {
  width: number;
  height: number;
  tiles: Tile[][];
  entities: Entity[];
  buildings: Building[];
  blockers: Blocker[];
}

/** Carte en paysage, jouée dans une fenêtre portrait qui suit le joueur. */
export const MAP_SIZE = { width: 96, height: 60 };

/** Parvis au sud-est, promenade et voie sur toute la largeur (bornes incluses). */
export const QUAY = { x0: 1, y0: 47, x1: MAP_SIZE.width - 2, y1: 49 };
export const TRACK = { ...QUAY, y0: QUAY.y1 + 1, y1: MAP_SIZE.height - 2 };

/** L'unique entrée côté quai et l'intérieur visible de la rame. */
export const TRAIN_DOOR = { x0: 67, x1: 69, y: TRACK.y0 };
export const TRAIN_ZONE = { x0: 64, y0: TRAIN_DOOR.y + 1, x1: 72, y1: TRAIN_DOOR.y + 4 };

/** Borne du quai. */
export const TERMINAL_TILE = { tx: 72, ty: QUAY.y1 - 2 };

function trackBlockers(): Blocker[] {
  const r = TRACK;
  const z = TRAIN_ZONE;
  const d = TRAIN_DOOR;
  const T = CONFIG.tile;
  const rect = (x0: number, y0: number, x1: number, y1: number) => ({
    x: x0 * T, y: y0 * T, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T,
  });
  return [
    rect(r.x0, r.y0, z.x0 - 1, r.y1),
    rect(z.x1 + 1, r.y0, r.x1, r.y1),
    rect(z.x0, d.y, d.x0 - 1, d.y),
    rect(d.x1 + 1, d.y, z.x1, d.y),
    rect(z.x0, z.y1 + 1, z.x1, r.y1),
  ];
}

/**
 * Le refuge (scène à part, accessible en métro) : les gros meubles de
 * l'illustration sont des zones de collision, décrites ici en pixels de l'image
 * d'origine (2000 x 1116).
 */
export const CAMP_IMAGE_WIDTH = 2000;
const CAMP_BLOCKS: [number, number, number, number][] = [
  [95, 150, 700, 570], // rayonnages, caisses et bidons du nord-ouest
  [0, 520, 340, 800], // plateforme et escalier ouest
  [0, 780, 480, 1000], // bidons et conteneur au sud-ouest
  [765, 110, 1500, 350], // passerelle, bureau aux casiers
  [755, 350, 795, 640], // mur ouest du dortoir
  [755, 350, 1260, 420], // mur nord du dortoir
  [1215, 420, 1340, 670], // mur est du dortoir et bureau violet
  [580, 590, 830, 800], // poste de travail bleu
  [835, 690, 975, 775], // barrière de chantier gauche
  [1105, 695, 1255, 790], // barrière de chantier droite
  [1105, 175, 1385, 395], // établi
  [1405, 285, 1495, 410], // râtelier
  [1495, 100, 1590, 455], // escalier nord-est
  [1590, 200, 1880, 505], // infirmerie
  [1490, 520, 2000, 890], // groupes électrogènes
];

/** Points d'entrée des renforts attirés par la rame (tuiles de rue, près des bords). */
export const REINFORCEMENT_TILES: [number, number][] = [
  [3, 17], [3, 35], [93, 17], [93, 36], [36, 17], [44, 35], [18, 35], [66, 17],
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
  // Rangée sud : un grand hangar (porte au sud), puis deux bâtiments (portes au nord).
  // Le refuge n'est plus dans la rue : on y va en métro (RefugeScene).
  { id: 'hangar', x: 2, y: 37, w: 20, h: 10, door: [12, 46], forced: true },
  { id: 'depot', x: 26, y: 37, w: 13, h: 10, door: [32, 37], forced: true },
  { id: 'commissariat', x: 41, y: 37, w: 13, h: 10, door: [47, 37], forced: true },
];

/**
 * Construit le quartier. La structure est fixe ; le contenu des bâtiments
 * (pièce vide, caisses, infectés) est tiré à chaque sortie, donc on ne sait
 * jamais ce qu'il y a derrière une porte fermée. L'atelier abrite toujours la
 * mécanicienne.
 */
export function buildMap(rng: Rng = Math.random, extraInfected = 0): MapData {
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
    if (b.id === 'refuge') {
      // Le portail du camp est large de 3 tuiles.
      tiles[b.door[1]][b.door[0] - 1] = 'floor';
      tiles[b.door[1]][b.door[0] + 1] = 'floor';
    }
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

  // Aucun butin ni infecté n'apparaît au départ sur le quai ou la voie.
  for (let ty = QUAY.y0; ty < TRACK.y0; ty++) {
    for (let tx = QUAY.x0; tx <= QUAY.x1; tx++) tiles[ty][tx] = 'quay';
  }
  for (let ty = TRACK.y0; ty <= TRACK.y1; ty++) {
    for (let tx = TRACK.x0; tx <= TRACK.x1; tx++) tiles[ty][tx] = 'track';
  }
  entities.push({ kind: 'terminal', id: 'borne-quai', tx: TERMINAL_TILE.tx, ty: TERMINAL_TILE.ty });
  taken.add(key(TERMINAL_TILE.tx, TERMINAL_TILE.ty));

  // Départ sur le quai : on descend de la rame.
  const spawnT = { tx: (TRAIN_DOOR.x0 + TRAIN_DOOR.x1) / 2, ty: QUAY.y1 };
  entities.push({ kind: 'spawn', id: 'spawn', tx: spawnT.tx, ty: spawnT.ty });
  taken.add(key(spawnT.tx, spawnT.ty));

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
      if (tx < 30 && ty > 34) continue; // pas devant le camp
      if (Math.hypot(tx - TERMINAL_TILE.tx, ty - TERMINAL_TILE.ty) < 6) continue; // ni sur la borne
      taken.add(key(tx, ty));
      return [tx, ty];
    }
    return null;
  };
  for (let i = 0; i < CONFIG.world.streetInfected + extraInfected; i++) {
    const s = freeStreet();
    if (s) addInfected(s[0], s[1]);
  }
  for (let i = 0; i < CONFIG.world.streetCrates; i++) {
    const s = freeStreet();
    if (s) addCrate(s[0], s[1]);
  }

  return { width, height, tiles, entities, buildings, blockers: trackBlockers() };
}

/** Meubles du refuge en px du monde, pour une illustration posée en (ox, oy) sur `displayWidth` px. */
export function campBlockers(ox: number, oy: number, displayWidth: number): Blocker[] {
  const k = displayWidth / CAMP_IMAGE_WIDTH;
  return CAMP_BLOCKS.map(([x0, y0, x1, y1]) => ({
    x: ox + x0 * k,
    y: oy + y0 * k,
    w: (x1 - x0) * k,
    h: (y1 - y0) * k,
  }));
}
