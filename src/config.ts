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

  // Le dernier métro (secondes depuis le départ du refuge). Une partie dure moins de 10 min :
  // 6 min 30 de jour, 2 min de nuit, 1 min pour monter dans le premier métro.
  time: {
    duskAt: 300, // 5:00 : le talkie avertit, la lumière change
    lastCallAt: 330, // 5:30 : dernier appel à la borne (la rame part au plus tard à 6:30)
    nightAt: 390, // 6:30 : plus de rame, les infectés entendent plus loin, les vagues arrivent
    dawnAt: 510, // 8:30 : le premier métro du matin arrive tout seul (portes fermées à 9:30)
  },

  // La nuit : des vagues d'infectés et des caisses de ravitaillement dans la rue.
  night: {
    waveEveryStartMs: 6000, // un rôdeur toutes les 6 s au début de la nuit...
    waveEveryEndMs: 3000, // ... toutes les 3 s juste avant l'aube
    waveMaxAlive: 14, // essai : un joueur immobile qui tire tient ~1 à 2 min ; en bougeant, la nuit se tient
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

  // Économie du refuge. Rééquilibrée après le premier essai sur téléphone
  // (255 CR en une sortie) : une très bonne sortie rapporte ~200 CR.
  economy: {
    sellPrices: { materials: 1, valuables: 12, rare: 40 }, // crédits par unité (matériaux : réservés au camp plus tard)
    upgradeCosts: [150, 350, 600], // niveaux 1, 2, 3. Essais : 200 à 400 CR par sortie -> une dizaine de sorties pour tout débloquer
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
