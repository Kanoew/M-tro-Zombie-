/**
 * Réglages centralisés. Temps, bruit, infectés, endurance et extraction se
 * règlent ici, jamais dans les scènes. Les valeurs de départ viennent du
 * cahier des charges et sont faites pour être ajustées aux essais.
 */
export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Rank = (typeof RANKS)[number];

export const CONFIG = {
  // Résolution logique en portrait (2x 360x640) : texte et interface nets sur téléphone.
  // Le monde est vu avec un zoom de 4 : on voit 180x320 px de carte, comme avant.
  view: { width: 720, height: 1280, zoom: 4 },
  ui: { scale: 2 },
  tile: 16,

  sprites: {
    scale: 0.3, // planches peintes (~100 px de haut) -> ~30 px dans le monde
    originY: 0.93, // pieds du personnage, proche du centre de collision
    bodySize: 10, // px monde, zone de collision aux pieds
  },

  player: {
    speed: 85, // px/s
    sprintFactor: 1.65,
    maxHp: 100,
    stamina: {
      max: 100,
      drain: 26, // par seconde en courant
      regen: 18, // par seconde au repos
      regenDelayMs: 700, // pause avant la récupération
      exhaustedUntil: 30, // après épuisement, il faut remonter à ce niveau pour courir
    },
  },

  interaction: {
    range: 24, // px, du joueur au centre de l'objet
  },

  // Le dernier métro (secondes depuis le départ du refuge). Une partie dure moins de 10 min :
  // 6 min 30 de jour, 2 min de nuit, 1 min pour monter dans le premier métro.
  time: {
    duskAt: 300, // 5:00 : le talkie avertit, la lumière change
    lastCallAt: 330, // 5:30 : dernier appel à la borne (la rame part au plus tard à 6:30)
    nightAt: 390, // 6:30 : plus de rame, les infectés entendent plus loin, les vagues arrivent
    dawnAt: 510, // 8:30 : le premier métro du matin arrive tout seul (portes fermées à 9:30)
  },

  // La nuit : des vagues d'infectés et des caisses de ravitaillement dans la rue.
  // Essai du bloc B : pression forte, 4 à 5 caisses fouillées et retour au premier métro.
  night: {
    waveEveryStartMs: 6000, // un rôdeur toutes les 6 s au début de la nuit...
    waveEveryEndMs: 3000, // ... toutes les 3 s juste avant l'aube
    waveTargetSpread: 200, // px : ils fouillent les alentours du joueur, pas sa position exacte
    crates: 6, // caisses de nuit larguées dans la rue à la tombée de la nuit
    crateMinDistance: 90, // px du joueur
    rareChance: 0.25, // contre 0,08 pour une caisse normale
    valuableChance: 0.4, // contre 0,27
  },

  // Survivre à la nuit et prendre le premier métro multiplie le butin ramené.
  morning: {
    lootBonus: 2,
  },

  // Extraction. Horloge indépendante de celle du jour.
  extraction: {
    closingSeconds: 60,
    waitNoiseEveryMs: 3500, // tant que la rame attend, le quai fait du bruit
    reinforceEveryMs: 6500, // et attire de nouveaux infectés
    reinforceMaxAlive: 30,
    reinforceMinDistance: 220, // px : ils arrivent hors de vue
  },

  // Rayons de bruit (px). Les infectés à portée se déplacent vers la source.
  noise: {
    crateOpened: 110,
    forcedDoor: 150,
    forcedDoorMuffled: 60, // lot 4 : amortisseur sur la masse
    quayAnnouncement: 99999, // l'annonce de la rame s'entend partout
    quayWaiting: 99999, // et tant qu'elle attend
    quayVisual: 260, // rayon de l'onde affichée
  },

  infected: {
    speed: 45, // plus lent que le joueur (85) : on peut les distancer le jour
    wanderSpeed: 18,
    speedNightFactor: 1.3,
    detectionRadiusDay: 70, // vue sur le joueur, ligne de vue requise
    detectionRadiusNight: 220, // la nuit : poursuite en ligne droite dans la rue
    sprintDetectionFactor: 1.4, // courir se remarque de plus loin
    noiseHearingFactorNight: 1.6, // la nuit, ils entendent plus loin
    loseTrackMs: 2500,
    lingerMs: 2500,
    hp: 30,
    contactDamage: 10,
    contactCooldownMs: 900,
    contactRange: 11,
    knockbackMs: 140,
    runnerSpeedFactor: 1.45,
  },

  // Valeurs de départ à tester. Un coureur remplace un infecté sur N à partir de C.
  ranks: {
    E: { extraInfected: 0, speed: 1, waveInterval: 1, waveMaxAlive: 5, lootValue: 1, runnerEvery: 0 },
    D: { extraInfected: 3, speed: 1.06, waveInterval: 0.90, waveMaxAlive: 6, lootValue: 1.25, runnerEvery: 0 },
    C: { extraInfected: 6, speed: 1.12, waveInterval: 0.80, waveMaxAlive: 7, lootValue: 1.50, runnerEvery: 6 },
    B: { extraInfected: 10, speed: 1.18, waveInterval: 0.70, waveMaxAlive: 8, lootValue: 1.85, runnerEvery: 5 },
    A: { extraInfected: 14, speed: 1.24, waveInterval: 0.62, waveMaxAlive: 10, lootValue: 2.25, runnerEvery: 4 },
    S: { extraInfected: 18, speed: 1.30, waveInterval: 0.55, waveMaxAlive: 12, lootValue: 2.75, runnerEvery: 3 },
  },

  companion: {
    followDistance: 22,
    speedFactor: 0.95,
  },

  // Contenu des bâtiments, tiré au hasard à chaque sortie.
  world: {
    streetInfected: 20,
    streetCrates: 10,
    buildingEmptyChance: 0.22, // pièce vide
    buildingLootChance: 0.4, // caisses seules ; le reste est infesté
  },

  // Économie du refuge. Les prix ont paru cohérents pendant l'essai du bloc B,
  // avec une première amélioration estimée après une ou deux sorties.
  // La valeur à la revente au bilan permet de mesurer les gains par sortie.
  economy: {
    sellPrices: { materials: 1, valuables: 12, rare: 40 }, // crédits par unité (matériaux : réservés au camp plus tard)
    upgradeCosts: [150, 350, 600, 1000, 1600],
    hpPerLevel: 25,
    staminaPerLevel: 25,
    bowDamagePerLevel: 4, // dès le niveau 3, une flèche suffit (infecté : 30 PV)
  },

  // Butin d'une caisse.
  loot: {
    rareChance: 0.08,
    valuableChance: 0.27,
    materialsMin: 1,
    materialsMax: 3,
  },
};
