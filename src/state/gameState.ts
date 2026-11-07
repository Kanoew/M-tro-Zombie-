/**
 * État de partie, séparé du rendu.
 *
 * - **acquis** : ce qui est déjà au refuge (arme équipée, stock, survivants).
 *   Conservé quoi qu'il arrive, y compris après une mort.
 * - **butin** : ce qui est ramassé pendant la sortie. Perdu en cas d'échec,
 *   crédité une seule fois en cas de retour réussi.
 *
 * Le lot 3 branchera la sauvegarde localStorage sur `gameState`.
 */
export interface Stock {
  materials: number;
  valuables: number;
  rare: number;
}

export const emptyStock = (): Stock => ({ materials: 0, valuables: 0, rare: 0 });

export const gameState = {
  character: 'joanna' as 'joanna',
  weapon: 'Épée',
  stock: emptyStock(),
  butin: emptyStock(),
  rescued: { mecanicienne: false },
};

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
}

/** Mort ou rame ratée : le butin est perdu, les acquis restent. */
export function settleFailure(): void {
  gameState.butin = emptyStock();
}

export function describeStock(s: Stock): string {
  const parts: string[] = [];
  if (s.materials) parts.push(`${s.materials} matériaux`);
  if (s.valuables) parts.push(`${s.valuables} objet${s.valuables > 1 ? 's' : ''} de valeur`);
  if (s.rare) parts.push(`${s.rare} pièce${s.rare > 1 ? 's' : ''} rare${s.rare > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'rien';
}
