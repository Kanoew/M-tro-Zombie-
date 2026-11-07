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
    damage: 15,
    halfAngle: 1.0, // rad, demi-ouverture de l'arc
  },

  // Lot 3 : jour et nuit (secondes depuis le départ du refuge).
  time: {
    duskAt: 390, // 6 min 30 : le talkie avertit, la lumière change
    nightAt: 480, // 8 min : les infectés entendent plus loin
  },

  // Extraction. Horloge indépendante de celle du jour.
  extraction: {
    closingSeconds: 60,
  },

  // Rayons de bruit (px). Les infectés à portée se déplacent vers la source.
  noise: {
    crateOpened: 110,
    forcedDoor: 150,
    forcedDoorMuffled: 60, // lot 4 : amortisseur sur la masse
    quayAnnouncement: 260,
  },

  // Un seul type d'infecté au prototype.
  infected: {
    speed: 45, // plus lent que le joueur (85) : on peut les distancer le jour
    wanderSpeed: 18,
    speedNightFactor: 1.3,
    detectionRadiusDay: 70, // vue sur le joueur, ligne de vue requise
    detectionRadiusNight: 220, // la nuit : poursuite en ligne droite dans la rue
    noiseHearingFactorNight: 1.6, // la nuit, ils entendent plus loin
    loseTrackMs: 2500,
    lingerMs: 2500,
    hp: 30,
    contactDamage: 10,
    contactCooldownMs: 900,
    contactRange: 11,
    knockbackMs: 140,
  },

  companion: {
    followDistance: 22,
    speedFactor: 0.95,
  },

  // Butin d'une caisse.
  loot: {
    rareChance: 0.08,
    valuableChance: 0.27,
    materialsMin: 1,
    materialsMax: 3,
  },
};
