#!/usr/bin/env python3
"""
Découpe le décor (rue cyberpunk vue du dessus) en morceaux réutilisables.

    python3 tools/prepare_decor.py <image_decor> <image_camp> <image_metro> [dossier_sortie]

Produit dans public/art/ : sol (miroir pour éviter les raccords), toits,
néons (à mélanger en « screen »), bannières, entrée de métro, fond d'écran
titre et brouillard ; depuis l'image du camp : le refuge ; depuis l'image du
métro : la rame détourée, la borne rouge et son socle de sacs de sable. Le portrait et le visage des personnages sont produits par
prepare_sheets.py.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

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


def soft_mask(size, draw_fn, blur):
    """Masque d'alpha dessiné par draw_fn(ImageDraw) puis adouci."""
    m = Image.new('L', size, 0)
    draw_fn(ImageDraw.Draw(m))
    return m.filter(ImageFilter.GaussianBlur(blur))


def with_alpha(img, mask):
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out


def station_and_camp(metro_path, camp_path, dst):
    metro = Image.open(metro_path).convert('RGB')

    # Rame : détourée au polygone (coordonnées dans l'image source), bout gauche fondu
    # car la rame sort du cadre.
    box = (0, 490, 506, 912)
    poly = [(0, 498), (60, 528), (160, 556), (260, 590), (360, 632), (458, 682), (482, 730),
            (500, 790), (490, 832), (470, 872), (452, 906), (420, 903), (380, 885), (330, 858),
            (280, 835), (200, 792), (100, 746), (0, 706)]
    local = [(x - box[0], y - box[1]) for x, y in poly]
    train = metro.crop(box)
    mask = soft_mask(train.size, lambda d: d.polygon(local, fill=255), 2.2)
    fade = Image.new('L', train.size, 255)
    fade.paste(Image.linear_gradient('L').rotate(90).resize((70, train.height)), (0, 0))  # 0 -> 255, de gauche à droite
    mask = Image.fromarray((np.asarray(mask, dtype=np.float32) * np.asarray(fade, dtype=np.float32) / 255).astype(np.uint8))
    with_alpha(train, mask).save(dst / 'train.png', optimize=True)

    # Borne : socle (sacs de sable + dalle lumineuse) posé au sol, et pilier avec son gyrophare,
    # dessiné par-dessus les personnages qui passent devant.
    ring_box = (795, 385, 1205, 705)
    ring = metro.crop(ring_box)
    ring_mask = soft_mask(ring.size, lambda d: d.ellipse((6, 6, ring.width - 6, ring.height - 6), fill=255), 12)
    with_alpha(ring, ring_mask).save(dst / 'terminal_ring.png', optimize=True)
    pil_box = (930, 380, 1075, 570)
    pillar = metro.crop(pil_box)
    pil_mask = soft_mask(pillar.size, lambda d: d.rounded_rectangle((14, 6, pillar.width - 14, pillar.height - 8), radius=18, fill=255), 5)
    with_alpha(pillar, pil_mask).save(dst / 'terminal_pillar.png', optimize=True)

    # Camp : le refuge. Redimensionné ; l'image garde ses coins sombres.
    camp = Image.open(camp_path).convert('RGB')
    camp.resize((1600, round(1600 * camp.height / camp.width)), Image.LANCZOS).save(dst / 'camp.jpg', quality=84)


def main():
    src = Image.open(sys.argv[1]).convert('RGB')
    dst = Path(sys.argv[4]) if len(sys.argv) > 4 else Path('public/art')
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
    station_and_camp(sys.argv[3], sys.argv[2], dst)
    print('décor écrit dans', dst)


if __name__ == '__main__':
    main()
