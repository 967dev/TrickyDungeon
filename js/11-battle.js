/* 11-battle.js — ПОДАЧА боя: анимации, журнал, инспектор, перетаскивание, отрисовка

   Часть скрипта, разрезанного из одного файла. ПОРЯДОК ПОДКЛЮЧЕНИЯ В
   index.html ЗНАЧИМ: это обычные скрипты, они выполняются подряд, и вместе
   дают ровно тот же порядок, что был в одном файле.

   Из этого следует ограничение: код, выполняющийся ПРИ ЗАГРУЗКЕ, не может
   звать функцию, объявленную в файле ниже — всплытие работает внутри одного
   скрипта, но не между ними. На момент разрезания таких обращений не было ни
   одного. Проверять при переносах.

   Глобали общие на все файлы: это не модули. Перевод на модули — отдельный
   шаг, он меняет семантику и ломает инструменты, которые водят игру через
   те же глобали. */

/* ================= БОЙ ================= */
let DRAG=null,suppressClick=false,holdFired=false;
document.addEventListener('click',e=>{
  if(suppressClick){e.stopPropagation();e.preventDefault();suppressClick=false}},true);
/* ================= снапшот боя =================
   Прогресс по рейдам лежит в основном сейве, а сам бой жил только в памяти:
   перезагрузка страницы его теряла. В браузере это мелочь, в Telegram — нет,
   webview выгружается при сворачивании.
   Снимок делается только в фазе игрока: восстанавливаться всегда в чистый
   свой ход проще и честнее, чем пытаться доиграть прерванный ход бота. Если
   приложение убили посреди хода врага, бот отыграет его заново.
   Юниты на поле хранят ссылку на объект карты — в снапшот кладём id и
   поднимаем обратно через byId. */
const BSNAP='bbduel_battle';
function snapBattle(){
  if(!B||B.over||B.phase!=='p')return;
  /* Посреди рассказа снимать нечего: состояние уже конечное, а на экране —
     ещё нет. Снимок сделается сразу после, отрисовкой в конце показа. */
  if(ИДЁТ||(B.ev&&B.ev.length))return;
  /* Незакрытый залп стихии снимать нельзя: восстановленный бой откроется без
     запроса цели, а ход будет заперт навсегда. */
  if(B.pend)return;
  /* Тренировку не сохраняем: в снимке нет ни номера шага, ни позиции в
     сценарии врага, и восстановление вернуло бы игрока в сценарный бой без
     ведущего — тупик. Прерванная тренировка просто начинается заново. */
  if(B.train){dropBattleSnap();return}
  const side=P=>({hp:P.hp,max:P.max,mana:P.mana,mmax:P.mmax,fatigue:P.fatigue,
    deck:P.deck,hand:P.hand,
    chain:P.chain||{el:null,n:0},ward:P.ward?1:0,manaPen:P.manaPen||0,
    board:P.board.map(u=>({id:u.card.id,uid:u.uid,atk:u.atk,hp:u.hp,maxhp:u.maxhp,
      taunt:u.taunt?1:0,rush:u.rush?1:0,canAtk:u.canAtk?1:0,sick:u.sick?1:0,buffed:u.buffed?1:0,
      imm:u.imm?1:0}))});
  try{store.setLocal(BSNAP,JSON.stringify(
    {v:1,si:B.si,skill:B.skill,uid:UID,p:side(B.p),e:side(B.e)}))}catch(e){}
}
function dropBattleSnap(){store.del(BSNAP)}
function restoreBattle(){
  lockUI(0);
  let d=null;
  try{d=JSON.parse(store.get(BSNAP)||'null')}catch(e){}
  if(!d||d.v!==1)return false;
  const st=STAGES[d.si];
  /* Снимок из другой версии игры: этап исчез или карты переименовали.
     Молча выкидываем — лучше начать бой заново, чем упасть на рендере. */
  if(!st){dropBattleSnap();return false}
  const side=x=>({hp:x.hp|0,max:x.max|0,mana:x.mana|0,mmax:x.mmax|0,fatigue:x.fatigue|0,
    deck:(x.deck||[]).filter(byId),hand:(x.hand||[]).filter(byId),
    /* Снимок старой версии полей цепочки не знает — восстановится с пустым
       набором, что честно: чего не было записано, того и не было. */
    chain:{el:(x.chain&&x.chain.el)||null,n:(x.chain&&x.chain.n)|0},
    ward:x.ward?1:0,manaPen:x.manaPen|0,
    board:(x.board||[]).map(u=>{const card=byId(u.id);if(!card)return null;
      return{uid:u.uid,card,atk:u.atk|0,hp:u.hp|0,maxhp:u.maxhp|0,
        taunt:!!u.taunt,rush:!!u.rush,canAtk:!!u.canAtk,sick:!!u.sick,buffed:u.buffed?1:0,
        imm:u.imm?1:0}})
      .filter(Boolean)});
  const P=side(d.p),E=side(d.e);
  if(P.hp<=0||E.hp<=0){dropBattleSnap();return false}
  clearFeed();
  B={si:d.si,st,phase:'p',over:false,skill:d.skill,p:P,e:E,sel:null,log:[],turnNo:0,ev:[],pend:null};
  blog('sys','— бой восстановлен —','turn');
  /* Иначе следующий призванный юнит получит uid уже занятый на поле. */
  UID=Math.max(UID,(d.uid|0)+1);
  go('battle');
  dressBattle(st);
  $('#bEnd').onclick=endTurn;
  $('#bEnd').disabled=false;
  $('#bGiveUp').onclick=askGiveUp;
  $('#bLogBtn').onclick=openLog;
  renderBattle();
  toast('Бой восстановлен');
  return true;
}

/* Оформление экрана боя — портрет врага, силуэты, кристаллы. Вынесено из
   startBattle, потому что то же самое нужно при восстановлении боя из
   снапшота, где новое состояние не создаётся. */
/* Сдача необратима и стоит игроку рейда, поэтому спрашиваем. Оверлей
   переиспользует классы панели результата, чтобы не плодить стилей. */
function askGiveUp(){
  if(!B||B.over)return;
  if(document.querySelector('.bResult'))return;      /* бой уже кончился */
  sfx.ui();
  const box=document.createElement('div');box.className='bResult';
  box.innerHTML=`<div class="bResBox">
    <div class="bResT lose">СДАТЬСЯ?</div>
    <div class="bResS">${B.st.n} · рейд засчитается как проигранный, <b>награды не будет</b></div>
    <div class="bResB">
      <button class="btn" id="guYes">ДА, ОТСТУПАЮ</button>
      <button class="btn pri" id="guNo">ДЕРЖИМСЯ!</button>
    </div></div>`;
  document.body.appendChild(box);
  box.querySelector('#guNo').onclick=()=>{sfx.ui();box.remove()};
  box.querySelector('#guYes').onclick=()=>{box.remove();finish(false,true)};
}
/* Задник боя по герою. Только для боёв первого акта: у тренировки свой
   учебный вид, и подменять его сценой из сюжета незачем. */
const BATTLE_BG={f:'art/story/scene1.webp',m:'art/story/boy4.webp'};
function setBattleBg(si){
  const bg=$('#bBg'),field=$('#bField');
  if(!bg||!field)return;
  /* Запасной фон, если герой почему-то не выбран. BATTLE_BG[null] — undefined,
     и бой молча оставался без задника: голая сетка с полосами, то есть ровно
     вид тренировки, где задника нет по замыслу. В обычной игре герой к рейдам
     всегда выбран, но цена страховки — один || . */
  const src=(si>0)&&(BATTLE_BG[S.hero]||BATTLE_BG.f);
  if(src){bg.style.backgroundImage=`url(${src})`;field.classList.add('hasBg')}
  else{bg.style.backgroundImage='';field.classList.remove('hasBg')}
}
function dressBattle(st){
  setBattleBg(B?B.si:0);
  $('#eName').textContent=st.n.toUpperCase();
  $('#eIc').innerHTML=svgWrap(EMB[st.ic]||EMB.skull);
  $('#eIc').style.borderColor=st.boss?'#ff3355':'#2c2c38';
  $('#silP').innerHTML=SIL.aya;
  { const n=$('#pName'); if(n)n.textContent=(S.name||'ТЫ').toUpperCase(); }
  setMood('calm');
  const variant=st.boss?'boss':(st.ic==='ghost'?'wraith':'thug');
  $('#silE').innerHTML=SIL[variant];
  $('#silEO').classList.toggle('boss',!!st.boss);
  const cry=$('#bCry');cry.innerHTML='';
  sprinkleCrystals(cry,5,['#ffd52e','#35f0ff','#ff4fd8']);
}

/* Заводка боя: состояние собирают правила, здесь — экран и обработчики. */
function startBattle(si){
  dropBattleSnap();lockUI(0);clearFeed();
  B=newBattle(si,S.deck);
  go('battle');
  dressBattle(B.st);
  $('#bEnd').onclick=endTurn;
  $('#bEnd').disabled=false;
  $('#bGiveUp').onclick=askGiveUp;
  $('#bLogBtn').onclick=openLog;
  renderBattle();
  turnBanner(B.train?'ТРЕНИРОВКА':'ТВОЙ ХОД!');
  /* Отложенный вызов привязан к СВОЕМУ бою. Иначе он переживает конец боя и
     заход в следующий и срабатывает уже по чужому B — игрок получает лишний
     ход подряд, в журнале «ХОД 1 · ТЫ» сразу за «ХОД 2 · ТЫ». Раньше от этого
     спасались паузой в 900мс перед новым боем, то есть надеждой. */
  const бой=B;
  позже(()=>{if(B!==бой)return;startTurn('p');if(B.train)startTraining()},600);
}

/* Обёртки над правилами: применить и рассказать. silent — раздача, о которой
   рассказывать нечего. */
function drawCard(who,silent){
  if(!B)return null;
  const было=B.ev.length;
  const id=rDraw(B,who);
  if(silent)B.ev.length=было;else проиграть();
  return id;
}

function damageHero(who,v){
  if(!B)return;
  rHeroDmg(B,who,v);
  проиграть();
}
/* Одна переиспользуемая плашка, а не новая на каждый удар: за бой их набегают
   десятки, и создавать узел ради полусекунды — лишняя работа на ровном месте. */
let hfEl=null;
function hurtFlash(){
  if(!gfxAnim()||!S.shk)return;
  if(!hfEl){hfEl=document.createElement('div');hfEl.className='hurtFlash';document.body.appendChild(hfEl)}
  hfEl.classList.remove('go');void hfEl.offsetWidth;hfEl.classList.add('go');
}
function popDmg(el,v,heal){
  const r=el.getBoundingClientRect();
  const d=document.createElement('div');d.className='dmgPop'+(heal?' heal':'');
  d.textContent=(heal?'+':'−')+v;
  d.style.left=(r.left+r.width/2)+'px';d.style.top=(r.top-8)+'px';
  document.body.appendChild(d);setTimeout(()=>d.remove(),820);
}
/* ================= журнал боя =================
   Единственный вход для «что сейчас произошло». Сегодня его зовут прямо из
   боевого кода, но зовут ИЗ ОДНОГО места на событие — когда логику отделим от
   анимаций (см. BACKLOG), этот же поток станет тем, что правила отдают
   наружу, а лента с историей — одним из его читателей.
   who: 'p' — наше действие, 'e' — вражеское, 'sys' — служебное. */
/* Строки журнала собираются в разметку, а в них может попасть что угодно —
   сегодня только имена карт, завтра имя игрока. Экранируем на входе, чтобы не
   пришлось вспоминать об этом потом. */
function esc(t){return String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function blog(who,text,kind){
  if(!B)return;
  if(!Array.isArray(B.log))B.log=[];
  const запись={w:who,t:text,k:kind||''};
  B.log.push(запись);
  /* Предел, чтобы длинный бой не растил массив без конца. */
  if(B.log.length>400)B.log.splice(0,B.log.length-400);
  feedPush(запись);
}
/* Строка в ленте: живёт несколько секунд и гаснет. Больше четырёх штук разом
   не держим — на телефоне они начинают закрывать доску. */
function feedPush(з){
  const f=$('#bFeed');if(!f)return;
  const el=document.createElement('b');
  el.className=(з.w==='sys'?'':з.w)+(з.k?' '+з.k:'');
  el.textContent=з.t;
  f.appendChild(el);
  while(f.children.length>4)f.firstChild.remove();
  const снять=()=>{if(!el.parentNode)return;el.classList.add('off');
    setTimeout(()=>el.remove(),420)};
  setTimeout(снять,з.k==='turn'?2600:4200);
}
function clearFeed(){const f=$('#bFeed');if(f)f.innerHTML=''}
function openLog(){
  if(!B)return;
  sfx.ui();
  const box=document.createElement('div');box.className='iWrap';
  const строки=(B.log||[]).map(з=>
    `<i class="${(з.w==='sys'?'':з.w)+(з.k?' '+з.k:'')}">${esc(з.t)}</i>`).join('');
  box.innerHTML=`<div class="iBox lgBox">
    <div class="iHead"><h2>ЖУРНАЛ БОЯ</h2>
      <button class="xbtn" aria-label="Закрыть"><svg width="13" height="13" viewBox="0 0 14 14"><path d="M1 1 L13 13 M13 1 L1 13" stroke="currentColor" stroke-width="2.4"/></svg></button></div>
    ${строки?`<div class="lgList">${строки}</div>`:'<div class="lgEmpty">Пока ничего не произошло</div>'}</div>`;
  document.body.appendChild(box);
  const закрыть=()=>box.remove();
  box.addEventListener('click',e=>{if(e.target===box)закрыть()});
  box.querySelector('.xbtn').onclick=закрыть;
  /* Прокручиваем к концу: интересует последнее, а не начало боя. */
  const l=box.querySelector('.lgList');
  if(l)l.scrollTop=l.scrollHeight;
}
function enemyBanner(c){
  const b=document.createElement('div');b.className='ePlay';
  b.innerHTML=`<i>ВРАГ</i>${c.n}`;
  $('#bWrap').appendChild(b);
  setTimeout(()=>b.remove(),1700);
}
function startTurn(who){
  /* Ход мёртвого боя не начинаем. startBattle заводит начало хода отложенно,
     на 600мс, и этот таймер переживает и конец боя, и заход в следующий: он
     сработает уже по ЧУЖОМУ B и подарит игроку лишний ход подряд. */
  if(!B||B.over)return;
  const пошёл=rStartTurn(B,who);
  $('#bEnd').disabled=(who==='e'||!пошёл);
  /* Бой мог кончиться прямо внутри: пустая колода бьёт усталостью, и она
     добивает. Тогда остаётся только досказать. */
  const бой=B;
  проиграть().then(()=>{
    if(!пошёл||B!==бой||B.over||B.phase!=='e')return;
    позже(()=>{if(B===бой&&!B.over&&B.phase==='e')safeEnemyTurn()},400);
  });
}
function turnBanner(t){
  const b=document.createElement('div');b.className='bTurn';b.textContent=t;
  $('#bWrap').appendChild(b);setTimeout(()=>b.remove(),1150);
}

async function endTurn(){
  if(!B||B.phase!=='p'||B.over)return;
  if(B.pend){toast('Сначала выбери цель для залпа стихии',1);tone(160,.08,{v:.06});return}
  if(ИДЁТ)return;   /* пока идёт показ, ход не закрываем: события ещё не сыграны */
  sfx.ui();B.phase='wait';B.seq=(B.seq||0)+1;$('#bEnd').disabled=true;
  B.sel=null;renderBattle();
  const бой=B;
  await пауза(200);
  if(B!==бой)return;
  startTurn('e');
}
/* Ход врага в обёртке. На время хода кнопка «конец хода» выключена, и любое
   исключение внутри оставляло бой мёртвым навсегда: фаза так и висела на
   враге, игрок не мог ни походить, ни завершить ход. Аварийная плашка при
   этом появлялась, то есть игрок видел, что сломалось, но партия была
   потеряна. Ловим и возвращаем ход.
   Вторая проверка — на молчаливый затык: если ИИ вышел, не передав ход
   (ранний return по неучтённой ветке), это так же насмерть, но без
   исключения, и никакой обработчик ошибок такое не заметит. */
async function safeEnemyTurn(){
  /* Снять блокировку обязаны при любом исходе: с ней поле не принимает
     нажатий, и застрявшая блокировка — тот же мёртвый бой, что и застрявшая
     фаза, только без единого следа в консоли. */
  try{
    try{ await aiTurn() }
    catch(e){
      try{console.error('[bbduel] ход врага упал',e)}catch(_){}
      if(B&&!B.over&&B.phase!=='p'){toast('Сбой у врага — ход возвращён тебе',1);startTurn('p')}
      return;
    }
    if(B&&!B.over&&B.phase!=='p'){
      try{console.warn('[bbduel] ход врага завершился, не передав ход')}catch(_){}
      startTurn('p');
    }
  }finally{ if(!B||B.phase==='p'||B.over)lockUI(0) }
}
/* Ход врага: правила отыгрывают его целиком и мгновенно, дальше остаётся
   рассказать. Раньше решение и показ шли вперемешку — из-за этого ход врага
   нельзя было ни проверить, ни прогнать без экрана. */
async function aiTurn(){
  if(!B||B.over)return;
  await пауза(500);
  rAiTurn(B);
  const бой=B;
  await проиграть();
  if(B!==бой||B.over)return;
  await пауза(350);
  if(B!==бой)return;
  startTurn('p');
}

/* Куда заклятие врага летит НА ЭКРАНЕ. Цель как таковую выбрали правила
   (aiSpellTarget), здесь только место, куда это показать. Раньше всё, что
   видел игрок, — плашка в углу: карта тратилась, где-то менялись числа, и
   связать одно с другим было не с чем. */
function aiSpellAim(c,tgt){
  const e=c&&c.eff;if(!e)return $('#rowP');
  const un=u=>u?$(`#rowE .unit[data-uid="${u.uid}"],#rowP .unit[data-uid="${u.uid}"]`):null;
  if(e.k==='dmg'||e.k==='drain')return (tgt&&un(tgt))||$('#pHp');
  if(e.k==='healHero')return $('#eHp');
  if(e.k==='draw')return $('#eHandN');
  if(e.k==='mana')return $('#eMana');
  if(e.k==='buff')return un(tgt)||$('#rowE');
  if(e.k==='healAll'||e.k==='buffAll')return $('#rowE');
  return $('#rowP');   /* aoe, weaken и всё прочее — по нашему ряду */
}


/* --- розыгрыш --- */

/* Правила решают, можно ли; подача переводит отказ в слова — про тосты
   правила не знают. */
function playCard(i,targetUnit){
  if(!B||B.over)return;
  /* Позицию карты в руке снимаем ДО того, как правила уберут её оттуда: через
     миг этого узла не будет, а без точки старта карте неоткуда лететь. */
  const h=$(`#bHand .hCard[data-i="${i}"]`);
  ОТКУДА=h?h.getBoundingClientRect():null;
  const р=rPlayCard(B,'p',i,targetUnit||null);
  if(!р.ok){
    if(р.why==='поле полно'){toast('Поле заполнено — максимум 5 юнитов',1);tone(130,.12,{v:.09})}
    else if(р.why==='мало маны'){tone(130,.12,{v:.09});toast('Мало маны!',1)}
    else if(р.why==='нужен свой юнит'){toast('Нужен свой юнит на поле',1);tone(160,.08,{v:.06})}
    return;
  }
  B.sel=null;
  проиграть();
}


async function dealDamage(side,u,v){
  if(!B)return;
  rUnitDmg(B,side,u,v);
  await проиграть();
}
/* Выпад: замах назад, бросок к цели, возврат. Одна кривая на удар по юниту и
   по герою — иначе два одинаковых по смыслу события читаются как разные.
   reach — доля пути: в героя не долетаем, там панель поверх поля.
   Обещание анимации ждём с жёстким сроком: в фоновой вкладке кадры встают, а
   на этом ожидании висит продолжение хода врага. */
async function lunge(elS,цель,ms,reach){
  if(!elS||!цель||!gfxAnim())return;
  const a=elS.getBoundingClientRect();
  const dx=цель.x-(a.left+a.width/2),dy=цель.y-(a.top+a.height/2);
  const k=reach||.84;
  elS.style.zIndex=30;
  /* Плавность у каждой фазы своя: замах тянется, бросок разгоняется и
     приходит на полной скорости, возврат мягкий. С одной общей кривой на все
     кадры фазы размазывались друг в друга, и удар читался как рывок. */
  const an=elS.animate([
    {transform:'translate(0,0) scale(1)',offset:0,easing:'ease-in-out'},
    {transform:`translate(${-dx*.13}px,${-dy*.13}px) scale(.97)`,offset:.28,
     easing:'cubic-bezier(.45,0,.75,.35)'},
    {transform:`translate(${dx*k}px,${dy*k}px) scale(1.09)`,offset:.58,easing:'linear'},
    {transform:`translate(${dx*k}px,${dy*k}px) scale(1.09)`,offset:.66,
     easing:'cubic-bezier(.25,.6,.3,1)'},
    {transform:'translate(0,0) scale(1)',offset:1}],
    {duration:ms,easing:'linear'});
  await Promise.race([an.finished.catch(()=>{}),sleep(ms+400)]);
  elS.style.zIndex='';
}
async function doAttack(side,u,tgt,opts){
  if(!B||B.over)return;
  rAttack(B,side,u,tgt);
  await проиграть();
}

/* ================= показ событий =================
   Правила (10-rules.js) отыгрывают действие целиком и мгновенно и складывают
   в B.ev, ЧТО произошло. Дальше дело подачи: пройти по списку и каждое
   событие рассказать — анимацией, звуком, строкой в журнале.

   Отсюда главная местная забота. Состояние УЖЕ конечное, а рассказ только
   начался: если рисовать прямо по нему, здоровье упадёт сразу на весь ход
   врага, три его существа появятся разом, а погибшие исчезнут раньше, чем по
   ним успеют ударить. Поэтому перед каждой отрисовкой числа ОТМАТЫВАЮТСЯ на
   непоказанные события — см. откат(). */
/* Темп рассказа. 1 — как задумано; 0 — мгновенно, без единого таймера.
   Ноль нужен прогонам: в спрятанной вкладке браузер душит setTimeout до
   одного в минуту (после пяти минут фона — «интенсивное» замедление), и на
   паузах подачи прогон вставал на часы. Микрозадача этому не подвержена.
   Разведение правил и подачи это и дало: скорость показа теперь ручка, а не
   свойство боя. Пригодится и игроку — «ускорить бои» в настройках. */
let ТЕМП=1;
/* Мгновенная уступка управления. Ни setTimeout, ни микрозадача не годятся:
   первый в спрятанной вкладке душится до одного раза в минуту, вторая
   вообще не отдаёт управление — цикл на Promise.resolve() подвешивает
   страницу насмерть (проверено: вкладка перестала отвечать). MessageChannel
   даёт настоящую задачу и под замедление таймеров не попадает. */
const тик=(()=>{try{
  const ch=new MessageChannel(),q=[];
  ch.port1.onmessage=()=>{const f=q.shift();if(f)f()};
  return ()=>new Promise(r=>{q.push(r);ch.port2.postMessage(0)});
}catch(e){return ()=>new Promise(r=>setTimeout(r,0))}})();
const пауза=ms=>ТЕМП<=0?тик():sleep(ms*ТЕМП);
const позже=(fn,ms)=>{if(ТЕМП<=0)тик().then(fn);else setTimeout(fn,ms*ТЕМП)};

let ИДЁТ=null;                 /* обещание текущего показа */
let ОТКУДА=null;               /* откуда летит карта — снято до перерисовки */
const СМЕРТИ_ЖДУТ=new Set();   /* uid тех, чьё падение играется прямо сейчас */

function проиграть(){
  if(ИДЁТ)return ИДЁТ;
  if(!B||!B.ev||!B.ev.length){renderBattle();return Promise.resolve()}
  lockUI(1);
  ИДЁТ=(async()=>{
    try{
      while(B&&B.ev&&B.ev.length){
        const e=B.ev.shift();
        /* Упавший показ не имеет права оставить бой мёртвым: правила своё уже
           отыграли, состояние верное, потерян только кадр. */
        try{await сыграть(e)}
        catch(err){try{console.error('[bbduel] показ события',e&&e.t,err)}catch(_){}}
        const жд=ритм(e,B&&B.ev?B.ev[0]:null);
        if(жд)await пауза(жд);
      }
    }finally{
      ИДЁТ=null;
      lockUI(!!(B&&!B.over&&B.phase!=='p'));
      renderBattle();
    }
  })();
  return ИДЁТ;
}

/* Ритм рассказа. Раньше паузы были вшиты в сам ход врага (`await sleep(340)`
   между ударами) — то есть правила ждали анимацию. Теперь это отдельная
   табличка подачи, и править её можно, не трогая бой. */
function ритм(было,будет){
  if(!B||B.over||!будет)return 0;
  if(будет.t==='atk'&&будет.side==='e')return 340;
  if(будет.t==='play'&&будет.who==='e')return 260;
  if(было.t==='summon'&&было.who==='e')return 240;
  if(было.t==='eff'&&было.who==='e')return 260;
  return 0;
}

async function сыграть(e){
  switch(e.t){

  case 'turn':
    blog('sys',`— ХОД ${e.no} · ${e.who==='p'?'ТЫ':'ВРАГ'} —`,'turn');
    renderBattle();
    if(e.who==='e')turnBanner('ХОД ВРАГА');
    return;

  case 'draw':
    if(e.who==='p')sfx.draw();
    renderBattle();
    return;

  case 'burn':{
    const c=byId(e.id);
    blog(e.who,`сгорела: ${c?c.n:e.id}`,'die');
    if(e.who==='p')toast(`Карта сгорела: ${c?c.n:e.id}`);
    renderBattle();
    return;
  }

  case 'fatigue':
    blog(e.who,`усталость · −${e.v}`,'die');
    return;

  case 'dmgHero':{
    renderBattle();
    const ic=e.who==='p'?$('#pHp'):$('#eHp');
    if(ic){
      popDmg(ic,e.v,false);
      const r=ic.getBoundingClientRect();
      burst(r.left+r.width/2,r.top+10,['#ff3355','#fff'],8,.9);
    }
    sfx.hit();
    /* По своему герою бьёт ощутимее, чем по вражескому. */
    PF.hit(e.who==='p'?'heavy':'light');
    if(e.who==='p'){setMood('surp');hurtFlash()}
    const sil=e.who==='p'?$('#silP'):$('#silE');
    if(sil){sil.classList.remove('hurt');void sil.offsetWidth;sil.classList.add('hurt');
      setTimeout(()=>sil.classList.remove('hurt'),360)}
    return;
  }

  case 'healHero':
    renderBattle();
    popDmg(e.who==='p'?$('#pHp'):$('#eHp'),e.v,true);
    sfx.heal();
    return;

  case 'play':{
    const c=e.c;
    blog(e.who,`⚡ ${c.n}${c.ty==='u'?` ${c.a}/${c.h}`:''} · ${c.c} ${plural(c.c,'мана','маны','маны')}`,'card');
    sfx.play(c.t,c.el);
    if(e.who==='e'){
      /* Точку вылета снимаем ДО перерисовки руки: через миг рубашки
         перестроятся под новый счёт, и карта полетела бы из чужого места. */
      ОТКУДА=enemyHandRect();
      enemyBanner(c);
      await пауза(400);
    }
    renderBattle();
    /* Юнит долетает до своей клетки — это делает событие 'summon', ему нужен
       уже созданный узел. Заклятию ждать нечего: цель известна сейчас. */
    if(c.ty==='u')return;
    const цельEl=e.who==='p'
      ? (e.tgt?$(`#rowP .unit[data-uid="${e.tgt.uid}"],#rowE .unit[data-uid="${e.tgt.uid}"]`)
             :spellAimP(c))
      : aiSpellAim(c,e.tgt);
    if(gfxAnim()&&ОТКУДА){
      const остановки=[];
      /* Карту врага сначала показываем крупно посередине: свою руку он игроку
         не показывает, и без этой остановки заклятие просто срабатывает. */
      if(e.who==='e')остановки.push({r:revealRect(),ms:290,hold:440,rot:-3});
      остановки.push({r:aimRect(цельEl),ms:300,k:.85,fade:0});
      await flyCard(c,ОТКУДА,остановки);
    }
    elBurst(цельEl,c,12+c.t*4,1.05);
    bang(pick(c.stk||['БАМ!']),50,e.who==='e'?44:46);
    if(e.who==='e')await пауза(110);
    return;
  }

  case 'summon':{
    renderBattle();
    const el=$(`#row${e.who==='p'?'P':'E'} .unit[data-uid="${e.u.uid}"]`);
    if(!el)return;
    const r=unitRect(el);
    const полёт=flyToBoard(e.u.card,ОТКУДА,r,el,{reveal:e.who==='e'});
    /* Своей карте не ждём: боевой клич должен успевать за полётом, так было
       всегда. Вражеской ждём — её показ и есть объяснение хода. */
    if(e.who==='e')await полёт;
    const t=e.u.card.t;
    burst(r.left+r.width/2,r.top+r.height/2,elCols(e.u.card),
      e.who==='p'?10+t*8:8+t*6, e.who==='p'?1:.9);
    bang(pick(e.u.card.stk||['БАМ!']),50,46);
    return;
  }

  case 'eff':
    blog(e.who,effText(e),effKind(e));
    if(e.k==='mana'){
      bang(e.who==='p'?`+${e.v} МАНА!`:`ВРАГУ +${e.v} МАНЫ!`,50,e.who==='p'?55:40);
      sfx.sparks();
    }
    else if(e.k==='healHero'||e.k==='healAll'||e.k==='buff'||e.k==='buffAll')sfx.heal();
    else if(e.k==='weaken')bang('Ш-Ш-Ш…',50,46);
    renderBattle();
    return;

  case 'dmgUnit':{
    const row=e.side==='p'?$('#rowP'):$('#rowE');
    const el=row?row.querySelector(`.unit[data-uid="${e.u.uid}"]`):null;
    renderBattle();
    /* Смертельный удар: клетки уже нет на доске, значит пересборка ряда её не
       тронет — цифру правим руками, иначе последнее попадание не видно. */
    if(el&&!B[e.side].board.includes(e.u))updateUnit(el,e.u,e.side,false);
    if(el){
      popDmg(el,e.v,false);
      const r=el.getBoundingClientRect();
      burst(r.left+r.width/2,r.top+r.height/2,['#ff3355','#fff'],7,.8);
      /* Вспышка и отдача — на цели, вместе. Раньше была только дрожь, и на
         быстром размене было неясно, попали в кого-то вообще или нет. */
      el.classList.remove('hit');void el.offsetWidth;el.classList.add('hit');
      setTimeout(()=>el.classList.remove('hit'),280);
      if(gfxAnim())el.animate([
        {transform:'translate(0,0) rotate(0)'},
        {transform:'translate(-7px,2px) rotate(-4deg)',offset:.25},
        {transform:'translate(5px,-1px) rotate(2.5deg)',offset:.55},
        {transform:'translate(0,0) rotate(0)'}],
        {duration:300,easing:'cubic-bezier(.2,.9,.3,1)'});
    }
    sfx.hit();
    /* Остановка кадра на сильном ударе — самый дешёвый способ придать удару
       вес: глаз воспринимает паузу как инерцию от попадания. */
    await пауза(e.v>=4?190:120);
    return;
  }

  case 'die':{
    СМЕРТИ_ЖДУТ.add(e.u.uid);
    blog(e.side,`✖ ${e.u.card.n} погиб`,'die');
    sfx.die();PF.hit('rigid');
    /* Злость — только когда выбили НАШЕГО. */
    if(e.side==='p')setMood('angry',1900);
    const row=e.side==='p'?$('#rowP'):$('#rowE');
    const el=row?row.querySelector(`.unit[data-uid="${e.u.uid}"]`):null;
    if(el){
      el.classList.add('dying');
      const r=el.getBoundingClientRect();
      burst(r.left+r.width/2,r.top+r.height/2,elCols(e.u.card),18,1.15);
      /* Ждём саму анимацию, а не круглое число: правка длительности в CSS
         иначе разъехалась бы с этой задержкой. Срок жёсткий — в фоновой
         вкладке кадры встают, а на этом ожидании висит весь рассказ. */
      const an=el.getAnimations().find(x=>x.animationName==='unitDie');
      if(an)await Promise.race([an.finished.catch(()=>{}),пауза(700)]);
      else await пауза(420);
      el.remove();
    }
    СМЕРТИ_ЖДУТ.delete(e.u.uid);
    renderBattle();
    return;
  }

  case 'atk':{
    const side=e.side,u=e.u,tgt=e.tgt;
    const rowS=side==='p'?$('#rowP'):$('#rowE');
    const rowT=side==='p'?$('#rowE'):$('#rowP');
    const elS=u&&rowS?rowS.querySelector(`.unit[data-uid="${u.uid}"]`):null;
    const elT=tgt.hero?(side==='p'?$('#bTop'):$('#pStats'))
                      :(rowT?rowT.querySelector(`.unit[data-uid="${tgt.uid}"]`):null);
    blog(side,tgt.hero
      ?`${u?u.card.n:'ВРАГ'} → ${side==='p'?'ГЕРОЙ ВРАГА':'ТВОЙ ГЕРОЙ'} · ${e.v}`
      :`${u.card.n} → ${tgt.card.n} · ${e.v}`,'atk');
    if(!tgt.hero&&e.back>0)
      blog(side==='p'?'e':'p',`${tgt.card.n} в ответ → ${u.card.n} · ${e.back}`,'atk');
    /* Черту и подсветку показываем ДО удара, а не вместе с ним: удар врага
       игрок не начинал сам, и без этой доли секунды взгляд не успевает найти,
       кто по кому бьёт. Своему удару замах не нужен — цель выбрал сам. */
    const замах=side==='e'?320:0;
    if(elS&&elT){
      atkLine(elS.getBoundingClientRect(),elT.getBoundingClientRect(),260+замах,side);
      if(замах&&gfxAnim()){
        elS.classList.remove('tell');void elS.offsetWidth;elS.classList.add('tell');
        await пауза(замах);
        elS.classList.remove('tell');
      }
    }
    const sil=side==='p'?$('#silP'):$('#silE');
    if(sil){sil.classList.remove('att','attE');void sil.offsetWidth;
      sil.classList.add(side==='p'?'att':'attE');
      setTimeout(()=>sil.classList.remove('att','attE'),460)}
    const sf=$('#spFlash');
    if(sf){sf.classList.remove('go');void sf.offsetWidth;sf.classList.add('go')}
    if(elS&&elT){
      const b=elT.getBoundingClientRect();
      /* В героя не долетаем: там панель поверх поля. */
      await lunge(elS,{x:b.left+b.width/2,y:b.top+b.height/2},side==='e'?520:400,
        tgt.hero?.5:undefined);
    }
    if(tgt.hero)shake($('#bWrap'));
    return;
  }

  case 'chain':{
    /* Тик набора рисует renderBattle — здесь только звук. Залп же обязан
       остановить рассказ: событий у него дальше нет, а показать надо. */
    renderBattle();
    sfx.elem(e.el);
    if(!e.fire)return;
    const z=ЗАЛП[e.el]||{n:'',d:''};
    blog(e.who,`✦ ЦЕПОЧКА ${(ЭЛ_ИМЯ[e.el]||'')} ×3 · ${z.n}`,'chain');
    chainBanner(e.el,e.who);
    tone(180,.16,{v:.1,sl:-60});
    await пауза(520);
    return;
  }

  case 'ward':
    blog(e.who,'✦ щит поднят: урон в лицо не пройдёт, вражеским юнитам −1 атаки','chain');
    renderBattle();
    return;

  case 'warded':
    blog(e.who,`✦ щит удержал ${e.v}`,'chain');
    sfx.elem('ice');
    renderBattle();
    return;

  case 'roast':
    blog(e.who,`✦ прожарка: ${e.v} урона всем вражеским юнитам`,'chain');
    return;

  case 'void':
    blog(e.who,`✦ пустотный взрыв: врагу −${e.v} маны на следующем ходу`,'chain');
    return;

  case 'manaLost':
    blog(e.who,`✦ пустота съела ${e.v} маны`,'chain');
    renderBattle();
    return;

  case 'immune':
    blog(e.side,`✦ ${e.u.card.n} не почувствовал ${e.v}`,'chain');
    return;

  case 'chainVoid':
    blog(e.who,'✦ залп пропал: на поле некому его принять','chain');
    return;

  case 'chainPend':
    /* У врага цель берёт автомат — спрашивать некого. */
    if(e.who==='p')chainAsk(e.el);
    return;

  case 'chainBuff':
    blog(e.who,`✦ ${e.u.card.n} +${e.a}/+${e.h}`,'chain');
    renderBattle();
    return;

  case 'chainImm':
    blog(e.who,`✦ ${e.u.card.n} прикрыт до конца хода врага`,'chain');
    renderBattle();
    return;

  case 'over':
    finish(e.win,e.forfeit);
    return;
  }
}

/* Строка журнала по событию эффекта. Слова живут здесь, а не в правилах:
   правила отдают «что и на сколько», а как это назвать — вопрос подачи. */
function effText(e){
  const c=e.c,своя=e.who==='p';
  const цель=e.tgt?e.tgt.card.n:(своя?'ГЕРОЙ ВРАГА':'ТВОЙ ГЕРОЙ');
  switch(e.k){
    case 'mana':return `+${e.v} маны`;
    case 'dmg':return `${c.n} → ${цель} · ${e.v}`;
    case 'healHero':return `♥ +${e.v} ${своя?'герою':'своему герою'}`;
    case 'healAll':return `♥ +${e.v} герою и всем своим`;
    case 'draw':return `+${e.v} ${plural(e.v,'карта','карты','карт')} в руку`;
    case 'buff':return `▲ ${e.tgt?e.tgt.card.n:''} +${e.a}/+${e.h}`;
    case 'buffAll':return `▲ всем своим +${e.a}/+${e.h}`;
    case 'aoe':return `${c.n} → по всем ${своя?'врагам':'твоим'} · ${e.v}`;
    case 'weaken':return `▼ ${своя?'врагам':'твоим'} −${e.v} атаки`;
    case 'drain':return `${c.n} → ${цель} · ${e.v}, себе ♥ +${e.v}`;
  }
  return e.k;
}
function effKind(e){return (e.k==='dmg'||e.k==='aoe'||e.k==='drain')?'atk':''}

/* ================= ЦЕПОЧКИ СТИХИЙ: слова и картинки =================
   Имена залпов авторские. Описание — то, что игрок должен успеть прочитать за
   две секунды, поэтому одна строка и без условий. */
const ЗАЛП={
  ice  :{n:'ЗАМОРОЗКА БОЛИ',    d:'урон в лицо не проходит, вражеским юнитам −1 атаки'},
  fire :{n:'ПРОЖАРКА',          d:'2 урона всем вражеским юнитам'},
  ether:{n:'ПУСТОТНЫЙ ВЗРЫВ',   d:'врагу −2 маны на следующем ходу'},
  volta:{n:'ВЫСОКОЕ НАПРЯЖЕНИЕ',d:'+1/+1 своему юниту на выбор'},
  steel:{n:'ПУЛЕНЕПРОБИВАЕМЫЙ', d:'юнит не получает урона до конца хода врага'},
};
const ЭЛ_ИМЯ={ice:'ЛЁД',fire:'ОГОНЬ',ether:'ЭФИР',volta:'ВОЛЬТА',steel:'СТАЛЬ'};

/* Громкая плашка залпа: эмблема, имя, что случилось. Без неё «вдруг у всех
   вражеских юнитов на два здоровья меньше» читается как сбой, а не как
   награда за собранную цепочку. */
function chainBanner(el,who){
  const z=ЗАЛП[el];if(!z)return;
  const b=document.createElement('div');
  b.className='chFire';b.dataset.el=el;
  b.innerHTML=`<span class="chFireI">${svgWrap(EMB[el]||'')}</span>`+
    `<span class="chFireT">${esc(z.n)}</span>`+
    `<span class="chFireS">${who==='p'?'твоя цепочка':'цепочка врага'} · ${esc(z.d)}</span>`;
  const w=$('#bWrap');if(!w)return;
  w.appendChild(b);setTimeout(()=>b.remove(),2000);
  const r=w.getBoundingClientRect();
  if(r.width)burst(r.left+r.width/2,r.top+r.height*.4,EL_COLS[el]||EL_COLS.steel,22,1.3);
}

/* Залп, которому нужна цель. Панель живёт на body, а не внутри #bWrap: на
   время рассказа обёртка боя заблокирована (lockUI), и кнопка внутри неё не
   приняла бы нажатия — игрок остался бы с запертым ходом. */
function chainAsk(el){
  const z=ЗАЛП[el];if(!z)return;
  document.querySelectorAll('.chAsk').forEach(n=>n.remove());
  const box=document.createElement('div');
  box.className='chAsk';box.dataset.el=el;
  box.innerHTML=`<div class="chAskBox">
    <div class="chAskI">${svgWrap(EMB[el]||'')}</div>
    <div class="chAskK">ЦЕПОЧКА ЗАМКНУТА · ${esc(ЭЛ_ИМЯ[el]||'')} ×3</div>
    <div class="chAskT">${esc(z.n)}</div>
    <div class="chAskD">${esc(z.d)}</div>
    <button class="btn pri" id="chAskGo">ВЫБРАТЬ ЦЕЛЬ</button>
  </div>`;
  document.body.appendChild(box);
  box.querySelector('#chAskGo').onclick=()=>{
    sfx.ui();box.remove();
    if(B&&B.pend){B.sel={type:'chain'};renderBattle()}
  };
}

/* Полоска набора. Рисует не конечный счётчик, а тот, до которого дошёл
   рассказ: иначе враг, играющий три эфира подряд, засветил бы полный набор
   ещё до того, как выложил первую карту. */
function renderChain(sel,who){
  const box=$(sel);if(!box)return;
  const c=(ОТКАТ&&ОТКАТ.цепь[who])||B[who].chain||{el:null,n:0};
  const щит=B[who].ward&&!(ОТКАТ&&ОТКАТ.щит.has(who));
  if((!c.el||!c.n)&&!щит){box.hidden=true;box.innerHTML='';return}
  box.hidden=false;
  box.dataset.el=c.el||'steel';
  const набор=(c.el&&c.n)
    ?`<span class="elChI">${svgWrap(EMB[c.el]||'')}</span>`+
     `<span class="elChN">${ЭЛ_ИМЯ[c.el]||''}</span>`+
     `<span class="elChP">${[0,1,2].map(i=>`<i class="${i<c.n?'on':''}"></i>`).join('')}</span>`
    :'';
  box.innerHTML=набор+(щит?'<span class="elWard">ЩИТ</span>':'');
}

/* ================= отмотка =================
   Числа на экране — не конечное состояние, а состояние НА ТОТ МОМЕНТ, до
   которого дошёл рассказ. Считается один раз на отрисовку и лежит в ОТКАТ,
   чтобы его видели syncRow/updateUnit/unitHTML, не таская параметром. */
let ОТКАТ=null;
function откат(){
  const о={hp:{p:0,e:0},рука:{p:0,e:0},мана:{p:0,e:0},колода:{p:0,e:0},
    ед:new Map(),атк:new Map(),непоявились:new Set(),
    /* Набор берём из ПЕРВОГО несыгранного события стороны: оно несёт то
       состояние, что было до него. Дальше по списку смотреть незачем. */
    цепь:{p:null,e:null},щит:new Set(),имм:new Set()};
  if(!B||!B.ev)return о;
  const плюс=(m,u,v)=>m.set(u,(m.get(u)||0)+v);
  for(const e of B.ev){
    switch(e.t){
      case 'dmgHero':о.hp[e.who]+=e.v;break;
      case 'healHero':о.hp[e.who]-=e.v;break;
      case 'draw':о.рука[e.who]--;о.колода[e.who]++;break;
      case 'burn':о.колода[e.who]++;break;
      case 'play':if(e.i>=0){о.рука[e.who]++;о.мана[e.who]+=e.c.c}break;
      case 'summon':о.непоявились.add(e.u.uid);break;
      case 'chain':if(о.цепь[e.who]===null)о.цепь[e.who]={el:e.pel||null,n:e.pn|0};break;
      case 'ward':о.щит.add(e.who);break;
      case 'chainImm':о.имм.add(e.u.uid);break;
      case 'chainBuff':плюс(о.ед,e.u,-(e.h||0));плюс(о.атк,e.u,-(e.a||0));break;
      case 'dmgUnit':плюс(о.ед,e.u,e.v);break;
      case 'eff':
        if(e.k==='mana')о.мана[e.who]-=e.v;
        else if(e.k==='buff'&&e.tgt){плюс(о.ед,e.tgt,-(e.h||0));плюс(о.атк,e.tgt,-(e.a||0))}
        else if(e.k==='buffAll')for(const u of B[e.who].board){плюс(о.ед,u,-(e.h||0));плюс(о.атк,u,-(e.a||0))}
        else if(e.k==='weaken')for(const u of B[e.who==='p'?'e':'p'].board)плюс(о.атк,u,e.v);
        break;
    }
  }
  return о;
}
function показHp(u){return u.hp+((ОТКАТ&&ОТКАТ.ед.get(u))||0)}
function показAtk(u){return Math.max(0,u.atk+((ОТКАТ&&ОТКАТ.атк.get(u))||0))}
/* Видно ли клетку прямо сейчас: только что призванную скрываем, пока рассказ
   до неё не дошёл. */
function ужеНаПоле(u){return !(ОТКАТ&&ОТКАТ.непоявились.has(u.uid))}

/* Полёт копии карты по цепочке остановок — один механизм на всё: розыгрыш
   игроком, вскрытие карты врагом, бросок заклятия в цель.
   Остановка: {r:куда, ms:сколько лететь, hold:сколько висеть на месте,
   rot:наклон, k:поправка масштаба, fade:прозрачность на подлёте}.
   Масштаб считается от ширины копии, поэтому ВСЕ прямоугольники обязаны быть
   карточных пропорций — для произвольных целей их строит aimRect(). */
function flyCard(c,откуда,остановки){
  if(!gfxAnim()||!откуда||!откуда.width||!остановки.length)return Promise.resolve();
  /* Копию верстаем в САМОМ КРУПНОМ размере, который ей понадобится, и дальше
     только уменьшаем. Раньше она версталась по размеру старта, а карта уже
     ко второй остановке становилась вдвое шире — и всё это время показывала
     вёрстку, снятую с узкой. Кегли внутри карты фиксированные: на 86px её
     собственное содержимое не помещается, нижняя пара «атака/здоровье»
     уходит за обрез на 43px (замерено), и увеличение показывало ровно эту
     обрезку крупнее. Отсюда и «статы куда-то уезжают». */
  const W=Math.max(откуда.width,...остановки.map(s=>s.r.width*(s.k||1)));
  const cx=откуда.left+откуда.width/2, cy=откуда.top+откуда.height/2;
  const fly=document.createElement('div');
  fly.className='flyCard';
  fly.style.width=W+'px';
  fly.style.left=(cx-W/2)+'px';
  fly.style.top=cy+'px';
  fly.innerHTML=cardHTML(c,{open:1,noAnim:1});
  document.body.appendChild(fly);
  /* Высоту берём у свёрстанной копии, а не считаем по пропорции: центр старта
     обязан совпасть с центром карты, иначе она прыгает в первый же кадр. */
  fly.style.top=(cy-fly.getBoundingClientRect().height/2)+'px';
  let всего=0;
  for(const s of остановки)всего+=(s.ms||300)+(s.hold||0);
  /* Плавность задаём покадрово, а не одной кривой на всю анимацию: с общей
     кривой пауза посередине съедала бы разгон второго отрезка, и он начинался
     бы рывком. */
  const ease='cubic-bezier(.3,.05,.2,1)';
  const kf=[{transform:`translate(0px,0px) scale(${откуда.width/W}) rotate(0deg)`,
             opacity:1,offset:0,easing:ease}];
  let t=0;
  for(const s of остановки){
    const dx=s.r.left+s.r.width/2-cx;
    const dy=s.r.top+s.r.height/2-cy;
    const sc=(s.r.width*(s.k||1))/W;
    const tr=`translate(${dx}px,${dy}px) scale(${sc}) rotate(${s.rot||0}deg)`;
    const op=s.fade!=null?s.fade:1;
    t+=(s.ms||300);
    kf.push({transform:tr,opacity:op,offset:Math.min(1,t/всего),easing:ease});
    if(s.hold){t+=s.hold;
      kf.push({transform:tr,opacity:op,offset:Math.min(1,t/всего),easing:ease})}
  }
  const an=fly.animate(kf,{duration:всего,easing:'linear',fill:'forwards'});
  /* Уборка обязана случиться при любом исходе: обещание анимации не
     резолвится, если вкладка ушла в фон и кадры встали, — а на этом обещании
     висит и продолжение хода. Поэтому поверх него жёсткий срок. */
  return new Promise(готово=>{
    let убрано=false;
    const done=()=>{if(убрано)return;убрано=true;fly.remove();готово()};
    an.finished.then(done).catch(done);
    setTimeout(done,всего+600);
  });
}
/* Карточный прямоугольник по центру произвольного элемента: целью бывает ряд
   во всю ширину или счётчик здоровья, и брать их размер за размер карты
   нельзя — копия растянулась бы на пол-экрана. */
function aimRect(el,W){
  const f=$('#bField');
  const fr=f?f.getBoundingClientRect():{left:0,top:0,width:innerWidth,height:innerHeight};
  const r=el&&el.getBoundingClientRect?el.getBoundingClientRect():null;
  const cx=r&&r.width?r.left+r.width/2:fr.left+fr.width/2;
  const cy=r&&r.width?r.top+r.height/2:fr.top+fr.height/2;
  const w=W||88,h=w*1.4;
  return {left:cx-w/2,top:cy-h/2,width:w,height:h};
}
/* Место, где карта врага замирает, чтобы её успели прочитать. */
function revealRect(){
  const f=$('#bField');
  const r=f?f.getBoundingClientRect():{left:0,top:0,width:innerWidth,height:innerHeight};
  /* Не уже 140px: у карты фиксированные кегли, и на меньшей ширине её
     собственное содержимое не помещается. Замерено на юните 2 тира — при
     104px нижняя пара «атака/здоровье» вылезает за обрез на 5px, при 120 уже
     внутри; 140 берём с запасом на длинные названия. */
  const w=Math.min(196,Math.max(140,r.width*.46)),h=w*1.4;
  return {left:r.left+r.width/2-w/2,top:r.top+r.height*.44-h/2,width:w,height:h};
}
/* Пока карта в полёте и пока ходит враг, поле нажатий не принимает: эффект
   обязан прилететь в ту же доску, по которой его нацелили. */
function lockUI(on){const w=$('#bWrap');if(w)w.classList.toggle('locked',!!on)}
/* Размер только что созданной клетки. Замер «как есть» врал: у свежего юнита
   CSS-анимация unitIn стартует со scale(.3), и getBoundingClientRect сразу
   после отрисовки давал прямоугольник втрое меньше настоящего — карта летела
   не в клетку, а в точку, и туда же сыпались искры. Гасим появление: на время
   полёта юнит всё равно скрыт прозрачностью, а на посадке его встряхивает
   свой пружок. Через finish(), а не inline-стилем: inline animation:none
   заодно убил бы и падение unitDie, и замах. */
function unitRect(el){
  try{el.getAnimations().forEach(a=>{if(a.animationName==='unitIn')a.finish()})}catch(e){}
  return el.getBoundingClientRect();
}
/* Куда летит НАШЕ заклятие без явной цели — по тому же правилу, что и
   вражеское, только стороны зеркальны. */
function spellAimP(c){
  const e=c.eff;if(!e)return $('#rowE');
  if(e.k==='dmg'||e.k==='drain')return $('#eHp');
  if(e.k==='healHero'||e.k==='healAll')return $('#pHp');
  if(e.k==='mana')return $('#pMana');
  if(e.k==='draw')return $('#bHand');
  if(e.k==='buffAll')return $('#rowP');
  return $('#rowE');   /* aoe, weaken — по вражескому ряду */
}
/* Откуда вылетает карта врага — из его руки, из середины веера рубашек.
   Запасные пути на случай, если руки на экране нет: счётчик в панели (он
   скрыт медиазапросом на телефоне) и, последним, верхний край поля. Раньше
   последним был центр экрана, и на телефоне карта вылетала оттуда — ровно
   из ниоткуда. */
function enemyHandRect(){
  const eh=$('#eHand'),backs=eh?eh.querySelectorAll('.ebCard'):null;
  if(backs&&backs.length){
    const r=backs[Math.floor(backs.length/2)].getBoundingClientRect();
    if(r.width)return {left:r.left,top:r.top,width:r.width,height:r.height};
  }
  const p=$('#eHandN'),host=p?(p.closest('.pile')||p):null;
  if(host&&host.getBoundingClientRect().width)return aimRect(host,86);
  const f=$('#bField'),fr=f?f.getBoundingClientRect():null;
  if(fr)return {left:fr.left+fr.width/2-25,top:fr.top-35,width:50,height:70};
  return aimRect(null,86);
}
/* Веер рубашек по числу карт в руке врага. Перерисовываем только когда счёт
   изменился: renderBattle зовут на каждый удар, а перестройка узлов посреди
   полёта сбила бы точку вылета. */
function syncEnemyHand(сколько){
  const eh=$('#eHand');if(!eh)return;
  const n=Math.min(7,сколько===undefined?(B&&B.e?B.e.hand.length:0):сколько);
  if(+eh.dataset.n!==n){
    eh.dataset.n=n;
    let h='';
    for(let i=0;i<n;i++)h+=`<div class="ebCard" style="transform:rotate(${((i-(n-1)/2)*2.4).toFixed(1)}deg)"></div>`;
    eh.innerHTML=h;
  }
  placeEnemyHand();
}
/* Ставим веер так, чтобы его низ упирался в верх первого ряда, а не заходил
   на доску. Считаем от РЯДА, а не от края поля: поле центрирует ряды по
   свободному месту, и зазор гуляет от высоты экрана — на одном он 29px, на
   низком 12px, и любое зашитое число промахивается. */
function placeEnemyHand(){
  const eh=$('#eHand'),row=$('#rowE'),f=$('#bField');
  if(!eh||!row||!f||!eh.children.length)return;
  const box=eh.getBoundingClientRect();
  if(!box.height)return;
  /* Крайние рубашки повёрнуты, и их углы свисают ниже коробки ряда — коробку
     считает вёрстка, поворот в неё не входит. Меряем свес, а не подбираем
     число: он зависит от того, сколько карт в руке (веер тем круче, чем их
     больше). */
  let low=box.bottom;
  for(const c of eh.children)low=Math.max(low,c.getBoundingClientRect().bottom);
  const место=row.getBoundingClientRect().top-f.getBoundingClientRect().top;
  const надо=box.height+(low-box.bottom)+5;
  /* Тесно (телефон) — поднимаем рубашки за верхний край, чтобы низ разошёлся
     с доской; просторно (десктоп) — прижимаем к самому верху поля, под панель
     врага. Без верхней границы рука на большом экране зависала посреди поля,
     оторванная и от панели, и от доски. */
  const top=Math.round(Math.min(0,место-надо));
  if(eh.dataset.top!=top){eh.dataset.top=top;eh.style.top=top+'px'}
}
addEventListener('resize',placeEnemyHand);
/* Карта не исчезает из руки, чтобы существо возникло на поле из ниоткуда, —
   она туда долетает. Летит копия поверх всего: настоящую карту в этот момент
   уже убрала перерисовка руки, а новое существо должно оказаться на месте
   сразу, иначе следующий клик пришёлся бы в пустоту.
   Само существо на время полёта прячем прозрачностью, а не задержкой показа:
   узел обязан существовать и занимать место, иначе поле дёрнется. */
async function flyToBoard(c,откуда,куда,el,opts){
  const o=opts||{};
  if(!gfxAnim()||!откуда||!куда||!куда.width){return}
  el.style.opacity='0';
  const stops=[];
  /* Карту врага сначала показываем крупно посередине: свою руку он игроку не
     показывает, и без этой остановки существо просто возникало на доске. */
  if(o.reveal)stops.push({r:revealRect(),ms:290,hold:440,rot:-3});
  else{
    /* Своя карта летит по дуге с подбросом: та же длительность читается
       живее, чем прямая. Точка на 55% пути, приподнятая над линией. */
    const w=(откуда.width+куда.width)/2,h=w*1.32;
    const cx=откуда.left+откуда.width/2+(куда.left+куда.width/2-(откуда.left+откуда.width/2))*.55;
    const cy=откуда.top+откуда.height/2+(куда.top+куда.height/2-(откуда.top+откуда.height/2))*.55-26;
    stops.push({r:{left:cx-w/2,top:cy-h/2,width:w,height:h},ms:190,rot:-4});
  }
  stops.push({r:куда,ms:o.reveal?300:190,fade:.85});
  await flyCard(c,откуда,stops);
  el.style.opacity='';
  if(gfxAnim())el.animate([{transform:'scale(1.16)'},{transform:'scale(1)'}],
    {duration:220,easing:'cubic-bezier(.3,1.5,.4,1)'});
}

/* Дуга от атакующего к цели: на поле из пяти клеток «кто кого» иначе
   восстанавливается только задним числом, по тому, у кого убыло здоровье.
   ms — сколько дуга живёт: при замахе она обязана дотянуть до самого удара,
   иначе прицел гаснет раньше, чем происходит то, на что он указывал.
   side красит дугу: жёлтая — бьём мы, красная — бьют нас. Изгиб в разные
   стороны по той же причине — чужая атака и своя не должны выглядеть
   одинаково даже краем глаза. */
function atkLine(a,b,ms,side){
  /* Своя настройка, а не общая с частицами: дуга — не украшение, а
     единственное, что называет цель до удара, и выключать её вместе с искрами
     неправильно ни в ту, ни в другую сторону. */
  if(!gfxAnim()||S.arrows===false)return;
  const dur=ms||260;
  const x1=a.left+a.width/2,y1=a.top+a.height/2;
  const x2=b.left+b.width/2,y2=b.top+b.height/2;
  const len=Math.hypot(x2-x1,y2-y1);
  if(len<8)return;
  /* Управляющая точка отведена вбок от середины по нормали — отсюда и дуга.
     Изгиб пропорционален длине, но с потолком: на длинном броске через всё
     поле кривая иначе улетает за край экрана. */
  const nx=-(y2-y1)/len, ny=(x2-x1)/len, знак=side==='e'?1:-1;
  const изгиб=знак*Math.min(64,len*.22);
  const cx=(x1+x2)/2+nx*изгиб, cy=(y1+y2)/2+ny*изгиб;
  /* Касательная в конце квадратичной кривой смотрит из управляющей точки в
     конечную — по ней и разворачиваем наконечник. Саму линию обрываем у его
     основания, иначе обводка торчит сквозь остриё. */
  const уг=Math.atan2(y2-cy,x2-cx), дл=14, пш=8.5;
  const бx=x2-Math.cos(уг)*дл, бy=y2-Math.sin(уг)*дл;
  const пx=-Math.sin(уг), пy=Math.cos(уг);
  const остриё=`${x2.toFixed(1)},${y2.toFixed(1)} `
    +`${(бx+пx*пш).toFixed(1)},${(бy+пy*пш).toFixed(1)} `
    +`${(бx-пx*пш).toFixed(1)},${(бy-пy*пш).toFixed(1)}`;
  const d=`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${бx.toFixed(1)} ${бy.toFixed(1)}`;
  const t=document.createElement('div');
  t.innerHTML=`<svg class="atkArc ${side==='e'?'e':'p'}" width="${innerWidth}" height="${innerHeight}"
      viewBox="0 0 ${innerWidth} ${innerHeight}" aria-hidden="true">
    <path class="aHalo" d="${d}"/><path class="aBody" d="${d}"/>
    <circle class="aDot" cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="3.4"/>
    <polygon class="aHead" points="${остриё}"/></svg>`;
  const svg=t.firstElementChild;
  document.body.appendChild(svg);
  /* Бегущий пунктир вместо прочерчивания. Прочерчивание говорило направление
     один раз, в первые кадры, и чтобы его заметить, линию приходилось делать
     яркой. Бегущий штрих повторяет то же самое всё время, пока дуга висит, —
     поэтому её можно приглушить до полупрозрачной и она перестаёт спорить с
     доской. Смещение отрицательное: штрихи идут ОТ источника К цели. */
  const шаг=19;
  svg.querySelectorAll('path').forEach(pp=>
    pp.animate([{strokeDashoffset:0},{strokeDashoffset:-шаг}],
      {duration:480,easing:'linear',iterations:Infinity}));
  svg.querySelector('.aHead').animate([{opacity:0,transform:'scale(.5)'},
      {opacity:.6,transform:'scale(1)'}],
    {duration:190,easing:'cubic-bezier(.2,1.5,.4,1)',fill:'both'});
  /* Появление и уход одной анимацией: две на одном элементе перебивали бы
     друг друга по opacity. */
  const вход=Math.min(.3,120/(dur+120));
  const уход=svg.animate([{opacity:0,offset:0},{opacity:1,offset:вход},
      {opacity:1,offset:.76},{opacity:0,offset:1}],
    {duration:dur+120,easing:'linear'});
  const off=()=>svg.remove();
  уход.finished.then(off).catch(off);
  setTimeout(off,dur+660);   /* тот же страховочный срок: в фоне кадры встают */
}

/* Долгое нажатие по существу открывает его карту. В руке карта читается
   тапом, а на поле тап занят выбором цели для атаки — прочитать, что делает
   существо (особенно чужое), было нельзя вообще, хотя половина карт что-то
   да умеет. Сдвиг пальца больше 10px отменяет удержание: иначе перетаскивание
   юнита на цель каждый раз упиралось бы в открывшееся окно. */
let HOLD_MS=420;   /* не const: порог подбирался на живых нажатиях */
function wireHold(el){
  /* Один раз на узел. Ряд пересобирается через syncRow, который СОХРАНЯЕТ
     узлы выживших существ, а renderBattle зовут на каждый удар — без этой
     метки на одном существе к середине боя висел бы десяток обработчиков, и
     каждый заводил бы свой таймер. */
  if(el.dataset.hold)return;
  el.dataset.hold='1';
  let t=null,sx=0,sy=0;
  const снять=()=>{if(t){clearTimeout(t);t=null}};
  el.addEventListener('pointerdown',e=>{
    if(!B||B.over)return;
    sx=e.clientX;sy=e.clientY;
    снять();
    t=setTimeout(()=>{
      t=null;holdFired=true;
      /* Гасим и начатое перетаскивание, и щелчок, который придёт по
         отпусканию: иначе поверх разбора отработает выбор цели. */
      DRAG=null;suppressClick=true;
      PF.hit('light');
      openUnitCard(+el.dataset.uid);
    },HOLD_MS);
  });
  el.addEventListener('pointermove',e=>{
    if(t&&Math.hypot(e.clientX-sx,e.clientY-sy)>10)снять()});
  el.addEventListener('pointerup',снять);
  el.addEventListener('pointercancel',снять);
  el.addEventListener('pointerleave',снять);
}
/* Карта существа с ЖИВЫМИ статами: важно не то, что на ней напечатано, а во
   что она превратилась после усилений и полученного урона. */
function openUnitCard(uid){
  if(!B)return;
  const свой=B.p.board.some(x=>x.uid===uid);
  const u=B.p.board.find(x=>x.uid===uid)||B.e.board.find(x=>x.uid===uid);
  if(!u)return;
  const c=u.card;
  closeInspector();
  sfx.ui();
  const изм=(u.atk!==c.a||u.maxhp!==c.h);
  insBox=document.createElement('div');insBox.className='iWrap';
  insBox.innerHTML=`<div class="iBox">
    <div class="iHead"><h2>${esc(c.n)}</h2>
      <button class="xbtn" aria-label="Закрыть"><svg width="13" height="13" viewBox="0 0 14 14"><path d="M1 1 L13 13 M13 1 L1 13" stroke="currentColor" stroke-width="2.4"/></svg></button></div>
    <div class="insView">
      <div class="insCard">${cardHTML(c,{open:1,noAnim:1})}</div>
      <div class="insInfo">
        <div class="insMeta">${свой?'ТВОЙ ЮНИТ':'ЮНИТ ВРАГА'} · ${u.atk}/${u.hp}${
          изм?` <span style="color:var(--dim)">(на карте ${c.a}/${c.h})</span>`:''
        } · ${TIER_NAMES[c.t]} ${'★'.repeat(c.t+1)}</div>
        ${kwLine(c)}
        <div class="insDesc">${effDesc(c)}</div>
        <div class="insFl">«${esc(c.fl)}»</div>
        <div class="insBtns">
          <span class="noMana">${свой
            ?(u.canAtk&&u.atk>0?'ГОТОВ АТАКОВАТЬ':(u.atk<=0?'НЕЧЕМ БИТЬ — 0 АТАКИ':'УЖЕ ХОДИЛ В ЭТОМ ХОДУ'))
            :(u.taunt?'ТАУНТ — его придётся бить первым':'на поле врага')}</span>
          <button class="btn" id="insClose">ЗАКРЫТЬ</button>
        </div>
      </div>
    </div></div>`;
  document.body.appendChild(insBox);
  const close=()=>closeInspector();
  insBox.addEventListener('click',e=>{if(e.target===insBox)close()});
  insBox.querySelector('.xbtn').onclick=close;
  insBox.querySelector('#insClose').onclick=close;
}
/* ================= ИНСПЕКТОР КАРТЫ ================= */
let insBox=null;
function closeInspector(){if(insBox){insBox.remove();insBox=null}}
function openInspector(i){
  if(!B||B.over)return;
  const c=byId(B.p.hand[i]);if(!c)return;
  closeInspector();
  sfx.ui();
  const canPlay=B.phase==='p'&&c.c<=B.p.mana;
  const boardFull=c.ty==='u'&&B.p.board.length>=5;
  const needT=needTargetCard(c);
  insBox=document.createElement('div');insBox.className='iWrap';
  insBox.innerHTML=`<div class="iBox">
    <div class="iHead"><h2>${c.n}</h2>
      <button class="xbtn" aria-label="Закрыть"><svg width="13" height="13" viewBox="0 0 14 14"><path d="M1 1 L13 13 M13 1 L1 13" stroke="currentColor" stroke-width="2.4"/></svg></button></div>
    <div class="insView">
      <div class="insCard">${cardHTML(c,{open:1,noAnim:1})}</div>
      <div class="insInfo">
        <div class="insMeta">${c.ty==='u'?`ЮНИТ · ${c.a}/${c.h} · ${c.c} МАНЫ`:`ЭХО · ${c.c} МАНЫ`} · ${TIER_NAMES[c.t]} ${'★'.repeat(c.t+1)}</div>
        ${kwLine(c)}
        <div class="insDesc">${effDesc(c)}</div>
        <div class="insFl">«${c.fl}»</div>
        <div class="insBtns">
          ${boardFull&&canPlay
            ?'<span class="noMana">ПОЛЕ ЗАПОЛНЕНО — максимум 5 юнитов</span>'
            :canPlay
              ?(needT
                ?'<button class="btn pri" id="insPlay">ВЫБРАТЬ ЦЕЛЬ ►</button><span style="font-size:10px;color:var(--dim)">потом тапни по врагу</span>'
                :'<button class="btn pri" id="insPlay">РАЗЫГРАТЬ ⚡</button>')
              :'<span class="noMana">МАЛО МАНЫ — дождись своего хода</span>'}
          <button class="btn" id="insClose">ЗАКРЫТЬ</button>
        </div>
      </div>
    </div></div>`;
  document.body.appendChild(insBox);
  const close=()=>closeInspector();
  insBox.addEventListener('click',e=>{if(e.target===insBox)close()});
  insBox.querySelector('.xbtn').onclick=close;
  insBox.querySelector('#insClose').onclick=close;
  const play=insBox.querySelector('#insPlay');
  if(play)play.onclick=()=>{
    closeInspector();
    if(needT){B.sel={type:'hand',i};renderBattle();toast('Теперь тапни по цели')}
    else playCard(i,null);
  };
}

/* ================= DRAG & DROP ================= */
function clearDropHi(){
  $$('.dropOk').forEach(el=>el.classList.remove('dropOk'));
}
function dragTargetsFor(){
  const res={zones:new Set(),units:new Set(),hero:false};
  if(!DRAG)return res;
  if(DRAG.kind==='hand'){
    const c=byId(B.p.hand[DRAG.ref]);
    if(!c)return res;
    if(c.ty==='u'){
      if(B.p.board.length<5)res.zones.add('rowP');
      /* У юнита с прицельным кличем подсвечиваем и цели: бросок прямо во
         врага выкладывает юнита и сразу бьёт кличем по нему. */
      if(c.eff&&c.eff.tg==='any'&&B.p.board.length<5){
        res.hero=true;B.e.board.forEach(u=>res.units.add(u.uid))}
    }
    else if(c.eff){
      if(c.eff.tg==='any'){res.hero=true;B.e.board.forEach(u=>res.units.add(u.uid))}
      else if(c.eff.tg==='ally'){B.p.board.forEach(u=>res.units.add(u.uid))}
      else res.zones.add('rowP');
    }else res.zones.add('rowP');
  }else if(DRAG.kind==='unit'){
    const u=B.p.board.find(x=>x.uid===DRAG.ref);
    if(u&&u.canAtk&&u.atk>0){
      const taunts=B.e.board.filter(x=>x.taunt);
      if(taunts.length)taunts.forEach(t=>res.units.add(t.uid));
      else{B.e.board.forEach(x=>res.units.add(x.uid));res.hero=true}
    }
  }
  return res;
}
function beginDrag(e,kind,ref,srcEl){
  if(!B||B.over||B.phase!=='p')return;
  holdFired=false;
  if(e.button!==undefined&&e.button!==0)return;
  DRAG={kind,ref,sx:e.clientX,sy:e.clientY,moved:false,ghost:null,srcEl};
  window.addEventListener('pointermove',onDragMove);
  window.addEventListener('pointerup',onDragUp,{once:true});
  window.addEventListener('pointercancel',onDragUp,{once:true});
}
function onDragMove(e){
  if(!DRAG)return;
  const d=Math.hypot(e.clientX-DRAG.sx,e.clientY-DRAG.sy);
  if(!DRAG.moved){
    if(d<12)return;
    DRAG.moved=true;
    const c=DRAG.kind==='hand'?byId(B.p.hand[DRAG.ref])
      :(B.p.board.find(u=>u.uid===DRAG.ref)||{}).card;
    if(!c){DRAG=null;return}
    const g=document.createElement('div');g.className='ghost';
    const u=DRAG.kind==='unit'?B.p.board.find(x=>x.uid===DRAG.ref):null;
    g.innerHTML=`${c.n}<small>${DRAG.kind==='hand'?'ПЕРЕТАСКИВАЙ…':'АТАКА · '+(u?u.atk:'')+' УРОНА'}</small>`;
    document.body.appendChild(g);DRAG.ghost=g;
    if(DRAG.srcEl)DRAG.srcEl.classList.add('dragSrc');
    sfx.ui();
  }
  DRAG.ghost.style.left=e.clientX+'px';
  DRAG.ghost.style.top=e.clientY+'px';
  clearDropHi();
  const T=dragTargetsFor();
  if(T.zones.has('rowP'))$('#rowP').classList.add('dropOk');
  if(T.hero)$('#bTop').classList.add('dropOk');
  T.units.forEach(uid=>{
    const el=$(`#rowE .unit[data-uid="${uid}"],#rowP .unit[data-uid="${uid}"]`);
    if(el)el.classList.add('dropOk')});
}
function onDragUp(e){
  window.removeEventListener('pointermove',onDragMove);
  const drag=DRAG;DRAG=null;
  if(!drag)return;
  if(drag.ghost)drag.ghost.remove();
  if(drag.srcEl)drag.srcEl.classList.remove('dragSrc');
  clearDropHi();
  if(!drag.moved){
    /* Долгое нажатие уже открыло карту — обычный тап по отпусканию не нужен,
       иначе поверх разбора сразу выберется цель для атаки. */
    if(holdFired){holdFired=false;return}
    if(drag.kind==='hand'){
      /* Повторный тап по уже выбранной карте отменяет выбор цели. Без этого
         из режима «тапни по цели» не было выхода вообще: тап мимо ничего не
         делал, и оставалось только завершить ход. */
      if(B.sel&&B.sel.type==='hand'&&B.sel.i===drag.ref){
        B.sel=null;sfx.ui();renderBattle();return}
      openInspector(drag.ref);return}
    if(drag.kind==='unit'){onUnitTap(drag.ref);return}
    return;
  }
  suppressClick=true;
  const el=document.elementFromPoint(e.clientX,e.clientY);
  if(!el)return;
  const tgtUnitEl=el.closest('.unit[data-uid]');
  const uid=tgtUnitEl?+tgtUnitEl.dataset.uid:null;
  if(drag.kind==='hand'){
    const c=byId(B.p.hand[drag.ref]);
    if(!c)return;
    if(c.c>B.p.mana){tone(130,.12,{v:.09});toast('Мало маны!',1);return}
    /* Юнит с прицельным боевым кличем — сначала юнит, потом клич. Проверка
       tg стояла выше проверки типа, и такой юнит уходил по ветке заклятий:
       подсветка звала на своё поле, а бросок туда отвечал «это заклятие нужно
       бросить НА цель» и оставлял карту в руке. Пять карт из 38 нельзя было
       выложить перетаскиванием вообще. */
    if(c.ty==='u'&&c.eff&&c.eff.tg==='any'){
      if(B.p.board.length>=5){toast('Поле заполнено — максимум 5 юнитов',1);return}
      if(uid!==null&&B.e.board.some(u=>u.uid===uid)){
        playCard(drag.ref,B.e.board.find(u=>u.uid===uid));return}
      if(el.closest('#bTop')){playCard(drag.ref,null);return}
      /* Брошен на своё поле — выкладывать вслепую нельзя, клич обещает выбор.
         Переходим в режим выбора цели, тот же, что из инспектора. */
      B.sel={type:'hand',i:drag.ref};renderBattle();
      toast('Юнит выйдет, когда выберешь цель боевого клича');
      return;
    }
    if(c.eff&&c.eff.tg==='any'){
      if(uid!==null&&B.e.board.some(u=>u.uid===uid))playCard(drag.ref,B.e.board.find(u=>u.uid===uid));
      else if(el.closest('#bTop'))playCard(drag.ref,null);
      else toast('Это заклятие нужно бросить НА цель: врага или его героя',1);
      return;
    }
    if(c.eff&&c.eff.tg==='ally'){
      if(uid!==null&&B.p.board.some(u=>u.uid===uid))playCard(drag.ref,B.p.board.find(u=>u.uid===uid));
      else toast('Брось это заклятие НА своего юнита',1);
      return;
    }
    if(el.closest('#rowP,#bBottom,#bField'))playCard(drag.ref,null);
    else if(el.closest('#rowE,#bTop'))toast('Своих кладут на своё поле — вниз!',1);
    return;
  }
  if(drag.kind==='unit'){
    const u=B.p.board.find(x=>x.uid===drag.ref);
    if(!u||!u.canAtk||u.atk<=0)return;
    if(uid!==null){
      const t=B.e.board.find(x=>x.uid===uid);
      if(!t)return;
      const taunts=B.e.board.filter(x=>x.taunt);
      if(taunts.length&&!taunts.includes(t)){toast('Сначала таунты!',1);return}
      u.canAtk=false;doAttack('p',u,t);
      return;
    }
    if(el.closest('#bTop,#rowE')){
      const taunts=B.e.board.filter(x=>x.taunt);
      if(taunts.length){toast('Сначала таунты!',1);return}
      u.canAtk=false;doAttack('p',u,{hero:1});
      return;
    }
  }
}

/* --- тап по своему юниту --- */
function onUnitTap(uid){
  if(B.phase!=='p'||B.over)return;
  const u=B.p.board.find(x=>x.uid===uid);if(!u)return;
  /* Незакрытый залп: юнит сейчас не воюет и не выбирается под удар. Иначе он
     потратил бы удар вхолостую — правила бы его не пропустили, а canAtk уже
     сняли бы. */
  if(B.pend){
    if(B.sel&&B.sel.type==='chain'){
      const эл=B.pend.el;
      const р=rChainTarget(B,u);
      if(!р.ok){toast(р.why,1);tone(160,.08,{v:.06});return}
      B.sel=null;sfx.elem(эл);
      elBurst($(`#rowP .unit[data-uid="${uid}"]`),{el:эл},16,1.2);
      проиграть();
    }else toast('Сначала жми «ВЫБРАТЬ ЦЕЛЬ»',1);
    return;
  }
  if(B.sel&&B.sel.type==='hand'){
    const c=byId(B.p.hand[B.sel.i]);
    if(c&&canTarget(c,'p'))playCard(B.sel.i,u);
    else if(c&&needTargetCard(c)){
      toast('Эту карту бросают в ВРАГА',1);tone(160,.08,{v:.06})}
    else{B.sel=null;renderBattle()}
    return}
  if(!u.canAtk||u.atk<=0||(u.sick&&!u.rush)){tone(160,.08,{v:.06});return}
  if(B.sel&&B.sel.type==='unit'&&B.sel.uid===uid){B.sel=null;renderBattle();return}
  B.sel={type:'unit',uid};renderBattle();
}
function onEnemyTap(uidOrHero){
  if(B&&B.pend)return;      /* сначала цель залпа, потом всё остальное */
  if(!B.sel){return}
  if(B.sel.type==='unit'){
    const u=B.p.board.find(x=>x.uid===B.sel.uid);if(!u)return;
    if(uidOrHero==='hero'){
      const taunts=B.e.board.filter(x=>x.taunt);
      if(taunts.length){toast('Сначала таунты!',1);return}
      u.canAtk=false;B.sel=null;doAttack('p',u,{hero:1});renderBattle();return}
    const t=B.e.board.find(x=>x.uid===uidOrHero);if(!t)return;
    const taunts=B.e.board.filter(x=>x.taunt);
    if(taunts.length&&!taunts.includes(t)){toast('Сначала таунты!',1);return}
    u.canAtk=false;B.sel=null;doAttack('p',u,t);renderBattle();return}
  if(B.sel.type==='hand'){
    const c=byId(B.p.hand[B.sel.i]);
    if(uidOrHero==='hero'){
      if(c&&needTargetCard(c)&&!canTarget(c,'hero')){
        toast('Это заклятие — на СВОЕГО юнита',1);tone(160,.08,{v:.06});return}
      playCard(B.sel.i,null);return}
    const t=B.e.board.find(x=>x.uid===uidOrHero);
    if(!t)return;
    if(c&&needTargetCard(c)&&!canTarget(c,'e')){
      toast('Это заклятие — на СВОЕГО юнита',1);tone(160,.08,{v:.06});return}
    playCard(B.sel.i,t);
  }
}

/* ================= рендер боя ================= */
/* Ужимает нахлёст карт так, чтобы веер целиком помещался в ширину руки.
   Фиксированный отрицательный margin из CSS рассчитан на десктоп: на 375px
   рука из 7 карт вылезала за оба края экрана. Раздвигать шире, чем задумано
   дизайном, не даём — только сжимаем. */
function fitHand(){
  const hand=$('#bHand'); if(!hand) return;
  const cards=hand.querySelectorAll('.hCard');
  const n=cards.length;
  hand.style.removeProperty('--hand-ov');
  if(n<2) return;
  const cw=cards[0].getBoundingClientRect().width;
  if(!cw) return;
  const avail=hand.clientWidth-8;           /* небольшой запас на поворот карт */
  const base=parseFloat(getComputedStyle(hand).getPropertyValue('--hand-ov'))||-14;
  const span=cw+(n-1)*(cw+2*base);
  if(span<=avail) return;                   /* и так помещается */
  const need=((avail-cw)/(n-1)-cw)/2;       /* нужный (более отрицательный) margin */
  hand.style.setProperty('--hand-ov',Math.min(base,need).toFixed(1)+'px');
}

function renderBattle(){
  if(!B)return;
  /* Рисуем не конечное состояние, а то, до которого дошёл рассказ. */
  ОТКАТ=откат();
  const hpP=clamp(B.p.hp+ОТКАТ.hp.p,0,B.p.max),hpE=clamp(B.e.hp+ОТКАТ.hp.e,0,B.e.max);
  const манаP=Math.max(0,B.p.mana+ОТКАТ.мана.p),манаE=Math.max(0,B.e.mana+ОТКАТ.мана.e);
  const рукаE=Math.max(0,B.e.hand.length+ОТКАТ.рука.e);
  const полеP=B.p.board.filter(ужеНаПоле).length,полеE=B.e.board.filter(ужеНаПоле).length;
  $('#eHp').textContent=hpE;$('#pHp').textContent=hpP;
  $('#eDeckN').textContent=B.e.deck.length+ОТКАТ.колода.e;$('#eHandN').textContent=рукаE;
  syncEnemyHand(рукаE);
  $('#pManaT').textContent=манаP+'/'+B.p.mmax;
  $('#eManaT').textContent=манаE+'/'+B.e.mmax;
  $('#eBoardN').textContent=полеE+'/5';
  $('#eBoardN').classList.toggle('full',полеE>=5);
  $('#pBoardN').innerHTML='ПОЛЕ <b>'+полеP+'/5</b>';
  $('#pBoardN').classList.toggle('full',полеP>=5);
  const playCount=B.p.hand.filter(id=>byId(id).c<=манаP).length;
  $('#pManaBox').classList.toggle('pulse',B.phase==='p'&&playCount>0);
  const manaRow=(P,max)=>{let s='';for(let i=0;i<Math.max(max,P);i++)
    s+=`<span class="mGem ${i<P?'on':''}"></span>`;return s};
  $('#pMana').innerHTML=manaRow(манаP,B.p.mmax);
  $('#eMana').innerHTML=manaRow(манаE,B.e.mmax);
  const canTargetE=B.sel&&(B.sel.type==='unit'||(B.sel.type==='hand'&&byId(B.p.hand[B.sel.i])?.eff?.tg==='any'));
  syncRow($('#rowE'),B.e.board,'e',!!canTargetE,canTargetE?'<div class="slot canDrop" data-slot="e-hero"></div>':'<div class="slot" data-slot="e-hero"></div>');
  renderChain('#pChain','p');renderChain('#eChain','e');
  const canTargetP=B.sel&&(B.sel.type==='chain'
    ||(B.sel.type==='hand'&&byId(B.p.hand[B.sel.i])?.eff?.tg==='ally'));
  syncRow($('#rowP'),B.p.board,'p',!!canTargetP,'<div class="slot"></div>');
  const n=B.p.hand.length;
  $('#bHand').innerHTML=B.p.hand.map((id,i)=>{
    const c=byId(id);
    const playable=c.c<=B.p.mana;
    /* Веер выгибается ВВЕРХ: карты выровнены по низу контейнера, поэтому
       сдвиг вниз выталкивал крайние карты за нижний край экрана. Заодно при
       большой руке уменьшаем разброс, чтобы веер оставался компактным. */
    const spread=n>5?2.6:4, arc=n>5?1.1:2.2;
    const rot=((i-(n-1)/2)*spread).toFixed(1);
    const ty=(-(Math.abs(i-(n-1)/2)**2*arc)).toFixed(1);
    const sel=B.sel&&B.sel.type==='hand'&&B.sel.i===i;
    return `<div class="hCard ${playable?'playable':'unplayable'} ${sel?'selected':''}"
      data-i="${i}" style="--rot:${rot}deg;--ty:${ty}px">${cardHTML(c,{open:1,noAnim:1})}</div>`}).join('');
  $$('#bHand .hCard').forEach(el=>{
    el.addEventListener('pointerdown',e=>{
      e.preventDefault();
      beginDrag(e,'hand',+el.dataset.i,el)});
  });
  fitHand();
  $$('#rowP .unit').forEach(el=>{
    el.addEventListener('pointerdown',e=>{
      e.preventDefault();
      beginDrag(e,'unit',+el.dataset.uid,el)});
    wireHold(el);
  });
  $$('#rowE .unit').forEach(el=>{
    el.addEventListener('click',e=>{e.stopPropagation();onEnemyTap(+el.dataset.uid)});
    wireHold(el);
  });
  $$('#rowE .slot[data-slot="e-hero"],#bTop').forEach(el=>{
    el.addEventListener('click',e=>{e.stopPropagation();onEnemyTap('hero')});
  });
  /* Незакрытый залп держит ход: правила всё равно не пропустят ни карту, ни
     удар, а выключенная кнопка объясняет это до того, как игрок ткнёт. */
  const bEnd=$('#bEnd');
  if(bEnd&&B.phase==='p'&&!B.over)bEnd.disabled=!!B.pend;
  /* Самопочинка. Залп есть, а спросить нечем — панель могло снести чем угодно,
     и тогда ход заперт навсегда. Дешевле вернуть её, чем ловить причину. */
  if(B.pend&&!B.over&&!document.querySelector('.chAsk')&&!(B.sel&&B.sel.type==='chain'))
    chainAsk(B.pend.el);
  updateHint();
  snapBattle();
  if(TR)trCheck();
}
function updateHint(){
  const h=$('#bHint');if(!h||!B)return;
  if(B.over){h.style.display='none';return}
  h.style.display='';
  if(B.phase!=='p'){h.textContent='— ход врага, наблюдай —';return}
  if(B.pend){
    h.textContent=(B.sel&&B.sel.type==='chain')
      ? 'тапни СВОЕГО юнита — на него ляжет залп стихии'
      : 'цепочка замкнулась — выбери, на кого ляжет залп';
    return;
  }
  const playCount=B.p.hand.filter(id=>byId(id).c<=B.p.mana).length;
  if(B.sel){
    if(B.sel.type==='hand'){
      const c=byId(B.p.hand[B.sel.i]);
      h.textContent=(c&&c.eff&&c.eff.tg==='ally')
        ? 'выбери СВОЕГО юнита · повторный тап по карте — отмена'
        : 'выбери цель у врага: юнит или его панель · повторный тап по карте — отмена';
    }
    else{const u=B.p.board.find(x=>x.uid===B.sel.uid);
      if(u)h.textContent=`${u.card.n} ${u.atk}/${u.hp} — тапни врага или перетащи юнита на цель`}
  }else{
    const hasTaunt=B.p.hand.some(id=>{const cc=byId(id);return cc.c<=B.p.mana&&cc.kw&&cc.kw.includes('taunt')});
    if(B.e.board.length-B.p.board.length>=2&&hasTaunt)
      h.textContent='враг давит числом — поставь ТАУНТа: пока он жив, враг обязан бить только его';
    else if(playCount>0)
      h.textContent=`играбельно: ${playCount} · тап — инфо · тяни на поле — играть`;
    else
      h.textContent='маны ни на что не хватает — жми КОНЕЦ ХОДА';
  }
}
/* ================= сборка ряда существ =================
   Раньше ряд собирался через innerHTML при каждом изменении состояния — на
   каждый удар, на каждую потраченную ману. Узлы существ уничтожались и
   создавались заново, а вместе с ними заново запускалась анимация появления:
   после любого попадания всё поле «выпрыгивало» повторно. Анимировать урон,
   замах или смерть было попросту не на чем — элемент исчезал в тот самый
   момент, когда должен был двигаться.
   Теперь узлы переиспользуются по uid, а меняются только те поля, что
   изменились. Появление играет один раз, всё остальное можно анимировать. */
function syncRow(row,board,side,targetable,slotHTML){
  const было=new Map();
  row.querySelectorAll('.unit').forEach(el=>было.set(el.dataset.uid,el));
  const порядок=[];
  /* Только что призванных пропускаем, пока рассказ до них не дошёл: правила
     ставят их на доску сразу, а появиться они должны по очереди. */
  const видимые=board.filter(ужеНаПоле);
  for(const u of видимые){
    const key=String(u.uid);
    let el=было.get(key);
    if(el){было.delete(key);updateUnit(el,u,side,targetable)}
    else{
      const t=document.createElement('div');
      t.innerHTML=unitHTML(u,side,targetable);
      el=t.firstElementChild;
    }
    порядок.push(el);
  }
  /* Узел павшего не трогаем: правила убрали его с доски сразу, но показать
     падение ещё только предстоит. .dying — падение уже играется, СМЕРТИ_ЖДУТ —
     играется прямо сейчас, а очередь событий держит тех, до кого не дошли.
     Считаем их: такой узел ЗАНИМАЕТ клетку, и её надо вычесть из пустых —
     иначе в ряду оказывается больше пяти ячеек. Видно это в размене, когда
     падают двое: живые клетки съезжают в сторону, а ряд разъезжается шире
     соседнего. */
  let доигрывают=0;
  было.forEach(el=>{
    if(el.classList.contains('dying')
      ||СМЕРТИ_ЖДУТ.has(+el.dataset.uid)
      ||(B&&B.ev&&B.ev.some(e=>e.t==='die'&&String(e.u.uid)===el.dataset.uid))){
      доигрывают++;return;
    }
    el.remove();
  });
  row.querySelectorAll('.slot').forEach(el=>el.remove());
  порядок.forEach((el,i)=>{
    const cur=row.children[i];
    if(cur!==el)row.insertBefore(el,cur||null);
  });
  const пусто=Math.max(0,5-видимые.length-доигрывают);
  if(пусто){
    const t=document.createElement('div');
    t.innerHTML=slotHTML.repeat(пусто);
    while(t.firstChild)row.appendChild(t.firstChild);
  }
}
/* Патчим только изменившееся. Полная перерисовка узла обнулила бы и подсветку,
   и любую идущую анимацию — ровно то, от чего уходим. */
function updateUnit(el,u,side,targetable){
  const sel=B.sel&&B.sel.type==='unit'&&B.sel.uid===u.uid;
  const tired=!u.canAtk&&side==='p';
  el.classList.toggle('sel',!!sel);
  el.classList.toggle('target',!!targetable);
  el.classList.toggle('tired',!!tired);
  el.classList.toggle('buffed',!!u.buffed);
  el.classList.toggle('imm',!!(u.imm&&!(ОТКАТ&&ОТКАТ.имм.has(u.uid))));
  const a=el.querySelector('.uA'), h=el.querySelector('.uH');
  const атк=показAtk(u),здор=показHp(u);
  if(a&&a.textContent!=String(атк))a.textContent=атк;
  if(h){
    /* Цифру здоровья не просто подменяем: при убыли она вспыхивает и
       вздрагивает, иначе размен читается только по всплывающему числу. */
    if(h.textContent!=String(здор)){
      const было=+h.textContent;
      h.textContent=здор;
      if(здор<было&&gfxAnim())h.animate(
        [{transform:'scale(1)'},{transform:'scale(1.45)',offset:.3},{transform:'scale(1)'}],
        {duration:280,easing:'cubic-bezier(.3,1.4,.4,1)'});
    }
    h.classList.toggle('hurt',здор<u.maxhp);
  }
  const kw=el.querySelector('.uKw');
  const want=(u.taunt?'<i>ТАУНТ</i>':'')+(u.rush&&u.sick?'<i class="r">РАШ</i>':'');
  if(kw&&kw.innerHTML!==want)kw.innerHTML=want;
}
/* Одно место, где решается, двигаться ли вообще. Системную настройку
   «меньше движения» уважаем: для части людей это не вкус, а самочувствие. */
/* Просит ли система убрать движение. Держим как подсказку для настроек, но
   решает НЕ она. Раньше решала — и это молча выключало полёт карты врага,
   замах перед ударом и выпад, то есть ровно то, чем ход противника вообще
   объясняется: на десктопе с этим флагом бой выглядел как до всех правок,
   только ещё быстрее (анимации пропущены, а паузы между ними остались).
   Честнее и заметнее так: флаг ставит галочку по умолчанию новому игроку,
   а дальше это обычный переключатель в настройках. Тем более что остальное
   движение в игре — бегущие полосы, дрейф сетки, лента на рубашках — этот
   флаг и не спрашивало никогда. */
let REDUCE=false;
try{const m=matchMedia('(prefers-reduced-motion:reduce)');REDUCE=m.matches;
  m.addEventListener&&m.addEventListener('change',e=>{REDUCE=e.matches})}catch(e){}
function gfxAnim(){return S.anim!==false}

function unitHTML(u,side,targetable){
  const hex=u.card.ult?'#ff3355':TIER_HEX[u.card.t];
  const sel=B.sel&&B.sel.type==='unit'&&B.sel.uid===u.uid;
  const tired=!u.canAtk&&side==='p';
  const имм=u.imm&&!(ОТКАТ&&ОТКАТ.имм.has(u.uid));
  return `<div class="unit ${sel?'sel':''} ${targetable?'target':''} ${tired?'tired':''} ${u.buffed?'buffed':''} ${имм?'imm':''}"
    data-uid="${u.uid}" style="--tc:${hex}">
    <span class="uName">${u.card.n}</span>
    <span class="uKw">${u.taunt?'<i>ТАУНТ</i>':''}${u.rush&&u.sick?'<i class="r">РАШ</i>':''}</span>
    ${/* Только uArtImg, без uArt. Оба класса на одной картинке — ловушка:
          .unit .uArt и .unit .uArtImg равны по весу, поэтому решает порядок в
          файле, а в телефонной медиа-секции .uArt переопределён ниже и
          побеждал. Арт на поле съёживался до 64% — треть ячейки пустовала
          справа и снизу. uArt задуман для SVG-эмблемы, картинке он не нужен:
          размер и обрезку целиком описывает uArtImg. */''}
    ${CARD_ART.has(u.card.id)
      ? `<img class="uArtImg" src="art/cards/${u.card.id}.webp" alt="" draggable="false">`
      : `<svg class="uArt" viewBox="0 0 24 24">${EMB[u.card.el]||EMB.steel}</svg>`}
    <span class="uHit"></span>
    <span class="uA">${показAtk(u)}</span><span class="uH ${показHp(u)<u.maxhp?'hurt':''}">${показHp(u)}</span>
  </div>`;
}
/* forfeit — досрочная сдача. Награду за неё не даём принципиально: утешительные
   15% превратили бы «начать десятый рейд и сразу сдаться» в ферму по 45 искр за
   пару секунд, что после починки экономики паков было бы единственной дырой. */
function finish(win,forfeit){
  /* Сюда приходят двумя дорогами: по событию 'over' от правил и напрямую при
     сдаче. Показать итоги обязаны ровно раз. */
  if(!B||B.итогПоказан)return;
  B.итогПоказан=1;
  B.over=true;dropBattleSnap();$('#bEnd').disabled=true;lockUI(0);
  blog('sys',forfeit?'— СДАЛСЯ —':(win?'— ПОБЕДА —':'— ПОРАЖЕНИЕ —'),'turn');
  const si=B.si;   /* запоминаем: к моменту показа итогов B могут обнулить */
  /* Обучение снимаем ЗДЕСЬ, а не только при уходе с экрана. Итоги боя
     показываются, не покидая экран боя, — значит перехватчик ввода режиссёра
     оставался навешенным и глотал нажатия по кнопкам итогов. Пока бой шёл по
     сценарию, до этого не доходило: последний шаг снимает блокировку сам,
     ещё до добивания. Но выиграть можно и раньше, чем сценарий доиграет, —
     и тогда окно итогов оказывалось мёртвым, а выйти из игры нечем. */
  if(typeof TR!=='undefined'&&TR)stopTraining();
  closeInspector();
  S.stats.battles++;
  let gained=0;
  if(win){
    S.stats.wins++;
    /* Тренировка идёт по сценарию и выигрывается гарантированно, поэтому
       платить за неё повторно — открытая дыра в экономике: перезаходи и
       получай искры сколько угодно. Награда строго за первый раз. */
    gained=(B.st.tutorial&&S.done[B.si])?0:B.st.reward;
    if(!S.done[B.si]){S.done[B.si]=1;gained=Math.round(gained*1.5);
      if(B.si+1>S.stage)S.stage=B.si+1;
      toast('Рейд зачищен! Бонус первой зачистки ×1,5')}
    sfx.win();PF.notify('success');setMood('joy',3200);
    burst(innerWidth/2,innerHeight/2,['#ffd52e','#fff','#ff4fd8','#35f0ff'],70,1.8);
    bang('ПОБЕДА!!',50,30);
  }else{
    gained=forfeit?0:Math.round(B.st.reward*.15);
    sfx.lose();PF.notify('error');setMood('sad',3200);
    bang(forfeit?'СДАЛСЯ…':'ОБЛОМ…',50,30);
  }
  S.sparks+=gained;save();
  позже(()=>{
    const box=document.createElement('div');box.className='bResult';
    box.innerHTML=`<div class="bResBox">
      <div class="bResT ${win?'win':'lose'}">${win?'ПОБЕДА!!':forfeit?'ОТСТУПЛЕНИЕ':'ПРОВАЛ'}</div>
      <div class="bResS">${B.st.n} · <b>${gained?'+'+fmtN(gained)+' искр':'без награды'}</b> · побед: ${S.stats.wins}/${S.stats.battles}</div>
      <div class="bResB">
        ${win&&мВсёПройдено()
          /* Последний бой последнего готового акта: вести «ДАЛЬШЕ» некуда, и
             отпускать игрока молча — значит закончить историю ничем. */
          ?'<button class="btn pri" id="rEnd">ПРОДОЛЖЕНИЕ ►</button>'
          :win&&B.si+1<STAGES.length?'<button class="btn pri" id="rNext">ДАЛЬШЕ ►</button>':''}
        <button class="btn" id="rRetry">ЕЩЁ РАЗ</button>
        <button class="btn" id="rMenu">В МЕНЮ</button>
      </div></div>`;
    document.body.appendChild(box);
    const close=()=>box.remove();
    /* Разговор после победы стоит НА ПУТИ кнопок, а не на таймере. Раньше он
       всплывал через 1,2 секунды поверх итогов — и соревновался с пальцем
       игрока: нажал «ДАЛЬШЕ» быстрее — окно итогов исчезало, показ отменялся,
       и вместо ответа побеждённого игрок уезжал в переписку СЛЕДУЮЩЕГО боя.
       Теперь любая из трёх кнопок сперва доигрывает недочитанное, потом ведёт
       дальше. Предлагаем один раз за бой: отказался — не переспрашиваем, чат
       останется под значком телефона на плитке. */
    let предложен=false;
    const продолжить=fn=>{
      /* Катсцены после победы идут ПОСЛЕ разговора: в сценарии сначала
         добивают словами, и только потом кадр. Обе очереди — на пути кнопок, а
         не на таймере, ровно по той же причине, что и чат. */
      const сцены=()=>{
        const очередь=win&&!forfeit?сценыЭтапа('after',si):[];
        /* Окно итогов закрываем ДО катсцены. Разговор ему не мешает — телефон
           это накладка (z-index 112) поверх итогов (70). А катсцена — целый
           ЭКРАН, и живёт он на z-index 2: итоги легли бы поверх него, закрыли
           кадр и съели все нажатия. Ровно это и случилось. */
        if(очередь.length)close();
        if(!сценыПодряд(очередь,fn))fn();
      };
      if(!предложен&&win&&!forfeit&&CHATS[si]&&CHATS[si].post&&!chatSeen(si,'post')){
        предложен=true;
        if(chatNote(si,'post',сцены))return;
      }
      сцены();
    };
    /* Все кнопки идут той же дверью, что и плитка рейда: иначе «ДАЛЬШЕ» снова
       увозило бы мимо сцены и разговора. Номер этапа берём из si, снятого в
       начале finish, — к этому моменту B уже могут обнулить. */
    if(box.querySelector('#rNext'))
      box.querySelector('#rNext').onclick=()=>продолжить(()=>{close();enterStage(si+1)});
    /* На финал идём МИМО показатьФинал: разговор уже отыграл «продолжить», и
       вторая проверка предложила бы его снова тому, кто только что отказался. */
    if(box.querySelector('#rEnd'))
      box.querySelector('#rEnd').onclick=()=>продолжить(()=>{
        close();B=null;S.theEnd=1;save();go('end')});
    box.querySelector('#rRetry').onclick=()=>продолжить(()=>{close();enterStage(si)});
    box.querySelector('#rMenu').onclick=()=>продолжить(()=>{close();B=null;go('menu')});
  },900);
}
