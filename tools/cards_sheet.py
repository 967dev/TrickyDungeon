# -*- coding: utf-8 -*-
"""Собирает cards-sheet.html — все карты игры с описаниями, на одной странице.

Зачем отдельный файл, а не разблокировать коллекцию в самой игре: в игре видно
только то, что выпало, а нужен полный список — и как справочник под генерацию
арта, и чтобы вычитывать тексты целиком.

Тексты НЕ переписываются руками: и сами карты, и описания эффектов берутся из
кода игры и считаются им же. Значит страница не может разойтись с игрой —
достаточно перегенерировать.

    python tools/cards_sheet.py
"""
import io
import json
import os
import re
import subprocess
import sys

КОРЕНЬ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ИСХОДНИК = os.path.join(КОРЕНЬ, 'index.html')
ВЫХОД = os.path.join(КОРЕНЬ, 'cards-sheet.html')


def кусок(js, начало, конец=';\n'):
    """Вырезает объявление по его началу до первого конца строки-разделителя."""
    i = js.find(начало)
    if i < 0:
        raise SystemExit('не найдено в скрипте игры: ' + начало[:40])
    j = js.find(конец, i)
    if j < 0:
        raise SystemExit('не закрыто: ' + начало[:40])
    return js[i:j + len(конец)]


def функция(js, имя):
    """Вырезает функцию по балансу фигурных скобок."""
    m = re.search(r'^function ' + re.escape(имя) + r'\(', js, re.M)
    if not m:
        raise SystemExit('нет функции ' + имя)
    i = js.index('{', m.start())
    d = 0
    for k in range(i, len(js)):
        if js[k] == '{':
            d += 1
        elif js[k] == '}':
            d -= 1
            if d == 0:
                return js[m.start():k + 1]
    raise SystemExit('не закрыта функция ' + имя)


def собрать_js():
    """Скрипт лежит в js/ отдельными файлами, порядок подключения значим (см.
    CLAUDE.md). Склеиваем их в том же порядке — для вырезания кусков это ровно
    тот же текст, что был когда-то одним файлом."""
    html = io.open(ИСХОДНИК, encoding='utf-8').read()
    # [^"?]+ — метку сборки (?v=N) отрезаем прямо здесь. Без этого скрипт
    # пытался открыть файл с именем «js/01-core.js?v=60» и падал на OSError,
    # то есть лист карт молча отставал от игры: перегенерация не проходила, а
    # старый файл продолжал лежать рядом и выглядеть свежим.
    имена = re.findall(r'<script src="(js/[^"?]+)[^"]*"></script>', html)
    if not имена:
        raise SystemExit('в index.html нет ни одного <script src="js/...">')
    return '\n'.join(io.open(os.path.join(КОРЕНЬ, н), encoding='utf-8').read()
                     for н in имена)


def main():
    js = собрать_js()

    # Берём только то, что нужно для текста карты. Остальной скрипт трогать
    # нельзя: он при загрузке лезет в DOM, звук и хранилище.
    части = [
        кусок(js, 'const CARDS=[', '\n];\n'),
        кусок(js, 'const TIER_NAMES='),
        кусок(js, 'const CARD_ART=new Set('),
        кусок(js, 'const EL_COLS={', '\n};\n'),
        функция(js, 'plural'),
        функция(js, 'плюс'),
        функция(js, 'effDesc'),
        функция(js, 'kwLine'),
    ]

    сбор = '\n'.join(части) + '''
const вывод = CARDS.map(c => ({
  id: c.id, n: c.n, t: c.t, тир: TIER_NAMES[c.t], ty: c.ty, c: c.c,
  a: c.a ?? null, h: c.h ?? null, el: c.el || 'steel', kw: c.kw || [],
  ult: !!c.ult, noColl: !!c.noColl, арт: CARD_ART.has(c.id),
  эфф: c.eff ? c.eff.k : null,
  описание: effDesc(c), ключевые: kwLine(c), фл: c.fl,
  цвет: (EL_COLS[c.el] || EL_COLS.steel)[0],
}));
process.stdout.write(JSON.stringify(вывод));
'''
    p = subprocess.run([('node.exe' if os.name == 'nt' else 'node'), '-e', сбор],
                       capture_output=True)
    if p.returncode:
        sys.stderr.write(p.stderr.decode('utf-8', 'replace'))
        raise SystemExit('node не смог посчитать карты')
    карты = json.loads(p.stdout.decode('utf-8'))

    ЭЛ = {'fire': 'ОГОНЬ', 'ice': 'ЛЁД', 'volta': 'ВОЛЬТА',
          'ether': 'ЭФИР', 'steel': 'СТАЛЬ'}
    КЛ = {'taunt': 'ТАУНТ', 'rush': 'РАШ'}

    def карточка(c):
        статы = ('<span class="st"><b class="a">%s</b><i>АТАКА</i></span>'
                 '<span class="st"><b class="h">%s</b><i>ЖИЗНИ</i></span>'
                 % (c['a'], c['h'])) if c['ty'] == 'u' else \
                '<span class="echo">ЭХО-ЗАКЛЯТИЕ</span>'
        кв = ''.join('<b class="kw">%s</b>' % КЛ.get(k, k) for k in c['kw'])
        метки = []
        if c['ult']:
            метки.append('<b class="tag sec">СЕКРЕТ</b>')
        if c['noColl']:
            метки.append('<b class="tag">не выпадает из паков</b>')
        метки.append('<b class="tag %s">%s</b>' % (
            'ok' if c['арт'] else 'no', 'арт есть' if c['арт'] else 'АРТА НЕТ'))
        return '''<article class="c t%d" style="--el:%s">
  <div class="вид" data-id="%s"></div>
  <header><span class="cost">%d</span>
    <h3>%s</h3>
    <span class="id">%s</span></header>
  <div class="meta"><b class="el">%s</b><b class="tier">%s %s</b>%s</div>
  <div class="stats">%s</div>
  %s
  <p class="desc">%s</p>
  <p class="fl">«%s»</p>
  <div class="tags">%s</div>
</article>''' % (c['t'], c['цвет'], c['id'], c['c'], c['n'], c['id'],
                 ЭЛ.get(c['el'], c['el']), c['тир'], '★' * (c['t'] + 1), кв,
                 статы, c['ключевые'], c['описание'], c['фл'], ''.join(метки))

    группы = []
    for t in range(5):
        свои = [c for c in карты if c['t'] == t]
        if not свои:
            continue
        нет_арта = sum(1 for c in свои if not c['арт'])
        группы.append(
            '<h2>%s <span>%s · %d карт · без арта: %d</span></h2>\n<div class="grid">%s</div>'
            % (свои[0]['тир'], '★' * (t + 1), len(свои), нет_арта,
               '\n'.join(карточка(c) for c in свои)))

    всего = len(карты)
    без = sum(1 for c in карты if not c['арт'])
    страница = '''<!doctype html>
<meta charset="utf-8">
<title>БАМ-БАМ: все карты</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--yel:#ffd52e;--mag:#ff4fd8;--cyn:#35f0ff;--red:#ff3355;--grn:#3dff8a;
  --bg:#0a0a0f;--ink:#e9e9f0;--dim:#8a8a9e;
  --disp:'Arial Black',Impact,sans-serif;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;padding:22px;background:var(--bg);color:var(--ink);
  font-family:'Segoe UI',Helvetica,Arial,sans-serif;
  background-image:radial-gradient(rgba(255,255,255,.04) 1px,transparent 1.5px);
  background-size:22px 22px}
h1{font-family:var(--disp);font-style:italic;color:var(--yel);margin:0 0 4px;
  text-shadow:3px 3px 0 #000;font-size:26px}
.sub{font-family:var(--mono);font-size:12px;color:var(--dim);margin-bottom:22px}
h2{font-family:var(--disp);font-style:italic;color:var(--cyn);font-size:18px;
  margin:30px 0 12px;text-shadow:2px 2px 0 #000;border-bottom:3px solid #000;padding-bottom:6px}
h2 span{font-family:var(--mono);font-style:normal;font-size:11px;color:var(--dim);
  margin-left:10px;letter-spacing:.06em}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.c{background:#12121b;border:2px solid #2c2c38;border-left:6px solid var(--el);
  padding:12px 14px;box-shadow:4px 5px 0 rgba(0,0,0,.5)}
.c header{display:flex;align-items:center;gap:9px;margin-bottom:8px}
.cost{font-family:var(--disp);background:var(--yel);color:#0a0a0e;width:30px;height:30px;
  display:grid;place-items:center;border:2px solid #000;font-size:16px;flex:none}
.c h3{font-family:var(--disp);font-size:15px;margin:0;flex:1;text-shadow:2px 2px 0 #000}
.id{font-family:var(--mono);font-size:10px;color:#55556a}
.meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:9px}
.el{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:#0a0a0e;
  background:var(--el);padding:2px 7px}
.tier{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--dim)}
.kw{font-family:var(--disp);font-size:10px;color:#0a0a0e;background:var(--yel);padding:2px 7px}
.stats{display:flex;gap:14px;align-items:flex-start;margin-bottom:9px}
.st{display:flex;flex-direction:column;align-items:center;gap:2px}
.st b{font-family:var(--disp);font-size:17px;padding:2px 10px;border:2px solid #000;color:#fff}
.st b.a{background:#c22b3f}.st b.h{background:#2b7ac2}
.st i{font-family:var(--mono);font-style:normal;font-size:8px;color:var(--dim);letter-spacing:.06em}
.echo{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--mag);
  border:2px solid var(--mag);padding:3px 9px}
.c p{margin:0 0 7px;font-size:13px;line-height:1.45}
.c .desc b{color:var(--yel)}
.c .desc .kw{background:none;color:var(--yel);padding:0;font-size:13px}
.c > p:has(+ .desc),.c p:first-of-type{color:#cfccdd}
.fl{font-style:italic;color:var(--dim);font-size:12px;border-left:3px solid #2c2c38;padding-left:9px}
.tags{display:flex;flex-wrap:wrap;gap:5px}
.tag{font-family:var(--mono);font-size:9px;letter-spacing:.06em;color:var(--dim);
  border:1px solid #2c2c38;padding:2px 6px;font-weight:400}
.tag.no{color:var(--red);border-color:var(--red)}
.tag.ok{color:var(--grn);border-color:var(--grn)}
.tag.sec{color:var(--red);border-color:var(--red)}
@media print{body{background:#fff;color:#000}.c{break-inside:avoid}}
</style>
<!-- Полоса переходов между стендами. Стоит В ГЕНЕРАТОРЕ, а не в готовом
     файле: cards-sheet.html собирается целиком, и вставка руками стиралась бы
     при каждой пересборке. Ровно это и случилось при первой попытке. -->
<style>
#дк{position:sticky;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:6px;align-items:center;
  padding:6px 10px;background:#0a0a0f;border-bottom:2px solid #2c2c38;
  font:600 11px/1 ui-monospace,Consolas,monospace}
#дк b{color:#ffd52e;font:900 11px/1 'Arial Black',Impact,sans-serif;letter-spacing:.04em;margin-right:4px}
#дк a{color:#cfccdd;text-decoration:none;padding:5px 9px;border:1px solid #2c2c38;background:#14141c}
#дк a:hover{border-color:#ffd52e;color:#ffd52e}
#дк a.тут{background:#ffd52e;color:#0a0a0f;border-color:#000}
#дк a.нет{opacity:.5}
#дк .прим{color:#5a5a6e;margin-left:auto;font-size:10px}
</style>
<nav id="дк"></nav>
<script>
(function(){
  var С=[["index.html","игра",1],["dev.html","дев-панель",1],["scene-lab.html","катсцены",1],
         ["map-lab.html","карта",1],["poster-lab.html","плакат",1],["holo-lab.html","голография",1],
         ["cards-sheet.html","лист карт",1],["story.html","тексты",0]];
  var тут=(location.pathname.split("/").pop()||"index.html");
  var n=document.getElementById("дк"), h='<b>СТЕНДЫ</b>';
  for(var i=0;i<С.length;i++){
    var f=С[i][0], имя=С[i][1], публ=С[i][2];
    h+='<a class="'+(f===тут?"тут":(публ?"":"нет"))+'" href="'+f+'"'+
       (публ?"":' title="нет на GitHub Pages — только локально"')+'>'+имя+(публ?"":" ·лок")+'</a>';
  }
  h+='<span class="прим">сейв общий на весь адрес</span>';
  n.innerHTML=h;
})();
</script>
<!-- Карта рисуется НАСТОЯЩЕЙ cardHTML() из js/07-cards.js и настоящими
     стилями css/04-cards.css. Своей копии тут нет намеренно: копия и игра
     разошлись бы, и стенд начал бы врать ровно там, где нужен больше всего —
     при вычитке карт перед выпуском. Тот же приём, что в poster-lab. -->
<link rel="stylesheet" href="css/01-base.css">
<link rel="stylesheet" href="css/04-cards.css">
<style>
/* ОТМЕНЯЕМ то, что 01-base.css делает с документом. Он нужен нам ради
   переменных (цвета, шрифты), но он же превращает страницу в приложение на
   весь экран: `html,body{height:var(--app-h)}` и `body{overflow:hidden}`.
   Лист карт — длинная страница, и от этого она просто переставала листаться.
   Заодно возвращаем выделение текста: с него тут копируют описания. */
html,body{height:auto;min-height:100%%;overflow:visible}
body{user-select:text;-webkit-user-select:text}
/* Точечная сетка 01-base прибита к экрану (position:fixed) и при прокрутке
   стояла бы на месте поверх карт. Странице она не нужна. */
body::before{display:none}

/* Карта слева от текста; на узком экране — сверху. Ширина в пикселях, а не в
   процентах: карта свёрстана в пикселях, и в резиновой коробке её значки
   поплыли бы — ровно та беда, что была с плакатом на щите. */
.c{display:grid;grid-template-columns:170px 1fr;gap:12px 16px;align-items:start}
.c>.вид{grid-row:1 / span 20;width:170px}
.c>.вид .cWrap{cursor:default}
@media(max-width:720px){.c{grid-template-columns:1fr}.c>.вид{grid-row:auto;width:200px}}
</style>
<script>
/* Заглушка состояния: cardHTML читает из него голографию и настройки графики.
   Голография ВЫКЛЮЧЕНА: на странице под сорок карт разом, а сорок вечно
   анимированных слоёв со смешением кладут телефон — это измерено на экране
   колоды в самой игре. */
const S={foil:false,anim:false,vfx:false,gfx:{}};
</script>
<script src="js/01-core.js"></script>
<script src="js/02-data.js"></script>
<script src="js/07-cards.js"></script>

<h1>БАМ-БАМ: КАСКАД — все карты</h1>
<div class="sub">%d карт · без арта: %d · тексты посчитаны кодом игры · tools/cards_sheet.py</div>
%s
''' % (всего, без, '\n'.join(группы))

    страница += '''
<script>
/* Рисуем после разметки: к этому моменту все места под карты уже в дереве. */
document.querySelectorAll('.вид[data-id]').forEach(function(м){
  var c=byId(м.dataset.id);
  /* Без fl: голос карты страница печатает СВОЕЙ строкой в тексте справа.
     С флагом он выходил дважды — на карте и рядом с ней. Ровно то же уже
     ловилось в разборе боя. */
  if(c)м.innerHTML=cardHTML(c,{open:1,noAnim:1});
});
</script>
'''
    io.open(ВЫХОД, 'w', encoding='utf-8', newline='\n').write(страница)
    print('готово: %s' % ВЫХОД)
    print('карт %d, без арта %d' % (всего, без))


if __name__ == '__main__':
    main()
