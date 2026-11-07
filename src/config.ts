/**
 * Réglages centralisés. Temps, bruit et infectés se règlent ici, jamais
 * dans les scènes. Les valeurs de départ viennent du cahier des charges
 * et sont faites pour être ajustées aux essais.
 */
export const CONFIG = {
  view: { width: 360, height: 640, zoom: 2 },
  tile: 16,

  player: {
    speed: 85, // px/s
    maxHp: 100,
    bodySize: 10,
  },

  interaction: {
    range: 22, // px, du joueur au centre de l'objet
  },

  attack: {
    range: 26,
    arcDuration: 140, // ms
    cooldown: 350, // ms
  },

  // Lot 3 : jour et nuit (secondes depuis le départ du refuge).
  time: {
    duskAt: 390, // 6 min 30 : le talkie avertit, la lumière change
    nightAt: 480, // 8 min : les infectés entendent plus loin
  },

  // Lot 2 : extraction. Horloge indépendante de celle du jour.
  extraction: {
    closingSeconds: 60,
  },

  // Rayons de bruit (px). Les objets émettent, les infectés réagissent (lot 2).
  noise: {
    crateOpened: 110,
    forcedDoor: 150,
    forcedDoorMuffled: 60, // avec un amortisseur sur la masse
    quayAnnouncement: 260,
  },

  // Lot 2 : un seul type d'infecté au prototype.
  infected: {
    speed: 45,
    wanderSpeed: 20,
    hearingRadiusDay: 90,
    hearingRadiusNight: 220,
    nightChaseInLineOfSight: true,
    hp: 30,
    contactDamage: 10,
  },
} as const;
