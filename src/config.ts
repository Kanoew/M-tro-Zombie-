/**
 * Réglages centralisés. Temps, bruit, infectés, endurance et extraction se
 * règlent ici, jamais dans les scènes. Les valeurs de départ viennent du
 * cahier des charges et sont faites pour être ajustées aux essais.
 */
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

  // Lot 3 : jour et nuit (secondes depuis le départ du refuge).
  time: {
    duskAt: 390, // 6 min 30 : le talkie avertit, la lumière change
    nightAt: 480, // 8 min : les infectés entendent plus loin
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

  // Un seul type d'infecté au prototype.
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

  // Séance 1 : économie du refuge. Une caisse rapporte ~10 crédits en moyenne,
  // une bonne sortie 50 à 80 : la première amélioration tombe après un retour.
  economy: {
    sellPrices: { materials: 3, valuables: 12, rare: 40 }, // crédits par unité
    upgradeCosts: [40, 90, 160], // prix des niveaux 1, 2 et 3 de chaque amélioration
    hpPerLevel: 25, // 100 -> 125 -> 150 -> 175 PV
    staminaPerLevel: 25, // 100 -> 175 d'endurance
    bowDamagePerLevel: 4, // 20 -> 32 : au niveau 3, une flèche suffit (infecté : 30 PV)
  },

  // Butin d'une caisse.
  loot: {
    rareChance: 0.08,
    valuableChance: 0.27,
    materialsMin: 1,
    materialsMax: 3,
  },
};
