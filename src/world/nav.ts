import type { MapData } from './map';

export interface Point {
  x: number;
  y: number;
}

/**
 * Navigation sur la grille de tuiles : pathfinding (BFS 8 directions) et
 * ligne de vue. Les portes fermées bloquent le passage et la vue ; les
 * caisses bloquent le passage seulement. Aucune dépendance à Phaser.
 */
export class Nav {
  private readonly w: number;
  private readonly h: number;
  private readonly walls: boolean[][];
  private readonly closedDoors = new Set<number>();
  private readonly solids = new Set<number>();

  constructor(map: MapData, readonly tile: number) {
    this.w = map.width;
    this.h = map.height;
    this.walls = map.tiles.map((row) => row.map((t) => t === 'wall'));
    for (const e of map.entities) {
      if (e.kind === 'door' && !e.open) this.closedDoors.add(this.key(e.tx, e.ty));
      if (e.kind === 'crate' || e.kind === 'terminal') this.solids.add(this.key(e.tx, e.ty));
    }
    // Meubles du camp : toute tuile dont le centre tombe dans un bloc est pleine.
    for (const b of map.blockers) {
      for (let ty = Math.floor(b.y / tile); ty <= Math.floor((b.y + b.h) / tile); ty++) {
        for (let tx = Math.floor(b.x / tile); tx <= Math.floor((b.x + b.w) / tile); tx++) {
          const cx = tx * tile + tile / 2;
          const cy = ty * tile + tile / 2;
          if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h && this.inside(tx, ty)) {
            this.solids.add(this.key(tx, ty));
          }
        }
      }
    }
  }

  private key(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  private inside(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  tileOf(v: number): number {
    return Math.floor(v / this.tile);
  }

  center(t: number): number {
    return t * this.tile + this.tile / 2;
  }

  openDoor(tx: number, ty: number): void {
    this.closedDoors.delete(this.key(tx, ty));
  }

  /** Bloque la vue : mur ou porte fermée. */
  opaque(tx: number, ty: number): boolean {
    return !this.inside(tx, ty) || this.walls[ty][tx] || this.closedDoors.has(this.key(tx, ty));
  }

  /** Bloque le passage : opaque, ou objet plein. */
  blocked(tx: number, ty: number): boolean {
    return this.opaque(tx, ty) || this.solids.has(this.key(tx, ty));
  }

  /** Vrai si rien d'opaque ne coupe le segment (coordonnées en pixels). */
  los(ax: number, ay: number, bx: number, by: number): boolean {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.opaque(this.tileOf(ax + (bx - ax) * t), this.tileOf(ay + (by - ay) * t))) {
        return false;
      }
    }
    return true;
  }

  /** Vrai si le segment ne traverse ni mur, ni porte fermée, ni objet plein : on peut y marcher droit. */
  clear(ax: number, ay: number, bx: number, by: number): boolean {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocked(this.tileOf(ax + (bx - ax) * t), this.tileOf(ay + (by - ay) * t))) return false;
    }
    return true;
  }

  /**
   * Chemin en points de pixels, sans la tuile de départ. Le dernier point est
   * la cible exacte si sa tuile est libre. Renvoie [] si départ et arrivée
   * sont sur la même tuile, null si la cible est inaccessible.
   */
  path(fx: number, fy: number, tx: number, ty: number): Point[] | null {
    const sx = this.tileOf(fx);
    const sy = this.tileOf(fy);
    const gx = this.tileOf(tx);
    const gy = this.tileOf(ty);
    if (!this.inside(sx, sy) || !this.inside(gx, gy)) return null;
    if (sx === gx && sy === gy) return [];

    // Cible occupée (caisse, borne) : on vise une tuile libre voisine.
    const targetBlocked = this.blocked(gx, gy);
    const atGoal = (x: number, y: number) =>
      targetBlocked ? Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= 1 : x === gx && y === gy;

    const prev = new Map<number, number>();
    const start = this.key(sx, sy);
    prev.set(start, -1);
    const queue: number[] = [start];
    let found = -1;

    for (let head = 0; head < queue.length && found < 0; head++) {
      const cur = queue[head];
      const cx = cur % this.w;
      const cy = Math.floor(cur / this.w);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.blocked(nx, ny)) continue;
          // Pas de coupe dans les coins.
          if (dx !== 0 && dy !== 0 && (this.blocked(cx + dx, cy) || this.blocked(cx, cy + dy))) {
            continue;
          }
          const k = this.key(nx, ny);
          if (prev.has(k)) continue;
          prev.set(k, cur);
          if (atGoal(nx, ny)) {
            found = k;
            break;
          }
          queue.push(k);
        }
        if (found >= 0) break;
      }
    }
    if (found < 0) return null;

    const pts: Point[] = [];
    for (let k = found; k !== start && k !== -1; k = prev.get(k) ?? -1) {
      pts.push({ x: this.center(k % this.w), y: this.center(Math.floor(k / this.w)) });
    }
    pts.reverse();
    if (!targetBlocked && pts.length) pts[pts.length - 1] = { x: tx, y: ty };
    return pts;
  }
}
