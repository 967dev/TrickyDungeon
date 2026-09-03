/* 07-cards.js — отрисовка карточки, гача, ролик вскрытия, экран колоды

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

/* ================= рендер карточки ================= */
function cardHTML(c,opts={}){
  const hex=c.ult?'#ff3355':TIER_HEX[c.t];
  const stars='★'.repeat(c.t+1);
  const kw=(c.kw||[]).map(k=>k==='taunt'?'ТАУНТ':'РАШ').join(' · ');
  let eff='';
  if(c.eff){const e=c.eff;
    const names={dmg:'урон',healHero:'лечение',healAll:'лечение всем',draw:'взять карту',buff:'усиление',
      buffAll:'усиление всем',aoe:'по всем врагам',weaken:'ослабление',drain:'урон+лечение',mana:'+1 маны'};
    eff=`${names[e.k]||''} ${e.v||''}${e.a?` (+${e.a}/+${e.h})`:''}`.trim()}
  /* Подписи под числами. Два цветных квадрата без подписи читались только
     тем, кто уже знает, что красный слева — урон: цвет и место конвенция, но
     конвенцию надо откуда-то узнать. */
  const atkHp=c.ty==='u'
    ?`<div class="cfAtkHp"><span><b class="a">${c.a}</b><i>УРОН</i></span>`
      +`<span><b class="h">${c.h}</b><i>ЖИЗНИ</i></span></div>`:'';
  const holo=S.foil
    ? `<div class="holo"><i></i></div><div class="cShine"></div><div class="cScan"></div><div class="cGrain"></div>`
    : '';
  const art=CARD_ART.has(c.id);
  return `<div class="cWrap t${c.t}${c.ult?' sec':''}${S.foil?' foil':''}${opts.open?' open':''}" ${opts.noAnim?'style="animation:none"':''}>
   <div class="cFlip">
    <div class="cFace cBack">
      <span class="bTape"></span>
      <span class="bStar"><svg viewBox="0 0 100 100"><path d="M50 8 L60 37 L91 38 L66 57 L75 88 L50 69 L25 88 L34 57 L9 38 L40 37 Z"/></svg></span>
      <span class="bT">БАМ-БАМ!!</span>
    </div>
    <div class="cFace cFront${art?' art':''}" style="--tc:${hex}">
      ${art?`<div class="cfArtImg" style="background-image:url(art/cards/${c.id}.webp)"></div>`:''}
      ${holo}
      <div class="cfHead"><span class="cfCost">${c.c}</span><span class="cfStars">${stars}</span></div>
      <div class="cfArt">${svgWrap(c.ty==='u'?(EMB[c.el]||EMB.steel):(EMB[spellIcon(c)]||EMB.boom))}</div>
      <div class="cfName">${c.n}</div>
      ${/* Коробка с эффектом появляется, только если есть что написать: у
            ванильного бойца пустая рамка читалась бы как потерянный текст. */''}
      ${kw||eff?`<div class="cfText">${kw?`<span class="cfKw">${kw}.</span> `:''}${eff}</div>`:''}
      ${/* Голос карты — отдельной строкой и ВСЕГДА. Раньше он стоял запасным
            вариантом описания (`eff||c.fl`) и потому доставался одним лишь
            бойцам без эффекта; на остальных 26 картах его не видел никто, он
            жил только в справочнике tools/cards_sheet.py. */''}
      ${c.fl?`<div class="cfFl">${c.fl}</div>`:''}
      ${atkHp}
      <div class="cfFoot"><span>${c.ty==='u'?'ЮНИТ':'ЭХО'}</span><span>${TIER_NAMES[c.t]}</span></div>
      ${opts.stk?`<div class="cfStk">${pick(c.stk||['!'])}</div>`:''}
    </div>
   </div>
  </div>`;
}
/* Карты, для которых нарисован арт. Остальные 27 продолжают рисоваться
   эмблемой — проверка по этому списку, а не попытка загрузить файл и
   обработать ошибку: несуществующий файл в background-image просто молча
   не покажется, и вместо карты был бы пустой прямоугольник. */
const CARD_ART=new Set([
  'r01','r02','r03','r04','r05','r06','r07','r08','s01','s02',
  'c01','c02','c03','c05','c08','c09','c11','s03','s04',
  /* третья партия, 2 сентября 2026 — тир ФРАКЦИЯ целиком */
  'c04','c06','c07','c10','c12','c13','s05','s06','s07',
  /* четвёртая партия, 3 сентября 2026 — тир ЛЕГЕНДА целиком, оба эха и
     секретный «Билет в Один Конец».
     На этом КОЛЛЕКЦИЯ ЗАКРЫТА: арт есть у всех 37 собираемых карт. Без него
     осталась одна zC0 «Перезарядка» — она обучающая, в коллекцию не попадает
     вовсе (noColl), и рисовать её незачем. */
  'L01','L02','L03','L04','L05','L06','s08','s09','X01',
]);
function spellIcon(c){return{dmg:'boom',healHero:'heal',healAll:'heal',draw:'card',buff:'up',buffAll:'up',aoe:'boom',weaken:'skull',drain:'skull',mana:'up'}[c.eff.k]||'boom'}

/* ================= гача ================= */
const BASE=[.7992,.1598,.0320,.0064,.0026];
const PITY_START=55,PITY_HARD=90,ULTRA_IN=.10,PACK=100;
/* Сколько искр даёт распыление лишней карты каждого тира.
   Считать эти числа надо против ФАКТИЧЕСКИХ частот, а не против BASE:
   гарант вытягивает ЛЕГЕНДУ с 0.64% до 2.03%, втрое, и подбор «на глаз» по
   базовым ставкам промахивается в разы. При старых [30,90,260,900,2600]
   средний пак возвращал 341 искру при цене 100 — печатал по +241 из воздуха,
   и бои теряли смысл. Сейчас возврат ≈63 при цене 100: пак остаётся стоком,
   искры приходят с рейдов, а распылить легенду всё ещё событие (два пака).
   Правишь BASE или PITY_* — пересчитывай и это. */
const DUST=[4,18,55,200,600];
function legChance(p){if(p>=PITY_HARD)return 1;if(p<PITY_START)return BASE[4];
  return BASE[4]+(1-BASE[4])*Math.pow((p-(PITY_START-1))/(PITY_HARD-(PITY_START-1)),2.6)}
function rollOne(){
  const pL=legChance(S.gacha.pity),scale=(1-pL)/(1-BASE[4]),r=Math.random();
  let tier=4,acc=0;
  for(let t=0;t<4;t++){acc+=BASE[t]*scale;if(r<acc){tier=t;break}}
  if(tier===4)S.gacha.pity=0;else S.gacha.pity++;
  let card;
  if(tier===4)card=(Math.random()<ULTRA_IN)?byId('X01'):pick(CARDS.filter(c=>c.t===3&&!c.ult));
  else card=pick(CARDS.filter(c=>c.t===tier&&!c.noColl));
  return card}
function renderGacha(){
  crumb('экран-ларька');
  tearing=false;
  $('#gTok').textContent=fmtN(S.sparks);
  const broke=S.sparks<PACK;
  $('#gBody').innerHTML=`
  <div class="gZone" id="gZone">
    <div class="pkRays"></div>
    <button class="pack" id="pack" ${broke?'disabled':''}
            aria-label="Вскрыть БАМ-ПАК за ${PACK} искр">
      <span class="pMouth"></span>
      <span class="pTear" id="pTear"><span class="pTab" id="pTab">ТЯНИ</span></span>
    </button>
    ${broke?'<div class="gHint">мало искр — зачисти рейд!</div>':'<div class="gHint">дёрни крышку или просто кликни</div>'}
    <div class="gPity">гарант: <b>${S.gacha.pity}/${PITY_HARD}</b>${S.gacha.pity>=PITY_START?' · шанс растёт!':''}</div>
  </div>`;
  /* Зубцы по нижнему краю полосы больше не рисуем clip-path'ом: он режет и
     попадание указателя, а зона захвата ярлыка заходит под нижнюю кромку —
     часть её переставала нажиматься. Зубчатую кромку и так несёт сам рендер
     по верху пачки. */
  primePackVideo();
  wirePack();
  crumb('ларёк-готов');
}
/* Единый порядок функций трансформа для полосы: и перетаскивание, и кадры
   анимации строят строку только через него. */
/* ================= ролик вскрытия =================
   Единственный бинарный ассет в проекте. Всё вокруг него построено так, что
   его отсутствие ничего не ломает: не загрузился, не декодируется, лежит на
   медленной сети — вскрытие просто идёт прежней CSS-анимацией.
   Момент склейки — 4.6с: к этой секунде вспышка из проёма заливает верх
   кадра, и переход к картам прячется в засветке, а не выглядит обрывом. */
const PACK_VIDEO='art/pack-open.mp4', PACK_VIDEO_CUT=4.6;
let packVid=null,packVidDead=false;
function primePackVideo(){
  /* Заходя в ларёк, просим догрузиться ещё раз. preload="auto" —
     всего лишь пожелание, и Safari его игнорирует: до жеста пользователя
     файл может не качаться вовсе. Поэтому ролик оказывался не готов ровно
     тогда, когда он нужен. load() на уже готовом элементе безвреден. */
  /* load() ровно один раз. Повторный вызов бросает уже скачанное и тянет
     822 КБ заново — а сюда заходят при каждом показе ларька. */
  if(packVid){
    if(!packVidDead&&!packVid.__pulled&&packVid.readyState<3){
      packVid.__pulled=1;crumb('догружаю-ролик');try{packVid.load()}catch(e){}
    }
    return;
  }
  const v=document.createElement('video');
  v.src=PACK_VIDEO;
  v.muted=true;                 /* у ролика своя дорожка, но звук у нас свой,
                                   процедурный, и он завязан на настройку S.snd */
  v.playsInline=true;v.preload='auto';v.setAttribute('playsinline','');
  v.className='pVid';v.style.display='none';
  crumb('ролик-создан');
  v.addEventListener('error',()=>{packVidDead=true});
  packVid=v;
}
/* Готовность спрашиваем у элемента, а не храним флаг, взведённый по
   canplaythrough. Это событие можно попросту не поймать — оно одноразовое и
   браузер вправе выстрелить им до навешивания слушателя или придержать в
   фоновой вкладке. Один пропуск — и ролик не включится уже никогда, молча.
   readyState>=3 (HAVE_FUTURE_DATA) отвечает по факту в любой момент. */
function packVidReady(){
  return !!(packVid&&!packVidDead&&!packVid.error&&packVid.readyState>=3);
}
function tearT(x,y,rz,rx,ry,sc){
  return `translate(${x}px,${y}px) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc})`;
}
function wirePack(){
  const pk=$('#pack');if(!pk)return;
  const tear=$('#pTear'),tab=$('#pTab');
  let down=false,sx=0,sy=0;
  if(tab){
    tab.addEventListener('pointerdown',e=>{if(pk.disabled)return;
      down=true;sx=e.clientX;sy=e.clientY;tear.style.animation='none';
      try{tab.setPointerCapture(e.pointerId)}catch(_){}
      e.preventDefault();e.stopPropagation()});
    tab.addEventListener('pointermove',e=>{if(!down)return;
      const dx=e.clientX-sx,dy=e.clientY-sy,d=Math.hypot(dx,dy),k=Math.min(1,d/130);
      tear.style.transition='none';
      /* Набор функций трансформа обязан совпадать с кадрами анимации отрыва
         вплоть до порядка. Иначе браузер не может интерполировать покомпонентно,
         сваливается в интерполяцию матриц — и все обороты свыше 180° по дороге
         теряются: вместо трёх витков в воздухе получается вялый доворот. */
      tear.style.transform=tearT(dx*.45,dy*.45-8*k,k*80,0,0,1);
      if(d>70&&!tab._rip){tab._rip=1;sfx.rip();PF.hit('light')}
      if(d>150){down=false;try{tab.releasePointerCapture(e.pointerId)}catch(_){}
        tab._rip=0;tearOff(false)}});
    const fin=e=>{if(!down)return;down=false;tab._rip=0;
      const d=Math.hypot((e.clientX||sx)-sx,(e.clientY||sy)-sy);
      if(d<8){tearOff(true);return}
      if(d>85){tearOff(false);return}
      tear.style.transition='transform .4s cubic-bezier(.2,1.8,.4,1)';tear.style.transform=''};
    tab.addEventListener('pointerup',fin);tab.addEventListener('pointercancel',fin);
  }
  pk.addEventListener('click',e=>{if(pk.disabled)return;
    if(e.target.closest&&e.target.closest('.pTab'))return;tearOff(true)});
}
/* Пак вскрывается двумя независимыми путями: pointerup по этикетке и click
   по самой коробке. Резкий свайп зовёт tearOff прямо из pointermove, палец
   отпускается над коробкой, браузер синтезирует click — и заход второй.
   Защиты по $('#pack') не хватало: id у коробки снимается только в
   отложенном колбэке, а до него ещё 600 мс. Флаг закрывает окно целиком,
   каким бы путём ни пришли. */
let tearing=false;
function tearOff(){
  const pk=$('#pack');if(!pk||pk.disabled||tearing)return;
  if(S.sparks<PACK){toast('Не хватает искр!',1);return}
  tearing=true;
  crumb('пак-вскрыт');
  S.sparks-=PACK;S.gacha.packs++;S.stats.packs++;
  $('#gTok').textContent=fmtN(S.sparks);
  sfx.tear();noise(.18,{f:150,q:.6,v:.22});PF.hit('heavy');
  const r=pk.getBoundingClientRect(),mx=r.left+r.width/2,my=r.top+20;
  burst(mx,my,['#ffd52e','#fff','#ffe063'],26,1.1);
  const mouth=pk.querySelector('.pMouth');if(mouth)mouth.classList.add('on');
  const useVid=!!(packVidReady()&&$('#gZone'));
  const mouthEl=pk.querySelector('.pMouth');
  /* Зев вскрывается ровно за первую фазу — синхронно с ходом разрыва.
     Нужен на обоих путях: на видеопуть пачка потом переезжает в «призрак»
     уже вскрытой, и закрытый зев там смотрелся бы нераспечатанным. */
  if(mouthEl)mouthEl.animate([{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)'}],
    {duration:400,easing:'cubic-bezier(.4,0,.5,1)',fill:'forwards'});
  const tear=$('#pTear');
  if(tear&&!useVid){tear.style.animation='none';
    /* Три фазы, как рвут по-настоящему.
       1. 0→35%: разрыв идёт по перфорации слева направо. Полоса ещё висит на
          правом крае (transform-origin:100% 50%), левый конец задирается и
          выворачивается к зрителю — это rotateY, а не плоский поворот.
       2. 35→50%: последний зубец лопается, полоса свободна.
       3. 50→100%: свободный полёт. rotateX — скручивание вокруг собственной
          продольной оси, rotateZ — кувырок в плоскости кадра. Падение вниз
          с ease-in по вертикали читается как тяжесть.
       Одинаковый набор функций во всех кадрах — см. комментарий в wirePack. */
    const from=tear.style.transform||tearT(0,0,0,0,0,1);
    tear.animate([
      {transform:from,offset:0},
      {transform:tearT(-4,-6,-10,0,22,1),offset:.14},
      {transform:tearT(-2,-12,-22,0,52,1),offset:.26},
      {transform:tearT(6,-16,-31,0,74,1),offset:.35},
      {transform:tearT(38,-34,10,150,150,.98),offset:.52},
      {transform:tearT(150,-10,120,430,300,.92),offset:.7},
      {transform:tearT(250,180,260,760,470,.82),offset:.86},
      {transform:tearT(330,560,400,1080,620,.72),opacity:1,offset:.94},
      {transform:tearT(350,660,430,1180,660,.7),opacity:0,offset:1}],
      {duration:1150,easing:'cubic-bezier(.3,.05,.6,1)',fill:'forwards'});}
  if(!useVid)pk.animate([{transform:'none'},{transform:'translateY(8px) scale(1.06,.88)'},{transform:'none'}],
    {duration:320,easing:'ease-out'});
  setTimeout(()=>sfx.whoosh(),useVid?2100:300);   /* в ролике полоса рвётся к 2.1с */
  const openPack=()=>{
    tearing=false;
    crumb('ok-карты');
    const zone=$('#gZone');
    const items=[];for(let i=0;i<5;i++)items.push(rollOne());
    /* Карты просто ложатся в коллекцию. Раньше здесь лишние копии молча
       превращались в искры, и счётчик прыгал ещё до того, как игрок увидел
       хоть одну карту — «начислилось непонятно за что». Теперь искры даёт
       только явное распыление на экране коллекции. */
    for(const c of items){
      const had=S.inv[c.id]||0;
      c._extra=had>=2;                    /* третья и дальше — в распыл */
      S.inv[c.id]=Math.min(INV_CAP,had+1)}
    save();$('#gTok').textContent=fmtN(S.sparks);
    /* Ушли с экрана за эти 600 мс (нативная «Назад» в Telegram, например) —
       показывать нечего, но искры уже списаны, поэтому карты всё равно
       зачисляем и говорим об этом. */
    if(!zone){toast('Пак вскрыт — 5 карт в коллекции');return}
    const g=document.createElement('div');g.className='packGhost';
    const zr=zone.getBoundingClientRect();
    g.style.left=(r.left-zr.left)+'px';g.style.top=(r.top-zr.top)+'px';g.style.width=r.width+'px';
    zone.appendChild(g);pk.removeAttribute('id');pk.style.width='100%';pk.style.pointerEvents='none';
    if(tear)tear.style.opacity='0';
    g.appendChild(pk);
    const holder=document.createElement('div');
    holder.innerHTML=`
      <div class="gHand" id="gHand">${items.map((c,i)=>cardHTML(c,{stk:1})).join('')}</div>
      <div class="gActions">
        <button class="btn pri" id="gAll">ОТКРЫТЬ ВСЕ</button>
        <button class="btn" id="gAgain">ЕЩЁ ПАК ⚡${PACK}</button>
        <button class="btn" id="gDone">ЗАБРАТЬ</button>
      </div>`;
    zone.replaceWith(holder);
    bang('БАМ!!');
    burst(mx,my,['#ffd52e','#ff4fd8','#35f0ff','#fff'],40,1.4);
    const cards=[...holder.querySelectorAll('.cWrap')];
    /* Раскрытие одной карты. Вынесено, чтобы «ОТКРЫТЬ ВСЕ» проигрывало ровно
       ту же анимацию и звук, а не свою урезанную копию. */
    const reveal=(w,i)=>{
      if(w.classList.contains('open'))return false;
      w.classList.add('open');
      const c=items[i];
      PF.hit(c.t>=3?'heavy':c.t>=2?'medium':'light');
      tone(220+i*90,.1,{v:.06});
      sfx.play(c.t);
      const rr=w.getBoundingClientRect();
      burst(rr.left+rr.width/2,rr.top+rr.height/2,fxCols(c.t),10+c.t*8,.8+c.t*.3);
      if(c.t>=3)bang(c.t===4?'ГРААЛЬ!!':pick(['ЛЕГЕНДА!!','ВОТ ЭТО ДРОП!!']),50,30);
      if(c.ult){sfx.secret();shake(document.body);
        setTimeout(()=>{burst(innerWidth/2,innerHeight/2,fxCols(4),80,2);
          bang('ИЗ ТЬМЫ!!',50,50)},250)}
      if(c._extra)setTimeout(()=>toast(`${c.n} — лишняя, распыли в коллекции`),400);
      return true;
    };
    cards.forEach((w,i)=>{
      const wr=w.getBoundingClientRect();
      const dx=mx-(wr.left+wr.width/2),dy=my-(wr.top+wr.height/2);
      w.animate([{transform:`translate(${dx}px,${dy}px) rotate(${rnd(-40,40)}deg) scale(.1)`,opacity:0},
        {transform:`translate(${dx*.5}px,${dy-120}px) scale(1.12)`,opacity:1,offset:.5},
        {transform:'translateY(-8px) scale(1.02)',offset:.85},{transform:'none',opacity:1}],
        {duration:760,delay:i*110,easing:'cubic-bezier(.22,.9,.3,1)',fill:'backwards'});
      setTimeout(()=>sfx.whip(),i*110+240);
      w.addEventListener('click',()=>{
        /* Закрытие снимает только класс. Раньше сюда же писался инлайновый
           transform:rotateY(0deg), и он навсегда перебивал по специфичности
           правило .cWrap.open .cFlip — карту после этого нельзя было открыть
           обратно ни одним кликом. */
        if(w.classList.contains('open')){w.classList.remove('open');sfx.ui();return}
        reveal(w,i);
      });
    });
    setTimeout(()=>{
      if(g){sfx.whoosh();
        g.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(50px) scale(.55) rotate(2deg)'}],
          {duration:400,easing:'ease-in',fill:'forwards'});
        setTimeout(()=>g.remove(),440)}
    },900);
    /* Раскрываем с задержкой, а не разом: иначе пять всплесков и пять звуков
       сливаются в кашу, и «граальный» дроп теряется в общей вспышке. */
    $('#gAll').onclick=()=>{
      cards.forEach((w,i)=>setTimeout(()=>reveal(w,i),i*160));
      $('#gAll').disabled=true;
    };
    $('#gAgain').onclick=()=>{if(S.sparks<PACK){toast('Не хватает искр!',1);return}renderGacha()};
    $('#gDone').onclick=()=>go('menu');
  };
  if(useVid)playPackVideo(pk,r,openPack);
  else setTimeout(openPack,600);
}
/* Проигрывает ролик поверх пачки и зовёт done() на склейке. Любая осечка —
   недоступный decoder, отклонённый play(), зависшая загрузка — обязана
   привести к тому же done(): искры уже списаны, оставить игрока перед
   застывшей картинкой нельзя. */
function playPackVideo(pk,r,done){
  const zone=$('#gZone');
  if(!zone){done();return}
  const v=packVid,zr=zone.getBoundingClientRect();
  /* Пачка занимает 74.80% ширины кадра и начинается на 13.16% — растягиваем
     кадр так, чтобы эти 74.80% стали шириной статичной пачки, и сдвигаем
     влево-вверх на её отступы внутри кадра. Тогда переход со статики на
     ролик происходит без единого пикселя смещения. */
  /* Соотношение берём у самого файла, а не константой: ролик уже один раз
     пережали (1246x1662 -> 720x960), и зашитое число пережило бы это молча,
     разъехавшись с вёрсткой. Доли положения пачки в кадре от разрешения не
     зависят, поэтому их пережатие не трогает. */
  const ar=(v.videoWidth&&v.videoHeight)?v.videoWidth/v.videoHeight:0.75;
  const VW=r.width/0.7480, VH=VW/ar;
  v.style.display='';v.style.width=VW+'px';v.style.height=VH+'px';
  v.style.left=(r.left-zr.left-0.1316*VW)+'px';
  v.style.top=(r.top-zr.top-0.0517*VH)+'px';
  try{v.currentTime=0}catch(e){}
  zone.appendChild(v);
  const fade=document.createElement('div');
  fade.className='pVidFade';
  fade.style.cssText+=`left:${v.style.left};top:${v.style.top};width:${VW}px;height:${VH}px`;
  zone.appendChild(fade);
  zone.classList.add('vid');
  crumb('ролик-пошёл');
  pk.style.visibility='hidden';
  const skip=document.createElement('div');
  skip.className='pVidSkip';skip.textContent='тап — пропустить';
  skip.style.left=(r.left-zr.left+r.width/2)+'px';
  skip.style.top=(r.top-zr.top+r.height+10)+'px';
  skip.style.bottom='auto';
  zone.appendChild(skip);
  let fired=false,cleanup=null;
  const finish=()=>{
    if(fired)return;fired=true;
    clearInterval(watch);if(cleanup)cleanup();
    try{v.pause()}catch(e){}
    v.remove();skip.remove();fade.remove();zone.classList.remove('vid');
    v.style.display='none';
    /* Видимость пачке НЕ возвращаем: ролик заканчивается вспышкой, и
       вернувшаяся статичная пачка мелькала одним кадром перед самыми
       картами — тот самый топорный рывок. */
    done();
  };
  /* Склейка по currentTime, а не по 'ended': последние 0.4с ролика — уже
     полностью засвеченный кадр, ждать их значит держать паузу впустую.
     Тот же таймер сторожит простой. Webview ставит медиа на паузу, когда
     приложение уходит в фон, — а в Telegram это происходит постоянно. Без
     сторожа игрок вернулся бы к застывшему кадру навсегда: искры списаны,
     карт нет, следующий пак заблокирован флагом tearing. Пробуем снять с
     паузы один раз, и если время всё равно не пошло — показываем карты. */
  let last=-1,stall=0,armed=false;
  const t0=performance.now();
  /* Абсолютный предел поверх счётчика простоя. Без него дёрганое
     воспроизведение растягивает ожидание как угодно долго: каждая попытка
     снять с паузы чуть двигает время, счётчик простоя обнуляется, и цикл
     начинается заново — замерено 7.7с вместо ожидаемых двух. Ролик обязан
     уложиться в свою длительность с запасом, иначе показываем карты. */
  const DEADLINE=(PACK_VIDEO_CUT+2.5)*1000;
  const watch=setInterval(()=>{
    const el=performance.now()-t0;
    if(el>DEADLINE){finish();return}
    /* Пока не убедились, что перемотка в ноль применилась, проверять порог
       склейки нельзя: элемент один на все паки, и со второго раза currentTime
       ещё держит значение с прошлого показа — сторож видел «уже досмотрено» и
       рубил ролик через 60мс. Взводимся, только увидев время в начале. */
    if(!armed){if(v.currentTime<.5)armed=true;else return}
    if(v.currentTime>=PACK_VIDEO_CUT){finish();return}
    /* Совсем не стартовал за полторы секунды — считаем ролик нерабочим и не
       держим игрока до общего предела. */
    if(el>1500&&v.currentTime<.1){finish();return}
    if(v.currentTime>last+.01){last=v.currentTime;stall=0;return}
    stall++;
    if(stall===12){const p=v.play();if(p&&p.catch)p.catch(()=>{})}   /* ~0.7с простоя */
    if(stall>=34)finish();                                            /* ~2с подряд — сдаёмся */
  },60);
  v.addEventListener('ended',finish,{once:true});
  v.addEventListener('click',finish);
  /* Отдельно ловим возврат из фона: не ждать сторожа лишнюю секунду. */
  const onVis=()=>{if(!document.hidden&&!fired&&v.paused){const p=v.play();if(p&&p.catch)p.catch(()=>{})}};
  document.addEventListener('visibilitychange',onVis);
  cleanup=()=>document.removeEventListener('visibilitychange',onVis);
  const pr=v.play();
  if(pr&&pr.catch)pr.catch(()=>finish());
}

/* ================= колода ================= */
let dFilter=-1;
function deckCount(id){return S.deck.filter(x=>x===id).length}
function renderDeck(){
  $('#dSub').textContent=`коллекция ${Object.keys(S.inv).length}/${COLLECTIBLE.length} карт`;
  $('#dFilters').innerHTML=`<button class="chip ${dFilter===-1?'on':''}" data-f="-1">ВСЕ</button>`+
    TIER_NAMES.map((n,i)=>`<button class="chip ${dFilter===i?'on':''}" data-f="${i}">${n}</button>`).join('');
  $$('#dFilters .chip').forEach(ch=>ch.onclick=()=>{dFilter=+ch.dataset.f;sfx.ui();renderDeck()});
  const sp=surplus();
  $('#dDust').innerHTML=sp.cards
    ? `<button class="btn pri" id="dDustBtn">РАСПЫЛИТЬ ЛИШНИЕ · +${fmtN(sp.sparks)} ⚡</button>
       <span class="dDustT">${sp.cards} шт · сверх двух копий · искры на паки</span>`
    : `<span class="dDustT">лишних копий нет · искры дают рейды</span>`;
  if(sp.cards)$('#dDustBtn').onclick=dustSurplus;
  $('#dGrid').innerHTML=COLLECTIBLE.map(c=>{
    const have=S.inv[c.id]||0,inDeck=deckCount(c.id);
    const show=dFilter<0||c.t===dFilter;
    if(!show)return '';
    const full=inDeck>=Math.min(have,2);
    /* open только у своих карт: без него cardHTML показывает рубашку, и чужая
       карта не выдаёт о себе вообще ничего. Отдельной заглушки рисовать не
       нужно — она уже нарисована. */
    return `<div class="dCard ${have?'':'locked'} ${inDeck?'sel':''}" data-id="${c.id}">
      ${have>1?`<span class="dCnt ${have>2?'extra':''}">×${have}</span>`:''}
      ${inDeck?`<span class="dIn">${inDeck}</span>`:''}
      ${cardHTML(c,{open:have?1:0,noAnim:1})}
      ${have?`<button class="dAdd ${full?'rem':''}" data-add="${c.id}"
        aria-label="${full?'Убрать из колоды':'В колоду'}">${full?'−':'+'}</button>`
           :`<span class="dLock">ЗАКРЫТО</span>`}
    </div>`}).join('');
  $$('#dGrid .dCard').forEach(el=>{
    /* Клик по карте открывает её крупно, а не кладёт в колоду. Режим
       «просмотр/выбор» для этого не нужен: набор колоды переехал на кнопку
       в углу карточки, и оба действия остались по одному касанию — просто
       у каждого своя цель. Режим пришлось бы помнить, и половина нажатий
       уходила бы «не туда». */
    el.onclick=()=>openCardView(el.dataset.id);
  });
  $$('#dGrid .dAdd').forEach(b=>b.onclick=e=>{
    e.stopPropagation();          /* иначе следом откроется просмотр */
    toggleDeck(b.dataset.add);
  });
  renderDeckSide();
}
/* Лишние копии — всё сверх двух: третью в колоду всё равно не положить,
   поэтому она мертвый груз, пока её не распылят. Распыляем только излишек,
   первые две копии не трогаем никогда — потерять играбельную карту одним
   промахом по кнопке на телефоне было бы слишком дорого. */
function surplus(){
  return COLLECTIBLE.reduce((a,c)=>{
    const n=(S.inv[c.id]||0)-2;
    return n>0?{cards:a.cards+n,sparks:a.sparks+n*DUST[c.t]}:a},{cards:0,sparks:0});
}
function dustSurplus(){
  const s=surplus();
  if(!s.cards){toast('Лишних карт нет',1);return}
  for(const c of COLLECTIBLE)if((S.inv[c.id]||0)>2)S.inv[c.id]=2;
  S.sparks+=s.sparks;save();
  sfx.sparks();PF.notify('success');
  toast(`Распылено ${s.cards} карт: +${fmtN(s.sparks)} искр`);
  renderDeck();
}
