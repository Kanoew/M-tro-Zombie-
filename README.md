# Dernier Métro

Jeu solo d'extraction et de survie zombie. 2D en vue du dessus, web mobile en portrait, clavier sur PC.
Phaser + TypeScript + Vite, diffusion statique sur GitHub Pages.

## Lancer

```bash
npm install
npm run dev      # serveur local, ouvert aussi sur le réseau pour tester sur téléphone
npm run build    # vérification TypeScript + build dans dist/
```

## Commandes

- Clavier : ZQSD, WASD ou flèches pour bouger, E ou Espace pour interagir, F ou J pour attaquer.
- Tactile : joystick flottant sur la moitié gauche de l'écran, boutons ACT et ATQ à droite.

## Organisation

- `src/config.ts` : tous les réglages (temps, bruit, infectés, extraction).
- `src/world/map.ts` : données du quartier, sans dépendance au rendu.
- `src/input/Controls.ts` : entrées clavier et tactile.
- `src/scenes/` : mission (monde) et interface (HUD, joystick, boutons).

## Avancement

- [x] Lot 1 : déplacement, collisions et interactions dans le quartier.
- [ ] Lot 2 : bruit, infectés, sauvetage et extraction de 60 secondes.
- [ ] Lot 3 : jour et nuit, bilan, atelier et sauvegarde locale.
- [ ] Lot 4 : campagne, nouveaux quartiers, commerce et améliorations rares.

Règle de persistance : le **butin** (ramassé pendant la sortie) est perdu en cas d'échec ; les **acquis**
(déjà au refuge, armes équipées au départ comprises) sont conservés.
