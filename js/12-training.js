/* 12-training.js — режиссёр обучения

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

/* ================= тренировка: режиссёр =================
   Шаг описывает: что говорит бот, что подсвечено и по какому условию шаг
   считается выполненным. Условие — предикат по состоянию боя, а не
   подписка на клик: игрок может добиться того же разными путями (перетащить
   карту или тапнуть и нажать «Разыграть»), и обучение не должно от этого
   зависеть. Предикат проверяется после каждой перерисовки боя — renderBattle
   и так зовётся после любого изменения состояния.
   Ввод режем перехватчиком в фазе всплытия-вниз (capture): всё, что вне
   подсвеченного элемента и кнопки выхода, гасится. Это надёжнее «дырки» в
   оверлее — не зависит от контекстов наложения и работает с drag'ом. */
let TR=null;
const TR_GATED=['pointerdown','mousedown','touchstart','click'];

/* Индекс карты в руке по id — рука меняется, номера плывут, привязываться
   к позиции нельзя. */
function trHand(id){return B?B.p.hand.indexOf(id):-1}
function trCard(id){const i=trHand(id);return i<0?null:document.querySelector(`#bHand .hCard[data-i="${i}"]`)}
function trOnBoard(id){return B&&B.p.board.some(u=>u.card.id===id)}
/* Конкретный юнит на поле, а не «первый попавшийся». На шаге про размен
   подсветка обязана указывать на Стрелка с РАШем, а `#rowP .unit` вернул бы
   Гончую — она стоит первой, и игрок бил бы не тем. */
function trUnit(id){
  if(!B)return null;
  const u=B.p.board.find(x=>x.card.id===id);
  return u?document.querySelector(`#rowP .unit[data-uid="${u.uid}"]`):null;
}

function trSteps(){return [
{t:'Так. Ты <b>новенький</b>. Я — <b>БОТ-КАРТЁЖНИК</b>, раздаю в этом Провале с тех пор, как тут ещё был свет. Сядь ровно, покажу правила за один бой.',btn:'ДАВАЙ'},

{t:'Вот <b>ты</b>. Сердце — здоровье, у тебя <b>30</b>. Опустится до нуля — бой проигран. Ничего сложного.',at:'#pStats'},

{t:'А вот <b>он</b>. У него всего <b>14</b> — я подобрал тебе соперника попроще. Твоя задача ровно одна: <b>сбить эту цифру до нуля</b>.',at:'#bTop'},

{t:'Жёлтые ромбы — <b>мана</b>. Ей платят за карты. Сейчас у тебя <b>1</b>, и каждый ход будет на одну больше — до десяти. Поэтому в начале играют дёшево, а к концу выкладывают тяжёлое.',at:'#pManaBox'},

{t:'Это <b>рука</b>. Жёлтая рамка на карте = маны хватает, серая = не потянешь. Тапни <b>«Перезарядку»</b> — покажу, как смотреть карту вблизи.',
 at:()=>trCard('zC0'),until:()=>!!document.querySelector('.insCard')},

{t:'Крупный вид. Тут цена в левом верхнем углу, а внизу — что карта делает. <b>Перезарядка</b> стоит 0 и даёт <b>+1 маны прямо сейчас</b>. Жми <b>«РАЗЫГРАТЬ»</b>.',
 /* Подсвечиваем весь инспектор, а не .insCard: кнопки лежат в соседнем
    .insBtns, и при подсветке одной карточки нажать «РАЗЫГРАТЬ» было нельзя. */
 at:'.insView',until:()=>B&&B.p.mana>=2&&trHand('zC0')<0},

{t:'Видишь? Ромбов стало <b>два</b>. Ход первый, а играть можно как на втором — вот из-за таких мелочей и выигрывают.',at:'#pManaBox'},

{t:'Теперь по-взрослому. <b>Перетащи «Гончую Террас»</b> из руки вниз, на своё поле. Тащить — быстрее, чем тапать; привыкай сразу.',
 at:()=>trCard('r01'),until:()=>trOnBoard('r01')},

{t:'Стоит. Но <b>атаковать она сегодня не будет</b> — юнит в ход выхода отдыхает, поэтому и выглядит тускло. Со следующего хода — свободен.',at:'#rowP'},

{t:'Мана кончилась, делать нечего. Жми <b>«КОНЕЦ ХОДА»</b> и смотри, что он выкинет.',
 at:'#bEnd',until:()=>B&&B.eTurn>=1},

{t:'Выставил <b>Патрульного</b>, 2 атаки / 3 здоровья, и на нём <span class="kw">ТАУНТ</span>. Это стена: <b>пока он жив, бить можно только его</b> — ни мимо, ни в лицо. Запомни, на этом ломаются все новички.',at:'#rowE'},

{t:'Ломать стену будем правильно. <b>Сыграй «Стрелка Сирен»</b> — 2 маны, 3 атаки, 1 здоровья.',
 at:()=>trCard('r06'),until:()=>trOnBoard('r06')},

{t:'На нём <span class="kw">РАШ</span> — он <b>бьёт в тот же ход, когда вышел</b>. Единственное исключение из правила отдыха.',at:'#rowP'},

{t:'<b>Перетащи Стрелка на Патрульного.</b> Оба погибнут: он снимет 3 и добьёт, а получит 2 при одном здоровье. Это <b>размен</b> — ты отдал двухманового, чтобы убрать стену. Честная сделка.',
 at:()=>trUnit('r06'),until:()=>B&&B.e.board.length===0},

{t:'Стены нет — дорога открыта. <b>Тащи Гончую прямо на его панель наверху.</b> Это удар в лицо, минус 2 здоровья.',
 at:()=>trUnit('r01'),until:()=>B&&B.e.hp<=12},

{t:'<b>12.</b> Вот так это и работает: ставишь дешёвое, меняешь по-умному, а лишний урон уходит в героя. Заканчивай ход.',
 at:'#bEnd',until:()=>B&&B.eTurn>=2},

{t:'Он огрызнулся. Ничего, у тебя <b>три маны</b>. <b>Сыграй «Курсанта Аркадия»</b> — 3/3, крепкий парень без фокусов.',
 at:()=>trCard('r04'),until:()=>trOnBoard('r04')},

/* Между Курсантом и Искрой ОБЯЗАН стоять конец хода, и это не украшение.
   Курсант стоит 3, на третьем ходу маны ровно 3 — после него ноль. А Искра
   стоит 1, и шаг «брось её в панель» становился невыполнимым: обучение
   намертво вставало на восемнадцатом шаге. Ход кончается — на следующем маны
   четыре, и на Искру хватает. */
{t:'И снова пусто. Жми <b>«КОНЕЦ ХОДА»</b> — на следующем ходу маны будет <b>четыре</b>.',
 at:'#bEnd',until:()=>B&&B.eTurn>=3},

/* Ждём, что Искра УШЛА ИЗ РУКИ, а не что у врага стало мало здоровья. По
   здоровью шаг закрывался чужой работой: на четвёртом ходу и Гончая, и Курсант
   уже могут бить, и двенадцать превращались в десять сами собой — заклятие
   игрок при этом так и не трогал, а урок считался пройденным. */
{t:'Последнее, что стоит знать: <b>эхо-заклятия</b>. Они не встают на поле, а срабатывают и уходят. <b>«Искра»</b> за 1 ману — <b>2 урона в любую цель</b>. Брось её <b>прямо в его панель</b>.',
 at:()=>trCard('s01'),until:()=>B&&trHand('s01')<0},

{t:'Вот теперь ты знаешь всё, что нужно: <b>мана растёт, юниты отдыхают ход, ТАУНТ держит, РАШ бьёт сразу, заклятия летят куда скажешь</b>. Дальше — сам.',
 btn:'ДОБИТЬ ЕГО'},

{t:'Добивай. Я не мешаю — жми что хочешь. Как закончишь, забирай <b>искры</b> и иди в настоящий рейд.',btn:'ПОНЯЛ'},
]}


function trEl(sel){return typeof sel==='function'?sel():(sel?document.querySelector(sel):null)}

function trBlock(e){
  /* Любая ошибка внутри должна ПРОПУСКАТЬ событие, а не глотать его. Один
     раз здесь уже был невалидный селектор, обработчик падал — и именно
     поэтому блокировка не работала. Но симметричная беда хуже: если он
     упадёт после stopPropagation, заблокированным окажется всё приложение.
     Поэтому вся логика в try, а на исключении — молча пропускаем. */
  try{ trBlockInner(e) }catch(err){ try{console.warn('[bbduel] шлюз обучения',err)}catch(_){} }
}
function trBlockInner(e){
  if(!TR||!TR.armed)return;
  const t=e.target;
  if(t.closest&&(t.closest('.trSay')||t.closest('.trBot')))return;   /* пузырь свой */
  /* Инспектор пропускаем всегда. Он открывается только тапом по разрешённой
     карте, но его кнопки в разрешённую зону не входили — и если игрок на шаге
     «перетащи карту» вместо перетаскивания тапал по ней, окно открывалось и
     закрывалось уже нечем: ни «РАЗЫГРАТЬ», ни «ЗАКРЫТЬ» не нажимались. */
  if(t.closest&&t.closest('.iWrap'))return;
  const allow=TR.allow&&trEl(TR.allow);
  /* Ровно два условия: сам разрешённый элемент или что-то внутри него.
     Раньше тут была ещё склейка селектора по id, и на элементе без id
     получалось невалидное «# » — closest бросал исключение, перехватчик
     падал и пропускал ВСЁ. Блокировка не работала вообще. */
  if(allow&&(t===allow||allow.contains(t)))return;
  e.stopPropagation();e.preventDefault();
}

/* Отрисовка разделена намеренно.
   trRender — только при смене шага: текст, кнопка, что разрешено нажимать.
   trPlace — геометрия, каждый тик. Раньше это была одна функция, и рамка
   пересчитывалась лишь на шагах с условием: renderBattle перестраивает руку
   целиком, старый элемент отваливается, и рамка оставалась висеть на пустом
   месте. Плюс пересборка кнопки «ДАЛЬШЕ» на каждом тике могла увести клик
   из-под пальца. */
function trRender(){
  if(!TR)return;
  const st=TR.steps[TR.i];if(!st)return;
  const say=TR.say;
  say.querySelector('.trTxt').innerHTML=st.t;
  say.querySelector('.trStep').textContent=`${TR.i+1} / ${TR.steps.length}`;
  const btns=say.querySelector('.trBtns');
  const old=btns.querySelector('.btn');if(old)old.remove();
  if(!st.until){                       /* информационный шаг — ведём кнопкой */
    const b=document.createElement('button');
    b.className='btn pri';b.textContent=st.btn||'ДАЛЬШЕ ►';
    b.onclick=()=>{sfx.ui();trNext()};
    btns.insertBefore(b,btns.firstChild);
  }
  TR.allow=st.until?st.at:null;
  trPlace();
}

const trHits=(a,b)=>!(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom);
function trBubbleBox(){
  const s=TR.say.getBoundingClientRect(),b=TR.bot.getBoundingClientRect();
  return {left:Math.min(s.left,b.left),right:Math.max(s.right,b.right),
          top:Math.min(s.top,b.top),bottom:Math.max(s.bottom,b.bottom)};
}
function trSide(top){TR.say.classList.toggle('top',top);TR.bot.classList.toggle('top',top)}

function trPlace(){
  if(!TR)return;
  const st=TR.steps[TR.i];if(!st)return;
  const el=st.at?trEl(st.at):null;
  const r=el&&el.getBoundingClientRect();
  /* Цели нет или она схлопнута (элемент пересоздан и ещё не разложен) —
     затемняем экран целиком, рамку прячем: лучше честное затемнение, чем
     рамка вокруг пустоты. */
  if(!r||!r.width||!r.height){
    TR.ring.classList.add('off');TR.ov.classList.remove('off');return;
  }
  TR.ov.classList.add('off');
  TR.ring.classList.remove('off');
  const pad=6;
  TR.ring.style.left=(r.left-pad)+'px';TR.ring.style.top=(r.top-pad)+'px';
  TR.ring.style.width=(r.width+pad*2)+'px';TR.ring.style.height=(r.height+pad*2)+'px';
  /* Куда убрать бота с репликой, чтобы не закрывать то, на что показываем.
     Решение считается от положения цели, а не от текущей стороны пузыря —
     иначе он бы дёргался туда-сюда на каждом тике. Проверяем замером, а не
     порогом по высоте: пузырь с ботом занимает заметный угол экрана, и
     «цель в нижней половине» ещё не значит, что он её накрыл. */
  const ringR={left:r.left-pad,right:r.right+pad,top:r.top-pad,bottom:r.bottom+pad};
  const want=(r.top+r.height/2)>innerHeight*.5;
  trSide(want);
  if(trHits(trBubbleBox(),ringR)){
    trSide(!want);
    if(trHits(trBubbleBox(),ringR))trSide(want);   /* мешает с обеих — берём предпочтительную */
  }
}

function trNext(){
  if(!TR)return;
  const st=TR.steps[TR.i];
  if(st&&st.go)try{st.go()}catch(e){}
  TR.i++;
  if(TR.i>=TR.steps.length){trFinish();return}
  trRender();
  trCheck();
}

/* Шаг с условием может оказаться уже выполненным (игрок опередил подсказку) —
   тогда проматываем сразу, иначе обучение зависнет на готовом требовании. */
function trCheck(){
  if(!TR||TR.done)return;
  const st=TR.steps[TR.i];
  if(!st)return;
  trPlace();
  if(!st.until||TR.pending)return;
  let ok=false;try{ok=!!st.until()}catch(e){ok=false}
  if(!ok)return;
  /* Между выполнением условия и переходом есть пауза, чтобы игрок увидел
     результат своего действия. Всё это время нельзя держать разрешённой
     старую цель: на шаге «тапни карту» инспектор уже открыт, а кнопка
     «РАЗЫГРАТЬ» в нём ещё заблокирована — нажатие просто не срабатывает и
     выглядит поломкой. Поэтому сразу отдаём разрешение следующему шагу. */
  TR.pending=true;
  const nxt=TR.steps[TR.i+1];
  TR.allow=nxt&&nxt.until?nxt.at:null;
  setTimeout(()=>{
    if(!TR||TR.done)return;
    TR.pending=false;
    if(TR.steps[TR.i]===st)trNext();
  },st.pause||520);
}

function startTraining(){
  stopTraining(true);
  const ov=document.createElement('div');ov.className='trOv';
  const ring=document.createElement('div');ring.className='trRing off';
  const bot=document.createElement('div');bot.className='trBot';
  bot.innerHTML=`<div class="trBotArt">
      <img src="art/bot.webp" alt="БОТ-КАРТЁЖНИК" draggable="false">
      <span class="trEye sp"></span><span class="trEye cl"></span>
    </div>`;
  const say=document.createElement('div');say.className='trSay';
  say.innerHTML=`<div class="trWho">БОТ-КАРТЁЖНИК · DEALER UNIT-07</div>
    <div class="trTxt"></div>
    <div class="trBtns"><button class="trQuit">покинуть тренировку</button>
      <span class="trStep"></span></div>`;
  document.body.append(ov,ring,bot,say);
  say.querySelector('.trQuit').onclick=()=>{
    sfx.ui();
    if(confirm('Выйти из тренировки? Бой прервётся.')){stopTraining();finish(false,true)}
  };
  TR={steps:trSteps(),i:0,armed:true,allow:null,ov,ring,bot,say,done:false,pending:false,tick:0};
  /* renderBattle зовётся только на изменение состояния боя, а часть условий
     смотрит на интерфейс (открылся ли инспектор). Такие шаги без опроса
     висли бы вечно. 200мс — незаметно на глаз и дёшево. */
  TR.tick=setInterval(()=>{
    /* Исключение в предикате шага или в раскладке не должно ни ронять тик,
       ни оставлять обучение с навешенным шлюзом: ловим и идём дальше. */
    try{ if(TR)trCheck() }catch(e){ try{console.warn('[bbduel] тик обучения',e)}catch(_){} }
  },200);
  /* Гасим только то, что НАЧИНАЕТ взаимодействие. pointerup/pointermove
     трогать нельзя: драг вешает их на window и получает целью то, над чем
     отпустили палец, а не карту — заблокировав их, мы бы сломали как раз
     перетаскивание карты на поле, которому и учим. Начать запрещённое
     действие всё равно нечем, а click гасится отдельно: блокировка
     pointerdown его не отменяет. */
  for(const ev of TR_GATED)document.addEventListener(ev,trBlock,true);
  addEventListener('resize',trPlace);
  trRender();trCheck();
}

function stopTraining(silent){
  if(!TR)return;
  TR.done=true;TR.armed=false;
  if(TR.tick)clearInterval(TR.tick);
  for(const ev of TR_GATED)document.removeEventListener(ev,trBlock,true);
  removeEventListener('resize',trPlace);
  for(const n of [TR.ov,TR.ring,TR.bot,TR.say])if(n&&n.parentNode)n.remove();
  TR=null;
  if(!silent)closeInspector();
}

function trFinish(){
  /* Последний шаг отработал — снимаем блокировку и отдаём бой игроку.
     Добивание он делает сам, победа приходит обычным путём. */
  stopTraining();
}
