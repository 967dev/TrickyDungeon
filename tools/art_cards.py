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
и добавить id в CARD_ART (js/02-data.js).

Пропорции оригинала значения не имеют: неквадратный кадр вписывается в
квадрат по сюжету, см. в_квадрат(). Обязательна только ЧЁРНАЯ подложка — на
неё опирается и карта (поле над головой ею и залито).
"""
import os, sys
from PIL import Image

MAP = {
    'r01': 'terras.png',       'r02': 'patrol.png',
    'r03': 'medic home.png',   'r04': 'Arcadia.png',
    'r05': 'flamethrower.png', 'r06': 'siren.png',
    'r07': 'dejurniy.png',     'r08': 'phonegirl.png',
    's01': 'iskra.png',        's02': 'cardcharge.png',
    # вторая партия, 31 августа 2026 — тир ГОРОД целиком плюс два эха
    'c01': 'дизель.png',
    'c02': 'румба.png',
    'c03': 'каштан.png',
    'c05': 'клещ.png',
    'c08': 'ноа.png',
    'c09': 'пиллар.png',
    'c11': 'моль.png',
    's03': 'чайник.png',
    's04': 'клетка.png',
    # третья партия, 2 сентября 2026 — тир ФРАКЦИЯ целиком
    'c04': 'demencia.png',
    'c06': 'hoshilisa.png',
    'c07': 'ren.png',
    'c10': 'bitbyte.png',
    'c12': 'bublik.png',
    'c13': 'tikhon.png',
    's05': 'happygvosd.png',
    's06': 'oskolok.png',
    's07': 'phonoteka.png',
}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW  = os.path.join(ROOT, 'art', '_raw')
OUT  = os.path.join(ROOT, 'art', 'cards')

ДОЛЯ = 0.94   # какую часть квадрата занимает сюжет


def сюжет(im, порог=14):
    """Прямоугольник, за которым начинается чёрный фон. У всех артов подложка
    чёрная — на это же опирается и карта, см. .cfArtImg в css/04-cards.css."""
    m = im.convert('L').point(lambda v: 255 if v > порог else 0)
    return m.getbbox()


def в_квадрат(im, имя):
    """Карта кладёт арт квадратом во всю свою ширину, поэтому оригинал обязан
    быть квадратным. Раньше тут стоял простой resize в (size, size) — он ЖМЁТ
    кадр: портрет 1023x1537 сплющивался на треть, и фигуры выходили толще
    себя. Заметили на третьей партии, где шесть артов пришли портретами.

    Режем не по кадру, а по СЮЖЕТУ: берём квадратное окно вокруг него так,
    чтобы сюжет занял ту же долю, что и у готовых артов (у них 0,94..1,00
    высоты — замерено). Не хватает кадра по краям — добиваем чёрным; на карте
    он неотличим от фона самих картинок, так что полей не видно.

    Так один и тот же кадр годится и для портрета по грудь, и для фигуры в
    полный рост: решает сюжет, а не пропорции файла."""
    if im.width == im.height:
        return im
    bb = сюжет(im)
    if not bb:
        print('  %s: кадр пустой, беру как есть' % имя)
        return im
    x0, y0, x1, y1 = bb
    сторона = int(round(max(x1 - x0, y1 - y0) / ДОЛЯ))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    лист = Image.new('RGB', (сторона, сторона), (0, 0, 0))
    лист.paste(im, (сторона // 2 - cx, сторона // 2 - cy))
    print('  %-14s %dx%d -> квадрат %d (сюжет %dx%d)' % (
        имя, im.width, im.height, сторона, x1 - x0, y1 - y0))
    return лист


def build(cid, src):
    p = os.path.join(RAW, src)
    if not os.path.exists(p):
        print('  нет оригинала: %s' % src); return
    im = в_квадрат(Image.open(p).convert('RGB'), src)
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
