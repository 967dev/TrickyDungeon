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
  const жди = ms => new Promise(r => setTimeout(r, ms));

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
    dropBattleSnap();
    startBattle(этап);
    const старт = performance.now();
    while (B && !B.over) {
      if (performance.now() - старт > предел) return { завис: true };
      if (B.phase === 'p' && !document.getElementById('bEnd').disabled) endTurn();
      await жди(120);
    }
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
      текущий = 'загрузка';
      /* Объявленные через function попадают на window, объявленные через
         const — нет. Проверяем то и другое одинаково, через сам идентификатор. */
      for (const имя of ['go','save','load','startBattle','renderBattle','endTurn','playCard',
        'doAttack','dealDamage','damageHero','aiTurn','aiSpell','blog','openLog','openInspector',
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
      ок(document.querySelectorAll('script[src^="js/"]').length === 13, 'подключено 13 файлов скрипта',
        document.querySelectorAll('script[src^="js/"]').length);

      /* ============ 2. данные карт ============ */
      текущий = 'данные карт';
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
      текущий = 'сохранение';
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
      текущий = 'экраны';
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
      текущий = 'колода';
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
      текущий = 'крутки';
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
      текущий = 'промокоды';
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
      текущий = 'правила боя';
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
      текущий = 'эффекты карт';
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
      текущий = 'журнал боя';
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
      текущий = 'бои целиком';
      for (const этап of [0, 1, 5, 9, 10]) {
        начать();
        const р = await отыграть(этап);
        ок(!р.завис, 'этап ' + этап + ': бой завершился', JSON.stringify(р));
        if (р.завис) continue;
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
      текущий = 'чат и сюжет';
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
      текущий = 'настройки';
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
      текущий = 'обучение';
      начать();
      const тр = await отыграть(0, 60000);
      ок(!тр.завис, 'тренировка доигрывается', JSON.stringify(тр));
      чисто();

    } catch (e) {
      провалы.push({ группа: текущий, что: 'ИСКЛЮЧЕНИЕ', детали: e.message + ' | ' + (e.stack || '').split('\n')[1] });
    }

    console.error = старыйError;
    if (сейв !== null) localStorage.setItem('bbduel', сейв);
    чисто();

    return {
      всего, прошло: всего - провалы.length, упало: провалы.length,
      ошибкаНаСтранице: упало,
      ошибкиКонсоли: ошибкиКонсоли.slice(0, 8),
      провалы
    };
  };
  return 'тесты загружены — зови __тесты()';
})();
