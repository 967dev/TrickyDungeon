/* 10-rules.js — ПРАВИЛА боя. Здесь нет ни одного обращения к DOM.

   Часть скрипта, разрезанного из одного файла. ПОРЯДОК ПОДКЛЮЧЕНИЯ В
   index.html ЗНАЧИМ: это обычные скрипты, они выполняются подряд.

   ================= зачем этот файл существует =================

   Раньше правила и подача были одним кодом: `dealDamage` отнимал здоровье и
   тут же ждал анимацию смерти, `aiTurn` вперемешку решал и показывал. Из
   этого следовали три беды, и все три уже случились:

   1. Баланс мерить было нечем. Сотни боёв через `await` не прогнать, поэтому
      замеры в BACKLOG.md сделаны ПЕРЕПИСАННОЙ моделью, а не игрой. К каждой
      таблице там пришлось приписать «форме доверять можно, числам — с
      поправкой».
   2. Одно правило жило в двух местах. Ход игрока применял эффекты карт в
      `playerEff`, ход врага — в `aiSpell`, отдельным списком веток. Они
      разошлись: у врага не было ветки `mana` (карта тратилась впустую), а
      `healAll` не лечил ему героя, хотя на карте написано «герою и всем
      своим».
   3. Проверить правило можно было только глазами.

   ================= договор =================

   Правила меняют состояние и складывают в `st.ev` СОБЫТИЯ — что именно
   произошло. Ни одно событие не несёт разметки, координат и текста: только
   факт и числа. Текст журнала собирает подача (`evText` в 11-battle.js), она
   же решает, чем это анимировать.

   Отсюда простое правило на будущее: **если в этот файл захотелось написать
   `document`, `$`, `sfx`, `await` или строку для игрока — оно не сюда.**

   Состояние `B` — тот же объект, что и был, плюс `ev`. Юниты хранят ссылку
   на карту (`u.card`), поэтому события можно нести ссылками, а не копиями:
   подача читает их сразу же, до следующего хода. */

/* Состояние боя и счётчик клеток живут здесь, а не в подаче: это данные
   правил. Подача берёт их отсюда — файлы делят одни глобали, это не модули. */
let B=null, UID=1;

/* Единственный вход для «что сейчас произошло». */
function выдать(st,e){ if(st&&st.ev)st.ev.push(e); return e }

function mkUnit(card){
  const rush=!!(card.kw&&card.kw.includes('rush'));
  /* canAtk:rush — иначе РАШ не работает вовсе. Юнит создавался с canAtk:false,
     и обе проверки атаки (перетаскивание в onDragUp и тап в onUnitTap) первым
     делом требуют canAtk — так что «атакует в тот же ход» не срабатывало ни
     разу, хотя обещано на шести картах и в справке.
     sick при этом остаётся true: юнит действительно только что вышел, на этом
     держится значок РАШ на портрете (u.rush && u.sick) и тусклая рамка. */
  return{uid:UID++,card,atk:card.a||0,hp:card.h||0,maxhp:card.h||0,
    taunt:!!(card.kw&&card.kw.includes('taunt')),rush,
    canAtk:rush,sick:true}}

/* ================= цели =================
   Единственное место, где решается, законна ли цель. Раньше это решали три
   разных обработчика вразнобой, и каждый ошибался по-своему:
   — тап по вражескому ЮНИТУ заклятием «на своего» усиливал юнита ВРАГА
     (Гвоздь-Счастливчик делал вражеского 2/3 пятёркой за твою ману);
   — тап по вражескому ГЕРОЮ тем же заклятием съедал карту вхолостую;
   — тап по СВОЕМУ юниту заклятием урона бил по своему же, хотя текст карты
     обещает «вражеский юнит или вражеский герой», да ещё и проводил урон с
     чужой стороной ('e'), что при летальном уроне рассинхронит доски.
   side: 'p' — свой юнит, 'e' — вражеский, 'hero' — вражеский герой. */
function needTargetCard(c){return !!(c.eff&&(c.eff.tg==='any'||c.eff.tg==='ally'))}
function canTarget(c,side){
  const tg=c&&c.eff&&c.eff.tg;
  if(!tg)return false;
  if(tg==='ally')return side==='p';
  if(tg==='any')return side==='e'||side==='hero';
  return false;
}

/* ================= сценарий тренировки =================
   Рука, колода и каждый ход врага заданы заранее. Иначе обучение невозможно
   вести по шагам: подсказка «сыграй Гончую» бессмысленна, если Гончей в руке
   не оказалось, а «атакуй его юнита» — если враг ничего не выставил.
   Расклад подобран так, чтобы по дороге встретились ТАУНТ, РАШ, боевой клич,
   заклятие, размен и удар в лицо. */
const TRAIN={
  hand:['zC0','r01','r06','s01','r04'],     /* Перезарядка, Гончая, Стрелок(РАШ), Искра, Курсант */
  deck:['r03','r08','s02','r02','r07','r05','r04','r01'],
  /* Ходы врага по номеру его хода. play — что выставляет, face — урон в лицо
     игроку (эмулируем атаку, не завися от того, что стоит на доске). */
  script:[
    {play:'r02'},                            /* 1: Патрульный 2/3 ТАУНТ — стена */
    {play:'r01',face:2},                     /* 2: Гончая 2/1 и щелчок по герою */
    {face:3},                                /* 3: просто бьёт */
    {}                                       /* дальше ничего — бой уже кончится */
  ]
};

/* ================= создание боя =================
   Возвращает готовое состояние. Экран, портрет врага и обработчики кнопок —
   забота подачи: она зовёт это и дальше сама. */
function newBattle(si,колодаИгрока){
  const st=STAGES[si];
  const pool=CARDS.filter(c=>!c.noColl&&c.t<=st.pool&&(c.ty==='u'||c.ty==='s'));
  const aiDeck=[];
  while(aiDeck.length<20){const c=pick(pool);if(aiDeck.filter(x=>x===c.id).length<2)aiDeck.push(c.id)}
  const B2={si,st,phase:'player',over:false,train:!!st.tutorial,eTurn:0,log:[],turnNo:0,ev:[],
    skill:clamp(.15+si*.09,0,1), /* 0.15 на первом рейде → 0.96 на финале */
    p:{hp:30,max:30,mana:0,mmax:0,
       deck:st.tutorial?[...TRAIN.deck].reverse():shuffle([...(колодаИгрока||[])]),
       hand:[],board:[],fatigue:0},
    e:{hp:st.hp,max:st.hp,mana:0,mmax:0,deck:st.tutorial?[]:shuffle(aiDeck),hand:[],board:[],fatigue:0},
    sel:null};
  if(B2.train){B2.p.hand=[...TRAIN.hand];return B2}
  for(let i=0;i<3;i++)rDraw(B2,'p');
  /* Рука из одних дорогих карт — это два-три хода бездействия на старте.
     Меняем худшую на первую дешёвую из колоды. */
  if(B2.p.hand.every(id=>byId(id).c>2)){
    const cheapIdx=B2.p.deck.findIndex(id=>byId(id).c<=2);
    if(cheapIdx>=0){
      let worst=0;B2.p.hand.forEach((id,i)=>{if(byId(id).c>byId(B2.p.hand[worst]).c)worst=i});
      const removed=B2.p.hand[worst];
      B2.p.hand[worst]=B2.p.deck[cheapIdx];
      B2.p.deck[cheapIdx]=removed;
    }
  }
  B2.p.hand.push('zC0');
  for(let i=0;i<4;i++)rDraw(B2,'e');
  B2.ev.length=0;   /* раздача — не событие боя, показывать нечего */
  return B2;
}

/* ================= элементарные правила ================= */
function rOver(st,win,forfeit){
  if(!st||st.over)return;
  st.over=true;
  выдать(st,{t:'over',win:!!win,forfeit:!!forfeit});
}

function rDraw(st,who){
  const P=st[who];
  if(!P.deck.length){
    /* В обучении колоды у врага нет ПО ЗАМЫСЛУ: его ходы расписаны сценарием.
       Усталость там не игровое событие, а побочный эффект пустого массива —
       она молча съедала врагу 1, 2, 3 здоровья за ход и в итоге выигрывала
       бой за игрока, попутно засоряя журнал понятием, которому обучение ещё
       не научило. */
    if(st.train&&who==='e')return null;
    P.fatigue++;
    выдать(st,{t:'fatigue',who,v:P.fatigue});
    rHeroDmg(st,who,P.fatigue);
    return null;
  }
  const id=P.deck.pop();
  if(P.hand.length>=7){выдать(st,{t:'burn',who,id});return null}
  P.hand.push(id);
  выдать(st,{t:'draw',who,id});
  return id;
}

function rHeroDmg(st,who,v){
  const P=st[who];
  P.hp=Math.max(0,P.hp-v);
  выдать(st,{t:'dmgHero',who,v});
  if(P.hp<=0)rOver(st,who==='e');
}

function rHeroHeal(st,who,v){
  const P=st[who];
  P.hp=Math.min(P.max,P.hp+v);
  выдать(st,{t:'healHero',who,v});
}

/* Урон по клетке. Мёртвого убираем с доски ЗДЕСЬ же: правила не имеют права
   оставлять на поле того, кого уже нет, ради красоты падения. Подача держит
   узел на экране сама — по событию 'die' (см. СМЕРТИ_ЖДУТ в 11-battle.js). */
function rUnitDmg(st,side,u,v){
  u.hp-=v;
  выдать(st,{t:'dmgUnit',side,u,v});
  if(u.hp<=0){
    выдать(st,{t:'die',side,u});
    const arr=st[side].board,i=arr.indexOf(u);
    if(i>=0)arr.splice(i,1);
  }
}

/* ================= эффекты карт =================
   ОДИН список веток на обе стороны. Раньше их было два — `playerEff` и
   `aiSpell`, — и они разошлись: у врага не было ветки `mana` (карта тратилась
   впустую) и `healAll` не лечил ему героя, хотя на карте написано «герою и
   всем своим». Расхождение такого рода не ловится ни тестом, ни глазом: обе
   половины по отдельности выглядят правильно.
   who — кто играет карту, tgt — выбранная цель (юнит) или null. */
function rEffect(st,who,c,tgt){
  const e=c&&c.eff;if(!e)return;
  const foe=who==='p'?'e':'p';
  const P=st[who],E=st[foe];
  switch(e.k){
    case 'mana':
      P.mana=Math.min(10,P.mana+e.v);
      выдать(st,{t:'eff',who,c,k:'mana',v:e.v});
      break;
    case 'dmg':
      выдать(st,{t:'eff',who,c,k:'dmg',v:e.v,tgt:tgt||null});
      if(tgt)rUnitDmg(st,foe,tgt,e.v);else rHeroDmg(st,foe,e.v);
      break;
    case 'healHero':
      выдать(st,{t:'eff',who,c,k:'healHero',v:e.v});
      rHeroHeal(st,who,e.v);
      break;
    case 'healAll':
      выдать(st,{t:'eff',who,c,k:'healAll',v:e.v});
      rHeroHeal(st,who,e.v);
      for(const u of P.board)u.hp=Math.min(u.maxhp,u.hp+e.v);
      break;
    case 'draw':
      выдать(st,{t:'eff',who,c,k:'draw',v:e.v});
      for(let k=0;k<e.v;k++)rDraw(st,who);
      break;
    case 'buff':
      if(tgt){
        выдать(st,{t:'eff',who,c,k:'buff',a:e.a||0,h:e.h||0,tgt});
        tgt.atk+=e.a||0;tgt.hp+=e.h||0;tgt.maxhp+=e.h||0;tgt.buffed=1;
      }
      break;
    case 'buffAll':
      выдать(st,{t:'eff',who,c,k:'buffAll',a:e.a||0,h:e.h||0});
      for(const u of P.board){u.atk+=e.a||0;u.hp+=e.h||0;u.maxhp+=e.h||0;u.buffed=1}
      break;
    case 'aoe':
      выдать(st,{t:'eff',who,c,k:'aoe',v:e.v});
      for(const u of [...E.board])rUnitDmg(st,foe,u,e.v);
      break;
    case 'weaken':
      выдать(st,{t:'eff',who,c,k:'weaken',v:e.v});
      for(const u of E.board)u.atk=Math.max(0,u.atk-e.v);
      break;
    case 'drain':
      выдать(st,{t:'eff',who,c,k:'drain',v:e.v,tgt:tgt||null});
      if(tgt)rUnitDmg(st,foe,tgt,e.v);else rHeroDmg(st,foe,e.v);
      rHeroHeal(st,who,e.v);
      break;
  }
}

/* ================= розыгрыш карты =================
   Возвращает {ok:true} или {ok:false,why}. Почему отказ — решают правила,
   а какими словами это сказать игроку — подача: правила про тосты не знают. */
function rPlayCard(st,who,i,tgt){
  const P=st[who],id=P.hand[i],c=byId(id);
  if(!c)return{ok:false,why:'нет карты'};
  if(c.ty==='u'&&P.board.length>=5)return{ok:false,why:'поле полно'};
  if(c.c>P.mana)return{ok:false,why:'мало маны'};
  /* Последний рубеж: карта, которой нужна цель на своём юните, без цели
     просто исчезала бы вместе с маной — эффект-то не к чему применять. */
  if(c.eff&&c.eff.tg==='ally'&&!(tgt&&P.board.includes(tgt)))
    return{ok:false,why:'нужен свой юнит'};
  P.mana-=c.c;P.hand.splice(i,1);
  выдать(st,{t:'play',who,i,c,tgt:tgt||null});
  if(c.ty==='u'){
    const u=mkUnit(c);P.board.push(u);
    выдать(st,{t:'summon',who,u});
    if(c.eff)rEffect(st,who,c,tgt);
  }else rEffect(st,who,c,tgt);
  return{ok:true};
}

/* ================= удар =================
   tgt — юнит или {hero:1}. Ответка бьёт даже если цель погибла: так было
   всегда, и на этом держится размен «оба падают». */
function rAttack(st,side,u,tgt){
  const foe=side==='p'?'e':'p';
  const back=tgt.hero?0:(tgt.atk||0);
  выдать(st,{t:'atk',side,u,tgt,v:u.atk,back});
  if(tgt.hero){rHeroDmg(st,foe,u.atk);return}
  rUnitDmg(st,foe,tgt,u.atk);
  if(back>0)rUnitDmg(st,side,u,back);
}

/* Законна ли атака по этой цели. Таунт — единственное ограничение. */
function rCanAttackTarget(st,side,tgt){
  const foe=side==='p'?'e':'p';
  const taunts=st[foe].board.filter(x=>x.taunt);
  if(!taunts.length)return true;
  return !tgt.hero&&taunts.includes(tgt);
}

/* ================= ход =================
   Возвращает false, если ход начать не удалось: бой мог закончиться прямо
   внутри — пустая колода бьёт усталостью, и она добивает. Дальше идти нельзя,
   иначе мёртвому бою назначается фаза и запирается поле. */
function rStartTurn(st,who){
  if(!st||st.over)return false;
  const P=st[who];
  P.mmax=Math.min(10,P.mmax+1);P.mana=P.mmax;
  if(who==='p')st.turnNo=(st.turnNo||0)+1;
  st.seq=(st.seq||0)+1;
  выдать(st,{t:'turn',who,no:st.turnNo||1});
  for(const u of P.board){u.canAtk=true;u.sick=false}
  rDraw(st,who);
  if(st.over)return false;
  st.phase=who;st.sel=null;
  return true;
}

/* ================= ИИ =================
   Решения ИИ — тоже правила: они не зависят ни от одного пикселя. Куда именно
   полетит карта на экране, подача считает отдельно, по выбранной здесь цели. */
function aiSpellTarget(st,c){
  const e=c&&c.eff;if(!e)return null;
  const P=st.p,E=st.e;
  if(e.k==='dmg'||e.k==='drain')
    return P.board.filter(x=>x.hp<=e.v).sort((a,b)=>b.atk-a.atk)[0]||P.board[0]||null;
  if(e.k==='buff')return E.board[0]||null;
  return null;
}

/* Весь ход врага целиком, синхронно. `skill` растёт по этапам: ранние враги
   мешкают и играют что попало, финальные — идеальную кривую. */
function rAiTurn(st){
  if(st.train)return rTrainEnemyTurn(st);
  const E=st.e,P=st.p,sk=st.skill;
  const lazy=Math.random()<(1-sk)*.35;
  const tradeP=.25+.55*sk;
  let guard=0,played=0;
  while(!st.over&&guard++<12){
    if(lazy&&played>=1)break;
    /* Условие board.length<5 стоит на ВСЕХ картах, не только на юнитах: с
       полной доской враг не играет вообще ничего. Так было с самого начала,
       и на этом посчитан весь баланс — не трогаем заодно с перекладкой. */
    const cands=E.hand.map((id,i)=>({id,i,c:byId(id)}))
      .filter(x=>x.c.c<=E.mana&&E.board.length<5);
    if(!cands.length)break;
    const idx=Math.random()<sk?cands.sort((a,b)=>b.c.c-a.c.c)[0]:pick(cands);
    const c=idx.c;played++;
    const tgt=c.eff?aiSpellTarget(st,c):null;
    E.mana-=c.c;E.hand.splice(idx.i,1);
    выдать(st,{t:'play',who:'e',i:idx.i,c,tgt});
    if(c.ty==='u'){
      const u=mkUnit(c);E.board.push(u);
      выдать(st,{t:'summon',who:'e',u});
      if(c.eff)rEffect(st,'e',c,tgt);
    }else rEffect(st,'e',c,tgt);
  }
  guard=0;
  while(!st.over&&guard++<14){
    const atk=E.board.filter(u=>u.canAtk&&u.atk>0);
    if(!atk.length)break;
    const u=atk[0];
    const taunts=P.board.filter(x=>x.taunt);
    const totalAtk=E.board.reduce((s,x)=>s+(x.canAtk?x.atk:0),0);
    const lethal=!taunts.length&&totalAtk>=P.hp;
    let tgt=null;
    if(taunts.length)tgt=taunts.sort((a,b)=>a.hp-b.hp)[0];
    else{
      const victim=P.board.filter(x=>x.hp<=u.atk&&x.atk<=u.hp).sort((a,b)=>b.atk-a.atk)[0];
      if(sk>.45&&lethal)tgt={hero:1};
      else if(victim&&Math.random()<tradeP)tgt=victim;
      else tgt={hero:1};
    }
    u.canAtk=false;
    rAttack(st,'e',u,tgt);
  }
}

/* Ход врага в тренировке: строго по списку, без ИИ и без случайности.
   Сценарий задаёт УРОН в лицо, а бьёт им тот, кто стоит на доске: раньше
   здоровье просто убывало без источника, и это читалось как чужое событие. */
function rTrainEnemyTurn(st){
  const step=TRAIN.script[st.eTurn++]||{};
  if(step.play&&st.e.board.length<5){
    const c=byId(step.play);
    if(c){
      выдать(st,{t:'play',who:'e',i:-1,c,tgt:null,scripted:1});
      const u=mkUnit(c);st.e.board.push(u);
      выдать(st,{t:'summon',who:'e',u});
    }
  }
  if(step.face){
    const бьющий=st.e.board.find(u=>u.atk>0)||st.e.board[0]||null;
    выдать(st,{t:'atk',side:'e',u:бьющий,tgt:{hero:1},v:step.face,back:0,scripted:1});
    rHeroDmg(st,'p',step.face);
  }
}

/* ================= прогон без экрана =================
   То, ради чего всё это и разводилось: настоящие правила, прогнанные сотнями
   боёв за секунды. Замеры баланса в BACKLOG.md сделаны переписанной моделью
   именно потому, что раньше так было нельзя.
   политика(st) — что делает игрок в свой ход; по умолчанию тот же ИИ, только
   с зеркальной стороны, чтобы можно было мерить сам этап.
   Возвращает {win, turns, st}. */
function simulate(si,колода,политика,предел){
  const st=newBattle(si,колода);
  if(st.train)return{win:true,turns:0,st};
  let ходов=0;
  const лимит=предел||60;
  rStartTurn(st,'p');
  while(!st.over&&ходов++<лимит){
    st.ev.length=0;
    if(st.phase==='p'){
      (политика||simplePolicy)(st);
      if(st.over)break;
      st.phase='wait';st.seq=(st.seq||0)+1;
      if(!rStartTurn(st,'e'))break;
      rAiTurn(st);
      if(st.over)break;
      if(!rStartTurn(st,'p'))break;
    }else break;
  }
  return{win:!!(st.over&&st.e.hp<=0),turns:ходов,st};
}

/* Простейший игрок: играет самое дорогое из доступного, бьёт таунты, иначе
   в лицо. Топорно и честно — той же топорностью, что и симулятор из BACKLOG. */
function simplePolicy(st){
  const P=st.p,E=st.e;
  let guard=0;
  while(!st.over&&guard++<12){
    const cands=P.hand.map((id,i)=>({i,c:byId(id)}))
      .filter(x=>x.c.c<=P.mana&&!(x.c.ty==='u'&&P.board.length>=5))
      .filter(x=>!(x.c.eff&&x.c.eff.tg==='ally'&&!P.board.length))
      .sort((a,b)=>b.c.c-a.c.c);
    if(!cands.length)break;
    const x=cands[0];
    const tg=x.c.eff&&x.c.eff.tg;
    const tgt=tg==='ally'?P.board[0]:(tg==='any'?(E.board[0]||null):null);
    if(!rPlayCard(st,'p',x.i,tgt).ok)break;
  }
  guard=0;
  while(!st.over&&guard++<14){
    const u=P.board.filter(x=>x.canAtk&&x.atk>0&&(!x.sick||x.rush))[0];
    if(!u)break;
    const taunts=E.board.filter(x=>x.taunt);
    const tgt=taunts.length?taunts[0]:{hero:1};
    u.canAtk=false;
    rAttack(st,'p',u,tgt);
  }
}
