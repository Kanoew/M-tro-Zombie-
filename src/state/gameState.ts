/**
 * État de partie, séparé du rendu.
 *
 * - **acquis** : ce qui est déjà au refuge (arme équipée, stock, crédits,
 *   améliorations, survivants). Conservé quoi qu'il arrive, y compris après
 *   une mort, et sauvegardé dans le navigateur.
 * - **butin** : ce qui est ramassé pendant la sortie. Perdu en cas d'échec,
 *   crédité une seule fois en cas de retour réussi.
 *
 * Économie (séance 1) : une seule monnaie, les crédits. Le stock se vend au
 * refuge ; les crédits achètent les améliorations de l'atelier, qui n'ouvre
 * qu'une fois la mécanicienne sauvée.
 */
import { CONFIG } from '../config';
import { CHARACTERS, WEAPONS, type CharacterId, type WeaponDef } from '../weapons';

export interface Stock {
  materials: number;
  valuables: number;
  rare: number;
}

export const emptyStock = (): Stock => ({ materials: 0, valuables: 0, rare: 0 });

export type UpgradeId = 'vie' | 'endurance' | 'arc';
export type Upgrades = Record<UpgradeId, number>;

export const gameState = {
  character: 'joanna' as CharacterId,
  /** Armes possédées (acquis : conservées même après une mort). */
  loadout: [...CHARACTERS.joanna.loadout],
  equipped: 0,
  stock: emptyStock(),
  butin: emptyStock(),
  credits: 0,
  upgrades: { vie: 0, endurance: 0, arc: 0 } as Upgrades,
  rescued: { mecanicienne: false },
};

// --- Sauvegarde ------------------------------------------------------------

const SAVE_KEY = 'dernier-metro-save-v1';

/** Écrit les acquis dans le navigateur. Sans stockage (navigation privée...), on joue sans sauvegarde. */
export function save(): void {
  try {
    const data = {
      stock: gameState.stock,
      credits: gameState.credits,
      upgrades: gameState.upgrades,
      rescued: gameState.rescued,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Stockage indisponible : rien à faire.
  }
}

/** Relit la sauvegarde au lancement. Une sauvegarde abîmée est ignorée. */
export function load(): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as Partial<typeof gameState>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    if (d.stock) gameState.stock = { materials: num(d.stock.materials), valuables: num(d.stock.valuables), rare: num(d.stock.rare) };
    gameState.credits = num(d.credits);
    if (d.upgrades) {
      for (const id of Object.keys(gameState.upgrades) as UpgradeId[]) {
        gameState.upgrades[id] = Math.min(UPGRADES[id].costs.length, num(d.upgrades[id]));
      }
    }
    gameState.rescued.mecanicienne = !!d.rescued?.mecanicienne;
  } catch {
    // Sauvegarde illisible : on repart de zéro.
  }
}

/** Repart de zéro (accessible en debug : `__dm.resetSave()` dans la console). */
export function resetSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignoré
  }
  gameState.stock = emptyStock();
  gameState.butin = emptyStock();
  gameState.credits = 0;
  gameState.upgrades = { vie: 0, endurance: 0, arc: 0 };
  gameState.rescued.mecanicienne = false;
}

// --- Personnage et armes ---------------------------------------------------

export function selectCharacter(id: CharacterId): void {
  gameState.character = id;
  gameState.loadout = [...CHARACTERS[id].loadout];
  gameState.equipped = 0;
}

export function currentWeapon(): WeaponDef {
  return WEAPONS[gameState.loadout[gameState.equipped]];
}

/** Passe à l'arme suivante (sans effet avec une seule arme). */
export function cycleWeapon(): WeaponDef {
  gameState.equipped = (gameState.equipped + 1) % gameState.loadout.length;
  return currentWeapon();
}

// --- Améliorations ---------------------------------------------------------

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Prix de chaque niveau ; leur nombre donne le niveau maximal. */
  costs: number[];
  /** Ce que donne le niveau `lvl` (0 = sans amélioration), pour l'affichage. */
  describe: (lvl: number) => string;
}

const E = CONFIG.economy;

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  vie: {
    id: 'vie',
    name: 'Vie',
    costs: E.upgradeCosts,
    describe: (lvl) => `${CONFIG.player.maxHp + lvl * E.hpPerLevel} PV`,
  },
  endurance: {
    id: 'endurance',
    name: 'Endurance',
    costs: E.upgradeCosts,
    describe: (lvl) => `${CONFIG.player.stamina.max + lvl * E.staminaPerLevel} END`,
  },
  arc: {
    id: 'arc',
    name: 'Arc',
    costs: E.upgradeCosts,
    describe: (lvl) => `${WEAPONS.arc.damage + lvl * E.bowDamagePerLevel} dégâts`,
  },
};

export const UPGRADE_ORDER: UpgradeId[] = ['vie', 'endurance', 'arc'];

/** Statistiques du joueur, améliorations comprises. La mission les lit au départ. */
export function playerStats(): { maxHp: number; maxStamina: number } {
  return {
    maxHp: CONFIG.player.maxHp + gameState.upgrades.vie * E.hpPerLevel,
    maxStamina: CONFIG.player.stamina.max + gameState.upgrades.endurance * E.staminaPerLevel,
  };
}

/** Dégâts réels d'une arme, améliorations comprises. */
export function weaponDamage(w: WeaponDef): number {
  return w.damage + (w.id === 'arc' ? gameState.upgrades.arc * E.bowDamagePerLevel : 0);
}

export function upgradeCost(id: UpgradeId): number | null {
  const lvl = gameState.upgrades[id];
  return lvl < UPGRADES[id].costs.length ? UPGRADES[id].costs[lvl] : null;
}

export type BuyResult = 'ok' | 'locked' | 'max' | 'poor';

export function buyUpgrade(id: UpgradeId): BuyResult {
  if (!gameState.rescued.mecanicienne) return 'locked';
  const cost = upgradeCost(id);
  if (cost === null) return 'max';
  if (gameState.credits < cost) return 'poor';
  gameState.credits -= cost;
  gameState.upgrades[id] += 1;
  save();
  return 'ok';
}

// --- Vente -----------------------------------------------------------------

export function stockValue(s: Stock): number {
  const p = E.sellPrices;
  return s.materials * p.materials + s.valuables * p.valuables + s.rare * p.rare;
}

/** Vend tout le stock du refuge. Renvoie les crédits gagnés. */
export function sellStock(): number {
  const gained = stockValue(gameState.stock);
  gameState.credits += gained;
  gameState.stock = emptyStock();
  save();
  return gained;
}

// --- Sortie ----------------------------------------------------------------

export function startMission(): void {
  gameState.butin = emptyStock();
}

/** Retour réussi : le butin rejoint le stock, une seule fois. */
export function settleSuccess(mechanicAboard: boolean): void {
  gameState.stock.materials += gameState.butin.materials;
  gameState.stock.valuables += gameState.butin.valuables;
  gameState.stock.rare += gameState.butin.rare;
  gameState.butin = emptyStock();
  if (mechanicAboard) gameState.rescued.mecanicienne = true;
  save();
}

/** Mort ou rame ratée : le butin est perdu, les acquis restent. */
export function settleFailure(): void {
  gameState.butin = emptyStock();
  save();
}

export function describeStock(s: Stock): string {
  const parts: string[] = [];
  if (s.materials) parts.push(`${s.materials} matériaux`);
  if (s.valuables) parts.push(`${s.valuables} objet${s.valuables > 1 ? 's' : ''} de valeur`);
  if (s.rare) parts.push(`${s.rare} pièce${s.rare > 1 ? 's' : ''} rare${s.rare > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'rien';
}
