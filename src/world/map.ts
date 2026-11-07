export type Tile = 'wall' | 'street' | 'floor' | 'quay';
export type EntityKind = 'door' | 'crate' | 'terminal' | 'npc' | 'spawn';

export interface Entity {
  kind: EntityKind;
  id: string;
  tx: number;
  ty: number;
  /** Portes uniquement : ouverte dès le départ. */
  open?: boolean;
}

export interface MapData {
  width: number;
  height: number;
  tiles: Tile[][];
  entities: Entity[];
}

/**
 * Premier quartier du prototype : refuge, garage, quai, deux trajets de
 * retour (rue ouest, rue est) et la mécanicienne dans un atelier à sauver.
 * Les règles de mission n'ont pas besoin de connaître le rendu : tout passe
 * par ces données.
 */
export function buildMap(): MapData {
  const width = 30;
  const height = 36;
  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Tile => 'street'),
  );
  const entities: Entity[] = [];

  for (let x = 0; x < width; x++) {
    tiles[0][x] = 'wall';
    tiles[height - 1][x] = 'wall';
  }
  for (let y = 0; y < height; y++) {
    tiles[y][0] = 'wall';
    tiles[y][width - 1] = 'wall';
  }

  const building = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    door: [number, number],
    open = false,
  ) => {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        const edge = tx === x || ty === y || tx === x + w - 1 || ty === y + h - 1;
        tiles[ty][tx] = edge ? 'wall' : 'floor';
      }
    }
    tiles[door[1]][door[0]] = 'floor';
    entities.push({ kind: 'door', id: `door-${id}`, tx: door[0], ty: door[1], open });
  };

  // Garage (nord-ouest), visitable.
  building('garage', 2, 2, 10, 7, [6, 8]);
  // Entrepôt (nord-est).
  building('entrepot', 18, 2, 9, 7, [22, 8]);
  // Immeuble ouest.
  building('ouest', 2, 16, 10, 8, [6, 16]);
  // Atelier (est) : la mécanicienne attend à l'intérieur.
  building('atelier', 19, 16, 8, 8, [22, 23]);
  // Refuge (sud-ouest) : porte ouverte au départ.
  building('refuge', 1, 29, 9, 6, [9, 32], true);

  // Quai (sud-est).
  for (let ty = 29; ty <= 33; ty++) {
    for (let tx = 13; tx <= 27; tx++) tiles[ty][tx] = 'quay';
  }

  entities.push({ kind: 'spawn', id: 'spawn', tx: 3, ty: 32 });
  entities.push({ kind: 'terminal', id: 'borne-quai', tx: 20, ty: 31 });
  entities.push({ kind: 'npc', id: 'mecanicienne', tx: 22, ty: 19 });

  entities.push({ kind: 'crate', id: 'caisse-garage-1', tx: 4, ty: 4 });
  entities.push({ kind: 'crate', id: 'caisse-garage-2', tx: 9, ty: 6 });
  entities.push({ kind: 'crate', id: 'caisse-entrepot', tx: 24, ty: 4 });
  entities.push({ kind: 'crate', id: 'caisse-atelier', tx: 25, ty: 21 });
  entities.push({ kind: 'crate', id: 'caisse-rue', tx: 14, ty: 12 });

  return { width, height, tiles, entities };
}
