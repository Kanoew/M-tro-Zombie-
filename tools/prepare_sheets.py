#!/usr/bin/env python3
"""
Prépare les planches d'animation du jeu à partir des images sources.

    python3 tools/prepare_sheets.py <dossier_sources> [dossier_sortie]

Pour chaque planche (grille régulière de poses) :
  1. nettoie les résidus de détourage (petites taches détachées du personnage) ;
  2. normalise l'échelle (même hauteur de personnage sur toutes les poses) ;
  3. aligne chaque pose sur les pieds et sur l'axe du corps ;
  4. écrit une planche à cases de taille uniforme, prête pour Phaser.

Les sources ne sont pas dans le dépôt (trop lourdes) : seules les planches
produites le sont, dans public/art/.
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ALPHA_MIN = 40  # en dessous, le pixel est considéré comme du vide


def label_components(mask):
    """Composantes connexes (8 voisins) d'un masque booléen. Renvoie (labels, nb)."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    n = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if labels[y0, x0]:
            continue
        n += 1
        labels[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not labels[yy, xx]:
                        labels[yy, xx] = n
                        q.append((yy, xx))
    return labels, n


def clean_cell(cell, near=28, min_ratio=0.004):
    """Efface les taches détachées. Garde le corps et ce qui le touche de près (arc, flèche)."""
    arr = np.array(cell)
    mask = arr[:, :, 3] > ALPHA_MIN
    labels, n = label_components(mask)
    if n == 0:
        return None
    areas = np.bincount(labels.ravel())[1:]
    main = int(np.argmax(areas)) + 1
    my, mx = np.nonzero(labels == main)
    bx0, bx1, by0, by1 = mx.min(), mx.max(), my.min(), my.max()
    keep = labels == main
    for i in range(1, n + 1):
        if i == main or areas[i - 1] < areas[main - 1] * min_ratio:
            continue
        yy, xx = np.nonzero(labels == i)
        if xx.max() >= bx0 - near and xx.min() <= bx1 + near and yy.max() >= by0 - near and yy.min() <= by1 + near:
            keep |= labels == i
    arr[~keep] = 0
    arr[:, :, 3] = np.where(arr[:, :, 3] > ALPHA_MIN, arr[:, :, 3], 0)
    return Image.fromarray(arr, 'RGBA')


def resize_premult(img, size):
    """Redimensionne sans liseré clair ni sombre (alpha prémultiplié)."""
    a = np.array(img).astype(np.float32)
    alpha = a[:, :, 3:4] / 255.0
    a[:, :, :3] *= alpha
    pm = Image.fromarray(np.concatenate([a[:, :, :3], a[:, :, 3:4]], axis=2).astype(np.uint8), 'RGBA')
    pm = pm.resize(size, Image.LANCZOS)
    b = np.array(pm).astype(np.float32)
    al = b[:, :, 3:4] / 255.0
    b[:, :, :3] = np.where(al > 0, b[:, :, :3] / np.maximum(al, 1e-3), 0)
    return Image.fromarray(np.clip(b, 0, 255).astype(np.uint8), 'RGBA')


def process_sheet(path, cols, rows, fig_h, cell_w, cell_h, ref_row=0, ref=None, anchor=0.55):
    """Renvoie la planche normalisée (cols x rows cases de cell_w x cell_h).

    ref : (rangée, colonne) d'une pose de référence dont la hauteur vaut fig_h (sinon la
          hauteur médiane de la rangée ref_row). anchor : part haute du personnage utilisée
          pour centrer la pose (0.25 = la tête, stable quand un bras tend l'arc en avant).
    """
    sheet = Image.open(path).convert('RGBA')
    W, H = sheet.size
    frames = {}
    for r in range(rows):
        for c in range(cols):
            box = (c * W // cols, r * H // rows, (c + 1) * W // cols, (r + 1) * H // rows)
            cleaned = clean_cell(sheet.crop(box))
            if cleaned is None:
                continue
            bb = cleaned.getbbox()
            frames[(r, c)] = cleaned.crop(bb)
    # Échelle commune : hauteur médiane des poses de la rangée de référence.
    if ref is not None:
        scale = fig_h / frames[ref].size[1]
    else:
        heights = sorted(f.size[1] for (r, _), f in frames.items() if r == ref_row)
        scale = fig_h / heights[len(heights) // 2]
    out = Image.new('RGBA', (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    widest = 0
    for (r, c), f in frames.items():
        w, h = max(1, round(f.size[0] * scale)), max(1, round(f.size[1] * scale))
        widest = max(widest, w)
        f = resize_premult(f, (w, h))
        # Axe du corps : barycentre horizontal du haut du personnage (stable pendant la marche).
        a = np.array(f)[:, :, 3] > 40
        top = a[: max(2, int(h * anchor))]
        xs = np.nonzero(top)[1]
        cx = float(xs.mean()) if len(xs) else w / 2
        ox = int(round(cell_w / 2 - cx))
        oy = cell_h - 3 - h
        cell = Image.new('RGBA', (cell_w, cell_h), (0, 0, 0, 0))
        cell.paste(f, (ox, oy), f)
        out.paste(cell, (c * cell_w, r * cell_h))
    print(f'  pose la plus large : {widest}px (case {cell_w}px)')
    return out, scale


def portrait(path, dst):
    """Portrait plein pied (écran titre) et visage rond (HUD) de Joanna, depuis la 1re pose de face."""
    sheet = Image.open(path).convert('RGBA')
    W, H = sheet.size
    cell = clean_cell(sheet.crop((0, 0, W // 4, H // 3)))
    fig = cell.crop(cell.getbbox())
    full = resize_premult(fig, (round(fig.width * 420 / fig.height), 420))
    full.save(dst / 'joanna_portrait.png', optimize=True)
    face_h = int(fig.height * 0.17)
    cx = fig.width // 2
    face = fig.crop((cx - face_h // 2 - 4, 0, cx + face_h // 2 + 4, face_h))
    face = resize_premult(face, (96, round(96 * face.height / face.width)))
    face.save(dst / 'joanna_face.png', optimize=True)
    print('portrait:', full.size, 'visage:', face.size)


def main():
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('public/art')
    dst.mkdir(parents=True, exist_ok=True)
    jobs = [
        # nom de sortie, fichier source, colonnes, rangées, hauteur du personnage, case (l, h)
        ('joanna_walk', '02-Joanna-Marche-corrigee.png', 4, 3, 100, 150, 112),
        ('joanna_idle', '04-Joanna-Idle.png', 4, 3, 100, 150, 112),
        # Tir à l'arc : 3 colonnes x 2 rangées, profil droit. Échelle calée sur la dernière pose
        # (au repos) ; centrage sur la tête, pour que le corps ne glisse pas pendant le tir.
        ('joanna_shoot', '03-Joanna-Tir-a-l-arc.png', 3, 2, 100, 150, 112, {'ref': (1, 2), 'anchor': 0.25}),
        ('mecano_walk', 'mecano.webp', 4, 3, 96, 120, 112),
        ('zombie', 'zombie.webp', 4, 4, 92, 124, 112),
    ]
    portrait(src / '04-Joanna-Idle.png', dst)
    for name, fname, cols, rows, fh, cw, ch, *extra in jobs:
        p = src / fname
        if not p.exists():
            print('absent :', p)
            continue
        print(name)
        sheet, scale = process_sheet(p, cols, rows, fh, cw, ch, **(extra[0] if extra else {}))
        sheet.save(dst / f'{name}.png', optimize=True)
        print(f'{name}: {sheet.size} échelle {scale:.3f}')


if __name__ == '__main__':
    main()
