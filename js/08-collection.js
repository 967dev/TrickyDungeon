/* 08-collection.js — крупный просмотр карты, карта рейдов, вход в бой

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

/* ================= крупный просмотр карты =================
   Открывается кликом по карточке в коллекции. Наклон здесь работает и пальцем
   тоже — в отличие от сетки, где касание означает прокрутку, а не осмотр.
   Кнопка колоды живёт и здесь: разглядев карту, естественно тут же решить её
   судьбу, не закрывая и не выискивая ту же карточку обратно в сетке. */
let cvEl=null,cvId=null;
function openCardView(id){
  const c=byId(id); if(!c)return;
  const have=S.inv[id]||0;
  if(!have){toast('Нет такой карты — открой пак в ларьке!',1);return}
  closeCardView(true);
  cvId=id;
  cvEl=document.createElement('div');
  cvEl.className='cvBd';
  cvEl.innerHTML=`<div class="cvCard">${cardHTML(c,{open:1,noAnim:1})}</div>
    <div class="cvBtns">
      <button class="btn pri" id="cvDeck"></button>
      <button class="btn" id="cvClose">ЗАКРЫТЬ</button>
    </div>
    <div class="cvNote" id="cvNote"></div>`;
  document.body.appendChild(cvEl);
  requestAnimationFrame(()=>cvEl&&cvEl.classList.add('on'));
  cvHiArt(id);
  cvSync();
  /* Клик по фону закрывает, по самой карте — нет: иначе осмотр обрывался бы
     на первом же движении, ради которого его и открыли. */
  cvEl.onclick=e=>{if(e.target===cvEl)closeCardView()};
  $('#cvClose').onclick=()=>closeCardView();
  $('#cvDeck').onclick=()=>{toggleDeck(cvId);cvSync()};
  cvWireTilt(cvEl.querySelector('.cvCard'));
  sfx.ui();
}
/* Игровой арт лежит в 512px — этого хватает руке и сетке, где карта ~150px.
   Здесь она втрое крупнее, и на 512 видно кашу: тонкие искры и волоски не
   переживают сжатие оригинала 1254 -> 512. Поэтому подменяем картинку на
   версию 1024 из art/cards/hi, и только по факту открытия: телефон не платит
   за то, во что не заглядывал. Подменяем после декодирования, чтобы карта не
   моргнула пустотой; нет файла — onerror молчит и остаётся обычный арт. */
const cvHiSeen=new Set();
function cvHiArt(id){
  const layer=cvEl&&cvEl.querySelector('.cfArtImg');
  if(!layer)return;
  const src='art/cards/hi/'+id+'.webp';
  const put=()=>{ if(cvId===id&&cvEl)layer.style.backgroundImage='url('+src+')' };
  if(cvHiSeen.has(id)){put();return}
  const im=new Image();
  im.onload=()=>{cvHiSeen.add(id);put()};
  im.src=src;
}
/* Подпись и кнопка пересобираются после каждой правки колоды, а не при
   открытии: иначе, добавив карту, игрок видел бы прежнюю надпись. */
function cvSync(){
  if(!cvEl)return;
  const have=S.inv[cvId]||0, inDeck=deckCount(cvId);
  const full=inDeck>=Math.min(have,2);
  const b=$('#cvDeck');
  b.textContent=full?'УБРАТЬ ИЗ КОЛОДЫ':'В КОЛОДУ';
  b.classList.toggle('danger',full);
  $('#cvNote').textContent=`в колоде ${inDeck} · у тебя ${have} · всего ${S.deck.length}/20`;
}
function closeCardView(now){
  if(!cvEl)return;
  const el=cvEl; cvEl=null; cvId=null;
  if(now){el.remove();return}
  el.classList.remove('on');
  setTimeout(()=>el.remove(),200);
}
/* Наклон в просмотре — свой обработчик, а не общий по документу: тот нарочно
   отбрасывает касания, потому что в сетке палец означает прокрутку. Здесь
   прокручивать нечего, и наклон пальцем как раз нужен — на телефоне это
   единственный способ его увидеть. */
function cvWireTilt(box){
  if(!box||!gfx().tilt)return;
  const w=box.querySelector('.cWrap'); if(!w)return;
  w.classList.add('tilt','rest');
  const set=e=>{
    const r=box.getBoundingClientRect(); if(!r.width)return;
    w.classList.remove('rest');
    w.style.setProperty('--tx',(((e.clientX-r.left)/r.width)*2-1).toFixed(3));
    w.style.setProperty('--ty',(((e.clientY-r.top)/r.height)*2-1).toFixed(3));
  };
  const rest=()=>{w.classList.add('rest');
    w.style.setProperty('--tx',0);w.style.setProperty('--ty',0)};
  box.addEventListener('pointerdown',e=>{
    try{box.setPointerCapture(e.pointerId)}catch(err){}
    set(e);
  });
  box.addEventListener('pointermove',e=>{
    /* Мышь наклоняет по наведению, палец — только пока держит: иначе карта
       так и осталась бы завалившейся после того, как палец убрали. */
    if(e.pointerType==='mouse'||e.buttons)set(e);
  });
  box.addEventListener('pointerup',rest);
  box.addEventListener('pointercancel',rest);
  box.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')rest()});
}

/* Уход с экрана коллекции обязан гасить превью: без этого оно оставалось бы
   висеть поверх боя, если увести мышь с карты уже после смены экрана. */
function toggleDeck(id){
  const have=S.inv[id]||0;if(!have){toast('Нет такой карты — открой пак в ларьке!',1);return}
  const inDeck=deckCount(id);
  if(inDeck>0&&inDeck>=Math.min(have,2)){
    S.deck=S.deck.filter(x=>x!==id);sfx.ui();
  }else if(S.deck.length>=20){toast('Колода полная — 20 карт',1);tone(130,.12,{v:.09});return}
  else{S.deck.push(id);sfx.ui()}
  save();renderDeck();
}
function renderDeckSide(){
  $('#dSideS').textContent=`${S.deck.length} / 20`;
  $('#dCount').textContent=`${S.deck.length} / 20`;
  $('#dCount').classList.toggle('bad',S.deck.length!==20);
  const cnt={};for(const id of S.deck)cnt[id]=(cnt[id]||0)+1;
  $('#dDeck').innerHTML=Object.keys(cnt).map(id=>{const c=byId(id);
    return `<div class="dRow" data-id="${id}" style="--tc:${c.ult?'#ff3355':TIER_HEX[c.t]}">
      <span class="rC">${c.c}</span><span class="rN">${c.n}</span>
      <span class="rA">${cnt[id]}× · ${c.ty==='u'?c.a+'/'+c.h:'эхо'}</span></div>`}).join('')||
    '<div style="text-align:center;color:#55556a;font-size:11px;font-style:italic;padding:14px">пусто</div>';
  $$('#dDeck .dRow').forEach(el=>el.onclick=()=>{S.deck.splice(S.deck.indexOf(el.dataset.id),1);save();renderDeck();sfx.ui()});
  $('#dAuto').onclick=()=>{S.deck=autoDeck();save();renderDeck();sfx.sparks();toast('Авто-набор собран!')};
  $('#dToBattle').onclick=()=>{
    if(S.deck.length!==20){toast('Нужно ровно 20 карт!',1);return}
    go('stages')};
}
function autoDeck(){
  const pool=COLLECTIBLE.filter(c=>(S.inv[c.id]||0)>0).flatMap(c=>{
    const n=Math.min(S.inv[c.id],2);return Array(n).fill(c)});
  const score=c=>(c.t*1.4)+(c.ty==='u'?(c.a+c.h)/c.c/2:1.4)+(c.kw?.includes('taunt')?.6:0)+(c.kw?.includes('rush')?.4:0)+(c.eff?.5:0);
  pool.sort((a,b)=>score(b)-score(a));
  const deck=[];const used={};
  for(const c of pool){if(deck.length>=20)break;
    if((used[c.id]||0)<2){deck.push(c.id);used[c.id]=(used[c.id]||0)+1}}
  return deck.slice(0,20);
}

/* ================= этапы =================
   Отрисовка экрана рейдов уехала в js/13-map.js: список-гармошка стал картой
   города. Здесь остался ЕДИНСТВЕННЫЙ вход в бой — он от подачи не зависит и
   нужен всем, кто бой начинает. */

/* ================= вход в бой =================
   ЕДИНСТВЕННАЯ дверь в бой из интерфейса. Раньше их было несколько — плитка
   рейда, «ДАЛЬШЕ» после победы, «ЕЩЁ РАЗ», — и цепочка «сцена → чат → бой»
   была написана только на первой. Нажимая «ДАЛЬШЕ» после тренировки, игрок
   попадал сразу в следующий бой: ни кат-сцены, ни разговора. Дважды за день
   один и тот же класс ошибки: две дороги к одной цели, и на второй забыли
   всё, что делает первая.
   Поэтому проверки и порядок живут здесь, а не в обработчиках. Появится третий
   способ начать бой — он получит то же самое, ничего не дописывая. */
function enterStage(i){
  if(!Number.isFinite(i)||!STAGES[i])return;
  if(i>S.stage){toast('Сначала зачисти предыдущий бой!',1);return}
  if(S.deck.length!==20){toast('Собери колоду — ровно 20 карт!',1);go('deck');return}
  const вБой=()=>vnLoad(STAGES[i].n.toUpperCase(),900,()=>startBattle(i));
  /* Чат — только пока не прочитан. Прочитанный остаётся под значком телефона:
     на поздних рейдах игрок ходит по многу раз, и обязательные два тапа перед
     каждой попыткой из «живо» превращаются в помеху. */
  const сЧатом=()=>{
    if(CHATS[i]&&CHATS[i].pre&&!chatSeen(i,'pre')&&chatNote(i,'pre',вБой))return;
    вБой();
  };
  /* Сюжет — один раз, перед первым настоящим рейдом. У каждого героя своя
     сцена, поэтому проверка только на флаг. Обучение (этап 0) сюда не
     попадает: сюжет привязан к первому бою акта, а не к любому бою.
     На рейды возвращаемся ПЕРЕД чатом: иначе телефон ложится поверх экрана
     новеллы, а у того нет своего выхода — стрелка «назад» вела бы в никуда. */
  if(i===1&&!S.story&&STORIES[S.hero]){
    vnLoad(STORIES[S.hero].intro,1100,()=>startStory(()=>{go('stages');сЧатом()}));
    return;
  }
  /* Катсцены этапа — перед чатом и по той же причине, что и вступление: экран
     новеллы не имеет своего выхода, и телефон поверх него вёл бы в никуда. */
  if(сценыПодряд(сценыЭтапа('before',i),()=>{go('stages');сЧатом()}))return;
  сЧатом();
}
