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

Ни пропорции оригинала, ни цвет его подложки значения не имеют:
  — неквадратный кадр вписывается в квадрат по сюжету, см. в_квадрат();
  — кайма кадра гасится в чистый ноль, см. кайма_в_ноль(), — именно этим
    цветом карта заливает поле вокруг картинки.
"""
import os, sys
from PIL import Image, ImageChops

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
    # четвёртая партия, 3 сентября 2026 — тир ЛЕГЕНДА целиком, эхо и секрет
    'L01': 'NELL.png',
    'L02': 'ARRRKASHA.png',
    'L03': 'SMOKING.png',
    'L04': 'LUMEN.png',
    'L05': 'KURONA.png',
    'L06': 'VESTA.png',
    's08': 'HEARTOFABYSS.png',
    's09': 'STING.png',
    'X01': '1WAYTICKET.png',
}

# Обложки районов карты города. Отдельно от карт, и вот почему: район — коробка
# 1.35:1, картинка в неё кладётся object-fit:cover, поэтому квадрат ей не нужен
# и вписывание по сюжету только срезало бы кадр зря. Гашение каймы тоже лишнее:
# край обложки съедает рваный clip-path района, а низ — градиент под подпись.
# Значит от сборки тут нужно ровно одно — вес.
# Имена файлов ЛАТИНИЦЕЙ, как и у всех прочих артов: кириллица в пути живёт
# только до первого сервера, который её не так закодирует, а проверить это
# можно лишь на живом хостинге.
РАЙОНЫ = {
    'act1': '1ACTMAP.png',
}
# Кадры катсцен. Имя файла = то, что ждёт игра: сцена, номер кадра и — у кадров
# С ГЕРОЕМ — буква пола. Кадр без героя один на обоих (щит на улице, соседний
# столик), кадр с героем свой у каждого: одежда и лицо берутся с эталона, и
# подменить их на лету нельзя.
# Квадрат и гашение каймы тут не нужны: кадр и так квадратный, а края уходят
# под рамку сцены. От сборки нужен только вес.
СЦЕНЫ = {
    'cafe1':  'streetscene.png',
    'cafe2f': 'coffee1g.png',
    'cafe3f': 'coffee2g.png',
    'cafe4':  'coffee3g.png',
    # Номер в имени — номер КАДРА В СЦЕНЕ, а не порядок присланного файла:
    # у «Утра» первый кадр — чёрный экран, он собран отдельно, и присланный
    # будильник это кадр ВТОРОЙ. Перепутать тут проще всего, а заметно будет
    # только на экране.
    'morning2f': 'morning_alarm.png',
    'morning3f': 'morning_call.png',
    'morning4f': 'morning_leave.png',
}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW  = os.path.join(ROOT, 'art', '_raw')
OUT  = os.path.join(ROOT, 'art', 'cards')

ДОЛЯ = 0.94   # какую часть квадрата занимает сюжет

# Текстура тумана карты. Собирается отдельно от артов карт: ей не нужны ни
# вписывание в квадрат, ни гашение каймы — у неё края и так чёрные, и именно
# на этом держится бесшовное наложение копий (кладутся режимом screen, где
# чёрное не рисуется вовсе). Контраст НЕ поднимаем: текстура тусклая нарочно,
# а копий три, и яркости складываются — с подъёмом карта белеет.
ТУМАН = ('smoke.png', 'fog.webp', 768, 80)


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


КАЙМА = 0.03   # доля стороны, на которой кадр гасится в ноль
# Сколько пикселей у самого края держим ЖЁСТКИМ нулём, прежде чем начать рампу.
# Без плато webp съедал ровно эту заботу: чистый ноль стоял в одном крайнем
# ряду, а сжатие с качеством 82 подтягивало его к соседям — на c08 край выходил
# 9/255, и это уже та самая «еле заметная рамка», из-за которой всё и делалось.
# Плоское чёрное поле сжимается в чёрное.
ПЛАТО_ДОЛЯ = 0.008


def кайма_в_ноль(im):
    """Гасит края кадра до чистого (0,0,0) с плавным сходом внутрь.

    Зачем: карта заливает поле вокруг картинки чёрным (см. .cfArtImg в
    css/04-cards.css) и рассчитывает, что подложка арта такая же. Пока это
    было ТРЕБОВАНИЕМ к генерации, оно однажды нарушилось: заливка стояла
    #0b0b11, подложка была (0,0,0), и семнадцати уровней синего хватило на еле
    заметную рамку вокруг арта. Теперь требования нет — приводим сами.

    Гасим ПЛАВНО, а не обрезаем по порогу: резкая граница просто переехала бы
    на край каймы, внутрь картинки. Рампа от нуля на самом краю до единицы на
    внутренней границе каймы стыка не даёт нигде.

    Побочно это даёт всем артам одинаковую лёгкую виньетку по краю — для карты
    свойство скорее полезное: сюжет не упирается в рамку."""
    w, h = im.size
    b = max(2, int(round(min(w, h) * КАЙМА)))
    ПЛАТО = max(1, int(round(min(w, h) * ПЛАТО_ДОЛЯ)))
    рампа = Image.new('L', (w, h), 255)
    px = рампа.load()
    for i in range(b):
        v = 0 if i < ПЛАТО else int(round(255 * (i + 1 - ПЛАТО) / (b + 1 - ПЛАТО)))
        for x in range(w):
            if px[x, i] > v: px[x, i] = v
            if px[x, h - 1 - i] > v: px[x, h - 1 - i] = v
        for y in range(h):
            if px[i, y] > v: px[i, y] = v
            if px[w - 1 - i, y] > v: px[w - 1 - i, y] = v
    return ImageChops.multiply(im, Image.merge('RGB', (рампа, рампа, рампа)))


def build(cid, src):
    p = os.path.join(RAW, src)
    if not os.path.exists(p):
        print('  нет оригинала: %s' % src); return
    im = кайма_в_ноль(в_квадрат(Image.open(p).convert('RGB'), src))
    for size, q, sub in ((512, 82, ''), (1024, 90, 'hi')):
        d = os.path.join(OUT, sub)
        os.makedirs(d, exist_ok=True)
        f = os.path.join(d, cid + '.webp')
        im.resize((size, size), Image.LANCZOS).save(f, 'WEBP', quality=q, method=6)
        print('  %-4s %4d px -> %6.0f КБ  %s' % (cid, size, os.path.getsize(f) / 1024, f[len(ROOT) + 1:]))

def build_map(имя, src):
    """Обложка района: только уменьшение и webp, без квадрата и каймы."""
    p = os.path.join(RAW, src)
    if not os.path.exists(p):
        print('  нет оригинала района: %s' % src); return
    im = Image.open(p).convert('RGB')
    d = os.path.join(ROOT, 'art', 'map')
    os.makedirs(d, exist_ok=True)
    f = os.path.join(d, имя + '.webp')
    # 768 по большей стороне: район на широком экране это 27% от ~1200 px, то
    # есть ~320 px, и вдвое больше уже с запасом на плотный экран.
    k = 768.0 / max(im.size)
    if k < 1:
        im = im.resize((int(round(im.width * k)), int(round(im.height * k))), Image.LANCZOS)
    im.save(f, 'WEBP', quality=84, method=6)
    print('  %-6s %4dx%-4d -> %6.0f КБ  art/map/%s.webp' % (
        имя, im.width, im.height, os.path.getsize(f) / 1024, имя))


def build_story(имя, src):
    """Кадр катсцены: уменьшение до 900 и webp. Ни квадрата, ни каймы."""
    p = os.path.join(RAW, src)
    if not os.path.exists(p):
        print('  нет оригинала кадра: %s' % src); return
    im = Image.open(p).convert('RGB')
    d = os.path.join(ROOT, 'art', 'story')
    os.makedirs(d, exist_ok=True)
    f = os.path.join(d, имя + '.webp')
    # 900 по стороне — как у кадров первой сцены: на экране кадр не шире 56vh.
    k = 900.0 / max(im.size)
    if k < 1:
        im = im.resize((int(round(im.width * k)), int(round(im.height * k))), Image.LANCZOS)
    im.save(f, 'WEBP', quality=84, method=6)
    print('  %-7s %4dx%-4d -> %6.0f КБ  art/story/%s.webp' % (
        имя, im.width, im.height, os.path.getsize(f) / 1024, имя))


def build_fog():
    src, out, size, q = ТУМАН
    p = os.path.join(RAW, src)
    if not os.path.exists(p):
        print('  нет оригинала тумана: %s' % src); return
    f = os.path.join(ROOT, 'art', out)
    Image.open(p).convert('L').resize((size, size), Image.LANCZOS)         .save(f, 'WEBP', quality=q, method=6)
    print('  %-6s %4d px -> %6.0f КБ  art/%s' % ('туман', size, os.path.getsize(f) / 1024, out))


if __name__ == '__main__':
    only = sys.argv[1:]
    if not only or 'fog' in only:
        build_fog()
    if only == ['fog']:
        sys.exit(0)
    for имя, src in sorted(СЦЕНЫ.items()):
        if not only or имя in only:
            build_story(имя, src)
    for имя, src in sorted(РАЙОНЫ.items()):
        if not only or имя in only:
            build_map(имя, src)
    for cid, src in sorted(MAP.items()):
        if not only or cid in only:
            build(cid, src)
