/* Снимок вёрстки для проверки перекладки стилей.
   Для КАЖДОГО элемента на каждом экране берём 47 вычисленных свойств и
   прямоугольник, сворачиваем в короткий отпечаток и складываем в
   localStorage. После перекладки снимаем такой же и сравниваем: любое
   расхождение — хоть в пиксель, хоть в цвет тени — вылезет само.

   Ключ элемента — путь по индексам в дереве, а не класс: он не зависит от
   того, что мы делаем со стилями.

   ВАЖНО, проверено калибровкой: снимок обязан сниматься с ЧИСТОЙ страницы,
   один раз за загрузку. Два прогона подряд разошлись на треть элементов —
   экраны оставляют за собой узлы (окна, тосты, собранный бой), индексы
   сдвигаются, и сравнивать становится нечего. Плюс анимации: половина
   вёрстки постоянно едет (полосы, сетка, голография), поэтому перед каждым
   чтением все анимации ставим на паузу и отматываем в ноль.

   И ещё одна ловушка, стоившая ложной тревоги на 330 элементов: снимать
   можно только когда окно УЖЕ устоялось в нужном размере. Снимок сразу после
   смены размера ловит страницу на полпути к мобильной эмуляции (hover,
   pointer) и врёт. Меняешь размер — перейди на страницу заново и убедись, что
   matchMedia('(hover:none)') отвечает ожидаемое, и только потом снимай.

   Порядок работы:
     перезагрузить → __сохранить('до')
     (перекладка)
     перезагрузить → __сохранить('после')
     __сверить('до','после')

   Временный инструмент, удалить после разбиения. */
(() => {
  const ПРОПС = ['display','position','width','height','top','right','bottom','left',
    'margin','padding','border-width','border-style','border-color','border-radius',
    'background-color','background-image','background-size','background-position',
    'color','font-family','font-size','font-weight','font-style','line-height',
    'letter-spacing','text-align','text-transform','text-shadow','white-space',
    'flex-direction','flex-wrap','align-items','justify-content','gap','flex',
    'grid-template-columns','z-index','opacity','transform','box-shadow','filter',
    'overflow','visibility','object-fit','aspect-ratio','mix-blend-mode'];

  /* Служебные теги в ключ не входят и соседей не сдвигают. Иначе разрезание
     одного <script> на тринадцать сдвигало индексы всех элементов после них,
     и снимок показывал 13446 расхождений там, где не изменилось ничего. */
  const СЛУЖЕБНЫЕ = { SCRIPT: 1, LINK: 1, STYLE: 1, META: 1, TITLE: 1 };
  const путь = el => {
    const ч = [];
    while (el && el !== document.body) {
      const свои = [...el.parentNode.children].filter(x => !СЛУЖЕБНЫЕ[x.tagName]);
      ч.push(свои.indexOf(el));
      el = el.parentElement;
    }
    return ч.reverse().join('/');
  };

  const хеш = s => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  /* Всё, что живёт своей жизнью и к стилям отношения не имеет. */
  const успокоить = () => {
    document.querySelectorAll('.toast,.dmgPop,.bang,.flyCard,.atkArc,.ghost,.bTurn,.ePlay')
      .forEach(n => n.remove());
    const cry = document.getElementById('bCry');
    if (cry) cry.innerHTML = '';          /* кристаллы раскиданы случайно */
    /* Одноразовые анимации ДОВОДИМ до конца, зациклённые морозим в нуле.
       Отматывать в ноль всё подряд было ошибкой: у только что созданного
       существа так возвращался стартовый кадр unitIn — scale(.3) — и то, был
       ли объект анимации ещё жив, решало случай. Это и давало 123 расхождения
       на доске. */
    try {
      document.getAnimations().forEach(a => {
        const t = a.effect && a.effect.getTiming();
        if (t && t.iterations === Infinity) { a.pause(); a.currentTime = 0 }
        else { try { a.finish() } catch (e) {} }
      });
    } catch (e) {}
  };

  /* Декорации со случайным содержимым. Кристаллы раскидываются рандомно, а
     бегущая строка размножает себя под ширину — их отпечатки разъезжаются
     сами по себе, без всяких правок CSS. Калибровка ловила ровно их. */
  const ИГНОР = '.crystal,.tkIn';

  const снятьЭкран = () => {
    успокоить();
    const из = {};
    for (const el of document.body.querySelectorAll('*')) {
      if (СЛУЖЕБНЫЕ[el.tagName]) continue;
      if (el.closest(ИГНОР)) continue;
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      let s = el.tagName + '|';
      for (const p of ПРОПС) s += c.getPropertyValue(p) + '|';
      s += [Math.round(r.left), Math.round(r.top),
            Math.round(r.width), Math.round(r.height)].join(',');
      из[путь(el)] = хеш(s);
    }
    return из;
  };

  /* Сейв фиксируем НА ДИСКЕ и перезагружаемся, а не правим состояние на лету.
     Калибровка показала почему: первый прогон дописывал своё состояние в
     сохранение, второй грузился уже с другим, и экраны строились из разного
     содержимого — расхождение было не о стилях. */
  window.__зафиксироватьСейв = () => {
    const s = clone(DEF);
    s.hero = 'f'; s.name = 'ТЕСТ'; s.sparks = 5000; s.stage = 10; s.story = 1;
    for (const c of CARDS) if (!c.noColl) s.inv[c.id] = 2;
    s.deck = CARDS.filter(c => c.t === 0 && !c.noColl).flatMap(c => [c.id, c.id]).slice(0, 20);
    s.promo = {}; s.chats = {}; s.done = {};
    s.snd = true; s.vfx = true; s.shk = true; s.foil = true;
    s.anim = true; s.arrows = true;
    s.gfx = { irid: 1, spec: 1, scan: 1, grain: 1, glow: 1, tilt: 1 };
    s.stats = { packs: 0, wins: 0, battles: 0 };
    s.gacha = { pity: 0, packs: 0 };
    localStorage.setItem('bbduel', JSON.stringify(s));
    localStorage.removeItem('bbduel_battle');
    localStorage.removeItem('bbduel_crumb');
    return 'сейв зафиксирован — теперь перезагрузи страницу';
  };

  const подготовить = () => {
    if (typeof REDUCE !== 'undefined') REDUCE = false;
    applyGfx();
  };

  const жди = ms => new Promise(r => setTimeout(r, ms));

  /* Не снимать, пока картинки не разложились: незагруженный <img> имеет
     высоту 0, и портрет героя давал единственное расхождение из 14356 —
     чистая гонка загрузки, к стилям отношения не имеющая. */
  const дождатьсяКартинок = async () => {
    const ждём = [...document.images].filter(i => !i.complete)
      .map(i => new Promise(r => { i.onload = i.onerror = r }));
    if (ждём.length) await Promise.all(ждём);
    try { await document.fonts.ready } catch (e) {}
    await жди(60);
  };

  let снималиУже = false;
  window.__снимок = async () => {
    if (снималиУже) throw new Error(
      'снимок уже снимался на этой загрузке — перезагрузи страницу, иначе ' +
      'оставшиеся узлы сдвинут индексы и сравнение станет мусором');
    снималиУже = true;
    подготовить();
    /* Прогрев: сначала строим ВСЕ экраны, только потом меряем. Экраны
       собираются лениво, и без прогрева порядок обхода решал, что уже
       построено, а что нет: при первой загрузке картинки грузятся дольше,
       и ленивый экран успевал появиться, при второй — нет. Расхождение было
       не в стилях, а в том, что мерили разное. */
    for (const id of ['menu','hero','stages','deck','gacha','settings','story']) {
      go(id); await жди(160);
    }
    await дождатьсяКартинок();
    const итог = {};
    for (const id of ['menu','hero','stages','deck','gacha','settings','story']) {
      go(id); await жди(300); await дождатьсяКартинок();
      итог[id] = снятьЭкран();
    }
    /* Бой надо собрать, а не просто показать: иначе поле пустое. Расклад
       фиксированный — случайной руки быть не должно. */
    startBattle(4);
    /* startBattle через 600мс сам начинает ход игрока и добирает карту. Снимок
       раньше этого срока ловил то шесть карт в руке, то пять — веер
       перестраивался целиком, и бой давал 232 расхождения на ровном месте.
       Ждём, пока таймер отработает, и только потом раскладываем своё. */
    await жди(900);
    B.p.board = [mkUnit(CARDS.find(c => c.ty === 'u' && c.c <= 2))];
    B.e.board = [mkUnit(CARDS.find(c => c.ty === 'u' && c.kw && c.kw.includes('taunt')))];
    B.p.hand = CARDS.filter(c => !c.noColl).slice(0, 5).map(c => c.id);
    B.e.hand = CARDS.filter(c => !c.noColl).slice(5, 10).map(c => c.id);
    B.p.mana = 9; B.p.mmax = 9; B.phase = 'p'; B.sel = null;
    renderBattle(); await жди(380); await дождатьсяКартинок();
    итог.battle = снятьЭкран();
    /* Окна поверх экрана — тоже вёрстка. Каждое снимаем и сразу убираем,
       чтобы следующее не наслаивалось. */
    openInspector(0); await жди(220); await дождатьсяКартинок();
    итог.inspector = снятьЭкран();
    closeInspector();
    openLog(); await жди(220); await дождатьсяКартинок();
    итог.log = снятьЭкран();
    document.querySelectorAll('.iWrap').forEach(n => n.remove());
    return итог;
  };

  window.__сохранить = async (метка) => {
    const s = await window.__снимок();
    localStorage.setItem('снимок:' + метка + ':' + innerWidth, JSON.stringify(s));
    return { метка, ширина: innerWidth,
      элементов: Object.values(s).reduce((n, v) => n + Object.keys(v).length, 0) };
  };

  window.__сверить = (a, b) => {
    const w = innerWidth;
    const A = JSON.parse(localStorage.getItem('снимок:' + a + ':' + w) || 'null');
    const B2 = JSON.parse(localStorage.getItem('снимок:' + b + ':' + w) || 'null');
    if (!A || !B2) return { ошибка: 'нет снимка ' + (A ? b : a) + ' для ширины ' + w };
    const отчёт = {};
    let всего = 0, разошлось = 0;
    for (const экран of Object.keys(A)) {
      const ключи = new Set([...Object.keys(A[экран]), ...Object.keys(B2[экран] || {})]);
      const плохие = [];
      for (const k of ключи) {
        всего++;
        if (A[экран][k] !== (B2[экран] || {})[k]) { разошлось++; плохие.push(k) }
      }
      if (плохие.length) отчёт[экран] = { разошлось: плохие.length, примеры: плохие.slice(0, 12) };
    }
    return { ширина: w, всего, разошлось, поЭкранам: отчёт };
  };
  return 'готово';
})();

/* Разовый разбор: полный дамп свойств поддерева руки после ТОЙ ЖЕ подготовки,
   что делает снимок. Нужен, чтобы понять, ЧТО именно разошлось, — отпечаток
   говорит только «разошлось». */
window.__рука = async (метка) => {
  await window.__снимок();
  const h = document.getElementById('bHand');
  if (!h) return 'нет руки';
  const ПР = ['display','position','width','height','top','right','bottom','left','margin',
    'padding','font-size','line-height','letter-spacing','transform','z-index','opacity',
    'overflow','max-height','min-height','flex','box-shadow','border-width','color','background-color'];
  const из = {};
  const путь = el => { const ч=[]; while(el&&el!==h){ч.push([...el.parentNode.children].indexOf(el));el=el.parentElement} return ч.reverse().join('/') };
  for (const el of h.querySelectorAll('*')) {
    const c = getComputedStyle(el), r = el.getBoundingClientRect(), o = {};
    for (const p of ПР) o[p] = c.getPropertyValue(p);
    o.rect = [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)];
    o.кл = String(el.className || '');
    из[путь(el)] = o;
  }
  localStorage.setItem('рука:' + метка, JSON.stringify(из));
  return Object.keys(из).length;
};
window.__сверитьРуку = () => {
  const A = JSON.parse(localStorage.getItem('рука:безслоёв')||'null');
  const B2 = JSON.parse(localStorage.getItem('рука:слои')||'null');
  if(!A||!B2) return 'нет одного из дампов';
  const разн = [];
  for (const k of Object.keys(A)) {
    const a=A[k], b=B2[k]||{};
    for (const p of Object.keys(a)) {
      const av=JSON.stringify(a[p]), bv=JSON.stringify(b[p]);
      if(av!==bv) разн.push({узел:k+' .'+a.кл, свойство:p, было:a[p], стало:b[p]});
    }
  }
  return { всего: разн.length, первые: разн.slice(0,20) };
};
