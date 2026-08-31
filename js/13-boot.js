/* 13-boot.js — кристаллы, сторож боя, запуск. Подключается ПОСЛЕДНИМ: тут исполняемый код старта

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

/* ================= кристаллы и параллакс ================= */
function sprinkleCrystals(container,n,cols){
  for(let i=0;i<n;i++){
    const c=document.createElement('i');c.className='crystal';
    c.style.left=rnd(4,93)+'%';c.style.top=rnd(6,86)+'%';
    const s=rnd(6,13);
    c.style.width=s+'px';c.style.height=s+'px';
    const col=pick(cols);c.style.borderColor=col;c.style.color=col;
    c.style.animationDuration=rnd(4,9).toFixed(2)+'s';
    c.style.animationDelay=(-rnd(0,9)).toFixed(2)+'s';
    container.appendChild(c);
  }
}
function bindParallax(el){
  el.addEventListener('pointermove',e=>{
    const r=el.getBoundingClientRect();
    el.style.setProperty('--mx',(((e.clientX-r.left)/r.width)-.5).toFixed(3));
    el.style.setProperty('--my',(((e.clientY-r.top)/r.height)-.5).toFixed(3));
  });
}

/* ================= сторож боя =================
   Точечные заплатки закрывают только те причины, которые мы придумали.
   Здесь проверяется следствие: пока идёт бой, игрок обязан иметь возможность
   действовать. Откуда взялся затык — исключение, неучтённая ветка, гонка
   таймеров, будущая правка — сторожу безразлично.
   Два инварианта:
   1. Фаза игрока → кнопка «конец хода» не может быть заблокирована.
   2. Не фаза игрока → это не может длиться бесконечно.
   Пороги с большим запасом: ход ИИ с полной доской и анимациями идёт до
   десяти секунд, и ложное срабатывание тут хуже самого затыка. */
const WD_BTN_MS=3000, WD_TURN_MS=20000;
let wdPhase=null, wdSince=0;
setInterval(()=>{
  try{
    if(!B||B.over||CUR!=='battle'){wdPhase=null;return}
    /* Пока вкладка спрятана, время не считаем. Браузер душит таймеры, ход
       врага растягивается в разы, и сторож принимал это за зависание —
       отбирал ход у врага у вернувшегося игрока. Свернуть игру посреди хода
       противника в мессенджере проще простого. */
    if(document.hidden){wdPhase=null;return}
    /* Сравниваем ЗАХОД в фазу, а не её имя. По имени сторож ошибался:
       короткая фаза 'wait' живёт 200мс, между опросами (раз в 2с) он видел её
       через раз — и через несколько ходов принимал два разных попадания в
       'wait' за одно бесконечное и отбирал у врага ход. В журнале это выглядит
       как два хода игрока подряд без хода врага между ними: именно так баг и
       нашёлся. Чем быстрее игрок жмёт «конец хода», тем вероятнее промах. */
    const заход=B.phase+'#'+(B.seq||0);
    if(заход!==wdPhase){wdPhase=заход;wdSince=Date.now();return}
    const stuck=Date.now()-wdSince;
    const btn=$('#bEnd');
    if(B.phase==='p'){
      if(btn&&btn.disabled&&stuck>WD_BTN_MS){
        btn.disabled=false;
        try{console.warn('[bbduel] сторож: разблокировал конец хода')}catch(e){}
      }
    }else if(stuck>WD_TURN_MS){
      try{console.warn('[bbduel] сторож: ход завис на фазе',B.phase)}catch(e){}
      toast('Ход завис — возвращаю тебе',1);
      wdPhase=null;
      startTurn('p');
    }
  }catch(e){}
},2000);

/* ================= запуск ================= */
PF.init();
renderMenu();
document.body.classList.add('menuOn');
/* Выбор героя больше не встречает игрока на пороге: меню открывается сразу,
   а спрашиваем при первом нажатии «ИГРАТЬ» (см. перехват в go). */
document.querySelector('#mbSilL .mbSil').innerHTML=SIL.diesel;
document.querySelector('#mbSilR .mbSil').innerHTML=SIL.aya;
sprinkleCrystals($('#mbCry'),9,['#ffd52e','#35f0ff','#ff4fd8']);
bindParallax($('#scr-menu'));
bindParallax($('#scr-battle'));
document.addEventListener('pointerdown',()=>{const c=ac();if(c&&c.state==='suspended')c.resume()},{once:true});

/* Прерванный бой — вернуть игрока прямо в него, минуя меню. */
restoreBattle();

/* Снять заставку: по готовности фоновой картинки, но не позже потолка. */
(()=>{
  const el=$('#boot');if(!el)return;
  let done=false;
  const drop=()=>{if(done)return;done=true;
    el.classList.add('out');setTimeout(()=>el.remove(),500)};
  const BOOT_MAX=2600;
  setTimeout(drop,BOOT_MAX);
  const img=new Image();
  img.onload=()=>setTimeout(drop,260);   /* чуть придержать, чтобы не мигало */
  img.onerror=drop;
  img.src='art/menu-bg.webp';
})();

/* Подтянуть облачный сейв. Локальный уже загружен и игра работает — облако
   лишь догоняет, если на другом устройстве прогресс дальше. Сравниваем по
   числу зачищенных рейдов, чтобы случайно не откатить игрока назад.
   Нормализация та же, что в load(): merge на клон DEF, иначе fixS падает
   на отсутствующих полях. */
let cloudPulled=false;
function pullCloud(){
  if(cloudPulled||!PF.isTMA)return;
  cloudPulled=true;
  PF.cloudGet('bbduel',raw=>{
    if(!raw)return;
    try{
      const d=JSON.parse(raw);
      if(typeof d!=='object'||!d)return;
      const cloud=Object.assign(clone(DEF),d);
      cloud.gacha=Object.assign({pity:0,packs:0},d.gacha||{});
      cloud.stats=Object.assign({},DEF.stats,d.stats||{});
      migrate(cloud);
      const mine=Object.keys(S.done||{}).length,theirs=Object.keys(cloud.done||{}).length;
      if(theirs>mine){
        S=fixS(cloud);save();
        if(CUR==='menu')renderMenu();
        toast('Прогресс подтянут из облака');
      }
    }catch(e){}
  });
}
/* Наклон карты под указателем — то, ради чего затевался паралакс: без него
   слои стоят на месте и объёма не видно.
   Слушатель ОДИН на весь документ, а не по штуке на карту: в коллекции их под
   сорок, и сорок подписок на pointermove — это ровно тот перерасход, на котором
   у нас недавно умирала страница.
   Только для мыши, и решает это САМО событие (pointerType), а не медиазапрос
   при подписке. Медиазапрос читается один раз на старте, и устройство, у
   которого мышь появилась позже — планшет с клавиатурой, десктоп в режиме
   эмуляции, — наклона не получило бы уже никогда. Проверка в обработчике
   вдобавок точнее по смыслу: на тач-экране pointermove приходит во время
   перетаскивания карты на поле, и наклонять её там как раз не надо.
   Гироскоп для всей коллекции разом не включаем — это та же ловушка с памятью,
   из которой мы только что выбирались. Для крупных экранов (вскрытие пака,
   инспектор) его можно будет добавить отдельно: там карт единицы. */
/* ================= настройки графики =================
   Три готовых набора и точная подстройка под ними. Хранится один объект
   флагов; набор — это просто его заполнение, а не отдельный режим. Иначе
   пришлось бы держать два источника правды и разбирать, кто из них главнее,
   когда игрок тронет отдельный переключатель. */
const GFX_KEYS=['irid','spec','scan','grain','glow','tilt'];
const GFX_NAMES={irid:['ПЕРЕЛИВЫ','радужный спектр по редкости карты'],
                 spec:['ПОЛОСКА БЛИКА','светлая полоса, идущая по стеклу'],
                 scan:['СТРОЧКИ','тонкая развёртка, как у проектора'],
                 grain:['ЗЕРНО','плёночный шум поверх карты'],
                 glow:['СВЕЧЕНИЕ','ореол вокруг карты в цвет редкости'],
                 tilt:['НАКЛОН','карта поворачивается за указателем, слои расходятся']};
const GFX_PRESETS=[
  {n:'ПРОСТАЯ', s:'только стекло — для слабых телефонов',
   v:{irid:0,spec:0,scan:0,grain:0,glow:0,tilt:0}},
  {n:'ОБЫЧНАЯ', s:'переливы, блик и наклон; без плёночной текстуры',
   v:{irid:1,spec:1,scan:0,grain:0,glow:1,tilt:1}},
  {n:'ПОЛНАЯ',  s:'всё сразу, как задумано',
   v:{irid:1,spec:1,scan:1,grain:1,glow:1,tilt:1}},
];
function gfx(){ if(!S.gfx||typeof S.gfx!=='object')S.gfx=clone(GFX_PRESETS[2].v); return S.gfx }
/* Какой набор сейчас — вычисляем сравнением, а не храним. Хранимый номер
   разъезжается с флагами при первой же ручной правке. */
function gfxPreset(){
  const g=gfx();
  return GFX_PRESETS.findIndex(p=>GFX_KEYS.every(k=>!!p.v[k]===!!g[k]));
}
function applyGfx(){
  const g=gfx(), b=document.body;
  b.classList.toggle('gNoIrid',!g.irid);
  b.classList.toggle('gNoSpec',!g.spec);
  b.classList.toggle('gNoScan',!g.scan);
  b.classList.toggle('gNoGrain',!g.grain);
  b.classList.toggle('gNoGlow',!g.glow);
  /* Слои вообще не попадают в разметку, если не включён ни один из них:
     четыре пустых узла на каждую из сорока карт коллекции — это зря. */
  S.foil=(g.irid||g.spec||g.scan||g.grain)?1:0;
  if(!g.tilt)document.querySelectorAll('.cWrap.tilt').forEach(w=>{
    w.classList.remove('tilt');w.style.removeProperty('--tx');w.style.removeProperty('--ty')});
}

function wireCardTilt(){
  let cur=null;
  const relax=w=>{w.classList.add('rest');w.style.setProperty('--tx',0);w.style.setProperty('--ty',0)};
  document.addEventListener('pointermove',e=>{
    if(e.pointerType&&e.pointerType!=='mouse')return;
    if(!gfx().tilt)return;
    if(!e.target||!e.target.closest)return;
    /* Карточка в сетке, в руке и в инспекторе гасит указатель на самой .cWrap,
       чтобы клик доставался контейнеру. Значит целью события всегда будет
       контейнер, и closest('.cWrap') не найдёт ничего — наклона там попросту
       не было. Поэтому, не найдя карту вверх по дереву, ищем её внутри
       контейнера. */
    let w=e.target.closest('.cWrap');
    if(!w){const host=e.target.closest('.dCard,.hCard,.insCard');
      if(host)w=host.querySelector('.cWrap')}
    if(w!==cur){ if(cur)relax(cur); cur=w; if(w)w.classList.add('tilt') }
    if(!w)return;
    const r=w.getBoundingClientRect();
    if(!r.width)return;
    w.classList.remove('rest');
    w.style.setProperty('--tx',(((e.clientX-r.left)/r.width)*2-1).toFixed(3));
    w.style.setProperty('--ty',(((e.clientY-r.top)/r.height)*2-1).toFixed(3));
  },{passive:true});
}
wireCardTilt();
applyGfx();
/* Escape закрывает просмотр — на десктопе это первое, что жмут. */
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&cvEl)closeCardView()});

pullCloud();

/* Если прошлый запуск оборвался, не дойдя до чистой метки, — показываем, где
   именно. Диагностика для отчёта: обычный игрок сюда не попадает, пока не
   умрёт вкладка, и тогда сообщение всё равно полезнее молчания. */
(()=>{
  const c=crumbRead();
  if(!c)return;
  setTimeout(()=>toast('Прошлый раз оборвался: '+c[0]+' ('+c[1]+'с)',1),1200);
})();

/* SDK Telegram грузится с async, поэтому мог не успеть к этому месту.
   Колбэк из onload тега добирает то, что требует уже готового объекта. */
window.__tgReady=function(){
  if(PF.init()){pullCloud();PF.guardClose(CUR==='battle');PF.back(CUR!=='menu',()=>{if(CUR!=='menu')go('menu')})}
};
if(window.Telegram)window.__tgReady();
