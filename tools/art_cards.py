# -*- coding: utf-8 -*-
"""Пересборка артов карт из оригиналов в art/_raw.

Два размера на карту, и это осознанно:
  art/cards/{id}.webp      512 px — игровой. Карта в руке ~110 px, в коллекции
                           ~150 px, так что 512 уже с запасом. Лёгкий: телефон
                           качает только его.
  art/cards/hi/{id}.webp  1024 px — только для превью при наведении на десктопе.
                           Оно растягивает карту до 400 px, и на 512 там видно
                           кашу: тонкие искры и волоски не переживают сжатие
                           1254 -> 512. Грузится по одному файлу на наведение,
                           мобильному не достаётся вовсе.

Новый арт: положить PNG в art/_raw, дописать строку в MAP, запустить
    python tools/art_cards.py
и добавить id в CARD_ART внутри index.html.
"""
import os, sys
from PIL import Image

MAP = {
    'r01': 'terras.png',       'r02': 'patrol.png',
    'r03': 'medic home.png',   'r04': 'Arcadia.png',
    'r05': 'flamethrower.png', 'r06': 'siren.png',
    'r07': 'dejurniy.png',     'r08': 'phonegirl.png',
    's01': 'iskra.png',        's02': 'cardcharge.png',
}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW  = os.path.join(ROOT, 'art', '_raw')
OUT  = os.path.join(ROOT, 'art', 'cards')

def build(cid, src):
    p = os.path.join(RAW, src)
    if not os.path.exists(p):
        print('  нет оригинала: %s' % src); return
    im = Image.open(p).convert('RGB')
    for size, q, sub in ((512, 82, ''), (1024, 90, 'hi')):
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        f = os.path.join(d, cid + '.webp')
        im.resize((size, size), Image.LANCZOS).save(f, 'WEBP', quality=q, method=6)
        print('  %-4s %4d px -> %6.0f КБ  %s' % (cid, size, os.path.getsize(f) / 1024, f[len(ROOT) + 1:]))

if __name__ == '__main__':
    only = sys.argv[1:]
    for cid, src in sorted(MAP.items()):
        if not only or cid in only:
            build(cid, src)
