/* Набор проверок игры целиком. Гоняется в браузере:

     fetch('tools/_tests.js').then(r=>r.text()).then(t=>(0,eval)(t))
     await __тесты()

   Зачем именно такой: разрезание файлов ломается не «немного криво», а
   отсутствующим символом и порядком выполнения. Поэтому проверки нарочно
   ходят по ШИРОКИМ путям — экраны, колода, крутки, бой целиком, чат,
   обучение, — каждый из которых дёргает десятки глобалей. Молчаливый провал
   тут невозможен: не нашлась функция — тест упал.

   Состояние игры сохраняется до прогона и возвращается после. */
(() => {
  let провалы = [], всего = 0, текущий = '';
  /* Какие группы успели начаться. Исключение внутри группы обрывает ВЕСЬ
     прогон — всё, что ниже, молча не выполняется, а отчёт показывает одно
     упавшее и выглядит почти хорошо. Считаем группы, чтобы обрыв нельзя
     было принять за успех. */
  const ВСЕГО_ГРУПП = 15;
  const пройдено = [];
  const группа = имя => { текущий = имя; пройдено.push(имя) };
  /* Ожидание. В БЫСТРОМ режиме — микрозадача, а не таймер: браузер душит
     setTimeout в спрятанной вкладке до одного в минуту, и прогон вставал не
     на своих ошибках, а на паузах подачи. Микрозадачи он не трогает. */
  let БЫСТРО = false;
  const жди = ms => БЫСТРО ? тик() : new Promise(r => setTimeout(r, ms));

  const ок = (условие, что, детали) => {
    всего++;
    if (!условие) провалы.push({ группа: текущий, что, детали: детали === undefined ? '' : String(детали) });
  };
  const равно = (а, б, что) => ок(а === б, что, 'ожидалось ' + JSON.stringify(б) + ', получено ' + JSON.stringify(а));

  /* ---------- вспомогательное ---------- */
  const тихо = fn => { try { return fn() } catch (e) { return '❌ ' + e.message } };

  const чисто = () => {
    document.querySelectorAll('.iWrap,.toast,.flyCard,.atkArc,.ghost').forEach(n => n.remove());
    if (typeof lockUI === 'function') lockUI(0);
  };

  /* Полный бой на автопилоте. Возвращает, чем кончился и что успел записать
     журнал. Ограничение по времени обязательно: зависший ход — это как раз
     то, что тест и должен ловить, а не висеть вместе с ним. */
  const отыграть = async (этап, предел = 90000) => {
    /* Пауза перед новым боем: у прошлого могли остаться отложенные вызовы
       начала хода, и им надо дать сработать по СТАРОМУ бою, а не по новому. */
    await жди(900);
    /* Бой отыгрывается на мгновенном темпе. Правила от этого не меняются —
       в том и смысл их отделения: скорость показа их не касается. Анимации
       тоже гасим: их обещания в спрятанной вкладке не резолвятся вовсе. */
    const темпБыл = ТЕМП, анимБыла = S.anim;
    ТЕМП = 0; S.anim = false; БЫСТРО = true;
    const вернуть = () => { ТЕМП = темпБыл; S.anim = анимБыла; БЫСТРО = false };
    dropBattleSnap();
    startBattle(этап);
    const старт = performance.now();
    while (B && !B.over) {
      if (performance.now() - старт > предел) {
        const р = { завис: true, ходовНаСрок: (B.log || []).filter(z => z.k === 'turn').length,
          hp: [B.p.hp, B.e.hp] };
        вернуть(); return р;
      }
      /* Пока идёт показ, поле заперто и живой игрок ходить не может —
         бот не имеет права ходить сквозь эту блокировку, иначе он проверяет
         не ту игру, в которую играют. */
      if (typeof ИДЁТ !== 'undefined' && ИДЁТ) { await жди(120); continue }
      if (B.phase === 'p' && !document.getElementById('bEnd').disabled) {
        /* Автоигрок ДЕЙСТВУЕТ, а не только жмёт «конец хода». Раньше хватало
           и пассивного: врага в обучении добивала его же усталость. Теперь её
           там нет, и бой обязан кончаться тем, чем должен — игроком. */
        for (let i = B.p.hand.length - 1; i >= 0 && B.phase === 'p' && !B.over; i--) {
          const c = byId(B.p.hand[i]);
          if (!c || c.ty !== 'u' || c.c > B.p.mana) continue;
          if (c.eff && c.eff.tg) continue;          /* прицельным нужен выбор */
          if (B.p.board.length >= 5) break;
          playCard(i, null);
          if (typeof ИДЁТ !== 'undefined' && ИДЁТ) await ИДЁТ;
          await жди(120);
        }
        for (const u of [...B.p.board]) {
          if (B.over || B.phase !== 'p') break;
          if (!u.canAtk || u.atk <= 0) continue;
          /* Нет таунта — бьём в ГЕРОЯ. Бот, разменивающийся с юнитами, до
             героя не доходит вовсе: враг подставляет новых, и бой не
             сходится — на первом рейде он так и стоял на 16 здоровья
             семь ходов. */
          const таунты = B.e.board.filter(x => x.taunt);
          const цель = таунты.length ? таунты[0] : { hero: 1 };
          u.canAtk = false;
          /* Дожидаться саму атаку, а не круглое число: смерть существа
             доигрывается внутри неё, и без await бот успевал ударить по уже
             умирающему второй раз — в журнале один и тот же юнит погибал
             дважды. */
          await doAttack('p', u, цель);
          await жди(250);
        }
        if (B && !B.over && B.phase === 'p' && !document.getElementById('bEnd').disabled) endTurn();
      }
      await жди(120);
    }
    /* Правила кончают бой мгновенно, а итог — часть РАССКАЗА: строку
       «— ПОБЕДА —» пишет finish, когда показ дойдёт до события 'over'.
       Не дождавшись, тест читал журнал без итога и поле ещё запертым. */
    if (typeof ИДЁТ !== 'undefined' && ИДЁТ) await ИДЁТ;
    вернуть();
    const L = (B && B.log) || [];
    const хода = L.filter(z => z.k === 'turn').map(z => z.t);
    let сбойПорядка = null;
    for (let i = 1; i < хода.length; i++) {
      const a = хода[i - 1], b = хода[i];
      if (!a.includes('ХОД') || !b.includes('ХОД')) continue;
      if (a.includes('ТЫ') === b.includes('ТЫ')) { сбойПорядка = a + ' → ' + b; break }
    }
    return { завис: false, ходов: хода.length, записей: L.length,
      атак: L.filter(z => z.k === 'atk').length, сбойПорядка,
      итог: хода[хода.length - 1] || '', hp: [B.p.hp, B.e.hp] };
  };

  window.__тесты = async () => {
    провалы = []; всего = 0;
    const сейв = localStorage.getItem('bbduel');
    const ошибкиКонсоли = [];
    const старыйError = console.error;
    console.error = function () { ошибкиКонсоли.push([...arguments].join(' ')); return старыйError.apply(this, arguments) };
    let упало = null;
    window.onerror = (m, f, l) => { упало = m + ' @' + l };

    const начать = () => {
      localStorage.removeItem('bbduel_battle');
      S = load();
      S.hero = 'f'; S.name = 'ТЕСТ'; S.sparks = 100000; S.stage = 10; S.story = 1;
      for (const c of CARDS) if (!c.noColl) S.inv[c.id] = 2;
      S.deck = autoDeck(); S.promo = {}; S.chats = {}; S.done = {};
      S.snd = false; S.anim = true; S.arrows = true; S.vfx = true; S.shk = true;
      save(); чисто();
    };

    try {
      /* ============ 1. целостность загрузки ============ */
      группа('загрузка');
      /* Объявленные через function попадают на window, объявленные через
         const — нет. Проверяем то и другое одинаково, через сам идентификатор. */
      for (const имя of ['go','save','load','startBattle','renderBattle','endTurn','playCard',
        'doAttack','dealDamage','damageHero','aiTurn','blog','openLog','openInspector',
        /* слой правил — он же то, чем меряется баланс без экрана */
        'newBattle','rDraw','rHeroDmg','rHeroHeal','rUnitDmg','rEffect','rPlayCard','rAttack',
        'rStartTurn','rAiTurn','rTrainEnemyTurn','aiSpellTarget','simulate','simplePolicy',
        'canTarget','needTargetCard','проиграть','сыграть','откат','effText',
        'openUnitCard','cardHTML','effDesc','kwLine','autoDeck','defaultDeck','mkUnit','byId',
        'redeemPromo','renderSettings','renderDeck','renderGacha','renderStages','renderMenu',
        'atkLine','flyCard','burst','elCols','elBurst','syncEnemyHand','placeEnemyHand',
        'unitRect','lockUI','fitHand','plural','sub','esc'])
        ок(тихо(() => typeof eval(имя)) === 'function', 'есть функция ' + имя, тихо(() => typeof eval(имя)));
      for (const имя of ['CARDS','STAGES','TIER_NAMES','EL_COLS','CARD_ART','PROMO','CHATS','GFX_PRESETS','DEF'])
        ок(тихо(() => eval(имя)) !== undefined, 'есть данные ' + имя);
      for (const id of ['scr-menu','scr-hero','scr-stages','scr-deck','scr-gacha','scr-settings',
        'scr-battle','scr-story','chWrap','toasts','fx'])
        ок(!!document.getElementById(id), 'есть узел #' + id);
      равно(document.querySelectorAll('link[rel=stylesheet]').length, 11, 'подключено 11 файлов стилей');
      ок(document.querySelectorAll('script[src^="js/"]').length === 14, 'подключено 14 файлов скрипта',
        document.querySelectorAll('script[src^="js/"]').length);

      /* ============ 2. данные карт ============ */
      группа('данные карт');
      равно(CARDS.length, 38, 'карт всего');
      равно(new Set(CARDS.map(c => c.id)).size, 38, 'все id уникальны');
      равно(new Set(CARDS.map(c => c.n)).size, 38, 'все имена уникальны');
      for (const c of CARDS) {
        ок(c.t >= 0 && c.t <= 4, 'тир в диапазоне: ' + c.id, c.t);
        ок(c.ty === 'u' || c.ty === 's', 'тип верный: ' + c.id, c.ty);
        ок(!!EL_COLS[c.el], 'стихия известна: ' + c.id, c.el);
        ок(Number.isFinite(c.c) && c.c >= 0, 'цена число: ' + c.id, c.c);
        if (c.ty === 'u') ок(Number.isFinite(c.a) && Number.isFinite(c.h), 'у юнита есть статы: ' + c.id);
        ок(typeof c.fl === 'string' && c.fl.length > 0, 'есть флейвор: ' + c.id);
        if (c.eff) {
          const d = effDesc(c);
          ок(typeof d === 'string' && d.length > 20, 'описание эффекта не пустое: ' + c.id, d);
          ок(!/undefined|NaN/.test(d), 'в описании нет дыр: ' + c.id, d);
        }
      }
      равно(defaultDeck().length, 20, 'стартовая колода — 20 карт');
      равно(autoDeck().length, 20, 'авто-набор — 20 карт');
      for (const id of CARD_ART) ок(!!byId(id), 'арт указан для существующей карты: ' + id);

      /* ============ 3. сохранение ============ */
      группа('сохранение');
      начать();
      S.sparks = 4242; save();
      S = load();
      равно(S.sparks, 4242, 'искры переживают перезагрузку');
      равно(S.hero, 'f', 'герой переживает перезагрузку');
      localStorage.setItem('bbduel', '{это не json');
      const битый = load();
      ок(битый && Array.isArray(битый.deck) && битый.deck.length === 20,
        'битый сейв не роняет загрузку', JSON.stringify(битый && битый.deck && битый.deck.length));
      начать();
      S.inv['r01'] = 99999; S = (fixS(S), S);
      ок(S.inv['r01'] <= 100, 'перебор в инвентаре срезается', S.inv['r01']);

      /* ============ 4. экраны ============ */
      группа('экраны');
      начать();
      for (const id of ['menu','hero','stages','deck','gacha','settings','story']) {
        const до = упало;
        go(id); await жди(160);
        равно(упало, до, 'переход на экран ' + id + ' без ошибок');
        ок(!!document.querySelector('#scr-' + id + '.on'), 'экран ' + id + ' показан');
      }
      go('menu'); await жди(120);
      ок(document.querySelectorAll('#mTiles .mTile,#mTiles [data-go]').length > 0, 'плитки меню отрисованы');
      go('deck'); await жди(200);
      ок(document.querySelectorAll('#dGrid .dCard').length >= 30, 'коллекция отрисована',
        document.querySelectorAll('#dGrid .dCard').length);
      равно(document.querySelectorAll('#dDeck .dRow').length,
        new Set(S.deck).size, 'в боковой панели строка на каждую карту колоды');
      равно(S.deck.length, 20, 'в колоде 20 карт');
      go('stages'); await жди(200);
      ок(document.querySelectorAll('#stMap .stNode').length >= 10, 'карта рейдов отрисована',
        document.querySelectorAll('#stMap .stNode').length);

      /* ============ 5. колода ============ */
      группа('колода');
      начать(); go('deck'); await жди(200);
      /* toggleDeck снимает ВСЕ копии разом (правило: клик по карте, у которой
         в колоде максимум, убирает её целиком), поэтому ждём -2, а не -1. */
      const карта = S.deck[0], копий = S.deck.filter(x => x === карта).length;
      const былоВКолоде = S.deck.length;
      toggleDeck(карта);
      равно(S.deck.length, былоВКолоде - копий, 'карта убирается из колоды целиком');
      равно(S.deck.filter(x => x === карта).length, 0, 'копий не осталось');
      toggleDeck(карта);
      равно(S.deck.filter(x => x === карта).length, 1, 'карта возвращается одной копией');
      S.deck = autoDeck();
      равно(new Set(S.deck).size <= 20, true, 'в авто-наборе нет лишних');
      const счёт = {};
      for (const id of S.deck) счёт[id] = (счёт[id] || 0) + 1;
      ок(Object.values(счёт).every(n => n <= 2), 'не больше двух копий одной карты');

      /* ============ 6. крутки ============ */
      группа('крутки');
      начать();
      const искрыДо = S.sparks, паков = 12;
      let выпало = 0;
      for (let i = 0; i < паков; i++) {
        const до = S.sparks;
        const пак = Array.from({ length: 5 }, () => rollOne());
        ок(пак.every(c => c && byId(c.id)), 'пак выдаёт существующие карты');
        ок(пак.every(c => !c.noColl), 'из паков не падает служебное');
        выпало += пак.length;
      }
      равно(выпало, паков * 5, 'в паке ровно 5 карт');
      ок(legChance(0) < legChance(PITY_HARD), 'гарант растит шанс', legChance(0) + ' → ' + legChance(PITY_HARD));
      ок(legChance(PITY_HARD) >= 1, 'на жёстком пороге гарант', legChance(PITY_HARD));

      /* ============ 7. промокоды ============ */
      группа('промокоды');
      начать();
      const было = S.sparks;
      redeemPromo('НЕТ ТАКОГО');
      равно(S.sparks, было, 'неверный код ничего не даёт');
      redeemPromo('  prerelease  ');
      равно(S.sparks, было + PROMO.PRERELEASE.sparks, 'код начисляет искры');
      redeemPromo('PRERELEASE');
      равно(S.sparks, было + PROMO.PRERELEASE.sparks, 'повторно не начисляет');
      S = load();
      ок(!!S.promo.PRERELEASE, 'активация сохраняется');

      /* ============ 8. правила боя ============ */
      группа('правила боя');
      начать();
      const тау = CARDS.find(c => c.ty === 'u' && c.kw && c.kw.includes('taunt'));
      const раш = CARDS.find(c => c.ty === 'u' && c.kw && c.kw.includes('rush'));
      const простой = CARDS.find(c => c.ty === 'u' && !c.kw);
      ок(!!тау && !!раш && !!простой, 'в базе есть таунт, раш и обычный юнит');

      равно(mkUnit(раш).canAtk, true, 'раш может бить сразу');
      равно(mkUnit(простой).canAtk, false, 'обычный юнит ждёт хода');
      равно(mkUnit(тау).taunt, true, 'таунт помечается');

      /* startBattle заводит начало хода на 600мс. Пока таймер не отработал,
         любая расстановка будет затёрта: мана вернётся к максимуму, а рука
         доберёт карту. Ждём его, и только потом раскладываем. */
      const бой = async () => {
        dropBattleSnap(); startBattle(4);
        await жди(900);
        B.p.board = []; B.e.board = []; B.over = false; B.phase = 'p';
        B.p.hand = []; B.p.deck = []; lockUI(0);
      };

      /* таунт держит АТАКИ */
      await бой();
      B.e.board = [mkUnit(тау)];
      B.p.board = [mkUnit(раш)]; B.p.board[0].canAtk = true;
      B.e.hp = 30;
      onUnitTap(B.p.board[0].uid); onEnemyTap('hero');
      await жди(1600);
      равно(B.e.hp, 30, 'таунт не пускает атаку в героя (тап)');
      await бой();
      B.e.board = [mkUnit(тау)]; B.p.board = [mkUnit(раш)]; B.p.board[0].canAtk = true; B.e.hp = 30;
      DRAG = { kind: 'unit', ref: B.p.board[0].uid, sx: 0, sy: 0, moved: true, ghost: null, srcEl: null };
      const бт = document.getElementById('bTop').getBoundingClientRect();
      onDragUp({ clientX: Math.round(бт.left + 40), clientY: Math.round(бт.top + 10) });
      await жди(1600);
      равно(B.e.hp, 30, 'таунт не пускает атаку в героя (перетаскивание)');

      /* заклятие таунт НЕ держит — так задумано */
      await бой();
      B.e.board = [mkUnit(тау)]; B.e.hp = 30; B.p.mana = 9; B.p.mmax = 9;
      const искра = CARDS.find(c => c.n === 'Искра');
      B.p.hand = [искра.id]; renderBattle();
      B.sel = { type: 'hand', i: 0 }; onEnemyTap('hero');
      await жди(1800);
      равно(B.e.hp, 30 - искра.eff.v, 'заклятие проходит сквозь таунт');

      /* размен и смерть */
      await бой();
      const сильный = mkUnit(CARDS.find(c => c.ty === 'u' && c.a >= 3));
      const слабый = mkUnit(CARDS.find(c => c.ty === 'u' && c.h <= 2));
      сильный.canAtk = true;
      B.p.board = [сильный]; B.e.board = [слабый];
      await doAttack('p', сильный, слабый);
      await жди(900);
      равно(B.e.board.length, 0, 'убитый уходит с доски');
      ок(!document.querySelector('#rowE .unit'), 'узел убитого удалён');

      /* усталость */
      await бой();
      B.p.deck = []; B.p.fatigue = 0; B.p.hp = 30;
      drawCard('p');
      равно(B.p.hp, 29, 'пустая колода бьёт усталостью');
      drawCard('p');
      равно(B.p.hp, 27, 'усталость растёт');

      /* переполнение руки */
      await бой();
      B.p.hand = CARDS.slice(0, 7).map(c => c.id);
      B.p.deck = [CARDS[0].id];
      drawCard('p');
      равно(B.p.hand.length, 7, 'восьмая карта сгорает');

      /* ============ 9. эффекты карт ============ */
      группа('эффекты карт');
      const проверитьЭффект = async (вид, подготовить, проверить) => {
        await бой();
        const c = CARDS.find(x => x.eff && x.eff.k === вид && x.ty === 's') ||
                  CARDS.find(x => x.eff && x.eff.k === вид);
        if (!c) { ок(false, 'нашлась карта с эффектом ' + вид); return }
        B.p.mana = 10; B.p.mmax = 10; B.p.hand = [c.id];
        const цель = подготовить(c);
        renderBattle();
        playCard(0, цель);
        await жди(1500);
        проверить(c);
      };
      /* Мишень берём с запасом жизней: на первом попавшемся юните (1 жизнь)
         заклятие на 2 просто убивало его, и проверка «сколько отняли» меряла
         пустоту. */
      const толстый = CARDS.find(x => x.ty === 'u' && x.h >= 5) || простой;
      await проверитьЭффект('dmg', c => { B.e.board = [mkUnit(толстый)]; return B.e.board[0] },
        c => равно(B.e.board[0] ? толстый.h - B.e.board[0].hp : 'юнит убит', c.eff.v, 'урон по юниту'));
      await проверитьЭффект('healHero', c => { B.p.hp = 10; return null },
        c => равно(B.p.hp, 10 + c.eff.v, 'лечение героя'));
      await проверитьЭффект('healAll', c => { B.p.hp = 10; B.p.board = [mkUnit(простой)]; B.p.board[0].hp = 1; return null },
        c => ок(B.p.hp === 10 + c.eff.v && B.p.board[0].hp === Math.min(простой.h, 1 + c.eff.v), 'лечение всем',
          B.p.hp + '/' + B.p.board[0].hp));
      await проверитьЭффект('draw', c => { B.p.deck = CARDS.slice(0, 5).map(x => x.id); return null },
        c => равно(B.p.hand.length, c.eff.v, 'добор карт'));
      await проверитьЭффект('buff', c => { B.p.board = [mkUnit(простой)]; return B.p.board[0] },
        c => ок(B.p.board[0].atk === простой.a + (c.eff.a || 0) && B.p.board[0].hp === простой.h + (c.eff.h || 0),
          'усиление своего', B.p.board[0].atk + '/' + B.p.board[0].hp));
      await проверитьЭффект('aoe', c => { B.e.board = [mkUnit(простой), mkUnit(простой)]; return null },
        c => ок(B.e.board.every(u => u.hp === простой.h - c.eff.v) || B.e.board.length === 0,
          'аое бьёт всех', B.e.board.map(u => u.hp).join(',')));
      await проверитьЭффект('weaken', c => { B.e.board = [mkUnit(простой)]; return null },
        c => равно(B.e.board[0].atk, Math.max(0, простой.a - c.eff.v), 'ослабление'));
      await проверитьЭффект('mana', c => { B.p.mana = 3; return null },
        c => равно(B.p.mana, 3 + c.eff.v, 'прибавка маны'));
      await проверитьЭффект('drain', c => { B.e.hp = 30; B.p.hp = 10; return null },
        c => ок(B.e.hp === 30 - c.eff.v && B.p.hp === 10 + c.eff.v, 'высасывание',
          B.e.hp + '/' + B.p.hp));

      /* ============ 10. журнал ============ */
      группа('журнал боя');
      await бой();
      B.log = [];
      blog('p', 'проба', 'card');
      равно(B.log.length, 1, 'запись попадает в журнал');
      ок(document.querySelectorAll('#bFeed b').length >= 1, 'строка появляется в ленте');
      openLog();
      ок(!!document.querySelector('.iWrap .lgList'), 'история открывается');
      ок(!!document.querySelector('.iWrap .xbtn'), 'у истории есть крестик');
      чисто();

      /* ============ 11. бои целиком ============ */
      группа('бои целиком');
      /* Ловим ЗАВИСАНИЕ, а не неумение бота. Финальный босс лечится, и
         простой автоигрок может не додавить его за отведённое время — это не
         поломка. Поэтому упёршийся в срок бой считаем нормой, если он всё это
         время ЖИЛ: ходы шли, ошибок нет, поле не заперто. */
      for (const этап of [0, 1, 5, 9, 10]) {
        начать();
        const р = await отыграть(этап, 120000);
        if (р.завис) {
          ок(р.ходовНаСрок >= 4, 'этап ' + этап + ': бой шёл, не встал', JSON.stringify(р));
          ок(!document.getElementById('bWrap').classList.contains('locked'),
            'этап ' + этап + ': поле не заперто на затяжном бою');
          чисто();
          continue;
        }
        ок(!р.сбойПорядка, 'этап ' + этап + ': ходы чередуются', р.сбойПорядка);
        ок(р.ходов >= 2, 'этап ' + этап + ': ходы записаны', р.ходов);
        ок(/ПОБЕДА|ПОРАЖЕНИЕ|СДАЛСЯ/.test(р.итог), 'этап ' + этап + ': итог записан', р.итог);
        ок(document.querySelectorAll('.flyCard').length === 0, 'этап ' + этап + ': летящих карт не осталось');
        ок(document.querySelectorAll('.atkArc').length === 0, 'этап ' + этап + ': дуг не осталось');
        ок(!document.getElementById('bWrap').classList.contains('locked'),
          'этап ' + этап + ': поле разблокировано');
        ок([...document.querySelectorAll('.unit')].every(e => e.style.opacity !== '0'),
          'этап ' + этап + ': нет спрятанных существ');
        чисто();
      }

      /* ============ 12. чат и сюжет ============ */
      группа('чат и сюжет');
      начать();
      for (const [этап, чат] of Object.entries(CHATS)) {
        ок(Array.isArray(чат.pre) || Array.isArray(чат.post), 'чат ' + этап + ' не пустой');
        for (const реплика of [...(чат.pre || []), ...(чат.post || [])]) {
          ок(Array.isArray(реплика) && реплика.length >= 2, 'реплика оформлена: чат ' + этап);
          const t = sub(реплика[1]);
          /* Ищем именно неподставленный шаблон {ж|м}: голые скобки бывают в
             никах — «@нге/\ в кед@}{» их содержит законно. */
          ок(!/\{[^{}]*\|[^{}]*\}/.test(t), 'подстановка пола сработала: ' + t.slice(0, 40));
        }
      }
      S.hero = 'm';
      ок(sub('Играл{а|}') === 'Играл', 'мужской род подставляется', sub('Играл{а|}'));
      S.hero = 'f';
      ок(sub('Играл{а|}') === 'Играла', 'женский род подставляется', sub('Играл{а|}'));

      /* ============ 13. настройки ============ */
      группа('настройки');
      начать(); go('settings'); await жди(200);
      ок(document.querySelectorAll('#setWrap .tgl').length >= 5, 'переключатели отрисованы',
        document.querySelectorAll('#setWrap .tgl').length);
      ок(!!document.getElementById('prCode'), 'поле промокода на месте');
      ок(!!document.getElementById('prGo'), 'кнопка промокода на месте');
      S.anim = false;
      равно(gfxAnim(), false, 'выключатель анимаций слушается');
      S.anim = true;
      равно(gfxAnim(), true, 'включатель анимаций слушается');
      S.arrows = false;
      const дуг = document.querySelectorAll('.atkArc').length;
      atkLine({ left: 0, top: 0, width: 10, height: 10 }, { left: 100, top: 100, width: 10, height: 10 }, 300, 'p');
      равно(document.querySelectorAll('.atkArc').length, дуг, 'выключенные стрелки не рисуются');
      S.arrows = true;

      /* ============ 14. обучение ============ */
      группа('обучение');
      начать();
      const тр = await отыграть(0, 60000);
      ок(!тр.завис, 'тренировка доигрывается', JSON.stringify(тр));
      чисто();

      /* ============ 15. описание против правил ============
         Карта обещает игроку словами, правила делают дело. Разойтись они
         могут молча — так уже было: «Зуб Тишины» обещал «выбранной цели», а
         бил всегда в героя, а `healAll` у врага не лечил ему героя, хотя на
         карте написано «герою и всем своим».
         Проверяем не текст, а ПОВЕДЕНИЕ — каждое утверждение из effDesc и
         kwLine прогоняется настоящими правилами без экрана. И каждое — за
         ОБЕ стороны: расхождение сторон и было тем самым классом ошибок. */
      группа('описание против правил');

      /* Чистый стенд: настоящий бой, но с пустыми досками и руками. */
      const стенд = () => {
        const st = newBattle(4, defaultDeck());
        st.p.board = []; st.e.board = []; st.p.hand = []; st.e.hand = [];
        st.p.mana = st.e.mana = 10; st.p.mmax = st.e.mmax = 10;
        st.ev.length = 0;
        return st;
      };
      const другой = кто => кто === 'p' ? 'e' : 'p';
      /* Сыграть карту c за сторону `кто`, вернув состояние. */
      const сыграл = (st, кто, id, tgt) => {
        st[кто].hand = [id];
        st[кто].mana = 10;
        return rPlayCard(st, кто, 0, tgt || null);
      };
      const поставить = (st, кто, id) => {
        const u = mkUnit(byId(id)); st[кто].board.push(u); return u;
      };
      /* Одна и та же проверка за обе стороны: асимметрия — главный риск. */
      const заОбе = (имя, тело) => {
        for (const кто of ['p', 'e']) {
          try { тело(кто, другой(кто)) }
          catch (e) { ок(false, имя + ' (' + кто + ')', 'ИСКЛЮЧЕНИЕ ' + e.message) }
        }
      };

      /* --- dmg: «одной цели на выбор: юниту ИЛИ герою» --- */
      заОбе('dmg бьёт выбранного юнита и только его', (кто, враг) => {
        const st = стенд();
        const a = поставить(st, враг, 'r02'), b = поставить(st, враг, 'r02');
        const hp0 = st[враг].hp;
        сыграл(st, кто, 's01', a);                        /* Искра, 2 урона */
        равно(a.hp, 3 - 2, 'dmg: цель получила ровно 2 (' + кто + ')');
        равно(b.hp, 3, 'dmg: соседа не задело (' + кто + ')');
        равно(st[враг].hp, hp0, 'dmg: героя не задело (' + кто + ')');
      });
      заОбе('dmg без цели бьёт вражеского героя', (кто, враг) => {
        const st = стенд();
        const hp0 = st[враг].hp, свой = st[кто].hp;
        сыграл(st, кто, 's01', null);
        равно(st[враг].hp, hp0 - 2, 'dmg в героя: ровно 2 (' + кто + ')');
        равно(st[кто].hp, свой, 'dmg в героя: себя не задело (' + кто + ')');
      });
      /* Обещание «Таунт этому не мешает — он держит только атаки». */
      заОбе('таунт НЕ закрывает героя от заклятия', (кто, враг) => {
        const st = стенд();
        поставить(st, враг, 'r02');                        /* Патрульный, ТАУНТ */
        const hp0 = st[враг].hp;
        сыграл(st, кто, 's01', null);
        равно(st[враг].hp, hp0 - 2, 'заклятие прошло сквозь таунт (' + кто + ')');
      });
      /* И обратное обещание: атаку таунт держит. */
      заОбе('таунт закрывает героя от атаки', (кто, враг) => {
        const st = стенд();
        const t = поставить(st, враг, 'r02');
        ок(!rCanAttackTarget(st, кто, { hero: 1 }), 'по герою мимо таунта нельзя (' + кто + ')');
        ок(rCanAttackTarget(st, кто, t), 'по самому таунту можно (' + кто + ')');
        st[враг].board.length = 0;
        ок(rCanAttackTarget(st, кто, { hero: 1 }), 'без таунта по герою можно (' + кто + ')');
      });

      /* --- healHero: «ТВОЕМУ герою, но не выше максимума. Юнитов не лечит» --- */
      заОбе('healHero лечит своего героя и упирается в максимум', (кто, враг) => {
        const st = стенд();
        const u = поставить(st, кто, 'r02'); u.hp = 1;
        st[кто].hp = st[кто].max - 1;
        const чужой = st[враг].hp;
        сыграл(st, кто, 'c09', null);                      /* Меднес, +4 */
        равно(st[кто].hp, st[кто].max, 'healHero: не выше максимума (' + кто + ')');
        равно(u.hp, 1, 'healHero: юнита не лечит (' + кто + ')');
        равно(st[враг].hp, чужой, 'healHero: чужого героя не трогает (' + кто + ')');
      });

      /* --- healAll: «герою И каждому твоему юниту» --- */
      заОбе('healAll лечит и героя, и своих юнитов', (кто, враг) => {
        const st = стенд();
        const свой = поставить(st, кто, 'r02'); свой.hp = 1;
        const чужой = поставить(st, враг, 'r02'); чужой.hp = 1;
        st[кто].hp = 10;
        сыграл(st, кто, 'L06', null);                      /* Веста, +4 всем */
        равно(st[кто].hp, 14, 'healAll: герой получил 4 (' + кто + ')');
        равно(свой.hp, 3, 'healAll: свой юнит вылечен до максимума (' + кто + ')');
        равно(чужой.hp, 1, 'healAll: чужого не лечит (' + кто + ')');
      });

      /* --- draw: «берёшь N карт. Если в руке уже 7 — лишнее сгорает» --- */
      заОбе('draw берёт из своей колоды', (кто, враг) => {
        const st = стенд();
        st[кто].deck = ['r01', 'r02', 'r03', 'r04'];
        const колода = st[кто].deck.length;
        сыграл(st, кто, 's03', null);                      /* Ночной Чайник, +2 */
        равно(st[кто].hand.length, 2, 'draw: в руке 2 карты (' + кто + ')');
        равно(st[кто].deck.length, колода - 2, 'draw: колода уменьшилась на 2 (' + кто + ')');
      });
      заОбе('draw при полной руке сжигает', (кто, враг) => {
        const st = стенд();
        st[кто].deck = ['r01', 'r02', 'r03'];
        st[кто].hand = ['r01', 'r01', 'r01', 'r01', 'r01', 'r01', 'r01'];
        st[кто].mana = 10;
        rDraw(st, кто);
        равно(st[кто].hand.length, 7, 'сгорание: рука не растёт выше 7 (' + кто + ')');
        равно(st[кто].deck.length, 2, 'сгорание: карта всё равно ушла из колоды (' + кто + ')');
        ок(st.ev.some(e => e.t === 'burn'), 'сгорание: событие есть (' + кто + ')');
      });

      /* --- buff: «одному ТВОЕМУ юниту на выбор. Навсегда» --- */
      заОбе('buff усиливает только выбранного своего', (кто, враг) => {
        const st = стенд();
        const a = поставить(st, кто, 'r02'), b = поставить(st, кто, 'r02');
        const c = поставить(st, враг, 'r02');
        сыграл(st, кто, 's05', a);                         /* Гвоздь, +3 к урону */
        равно(a.atk, 2 + 3, 'buff: цель усилена (' + кто + ')');
        равно(b.atk, 2, 'buff: сосед не тронут (' + кто + ')');
        равно(c.atk, 2, 'buff: чужой не тронут (' + кто + ')');
      });
      заОбе('buff без своей цели не играется', (кто, враг) => {
        const st = стенд();
        const р = сыграл(st, кто, 's05', null);
        ок(!р.ok, 'buff без цели отказан (' + кто + ')', JSON.stringify(р));
        равно(st[кто].mana, 10, 'buff без цели: мана не потрачена (' + кто + ')');
      });
      заОбе('buff даёт и жизни, и потолок', (кто, враг) => {
        const st = стенд();
        const a = поставить(st, кто, 'r02');
        сыграл(st, кто, 's06', a);                         /* Осколок, +1/+3 */
        равно(a.hp, 3 + 3, 'buff: жизни выросли (' + кто + ')');
        равно(a.maxhp, 3 + 3, 'buff: максимум вырос вместе с ними (' + кто + ')');
      });

      /* --- buffAll: «каждому твоему юниту на поле» --- */
      заОбе('buffAll задевает всех своих и никого чужого', (кто, враг) => {
        const st = стенд();
        const a = поставить(st, кто, 'r02'), b = поставить(st, кто, 'r01');
        const c = поставить(st, враг, 'r02');
        сыграл(st, кто, 'c02', null);                      /* Румба, +1/+1 всем */
        равно(a.atk, 3, 'buffAll: первый свой (' + кто + ')');
        равно(b.atk, 3, 'buffAll: второй свой (' + кто + ')');
        равно(c.atk, 2, 'buffAll: чужой не тронут (' + кто + ')');
        ок(st[кто].board.every(u => u.hp === u.maxhp),
          'buffAll: жизни и потолок выросли вместе (' + кто + ')');
      });

      /* --- aoe: «КАЖДОМУ юниту врага. Героя не задевает» --- */
      заОбе('aoe бьёт всех чужих юнитов и не трогает героя', (кто, враг) => {
        const st = стенд();
        const a = поставить(st, враг, 'r02'), b = поставить(st, враг, 'r02');
        const свой = поставить(st, кто, 'r02');
        const hp0 = st[враг].hp;
        сыграл(st, кто, 's07', null);                      /* Фонотека, 2 по всем */
        равно(a.hp, 1, 'aoe: первый чужой (' + кто + ')');
        равно(b.hp, 1, 'aoe: второй чужой (' + кто + ')');
        равно(свой.hp, 3, 'aoe: свой не тронут (' + кто + ')');
        равно(st[враг].hp, hp0, 'aoe: чужой герой не тронут (' + кто + ')');
      });

      /* --- weaken: «теряет N урона (не ниже нуля). Жизни не трогает» --- */
      заОбе('weaken срезает урон до нуля и не ниже', (кто, враг) => {
        const st = стенд();
        const a = поставить(st, враг, 'r02');
        const слабый = поставить(st, враг, 'r02'); слабый.atk = 0;
        сыграл(st, кто, 'L04', null);                      /* Люмень, −1 урона */
        равно(a.atk, 1, 'weaken: урон срезан (' + кто + ')');
        равно(слабый.atk, 0, 'weaken: ниже нуля не уходит (' + кто + ')');
        равно(a.hp, 3, 'weaken: жизни не тронуты (' + кто + ')');
      });

      /* --- drain: «вражескому ГЕРОЮ и +N твоему. Цель не выбирается» --- */
      заОбе('drain бьёт только героя и лечит своего', (кто, враг) => {
        const st = стенд();
        const щит = поставить(st, враг, 'r02');
        const hp0 = st[враг].hp;
        st[кто].hp = 10;
        сыграл(st, кто, 's09', null);                      /* Шип Тишины, 6 */
        равно(st[враг].hp, hp0 - 6, 'drain: герой получил 6 (' + кто + ')');
        равно(щит.hp, 3, 'drain: юнита не задело даже под таунтом (' + кто + ')');
        равно(st[кто].hp, 16, 'drain: свой герой вылечен на 6 (' + кто + ')');
      });

      /* --- mana: «+N прямо сейчас, только на этот ход» --- */
      заОбе('mana добавляет ману сверх запаса хода', (кто, враг) => {
        const st = стенд();
        st[кто].mana = 3; st[кто].mmax = 3;
        st[кто].hand = ['zC0'];
        rPlayCard(st, кто, 0, null);                       /* Перезарядка, +1 */
        равно(st[кто].mana, 4, 'mana: стало на 1 больше (' + кто + ')');
        равно(st[кто].mmax, 3, 'mana: запас хода не вырос (' + кто + ')');
      });

      /* --- ключевые слова --- */
      ок(mkUnit(byId('r01')).sick && !mkUnit(byId('r01')).canAtk,
        'без РАША юнит ходит только со следующего хода');
      ок(mkUnit(byId('r06')).canAtk, 'РАШ: атакует в тот же ход');
      ок(mkUnit(byId('r02')).taunt, 'ТАУНТ: метка стоит');

      /* --- поле на пятерых --- */
      {
        const st = стенд();
        for (let i = 0; i < 5; i++) поставить(st, 'p', 'r01');
        const р = сыграл(st, 'p', 'r01', null);
        ок(!р.ok, 'шестой юнит на поле не встаёт', JSON.stringify(р));
      }

      /* --- ряд не разъезжается, пока падают клетки ---
         Пустые клетки считались по ЖИВЫМ юнитам, а в ряду при этом ещё висят
         узлы падающих: ячеек становилось больше пяти, ряд расползался шире
         соседнего и живые клетки съезжали в сторону. Видно было в размене. */
      {
        dropBattleSnap(); startBattle(4);
        B.p.hand = []; B.e.hand = [];
        const св = [], вр = [];
        for (let i = 0; i < 4; i++) { const u = mkUnit(byId('r02')); B.p.board.push(u); св.push(u) }
        for (let i = 0; i < 2; i++) { const u = mkUnit(byId('r06')); u.canAtk = true; u.sick = false; B.e.board.push(u); вр.push(u) }
        B.ev.length = 0; renderBattle();
        равно(document.getElementById('rowP').children.length, 5, 'ряд: пять ячеек до размена');
        B.ev.length = 0;
        rAttack(B, 'e', вр[0], св[0]);
        rAttack(B, 'e', вр[1], св[1]);
        renderBattle();
        равно(document.getElementById('rowP').children.length, 5,
          'ряд: пять ячеек и посреди размена, пока падение не показано');
        ок(B.p.board.length === 2, 'правила убрали павших с доски сразу', B.p.board.length);
        B = null; чисто();
      }

      /* --- поле вокруг арта того же цвета, что подложка самих артов ---
         У всех артов верхний ряд пикселей = 0,0,0 (замерено по файлам).
         Карта заливает поле вокруг картинки своим цветом, и стоило там
         оказаться #0b0b11, как расхождения в 17 по синему хватало на еле
         заметную рамку вокруг арта. Держим ноль. */
      {
        const к = document.createElement('div');
        к.style.cssText = 'position:fixed;left:-9999px;width:200px';
        к.innerHTML = cardHTML(byId('r05'), { open: 1, noAnim: 1 });
        document.body.appendChild(к);
        const арт = к.querySelector('.cfArtImg');
        равно(арт ? getComputedStyle(арт).backgroundColor : 'нет узла', 'rgb(0, 0, 0)',
          'поле вокруг арта — чистый чёрный, как подложка картинок');
        к.remove();
      }

      /* --- ни одна карта не осталась без описания --- */
      for (const c of CARDS) {
        const т = тихо(() => effDesc(c).replace(/<[^>]+>/g, '').trim());
        ок(typeof т === 'string' && т.length > 10, 'есть описание: ' + c.n, т);
        if (c.eff && (c.eff.k === 'dmg' || c.eff.k === 'aoe' || c.eff.k === 'drain'
                   || c.eff.k === 'healHero' || c.eff.k === 'healAll' || c.eff.k === 'mana'))
          ок(т.includes(String(c.eff.v)), 'в описании стоит число ' + c.eff.v + ': ' + c.n, т);
        ок(!!c.fl && c.fl.length > 3, 'есть флейвор: ' + c.n, c.fl);
      }
      чисто();

    } catch (e) {
      провалы.push({ группа: текущий, что: 'ИСКЛЮЧЕНИЕ', детали: e.message + ' | ' + (e.stack || '').split('\n')[1] });
    }

    console.error = старыйError;
    if (сейв !== null) localStorage.setItem('bbduel', сейв);
    чисто();

    if (пройдено.length !== ВСЕГО_ГРУПП)
      провалы.push({ группа: 'прогон', что: 'прогон оборвался: групп ' + пройдено.length +
        ' из ' + ВСЕГО_ГРУПП, детали: 'дошли: ' + пройдено.join(', ') });

    return {
      всего, групп: пройдено.length + '/' + ВСЕГО_ГРУПП,
      прошло: всего - провалы.length, упало: провалы.length,
      ошибкаНаСтранице: упало,
      ошибкиКонсоли: ошибкиКонсоли.slice(0, 8),
      провалы
    };
  };
  return 'тесты загружены — зови __тесты()';
})();
