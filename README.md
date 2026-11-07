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

## Règles du lot 2

- Une caisse ouverte ou une porte forcée émet un bruit : les infectés dans le rayon vont voir sur place.
- Un infecté voit le joueur dans un rayon limité et en ligne de vue (les murs et portes fermées coupent la vue). Il abandonne s'il le perd, et peut entrer par toute porte ouverte.
- La mécanicienne se recrute dans l'atelier, puis suit le joueur par le chemin le plus court.
- La borne du quai appelle la rame : annonce bruyante, puis 60 secondes avant la fermeture des portes.
- À la fermeture : joueur dans la rame = retour réussi (butin crédité une fois), sinon échec. La mécanicienne doit être à bord pour valider le sauvetage.
- Une mort ou une rame ratée fait perdre le butin ; les acquis restent.

## Version et cache

Le numéro de version (`package.json`) et l'heure du build s'affichent en bas à gauche du jeu. Chaque build publie `version.json` ; au chargement, la page le relit sans cache et se recharge une fois si elle est périmée. Pensez à incrémenter la version à chaque lot.

## Organisation

- `src/config.ts` : tous les réglages (temps, bruit, infectés, extraction).
- `src/world/map.ts` : données du quartier, sans dépendance au rendu.
- `src/world/nav.ts` : pathfinding et ligne de vue sur la grille.
- `src/entities/` : infecté, survivant escorté, suivi de chemin.
- `src/state/gameState.ts` : acquis et butin, règles de bilan.
- `src/input/Controls.ts` : entrées clavier et tactile.
- `src/scenes/` : mission (monde) et interface (HUD, joystick, boutons).

## Avancement

- [x] Lot 1 : déplacement, collisions et interactions dans le quartier.
- [x] Lot 2 : bruit, infectés, sauvetage et extraction de 60 secondes.
- [ ] Lot 3 : jour et nuit, bilan, atelier et sauvegarde locale.
- [ ] Lot 4 : campagne, nouveaux quartiers, commerce et améliorations rares.

Règle de persistance : le **butin** (ramassé pendant la sortie) est perdu en cas d'échec ; les **acquis**
(déjà au refuge, armes équipées au départ comprises) sont conservés.
