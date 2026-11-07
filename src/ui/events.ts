import type { Stock } from '../state/gameState';

/** Données poussées par la mission vers l'interface (événement 'hud'). */
export interface HudData {
  hp: number;
  maxHp: number;
  weapon: string;
  butin: Stock;
  /** Secondes restantes avant la fermeture des portes, ou null si la rame n'est pas appelée. */
  extraction: number | null;
  escort: 'none' | 'waiting' | 'following' | 'rescued';
}

/** Événement 'mission-end'. */
export interface MissionEnd {
  success: boolean;
  title: string;
  reason: string;
  lines: string[];
}
