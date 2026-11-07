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

- Clavier : ZQSD, WASD ou flèches pour bouger, **Maj** pour courir, E ou Espace pour interagir, F ou J pour attaquer, **Tab** pour changer d'arme.
- Tactile : joystick flottant sur la moitié gauche de l'écran, boutons ACT, ATQ et COURIR (maintenu) à droite.
- Courir consomme l'endurance (barre jaune). À zéro, on est épuisé : la course reste bloquée jusqu'à récupération. Courir se remarque de plus loin.

## Règles du lot 2

- Une caisse ouverte ou une porte forcée émet un bruit : les infectés dans le rayon vont voir sur place.
- Un infecté voit le joueur dans un rayon limité et en ligne de vue (les murs et portes fermées coupent la vue). Il abandonne s'il le perd, et peut entrer par toute porte ouverte.
- La mécanicienne se recrute dans l'atelier, puis suit le joueur par le chemin le plus court.
- La borne du quai appelle la rame : annonce bruyante, puis 60 secondes avant la fermeture des portes.
- À la fermeture : joueur dans la rame = retour réussi (butin crédité une fois), sinon échec. La mécanicienne doit être à bord pour valider le sauvetage.
- Une mort ou une rame ratée fait perdre le butin ; les acquis restent.

## Armes et personnages

Les armes sont des données dans `src/weapons.ts` (dégâts, cadence, portée, **bruit**, mêlée ou distance). Chaque personnage a un `loadout` ; ajouter une arme ou un personnage (le second aura des pistolets) ne demande pas de toucher à la mission.

- **Joanna** part avec un arc : silencieux, deux flèches par infecté, geste animé (la flèche part à la pose de relâchement), déplacement ralenti pendant le geste, visée assistée dans un cône devant elle avec avance sur les cibles en mouvement. Les murs, portes fermées et caisses arrêtent les flèches. Munitions illimitées pour l'instant.
- L'épée de mêlée existe dans les données (`epee`) : on peut la tester en ajoutant `'epee'` au `loadout`.

## Jour, crépuscule, nuit

Horloge depuis le départ du camp (`time` dans `src/config.ts`) : le jour jusqu'à 6 min 30, le **crépuscule** (le talkie prévient, la lumière tourne à l'orange), la **nuit** à 8 min (lumière bleue ; les infectés entendent 1,6 fois plus loin, voient jusqu'à 220 px en ligne droite et courent plus vite). L'horloge de la rame est indépendante : un appel tardif se poursuit pendant la tombée de la nuit. La barre en haut à droite montre l'heure. La teinte de lumière demande WebGL (désactivée en rendu 2D de secours).

## Carte et décor

- Carte en paysage de 96 x 56 tuiles, jouée dans une fenêtre portrait qui suit le joueur.
- Le **camp** (refuge) est l'illustration fournie, posée sur le bâtiment de départ ; ses gros meubles sont des zones de collision (`CAMP` dans `src/world/map.ts`).
- Au **quai**, la rame et la borne rouge sont détourées des illustrations ; la rame glisse jusqu'au quai quand on l'appelle.
- Chaque bâtiment fermé est recouvert d'un toit : on ne voit pas ce qu'il contient. Ouvrir ou forcer la porte lève le toit. Le contenu (pièce vide, caisses, infectés) est tiré à chaque sortie ; l'atelier abrite toujours la mécanicienne.
- Quand la rame attend, le quai fait du bruit à intervalles réguliers : tous les infectés encore en vie convergent vers la borne, et de nouveaux arrivent des bords de la carte, hors de vue (voir `extraction` dans `src/config.ts`).
- Chaque infecté affiche sa barre de vie.

## Écran titre

Choix du personnage : Joanna est jouable, le second emplacement est verrouillé. Depuis le bilan, `M` ou le bouton MENU ramène au titre.

## Art

Les planches de personnages et les morceaux de décor sont dans `public/art/`. Ils sont produits à partir des images sources (non versionnées, trop lourdes) :

```bash
python3 tools/prepare_sheets.py <dossier_sources> public/art   # personnages (nettoyage, échelle, alignement des pieds)
python3 tools/prepare_decor.py <décor> <camp> <métro> public/art   # sol, toits, néons, camp, rame, borne, fond du titre
```

Ajouter `?renderer=canvas` à l'adresse force le rendu 2D (essais automatisés sans carte graphique).

## Version et cache

Le numéro de version (`package.json`) et l'heure du build s'affichent en bas à gauche du jeu. Chaque build publie `version.json` ; au chargement, la page le relit sans cache et se recharge une fois si elle est périmée. Pensez à incrémenter la version à chaque lot.

## Organisation

- `src/config.ts` : tous les réglages (temps, bruit, infectés, extraction).
- `src/world/map.ts` : données du quartier, sans dépendance au rendu.
- `src/world/nav.ts` : pathfinding et ligne de vue sur la grille.
- `src/entities/` : infecté, survivant escorté, suivi de chemin.
- `src/state/gameState.ts` : acquis et butin, règles de bilan.
- `src/input/Controls.ts` : entrées clavier et tactile.
- `src/scenes/` : chargement, titre, mission (monde) et interface (HUD, joystick, boutons, pluie).
- `src/render/characters.ts` : planches, animations, orientation des personnages peints.

## Avancement

- [x] Lot 1 : déplacement, collisions et interactions dans le quartier.
- [x] Lot 2 : bruit, infectés, sauvetage et extraction de 60 secondes.
- [x] Hors lot : écran titre, grande carte cachée, course et endurance, renforts de la rame, sprites et décor peints.
- [~] Lot 3 : jour, crépuscule et nuit faits ; restent le bilan complet, l'atelier et la sauvegarde locale.
- [ ] Lot 4 : campagne, nouveaux quartiers, commerce et améliorations rares.

Règle de persistance : le **butin** (ramassé pendant la sortie) est perdu en cas d'échec ; les **acquis**
(déjà au refuge, armes équipées au départ comprises) sont conservés.
