#!/usr/bin/env python3
"""
Découpe le décor (rue cyberpunk vue du dessus) en morceaux réutilisables.

    python3 tools/prepare_decor.py <image_decor> [dossier_sortie]

Produit dans public/art/ : sol (miroir pour éviter les raccords), toits,
néons (à mélanger en « screen »), bannières, entrée de métro, fond d'écran
titre et brouillard. Le portrait et le visage des personnages sont produits par
prepare_sheets.py.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

CROPS = {
    # nom: boîte (gauche, haut, droite, bas) dans l'image source 2000x1116
    'roof_a': (566, 884, 876, 1112),
    'roof_b': (1076, 884, 1436, 1112),
    'neon_pink_v': (222, 36, 282, 200),
    'neon_purple_v': (506, 176, 562, 346),
    'neon_cyan_top': (506, 0, 556, 80),
    'neon_cyan_v': (1670, 76, 1738, 264),
    'neon_pink_h': (0, 425, 222, 470),
    'neon_metro': (1205, 338, 1485, 392),
    'neon_shop': (958, 398, 1132, 452),
    'banner': (1508, 506, 1714, 568),
    'metro': (1170, 330, 1500, 600),
}


def main():
    src = Image.open(sys.argv[1]).convert('RGB')
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('public/art')
    dst.mkdir(parents=True, exist_ok=True)

    for name, box in CROPS.items():
        src.crop(box).save(dst / f'{name}.png', optimize=True)

    # Sol : bande d'asphalte fissuré, répétée en miroir (2x2) pour un pavage sans raccord.
    road = src.crop((650, 650, 1450, 870))
    tile = Image.new('RGB', (road.width * 2, road.height * 2))
    tile.paste(road, (0, 0))
    tile.paste(ImageOps.mirror(road), (road.width, 0))
    tile.paste(ImageOps.flip(road), (0, road.height))
    tile.paste(ImageOps.flip(ImageOps.mirror(road)), (road.width, road.height))
    tile.save(dst / 'ground.jpg', quality=82)

    # Fond de l'écran titre.
    bg = src.resize((1000, 558), Image.LANCZOS)
    bg.save(dst / 'menu_bg.jpg', quality=78)

    # Brouillard : bruit lissé, blanc à alpha variable, pavable.
    rng = np.random.default_rng(7)
    size = 256
    acc = np.zeros((size, size), dtype=np.float32)
    for octave, amp in ((4, 1.0), (8, 0.5), (16, 0.25)):
        small = rng.random((octave, octave)).astype(np.float32)
        img = Image.fromarray((small * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
        acc += amp * np.asarray(img, dtype=np.float32) / 255.0
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    alpha = (np.clip((acc - 0.35) * 1.8, 0, 1) * 150).astype(np.uint8)
    fog = np.zeros((size, size, 4), dtype=np.uint8)
    fog[:, :, 0], fog[:, :, 1], fog[:, :, 2] = 170, 150, 220
    fog[:, :, 3] = alpha
    Image.fromarray(fog, 'RGBA').filter(ImageFilter.GaussianBlur(2)).save(dst / 'fog.png', optimize=True)
    print('décor écrit dans', dst)


if __name__ == '__main__':
    main()
