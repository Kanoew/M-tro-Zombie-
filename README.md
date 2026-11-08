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
- En sortie, le bouton pause en haut à droite ou **Échap** suspend la partie et ses comptes à rebours.
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

## Le dernier métro (jour, crépuscule, nuit, aube)

Une partie dure moins de 10 minutes. Horloge depuis le départ du camp (`time` dans `src/config.ts`) :

| Heure | Phase | Ce qui se passe |
|---|---|---|
| 0:00 | Jour | La borne appelle la rame normalement. |
| 5:00 | Crépuscule | Le talkie prévient, la lumière tourne à l'orange. La barre affiche le compte à rebours du dernier appel. |
| 5:30 | Dernier appel | Passé ce cap, la borne ne répond plus. Une rame appelée avant part au plus tard à 6:30. |
| 6:30 | Nuit (2 min) | Plus aucune rame. **Vagues** : des rôdeurs entrent par les bords de la carte et fouillent les alentours du joueur, de plus en plus souvent (toutes les 6 s puis 3 s, 14 en vie au maximum). **6 caisses de nuit** (lueur cyan) tombent dans la rue : 25 % de pièce rare, 40 % d'objet de valeur. Les infectés entendent 1,6 fois plus loin, voient plus loin et courent plus vite. |
| 8:30 | Aube | Le premier métro du matin arrive tout seul et attend 60 s. À bord à la fermeture : retour réussi, butin x2 (`morning.lootBonus`). Raté : échec. |

Réglages de la nuit : `night` dans `src/config.ts`. Le repère rouge sur la barre du jour marque le dernier appel. La teinte de lumière demande WebGL (désactivée en rendu 2D de secours).

## Carte et décor

- Carte en paysage de 96 x 56 tuiles, jouée dans une fenêtre portrait qui suit le joueur.
- Le refuge n'est plus dans la rue : l'ancien emplacement du camp est un grand **hangar** à fouiller. Les meubles du refuge sont des zones de collision (`campBlockers` dans `src/world/map.ts`).
- Au **quai**, la rame et la borne rouge sont détourées des illustrations ; la rame glisse jusqu'au quai quand on l'appelle.
- Chaque bâtiment fermé est recouvert d'un toit : on ne voit pas ce qu'il contient. Ouvrir ou forcer la porte lève le toit. Le contenu (pièce vide, caisses, infectés) est tiré à chaque sortie ; l'atelier abrite toujours la mécanicienne.
- Quand la rame attend, le quai fait du bruit à intervalles réguliers : tous les infectés encore en vie convergent vers la borne, et de nouveaux arrivent des bords de la carte, hors de vue (voir `extraction` dans `src/config.ts`).
- Chaque infecté affiche sa barre de vie.

## Le refuge

Le refuge est une scène à part (`src/scenes/RefugeScene.ts`), accessible seulement en métro. On y arrive depuis l'écran titre et depuis le bilan (bouton **REFUGE**). On s'y déplace comme dans la rue, sans infectés :

- **Comptoir** (poste informatique bleu) : vend le stock en crédits (CR). Matériaux 1, objets de valeur 12, pièces rares 40 (`economy` dans `src/config.ts`).
- **Mécanicienne** (devant l'établi) : l'atelier. Elle n'est là qu'une fois ramenée de l'atelier, en ville. Trois améliorations sur 3 niveaux (150, 350, 600 CR) :
  - **Vie** : +25 PV max par niveau (100 → 175)
  - **Endurance** : +25 par niveau (100 → 175)
  - **Arc** : +4 dégâts par flèche (20 → 32 ; au niveau 3, une flèche abat un infecté)
- **Portail** : prendre la rame. La sortie commence sur le quai, à la descente de la rame, qui repart aussitôt.

Les repères au sol (cercles verts) marquent les trois points. Panneau ouvert, au clavier : `V` vend, `1` `2` `3` améliorent, `Échap` ferme. Le panneau est dans `src/ui/RefugePanel.ts`, l'interface du refuge dans `src/scenes/RefugeUIScene.ts`.

Depuis le bilan, **REPARTIR** relance directement une sortie sans passer par le refuge.

## Sauvegarde

Les acquis (stock, crédits, améliorations, mécanicienne sauvée) sont gardés dans le navigateur (`localStorage`, clé `dernier-metro-save-v1`) après chaque retour, mort, vente ou achat. Le butin d'une sortie en cours n'est jamais sauvegardé. Pour repartir de zéro : `__dm.resetSave()` dans la console, puis recharger.

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
- [~] Lot 3 : jour, crépuscule et nuit ; refuge (vente, atelier à 3 améliorations) et sauvegarde locale faits. Dernier métro, nuit sans rame, premier métro du matin et refuge en scène séparée faits.
- [ ] Lot 4 : campagne, nouveaux quartiers, commerce et améliorations rares.

Règle de persistance : le **butin** (ramassé pendant la sortie) est perdu en cas d'échec ; les **acquis**
(déjà au refuge, armes équipées au départ comprises) sont conservés.
