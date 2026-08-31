/* Скрипт игры. Вынесен из index.html одним куском, БЕЗ единой
   перестановки — порядок выполнения сохранён дословно.

   Это ОБЫЧНЫЙ скрипт, а не модуль. Сознательно: половина кода держится
   на глобальных функциях (window.__tgReady зовёт inline-обработчик у
   тега телеграмного SDK), и на них же стоят инструменты проверки.
   Перевод на модули — отдельный шаг, он меняет семантику. */
'use strict';
/* ================= аварийный обработчик =================
   В Telegram-webview нет ни консоли, ни возможности перезагрузить страницу
   жестом. Необработанное исключение посреди хода просто «вешает» игру, и
   снаружи это выглядит как «кнопки перестали нажиматься». Поэтому ловим
   всё на верхнем уровне и показываем плашку с выходом в меню.
   Стили — инлайном: плашка обязана нарисоваться, даже если сломалось
   что-то до неё. */
const crash=(()=>{
  let shown=false;
  return function crash(err){
    try{console.error('[bbduel]',err)}catch(e){}
    if(shown)return;shown=true;
    const box=document.createElement('div');
    box.setAttribute('style','position:fixed;left:8px;right:8px;'+
      'bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:9999;'+
      'background:#101017;border:2px solid #ff3355;box-shadow:4px 4px 0 rgba(255,51,85,.4);'+
      'padding:12px 14px;color:#f2f2f6;font:600 12px/1.35 ui-monospace,Consolas,monospace');
    const msg=document.createElement('div');
    msg.textContent='Что-то сломалось: '+((err&&(err.message||err))+'').slice(0,140);
    const btn=document.createElement('button');
    btn.textContent='В МЕНЮ';
    btn.setAttribute('style','margin-top:10px;background:#ffd52e;color:#0a0a0f;border:2px solid #000;'+
      'padding:7px 14px;font:900 12px/1 Arial Black,Impact,sans-serif;cursor:pointer');
    btn.onclick=()=>{box.remove();shown=false;
      try{if(typeof go==='function')go('menu')}catch(e){location.reload()}};
    box.appendChild(msg);box.appendChild(btn);
    (document.body||document.documentElement).appendChild(box);
  };
})();
window.addEventListener('error',e=>crash(e.error||e.message));
window.addEventListener('unhandledrejection',e=>crash(e.reason));
/* ================= утилиты ================= */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const pick=a=>a[Math.floor(Math.random()*a.length)];
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const fmtN=v=>Math.round(v).toLocaleString('ru-RU');
const clone=o=>JSON.parse(JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const svgWrap=p=>`<svg viewBox="0 0 24 24">${p}</svg>`;

/* ================= платформа: Telegram Mini App / обычный веб =================
   Игра НИКОГДА не обращается к Telegram напрямую — только через PF.
   Вне Telegram (GitHub Pages, Vercel, локальный файл) всё это молча
   превращается в no-op, и игра работает как обычная веб-страница. */
const PF=(()=>{
  /* SDK грузится асинхронно, чтобы недоступный telegram.org не задерживал
     игру. Значит объект Telegram может появиться уже после старта — поэтому
     никаких снимков при создании PF, каждый вызов смотрит на актуальное
     состояние окна. */
  const TG=()=>(typeof window!=='undefined'&&window.Telegram&&window.Telegram.WebApp)||null;
  /* Скрипт Telegram отдаёт объект WebApp даже в обычном браузере, поэтому
     наличие объекта ничего не доказывает. Реальный признак TMA — непустой
     initData либо известная платформа. */
  const inTMA=()=>{const tg=TG();
    return !!(tg&&((tg.initData&&tg.initData.length)||(tg.platform&&tg.platform!=='unknown')))};
  /* Доступность метода зависит от версии клиента Telegram, поэтому каждый
     вызов заворачиваем: отсутствующий метод не должен ронять игру. */
  const call=(name,...a)=>{const tg=TG();
    if(!inTMA()||!tg||typeof tg[name]!=='function')return undefined;
    try{return tg[name](...a)}catch(e){return undefined}};

  const HAPTIC={light:'light',medium:'medium',heavy:'heavy',rigid:'rigid',soft:'soft'};
  return {
    get isTMA(){return inTMA()},
    get tg(){return TG()},
    /* Тактильная отдача. Вне TMA — тишина. */
    hit(style){const tg=TG();if(!inTMA()||!tg||!tg.HapticFeedback)return;
      try{tg.HapticFeedback.impactOccurred(HAPTIC[style]||'medium')}catch(e){}},
    notify(type){const tg=TG();if(!inTMA()||!tg||!tg.HapticFeedback)return;
      try{tg.HapticFeedback.notificationOccurred(type)}catch(e){}},
    /* Нативная кнопка «Назад» в шапке Telegram. */
    back(show,cb){const tg=TG();if(!inTMA()||!tg||!tg.BackButton)return;
      try{if(cb)tg.BackButton.onClick(cb);show?tg.BackButton.show():tg.BackButton.hide()}catch(e){}},
    /* Спросить подтверждение при закрытии — чтобы не потерять бой свайпом. */
    guardClose(on){call(on?'enableClosingConfirmation':'disableClosingConfirmation')},
    /* Высота вьюпорта: в webview Telegram 100vh врёт. Держим реальную высоту
       в CSS-переменной --app-h, на неё завязана вёрстка. */
    syncHeight(){
      const tg=TG();
      const h=(inTMA()&&tg&&(tg.viewportStableHeight||tg.viewportHeight))||window.innerHeight||0;
      /* В свёрнутой вкладке или фоновом webview innerHeight бывает 0. Записать
         такое значение — схлопнуть вёрстку в ноль, поэтому нули игнорируем:
         остаётся CSS-фолбэк 100vh. */
      if(h>0)document.documentElement.style.setProperty('--app-h',h+'px');
    },
    /* CloudStorage синхронит сейв между устройствами пользователя. API
       асинхронный, а игровой load/save синхронный — поэтому облако работает
       как зеркало поверх localStorage, а не как источник истины. */
    cloudGet(key,cb){
      const tg=TG();
      if(!inTMA()||!tg||!tg.CloudStorage)return cb(null);
      try{tg.CloudStorage.getItem(key,(err,val)=>cb(err?null:(val||null)))}catch(e){cb(null)}
    },
    cloudSet(key,val){
      const tg=TG();
      if(!inTMA()||!tg||!tg.CloudStorage)return;
      try{tg.CloudStorage.setItem(key,val,()=>{})}catch(e){}
    },
    /* Идемпотентно: вызывается сразу на старте и ещё раз, когда доедет SDK.
       Возвращает true, если телеграмная часть уже настроена. */
    init(){
      if(!this._base){this._base=1;
        this.syncHeight();
        window.addEventListener('resize',()=>this.syncHeight())}
      if(this._tma)return true;
      const tg=TG();
      if(!inTMA()||!tg)return false;
      this._tma=1;
      call('ready');call('expand');
      /* Критично: свайп-вниз-закрыть в Telegram дерётся с нашими драгами
         (тянем карту на поле, срываем этикетку пака). */
      call('disableVerticalSwipes');
      /* Хром Telegram под нашу палитру, чтобы не было светлой рамки. */
      call('setHeaderColor','#0a0a0f');call('setBackgroundColor','#0a0a0f');
      if(tg.onEvent)try{tg.onEvent('viewportChanged',()=>this.syncHeight())}catch(e){}
      return true;
    }
  };
})();

/* ================= хранилище ================= */
const store=(()=>{try{const k='__bbt';localStorage.setItem(k,'1');localStorage.removeItem(k);
  return{get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},
         set:(k,v)=>{try{localStorage.setItem(k,v);PF.cloudSet(k,v)}catch(e){}},
         /* setLocal — намеренно мимо CloudStorage. Снапшот боя пишется после
            каждого действия игрока; гнать это в облако значит долбить API
            Telegram десятки раз за бой, а данные всё равно привязаны к
            конкретному устройству и живут минуты. */
         setLocal:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},
         del:k=>{try{localStorage.removeItem(k)}catch(e){}},ok:true}}
  catch(e){const m={};return{get:k=>(k in m?m[k]:null),
                             set:(k,v)=>{m[k]=v;PF.cloudSet(k,v)},
                             setLocal:(k,v)=>{m[k]=v},del:k=>{delete m[k]},ok:false}}})();

/* Хлебные крошки на случай, когда страница не падает, а УМИРАЕТ: iOS убивает
   процесс отрисовки при нехватке памяти, и тогда не срабатывает ни один
   обработчик — ни window.onerror, ни аварийная плашка. Экран просто белеет,
   и помогает только перезагрузка. Отладчика к телефону из-под Windows не
   подключить, поэтому единственный способ узнать, на каком шаге всё умерло —
   записать шаг в хранилище заранее и прочитать после перезапуска.
   Ключ отдельный от сейва: он не должен ни ехать в облако, ни попадать в
   миграции. Метка 'ok' ставится, когда экран круток покинут по-человечески. */
const CRUMB='bbduel_crumb';
function crumb(step){try{store.setLocal(CRUMB,step+'|'+Math.round(performance.now()/100)/10)}catch(e){}}
function crumbRead(){
  const v=store.get(CRUMB);
  if(!v||v.indexOf('ok')===0)return null;
  store.del(CRUMB);
  return v.split('|');
}

/* ================= эмблемы ================= */
const EMB={
  volta:'<path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" fill="currentColor"/>',
  fire:'<path d="M12 2 C13 6 17 7.5 17 12 A5 5 0 0 1 7 12 C7 9.5 8.5 8.5 9.5 6.5 C10 8.5 11.5 9 12 11 C13.5 9 12.5 5 12 2 Z" fill="currentColor"/>',
  ice:'<g stroke="currentColor" stroke-width="1.8" fill="none"><path d="M12 2 V22 M4 6 L20 18 M4 18 L20 6 M12 5 L9.5 2.5 M12 5 L14.5 2.5 M12 19 L9.5 21.5 M12 19 L14.5 21.5"/></g>',
  steel:'<path d="M12 2 L20 6 V12 C20 17 16.5 20.6 12 22 C7.5 20.6 4 17 4 12 V6 Z" fill="currentColor"/>',
  ether:'<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M2 12 C5 6 9 4 12 4 C15 4 19 6 22 12 C19 18 15 20 12 20 C9 20 5 18 2 12 Z"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></g>',
  skull:'<path d="M12 2 C7 2 4 5.5 4 10 C4 13 5.5 15 7 16 V19 H9.5 V17 H11 V19 H13 V17 H14.5 V19 H17 V16 C18.5 15 20 13 20 10 C20 5.5 17 2 12 2 Z M9 10.5 A1.4 1.4 0 1 0 9 10.49 Z M15 10.5 A1.4 1.4 0 1 0 15 10.49 Z" fill="currentColor"/>',
  boom:'<g fill="currentColor"><path d="M12 1 L14 7 L20 4 L16 9 L23 11 L16 13 L19 19 L13 16 L11 23 L9 16 L3 19 L6 13 L-1 11 L6 9 L3 4 L9 7 Z" transform="scale(.92) translate(1,1)"/></g>',
  heal:'<path d="M10 2 H14 V9 H21 V13 H14 V20 H10 V13 H3 V9 H10 Z" fill="currentColor"/>',
  card:'<g fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="12" height="18" rx="2"/><path d="M7 8 H13 M7 12 H13 M7 16 H10" stroke-width="1.5"/></g>',
  up:'<path d="M12 3 L20 13 H15 V21 H9 V13 H4 Z" fill="currentColor"/>',
  ghost:'<path d="M12 2 C7.5 2 5 5.5 5 9.5 V21 L7.5 18.6 L10 21 L12 18.6 L14 21 L16.5 18.6 L19 21 V9.5 C19 5.5 16.5 2 12 2 Z M9.2 9 A1.5 1.5 0 1 0 9.2 8.99 Z M14.8 9 A1.5 1.5 0 1 0 14.8 8.99 Z" fill="currentColor"/>'
};

/* ================= СИЛУЭТЫ персонажей ================= */
const SIL={
aya:`<svg viewBox="0 0 230 280">
 <g fill="currentColor">
  <ellipse cx="78" cy="66" rx="14" ry="16"/>
  <path d="M64 56 L58 74 L70 72 Z"/>
  <path d="M88 50 L128 46 L112 62 L156 66 L122 76 L158 92 L118 84 L134 108 L98 88 L106 104 L84 86 Z"/>
  <path d="M70 78 L30 58 L44 84 L16 94 L52 98 Z"/>
  <path d="M64 80 L90 84 L94 128 L60 124 Z"/>
  <path d="M56 122 L96 126 L118 180 L34 180 Z"/>
  <circle cx="34" cy="142" r="5"/><circle cx="118" cy="46" r="5"/>
  <circle cx="121" cy="42" r="4.5"/><circle cx="112" cy="51" r="3"/>
 </g>
 <g stroke="currentColor" stroke-linecap="round" fill="none">
  <line x1="66" y1="90" x2="48" y2="118" stroke-width="11"/>
  <line x1="48" y1="118" x2="34" y2="142" stroke-width="9"/>
  <line x1="86" y1="90" x2="112" y2="74" stroke-width="11"/>
  <line x1="112" y1="74" x2="118" y2="48" stroke-width="9"/>
  <line x1="118" y1="42" x2="204" y2="8" stroke-width="5"/>
  <line x1="68" y1="172" x2="50" y2="208" stroke-width="13"/>
  <line x1="50" y1="208" x2="56" y2="246" stroke-width="10"/>
  <line x1="56" y1="246" x2="38" y2="250" stroke-width="8"/>
  <line x1="84" y1="174" x2="104" y2="212" stroke-width="13"/>
  <line x1="104" y1="212" x2="112" y2="252" stroke-width="10"/>
  <line x1="112" y1="252" x2="130" y2="256" stroke-width="8"/>
 </g>
 <circle cx="73" cy="63" r="2.2" fill="#ffd52e"/>
</svg>`,
diesel:`<svg viewBox="0 0 230 280">
 <g fill="currentColor">
  <ellipse cx="140" cy="66" rx="13" ry="15"/>
  <path d="M126 52 L158 48 L160 58 L126 62 Z"/>
  <path d="M154 56 L176 62 L154 67 Z"/>
  <path d="M126 80 L152 76 L150 122 L122 118 Z"/>
  <path d="M124 82 L96 116 L122 128 L138 100 Z"/>
  <circle cx="190" cy="120" r="5"/>
 </g>
 <g stroke="currentColor" stroke-linecap="round" fill="none">
  <line x1="148" y1="88" x2="174" y2="104" stroke-width="11"/>
  <line x1="174" y1="104" x2="190" y2="120" stroke-width="9"/>
  <line x1="130" y1="92" x2="106" y2="112" stroke-width="11"/>
  <line x1="106" y1="112" x2="118" y2="132" stroke-width="9"/>
  <line x1="140" y1="122" x2="164" y2="154" stroke-width="13"/>
  <line x1="164" y1="154" x2="158" y2="192" stroke-width="10"/>
  <line x1="158" y1="192" x2="174" y2="196" stroke-width="8"/>
  <line x1="128" y1="122" x2="104" y2="158" stroke-width="13"/>
  <line x1="104" y1="158" x2="120" y2="196" stroke-width="10"/>
  <line x1="120" y1="196" x2="104" y2="200" stroke-width="8"/>
  <line x1="170" y1="128" x2="220" y2="120" stroke-width="9"/>
 </g>
 <g fill="currentColor">
  <circle cx="180" cy="134" r="4"/><circle cx="210" cy="129" r="4"/>
 </g>
 <circle cx="146" cy="64" r="2.2" fill="#35f0ff"/>
</svg>`,
thug:`<svg viewBox="0 0 230 280">
 <g fill="currentColor">
  <ellipse cx="86" cy="70" rx="14" ry="15"/>
  <path d="M70 58 L102 56 L104 66 L70 68 Z"/>
  <path d="M62 84 L110 90 L116 152 L56 146 Z"/>
  <circle cx="142" cy="50" r="5"/>
 </g>
 <g stroke="currentColor" stroke-linecap="round" fill="none">
  <line x1="102" y1="96" x2="130" y2="78" stroke-width="12"/>
  <line x1="130" y1="78" x2="142" y2="50" stroke-width="10"/>
  <line x1="144" y1="54" x2="98" y2="6" stroke-width="7"/>
  <line x1="68" y1="98" x2="54" y2="132" stroke-width="12"/>
  <line x1="54" y1="132" x2="48" y2="162" stroke-width="10"/>
  <line x1="76" y1="148" x2="66" y2="198" stroke-width="14"/>
  <line x1="66" y1="198" x2="70" y2="246" stroke-width="11"/>
  <line x1="70" y1="246" x2="52" y2="250" stroke-width="9"/>
  <line x1="98" y1="150" x2="116" y2="200" stroke-width="14"/>
  <line x1="116" y1="200" x2="114" y2="246" stroke-width="11"/>
  <line x1="114" y1="246" x2="132" y2="250" stroke-width="9"/>
 </g>
 <circle cx="80" cy="66" r="2.4" fill="#ff3355"/>
 <circle cx="92" cy="66" r="2.4" fill="#ff3355"/>
</svg>`,
wraith:`<svg viewBox="0 0 230 280">
 <g fill="currentColor">
  <path d="M115 34 L142 58 L150 92 L108 84 Z"/>
  <ellipse cx="112" cy="76" rx="20" ry="18"/>
  <path d="M92 88 L134 92 L152 170 L128 156 L140 214 L108 192 L112 250 L88 216 L84 158 L66 178 L74 104 Z"/>
 </g>
 <g stroke="currentColor" stroke-linecap="round" fill="none">
  <line x1="84" y1="120" x2="52" y2="140" stroke-width="9"/>
  <line x1="136" y1="122" x2="172" y2="146" stroke-width="9"/>
 </g>
 <circle cx="106" cy="72" r="3" fill="#ff3355"/>
 <circle cx="120" cy="74" r="2" fill="#ff3355"/>
</svg>`,
boss:`<svg viewBox="0 0 230 280">
 <g fill="currentColor">
  <ellipse cx="96" cy="60" rx="13" ry="14"/>
  <path d="M84 46 L92 30 L100 48 Z"/>
  <path d="M66 72 L124 78 L136 160 L54 152 Z"/>
  <rect x="150" y="6" width="58" height="30" rx="5"/>
  <circle cx="150" cy="45" r="5"/>
 </g>
 <g stroke="currentColor" stroke-linecap="round" fill="none">
  <line x1="122" y1="72" x2="172" y2="24" stroke-width="8"/>
  <line x1="116" y1="88" x2="136" y2="64" stroke-width="13"/>
  <line x1="136" y1="64" x2="150" y2="45" stroke-width="10"/>
  <line x1="78" y1="156" x2="66" y2="204" stroke-width="16"/>
  <line x1="66" y1="204" x2="72" y2="248" stroke-width="12"/>
  <line x1="72" y1="248" x2="52" y2="252" stroke-width="10"/>
  <line x1="104" y1="158" x2="122" y2="206" stroke-width="16"/>
  <line x1="122" y1="206" x2="120" y2="248" stroke-width="12"/>
  <line x1="120" y1="248" x2="140" y2="252" stroke-width="10"/>
 </g>
 <circle cx="90" cy="58" r="2.4" fill="#ff3355"/>
 <circle cx="100" cy="58" r="2.4" fill="#ff3355"/>
</svg>`
};

/* ================= карты ================= */
const CARDS=[
{id:'r01',n:'Гончая Террас',t:0,ty:'u',c:1,a:2,h:1,el:'steel',fl:'Стережь провал. Провал не против.',stk:['ГАВ!','тяв!']},
{id:'r02',n:'Патрульный ГРАНИ',t:0,ty:'u',c:2,a:2,h:3,el:'steel',kw:['taunt'],fl:'Вахта — это не про сон. Вахта — это про всех.',stk:['СТОЯТЬ!','в поле!']},
{id:'r03',n:'Санитар Дома',t:0,ty:'u',c:2,a:1,h:3,el:'ice',eff:{k:'healHero',v:3},fl:'Бинт найдётся. Вопрос — для кого.',stk:['ZAP!','держи!']},
{id:'r04',n:'Курсант Аркадия',t:0,ty:'u',c:3,a:3,h:3,el:'steel',fl:'Первый данж — как первый борщ: страшно, но горячо.',stk:['оп-па!','так!']},
{id:'r05',n:'Огнемётчик',t:0,ty:'u',c:3,a:2,h:4,el:'fire',eff:{k:'dmg',v:1,tg:'any'},fl:'Пламя подчиняется только тому, кто не боится бровей.',stk:['ШШШ!','жарко!']},
{id:'r06',n:'Стрелок Сирен',t:0,ty:'u',c:2,a:3,h:1,el:'volta',kw:['rush'],fl:'Стреляет раньше, чем просыхает.',stk:['пиф!','ZAP!']},
{id:'r07',n:'Дежурный',t:0,ty:'u',c:4,a:3,h:5,el:'steel',kw:['taunt'],fl:'Смена длится, пока длится.',stk:['не сегодня','держу!']},
{id:'r08',n:'Связист',t:0,ty:'u',c:3,a:2,h:2,el:'volta',eff:{k:'draw',v:1},fl:'«Приём… приём… они уже внутри, приём—»',stk:['приём!','связь!']},
{id:'s01',n:'Искра',t:0,ty:'s',c:1,el:'volta',eff:{k:'dmg',v:2,tg:'any'},fl:'Мелкая, но честная.',stk:['ZAP!']},
{id:'s02',n:'Подзарядка',t:0,ty:'s',c:2,el:'volta',eff:{k:'draw',v:1},fl:'Кофе для колоды.',stk:['дриньк!','вжух!']},
{id:'c01',n:'Дизель',t:1,ty:'u',c:4,a:3,h:5,el:'steel',kw:['rush'],fl:'Снял! …чёрт, не снял. Ещё раз!',stk:['VROOM!','ГОНКА!']},
{id:'c02',n:'Румба',t:1,ty:'u',c:3,a:2,h:4,el:'ether',eff:{k:'buffAll',a:1,h:1},fl:'Ваш аплодисменты я слышу. Твои — нет.',stk:['ХЭЙ!','бис!']},
{id:'c03',n:'Сэр Каштан',t:1,ty:'u',c:3,a:1,h:6,el:'ice',kw:['taunt'],eff:{k:'dmg',v:1,tg:'any'},fl:'Пыль — это то, что было кем-то забыто.',stk:['ФШШ!','порядок!']},
{id:'c04',n:'Зоя «Бабуля»',t:2,ty:'u',c:2,a:2,h:4,el:'volta',kw:['taunt'],eff:{k:'draw',v:1},fl:'Не дёргайся, милый. Я жду, а он — нет.',stk:['тихо-тихо','на!']},
{id:'c05',n:'Гоша «Клещ»',t:1,ty:'u',c:4,a:3,h:5,el:'fire',eff:{k:'dmg',v:2,tg:'any'},fl:'Я это ещё не копал! …ну, теперь копал.',stk:['БУРАВ!','глубже!']},
{id:'c06',n:'Хоси «Лис»',t:2,ty:'u',c:3,a:2,h:3,el:'ether',eff:{k:'draw',v:1},fl:'Эта карта бьёт. Эта — спасает. А эта — по любви.',stk:['фокус!','пик!']},
{id:'c07',n:'Рэн',t:2,ty:'u',c:2,a:3,h:1,el:'ice',kw:['rush'],fl:'…',stk:['шшш…','vanish']},
{id:'c08',n:'Ноа «Прибой»',t:1,ty:'u',c:3,a:3,h:4,el:'volta',fl:'Волна всегда возвращается. И я.',stk:['прилив!','сплэш!']},
{id:'c09',n:'Пилар «Пилюля»',t:1,ty:'u',c:3,a:2,h:4,el:'ice',eff:{k:'healHero',v:4},fl:'Сядь. Не трогай. И конфету возьми.',stk:['ЛЕГКО!','лекарство!']},
{id:'c10',n:'Бит и Байт',t:2,ty:'u',c:4,a:3,h:4,el:'volta',eff:{k:'aoe',v:1},fl:'— вдвоём быстрее. — вдвоём дороже. — молчи.',stk:['СИНХРО!','запуск!']},
{id:'c11',n:'Профессор Моль',t:1,ty:'u',c:2,a:1,h:3,el:'ether',eff:{k:'draw',v:1},fl:'Тишина первого рода… НЕТ. Записывайте!!',stk:['запись!','эврика!']},
{id:'c12',n:'Барон Бублик',t:2,ty:'u',c:4,a:3,h:6,el:'steel',kw:['taunt'],fl:'Сдашь чисто — налью. Сдашь грязно — двойной.',stk:['шот!','наливаю!']},
{id:'c13',n:'Тихон',t:2,ty:'u',c:5,a:5,h:5,el:'fire',fl:'(молча подметает провал по расписанию)',stk:['…','свип!']},
{id:'s03',n:'Ночной Чайник',t:1,ty:'s',c:3,el:'ice',eff:{k:'draw',v:2},fl:'Чай крепкий. Собеседник — крепче.',stk:['буль-буль']},
{id:'s04',n:'Пустая Клетка',t:1,ty:'s',c:2,el:'ether',eff:{k:'dmg',v:3,tg:'any'},fl:'Клетка честная. Аномалия — не очень.',stk:['КЛАЦ!']},
{id:'s05',n:'Гвоздь-Счастливчик',t:2,ty:'s',c:2,el:'fire',eff:{k:'buff',a:3,h:0,tg:'ally'},fl:'«Продаю с болью» — Хоси, третий год подряд.',stk:['гвоздь!!']},
{id:'s06',n:'Осколок Часового',t:2,ty:'s',c:2,el:'ice',eff:{k:'buff',a:1,h:3,tg:'ally'},fl:'Стрелки выпали внутрь. Иногда слышно, как тикают.',stk:['тик-так']},
{id:'s07',n:'Фонотека Бездны',t:2,ty:'s',c:3,el:'ether',eff:{k:'aoe',v:2},fl:'Звук данжа, из которого никто не вернулся.',stk:['ш-ш-ш…']},
{id:'L01',n:'Кайра «Кадр»',t:3,ty:'u',c:5,a:5,h:4,el:'ether',kw:['rush'],eff:{k:'dmg',v:2,tg:'any'},fl:'Стой красиво. Это войдёт в историю.',stk:['СНЯТО!','КАДР!!']},
{id:'L02',n:'Аркадий «Штурм»',t:3,ty:'u',c:6,a:4,h:9,el:'volta',kw:['taunt'],eff:{k:'healHero',v:5},fl:'Сначала горячее, потом героика.',stk:['ДЕРЖИСЬ!','борщ!']},
{id:'L03',n:'Граф Дымм',t:3,ty:'u',c:5,a:4,h:5,el:'ether',eff:{k:'dmg',v:4,tg:'any'},fl:'У каждого провала есть мотив. Найди — и он признается.',stk:['ВЕРДИКТ!']},
{id:'L04',n:'Люмень',t:3,ty:'u',c:6,a:5,h:6,el:'ice',eff:{k:'weaken',v:1},fl:'Тебя тоже потеряли? Погоди. Я записываю.',stk:['колыбельная…']},
{id:'L05',n:'Ая Курона',t:3,ty:'u',c:7,a:7,h:6,el:'fire',kw:['rush'],fl:'(я всё отрепетировала. я готова. я… привет.)',stk:['ЮКИ!!','поток!']},
{id:'L06',n:'Веста',t:3,ty:'u',c:5,a:4,h:7,el:'fire',eff:{k:'healAll',v:4},fl:'Сначала суп. Подвиги — после.',stk:['СУП!','горячо!']},
{id:'s08',n:'Сердце Провала',t:3,ty:'s',c:5,el:'ether',eff:{k:'aoe',v:4},fl:'Кристалл, который бьётся. Не в такт твоему — в такт своему.',stk:['ПУЛЬС!!']},
{id:'s09',n:'Зуб Тишины',t:3,ty:'s',c:4,el:'ice',eff:{k:'drain',v:6},fl:'Тишина здесь — присутствие кого-то третьего.',stk:['…тишина']},
{id:'X01',n:'Билет в Один Конец',t:4,ty:'u',c:9,a:10,h:10,el:'ether',kw:['rush'],eff:{k:'draw',v:1},ult:1,
  fl:'Компостер на входе. Обратного компостера не существует.',stk:['ПОЕЗД!!','ПОСЛЕДНИЙ ВАГОН']},
{id:'zC0',n:'Перезарядка',t:0,ty:'s',c:0,el:'volta',noColl:1,eff:{k:'mana',v:1},
  fl:'+1 маны в этот ход. Разовый буст за первый ход.',stk:['+1!']},
];
const COLLECTIBLE=CARDS.filter(c=>!c.noColl);
const byId=id=>CARDS.find(c=>c.id===id);
const TIER_NAMES=['РЕКРУТ','ГОРОД','ФРАКЦИЯ','ЛЕГЕНДА','СЕКРЕТ'];
const TIER_HEX=['#aab6bf','#35f0ff','#ff4fd8','#ffd52e','#ff3355'];

/* ================= этапы ================= */
const STAGES=[
{n:'Тренировка',d:'БОТ-КАРТЁЖНИК покажет, как это работает.',hp:14,pool:0,reward:120,ic:'card',tutorial:1},
{n:'xX_Mr_Anon_Xx',d:'Пишет в общий чат, что твоя колода — мусор.',hp:16,pool:0,reward:60,ic:'ghost'},
{n:'@нге/\\ в кед@}{',d:'Ник не читается. Колода — тем более.',hp:20,pool:0,reward:70,ic:'ghost'},
{n:'Новички-стримеры',d:'Снимают прохождение. Снимут и тебя.',hp:22,pool:1,reward:80,ic:'ghost'},
{n:'Gold_Swag_2k',d:'Читает рэп в общий чат. Кажется, всерьёз.',hp:24,pool:1,reward:90,ic:'ghost'},
{n:'Мама_ангелочка',d:'Пишет капсом. Просит сдаться. Не шутит.',hp:26,pool:2,reward:110,ic:'ghost',boss:1},
{n:'Экзамен ГРАНИ',d:'Чиновники с пушками. С табельным.',hp:28,pool:2,reward:120,ic:'skull'},
{n:'Глубинный Провал',d:'Внизу вода помнит всё.',hp:30,pool:2,reward:140,ic:'skull'},
{n:'Банда «Сталь»',d:'Труба — аргумент. Двенадцать труб.',hp:32,pool:3,reward:160,ic:'ghost'},
{n:'Тишина Второго Рода',d:'Не отсутствие звука. Присутствие.',hp:36,pool:3,reward:200,ic:'skull',boss:1},
{n:'Сердце Прилива',d:'Тот самый Тихий Прилив. Личная встреча.',hp:42,pool:3,reward:300,ic:'ghost',boss:1},
];
/* Одна запись на каждый этап, включая тренировку в начале. При вставке
   «Тренировки» нулевым этапом массив остался на десяти записях: индексы
   сдвинулись, каждый рейд показывал чужую сложность, а последний — undefined. */
const DIFF=['учебная','учебная','учебная','лёгкая','лёгкая','боевая','боевая','боевая','злая','злая','злая'];

/* ================= звук ================= */
let AC=null,nzBuf=null;
function ac(){if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}return AC}
function tone(f,d,o={}){const c=ac();if(!c||!S.snd)return;
  try{const t=c.currentTime+(o.at||0),os=c.createOscillator(),g=c.createGain();
  os.type=o.w||'square';os.frequency.setValueAtTime(f,t);
  if(o.sl)os.frequency.exponentialRampToValueAtTime(Math.max(24,f+o.sl),t+d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(o.v||.08,t+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t+d);
  os.connect(g);g.connect(c.destination);os.start(t);os.stop(t+d+.03)}catch(e){}}
function noise(d=.2,o={}){const c=ac();if(!c||!S.snd)return;
  try{if(!nzBuf){nzBuf=c.createBuffer(1,c.sampleRate,c.sampleRate);const d2=nzBuf.getChannelData(0);
    for(let i=0;i<d2.length;i++)d2[i]=Math.random()*2-1}
  const t=c.currentTime,src=c.createBufferSource();src.buffer=nzBuf;src.loop=true;
  const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.setValueAtTime(o.f||900,t);bp.Q.value=o.q||1;
  if(o.sl)bp.frequency.exponentialRampToValueAtTime(Math.max(40,(o.f||900)+o.sl),t+d);
  const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(o.v||.16,t+.01);
  g.gain.exponentialRampToValueAtTime(.0001,t+d);
  src.connect(bp);bp.connect(g);g.connect(c.destination);src.start(t);src.stop(t+d+.05)}catch(e){}}
const sfx={
  ui(){tone(990,.03,{v:.04})},
  draw(){noise(.06,{f:2400,q:1.4,v:.08})},
  /* Слои по тиру — фанфара редкости, она остаётся. Поверх неё короткий
     призвук стихии: то же различие, что теперь дают искры, но на слух. */
  play(t,el){tone(180,.12,{v:.09,sl:-80});if(t>=2)tone(880,.14,{w:'triangle',v:.07,at:.05});
    if(t>=3){tone(1174,.2,{w:'triangle',v:.07,at:.1});tone(1568,.3,{w:'triangle',v:.06,at:.2})}
    if(el)sfx.elem(el)},
  elem(el){
    if(el==='fire')       noise(.20,{f:820,q:.7,v:.09,sl:-460});
    else if(el==='ice'){  tone(1568,.15,{w:'triangle',v:.055});
                          tone(2093,.12,{w:'sine',v:.045,at:.06}) }
    else if(el==='volta'){noise(.05,{f:5200,q:2.6,v:.09});
                          tone(2400,.05,{w:'square',v:.035,at:.03}) }
    else if(el==='ether'){tone(392,.28,{w:'sine',v:.045});
                          tone(587,.32,{w:'sine',v:.04,at:.1}) }
    else                  noise(.07,{f:1500,q:2.2,v:.10,sl:-620});
  },
  hit(){noise(.09,{f:500,q:.8,v:.26,sl:-320});tone(120,.1,{v:.14,sl:-60})},
  heal(){tone(659,.1,{w:'sine',v:.06});tone(880,.14,{w:'sine',v:.06,at:.08})},
  die(){tone(300,.18,{w:'sawtooth',v:.07,sl:-240});noise(.14,{f:400,q:.6,v:.16,sl:-300})},
  win(){[523,659,784,1047].forEach((f,i)=>tone(f,.22,{w:'triangle',v:.09,at:i*.12}))},
  lose(){[392,330,262,196].forEach((f,i)=>tone(f,.26,{w:'sawtooth',v:.07,at:i*.15}))},
  tear(){noise(.16,{f:2600,q:.6,v:.3,sl:-2100})},
  rip(){noise(.07,{f:1700,q:1.6,v:.18,sl:-900})},
  whoosh(){noise(.3,{f:300,q:.9,v:.13,sl:2200})},
  whip(){tone(1300,.07,{w:'triangle',v:.05,sl:700})},
  secret(){tone(55,1.1,{w:'sawtooth',v:.12});tone(1046,.6,{w:'triangle',v:.07,at:.7})},
  sparks(){tone(1318,.07,{w:'sine',v:.06});tone(1760,.1,{w:'sine',v:.06,at:.06})},
};

/* ================= частицы ================= */
const fxCv=$('#fx'),fxc=fxCv.getContext('2d');
let DPR=Math.min(devicePixelRatio||1,2);
function fxSize(){fxCv.width=innerWidth*DPR;fxCv.height=innerHeight*DPR;fxc.setTransform(DPR,0,0,DPR,0,0)}
fxSize();addEventListener('resize',fxSize);
const parts=[];let fxOn=false;
function burst(x,y,cols,n,pow=1){
  if(!S.vfx)return;
  for(let i=0;i<n;i++){
    const a=-Math.PI/2+(Math.random()-.5)*6.283,sp=(2+Math.random()*5)*pow;
    parts.push({t:Math.random()<.45?'star':'shard',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-(1+Math.random()*2)*pow,
      life:1,dec:.013+Math.random()*.018,r:(Math.random()*7+3)*Math.min(pow,1.7),
      rot:Math.random()*6.28,vr:(Math.random()-.5)*.35,c:pick(cols)})}
  kickFx()}
/* Цвет искр по ТИРУ — только там, где празднуют редкость: вскрытие пака.
   В бою тир ни о чём не говорит, там важно, ЧЕМ ударили. */
const fxCols=t=>t===1?['#35f0ff','#bffcff','#fff']:t===2?['#ff4fd8','#ffb3ec','#fff']:
  t===3?['#ffd52e','#fff','#ff9500']:t===4?['#ff3355','#fff','#ffd52e']:['#c9d4dc','#fff'];
/* Цвет искр по СТИХИИ — в бою. Стихия прописана у каждой карты с самого
   начала и рисует её эмблему, но на искры не влияла никак: огненное и ледяное
   заклятия одного тира брызгали одинаково, и удар нельзя было опознать, не
   прочитав название. */
const EL_COLS={
  fire :['#ff6a1f','#ffd52e','#fff'],
  ice  :['#35f0ff','#bffcff','#fff'],
  volta:['#ffd52e','#fffbc2','#fff'],
  ether:['#ff4fd8','#c07bff','#fff'],
  steel:['#c9d4dc','#8fa3b0','#fff'],
};
const elCols=c=>EL_COLS[c&&c.el]||EL_COLS.steel;
/* Вспышка в цвет стихии по центру произвольного элемента. */
function elBurst(el,c,n,pow){
  if(!el||!el.getBoundingClientRect)return;
  const r=el.getBoundingClientRect();
  if(!r.width)return;
  burst(r.left+r.width/2,r.top+r.height/2,elCols(c),n||10,pow||1);
}
function fxLoop(){fxc.clearRect(0,0,innerWidth,innerHeight);
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=p.dec;
    if(p.life<=0){parts.splice(i,1);continue}
    p.x+=p.vx;p.y+=p.vy;p.vy+=.16;p.vx*=.985;p.rot+=p.vr;
    fxc.globalAlpha=Math.min(1,p.life*1.4);
    if(p.t==='star'){fxc.save();fxc.translate(p.x,p.y);fxc.rotate(p.rot);fxc.fillStyle=p.c;
      fxc.beginPath();for(let k=0;k<8;k++){const R=k%2?p.r*.36:p.r,a=k*Math.PI/4;fxc.lineTo(Math.cos(a)*R,Math.sin(a)*R)}
      fxc.closePath();fxc.fill();fxc.restore()}
    else{fxc.save();fxc.translate(p.x,p.y);fxc.rotate(p.rot);fxc.fillStyle=p.c;
      fxc.fillRect(-p.r,-p.r*.3,p.r*2,p.r*.6);fxc.restore()}}
  fxc.globalAlpha=1;
  if(parts.length)requestAnimationFrame(fxLoop);else{fxOn=false;fxc.clearRect(0,0,innerWidth,innerHeight)}}
function kickFx(){if(!fxOn){fxOn=true;requestAnimationFrame(fxLoop)}}
function bang(text,x,y){
  const b=document.createElement('div');b.className='bang';b.textContent=text;
  b.style.left=(x||50)+'%';b.style.top=(y||42)+'%';document.body.appendChild(b);
  setTimeout(()=>b.remove(),950)}
function toast(msg,red){
  const t=document.createElement('div');t.className='toast'+(red?' red':'');t.textContent=msg;
  $('#toasts').appendChild(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300)},3200)}
function shake(el){if(!S.shk)return;el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake')}

/* ================= состояние ================= */
/* Версия схемы сейва. Поднимать на единицу при любом изменении, которое
   старые данные не переживут сами: переименование id карты, смена структуры
   inv/deck, перенос поля. */
const SCHEMA=2;
/* Ступени миграции: MIGRATE[n] поднимает состояние с версии n-1 на n, поэтому
   сейв любого возраста доезжает до актуального цепочкой. Сейчас ступеней нет —
   ценность в самом механизме: без него первое же переименование id молча
   ломает чужие сохранения, а обнаружится это уже у игрока.
   MIGRATE[2]=s=>{...} — так будет выглядеть следующая. */
const MIGRATE={
  /* v2: перед рейдами вставлена «Тренировка» нулевым этапом. Прогресс хранится
     по индексу этапа, поэтому без сдвига у игрока «зачищенными» оказались бы
     соседние рейды, а не его собственные. Тренировку сразу помечаем пройденной:
     человек уже играл, гнать его через обучение задним числом — грубо. */
  2:s=>{
    const done={};
    for(const k of Object.keys(s.done||{})){
      const i=parseInt(k,10);
      if(Number.isFinite(i))done[i+1]=1;
    }
    done[0]=1;
    s.done=done;
    s.stage=(Number.isFinite(s.stage)?s.stage:0)+1;
  }
};
function migrate(s){
  let v=Number.isFinite(s.v)?s.v:0;
  /* Сейв из более новой сборки (прилетел из облака после отката версии):
     не трогаем и не штампуем — иначе на новой сборке он окажется испорчен. */
  if(v>SCHEMA)return s;
  while(v<SCHEMA){const step=MIGRATE[v+1];if(step)step(s);v++}
  s.v=SCHEMA;return s;
}
/* stage:1, а не 0 — «Тренировка» стоит нулевым этапом, и при stage:0 она
   запирала бы первый рейд до своего прохождения. Обучение ещё не доделано,
   поэтому пока оно не обязательное: открыты сразу и оно, и рейд 1.
   Вернуть обязательность = поставить обратно 0. */
/* Больше двух копий в колоду не положить, но лишние копятся в коллекции,
   чтобы игрок распылял их сам и видел, за что пришли искры.
   Объявлено здесь, а НЕ рядом с прочими гача-константами: его читает fixS,
   а fixS вызывается из load() строкой ниже. Стоя ниже по файлу, константа
   оказывалась во временной мёртвой зоне, fixS падал с ReferenceError, и
   load() по catch возвращал чистый DEF — то есть каждая перезагрузка
   страницы стирала сейв. */
const INV_CAP=20;
const DEF={v:SCHEMA,sparks:600,inv:{},deck:null,stage:1,done:{},hero:null,name:'',story:0,
  gacha:{pity:0,packs:0},snd:true,vfx:true,shk:true,foil:true,anim:true,arrows:true,
  /* Настройки графики. По умолчанию всё включено: игра должна показывать себя
     как задумана, а урезать пусть решает тот, кому тяжело. */
  gfx:{irid:1,spec:1,scan:1,grain:1,glow:1,tilt:1},
  chats:{},   /* какие переписки уже прочитаны — по номеру этапа */
  promo:{},   /* какие промокоды уже активированы — чтобы не вводить дважды */
  stats:{packs:0,wins:0,battles:0}};
let S=load();
function defaultDeck(){return CARDS.filter(c=>c.t===0&&!c.noColl).flatMap(c=>[c.id,c.id]).slice(0,20)}
function fixS(s){
  for(const c of CARDS){if(Number.isFinite(s.inv[c.id]))s.inv[c.id]=clamp(s.inv[c.id]|0,0,INV_CAP)}
  if(!Array.isArray(s.deck)||s.deck.length!==20)s.deck=defaultDeck();
  if(!Number.isFinite(s.stage))s.stage=0;
  /* Сейвы, сделанные до появления блока графики, приходят без gfx. Дополняем
     по ключам, а не подменяем объект целиком: иначе будущий новый флаг
     затирал бы уже выбранное игроком. */
  if(!s.chats||typeof s.chats!=='object')s.chats={};
  if(!s.promo||typeof s.promo!=='object')s.promo={};
  if(!s.gfx||typeof s.gfx!=='object')s.gfx={};
  for(const k in DEF.gfx)if(s.gfx[k]!==0&&s.gfx[k]!==1)s.gfx[k]=DEF.gfx[k];
  return s}
function load(){
  const raw=store.get('bbduel');
  /* fixS и на чистом DEF: у него deck=null, и без нормализации загрузчик
     возвращал заведомо нерабочее состояние, а доводил его до ума лишь
     стартовый блок ниже по файлу. Любой вызов load() мимо него — например
     при сбросе прогресса — получал колоду null и ронял отрисовку меню. */
  if(!raw)return fixS(clone(DEF));            /* сейва нет — честно новый игрок */
  let d=null;
  try{d=JSON.parse(raw)}catch(e){d=null}
  if(!d||typeof d!=='object')return fixS(clone(DEF));   /* мусор вместо сейва */
  try{
    const s=Object.assign(clone(DEF),d);
    s.gacha=Object.assign({pity:0,packs:0},d.gacha||{});s.stats=Object.assign({},DEF.stats,d.stats||{});
    /* v берём из сырых данных: Object.assign уже подставил актуальную из DEF,
       и по ней старый сейв выглядел бы свежим. */
    s.v=Number.isFinite(d.v)?d.v:0;
    return fixS(migrate(s));
  }catch(e){
    /* Сейв прочитался, упала НАША обработка. Возвращать здесь DEF — значит
       стереть чужой прогресс из-за собственной ошибки, молча и безвозвратно:
       следом отработает заполнение пустого инвентаря и запишет дефолт поверх.
       Ровно так и произошло с INV_CAP во временной мёртвой зоне. Поэтому
       отдаём разобранные данные как есть и кричим в консоль. */
    try{console.error('[bbduel] обработка сейва упала, данные сохранены как есть',e)}catch(_){}
    try{crash(e)}catch(_){}
    return Object.assign(clone(DEF),d);
  }
}
function save(){try{store.set('bbduel',JSON.stringify(S))}catch(e){}}
if(!store.ok)setTimeout(()=>toast('Хранилище недоступно — сейв до перезагрузки',1),900);
if(!S.inv||!Object.keys(S.inv).length){
  for(const c of CARDS.filter(c=>c.t===0&&!c.noColl))S.inv[c.id]=2;
  S.deck=defaultDeck();save();}

/* ================= экраны ================= */
let CUR='menu';
function go(id){
  /* Играть можно только героем. Перехват стоит здесь, а не на кнопке меню,
     чтобы закрыть и остальные входы в рейды — например «В БОЙ» с экрана
     колоды. Выбрал героя — дальше этот перехват не срабатывает никогда. */
  if(id==='stages'&&!S.hero)id='hero';
  sfx.ui();
  /* Игрок сам ушёл с боя — значит рейд брошен осознанно. Снимок держим
     только для аварийных случаев (свернули приложение, упал webview). */
  if(CUR==='deck'&&id!=='deck')closeCardView(true);

  if(CUR==='battle'&&id!=='battle'){
    dropBattleSnap();
    /* И обязательно снять обучение. Иначе оно продолжает жить на другом
       экране: перехватчик ввода остаётся навешенным и блокирует ВСЁ
       приложение, а рамка указывает на элементы скрытого боя. */
    if(TR)stopTraining();
  }
  $$('.screen').forEach(s=>s.classList.remove('on'));
  $('#scr-'+id).classList.add('on');CUR=id;
  document.body.classList.toggle('menuOn',id==='menu');
  /* В TMA: нативная кнопка «Назад» вместо экранной на всех экранах кроме меню,
     и подтверждение закрытия во время боя, чтобы не потерять рейд. */
  PF.back(id!=='menu',()=>{if(CUR!=='menu')go('menu')});
  PF.guardClose(id==='battle');
  if(id==='hero')renderHero();
  /* Заход на экран сюжета не через startStory (например из меню) — начинаем
     сцену с начала. Условие на vnI===0 было ошибкой: после первого просмотра
     счётчик стоит в конце, и повтор открывался сразу на последней реплике. */
  if(id==='story'&&!vnAfter){vnI=0;vnArt=0;setTimeout(()=>vnShow(),0)}
  if(id==='menu')renderMenu();
  if(id==='gacha')renderGacha(); else if(CUR==='gacha')crumb('ok-ушёл');
  if(id==='deck')renderDeck();
  if(id==='stages')renderStages();
  if(id==='settings')renderSettings();
}
document.addEventListener('click',e=>{
  const ib=e.target.closest('[data-info]');if(ib){openInfo(ib.dataset.info);return}
  const b=e.target.closest('[data-go]');if(b){go(b.dataset.go);return}
  /* Любой клик по экрану сюжета листает дальше — кроме кнопки пропуска. */
  if(CUR==='story'){
    if(e.target.closest('#vnSkip')){
      const after=vnAfter;vnAfter=null;S.story=1;save();
      if(after)after();else go('menu');
      return;
    }
    vnNext();
  }});

/* ================= сюжет: сцена «Последний звонок» =================
   По вашему выбору оставлены только реплики — ремарки курсивом («Она надевает
   гарнитуру», «Пауза», «Щелчок») выброшены, их работу берёт на себя смена
   кадра. Короткие обмены склеены в одно окно: «Что?» / «Ничего.» и подобные.
   Поле s: g — вслух, t — мысли, c — клиент. Поле a — номер кадра; он ходит
   между спокойным (1) и сорванным (2) по ходу перепалки, чтобы картинка
   отыгрывала тон реплики, а не просто менялась раз в блок. */
/* Сюжеты обоих героев. Раньше сцена была одна и жёстко зашита в показ: путь к
   кадрам, имя второй стороны и лицо героини стояли прямо в vnShow. Теперь это
   данные — третьего героя можно добавить, не трогая отрисовку. */
const STORIES={
f:{art:'art/story/scene',face:'f',foe:'НЕДОВОЛЬНЫЙ КЛИЕНТ',
   intro:'СЛУЖБА ПОДДЕРЖКИ',title:'ПОСЛЕДНИЙ ЗВОНОК',
   mood:{1:'calm',2:'angry',3:'angry',4:'calm'},
   beats:[
{a:1,l:[['g','Только не сейчас...']]},
{a:1,l:[['g','Здравствуйте! Служба поддержки. Меня зовут {NAME}. Чем я могу вам помочь?']]},
{a:1,l:[['c','Наконец-то! Вы там вообще работаете?!']]},
{a:1,l:[['g','Приношу извинения за ожидание. Расскажите, пожалуйста, что произошло.']]},
{a:1,l:[['c','У меня интернет не работает уже два часа!']]},
{a:1,l:[['g','Понимаю. Давайте проверим соединение. Подскажите, пожалуйста, горит ли индикатор—']]},
{a:1,l:[['c','Да, всё горит! Я уже всё проверил!']]},
{a:1,l:[['g','Хорошо. Тогда давайте—']]},
{a:1,l:[['c','Вы вообще понимаете, что я из-за вас работу потерял?!']]},
{a:2,sh:1,l:[['t','А я сейчас из-за тебя карту проиграю.']]},
{a:1,l:[['c','Вы меня слышите?!'],['g','Да, конечно.']]},
{a:1,l:[['c','Тогда почему вы молчите?!']]},
{a:1,l:[['g','Я проверяю информацию по вашему подключению.']]},
{a:1,l:[['c','Вы уже десять минут её проверяете!']]},
{a:1,l:[['g','Прошло около двух минут.']]},
{a:1,l:[['c','Не надо мне рассказывать, сколько прошло!']]},
{a:2,sh:1,l:[['t','А тебе не надо мне рассказывать, как считать время.']]},
{a:1,l:[['c','Что?'],['g','Ничего.']]},
{a:1,l:[['g','Так. Я вижу проблему. У вас отключён роутер.']]},
{a:1,l:[['c','Не может быть.']]},
{a:1,l:[['g','Он не подключён к розетке.']]},
{a:1,l:[['c','Я его не отключал.'],['g','Я понимаю.']]},
{a:1,l:[['c','И что мне теперь делать?']]},
{a:1,l:[['g','Подключить его обратно.']]},
{a:1,l:[['c','И интернет появится?'],['g','Да.']]},
{a:1,l:[['c','...Появился.']]},
{a:1,l:[['g','Отлично.']]},
{a:1,l:[['c','А почему он вообще отключился?']]},
{a:1,l:[['g','Не знаю.']]},
{a:1,l:[['c','В смысле — не знаете?!']]},
{a:1,l:[['g','Причин может быть много.']]},
{a:1,l:[['c','А вы специалист или кто?!']]},
{a:1,l:[['c','Алло?!'],['g','Да.']]},
{a:1,l:[['c','Так что мне делать, если это снова произойдёт?!']]},
{a:1,l:[['g','Позвонить нам ещё раз.']]},
{a:1,l:[['c','А если опять будете двадцать минут трубку не брать?!']]},
{a:2,sh:1,l:[['t','Ох, поверь. В следующий раз я точно не возьму.']]},
{a:1,l:[['c','ЧТО?!']]},
{a:1,l:[['g','Всего доброго.']]},
{a:1,l:[['c','Подождите, я ещё—'],['g','Всего доброго.']]},
{a:1,l:[['c','Но—']]},
{a:2,sh:1,l:[['g','ВСЕГО. ДОБРОГО.']]},
{a:3,sh:1,l:[['g','Да пошёл ты!']]},
{a:3,m:'calm',l:[['g','Три года...']]},
{a:3,m:'calm',l:[['g','Три года я отвечаю на звонки людей, которые не знают, где у них розетка.']]},
{a:4,l:[['g','А ведь...']]},
{a:4,l:[['g','Почему я вообще здесь сижу?']]},
{a:4,l:[['g','Я могу просто всё бросить.']]},
{a:4,l:[['g','Уйти с этой работы.']]},
{a:4,l:[['g','Играть каждый день.']]},
{a:4,l:[['g','Подняться в БАМ-рейтинге.']]},
{a:4,l:[['g','Попасть на турниры.']]},
{a:4,l:[['g','Выиграть региональные.']]},
{a:4,l:[['g','Потом мировые...']]},
{a:4,m:'joy',l:[['g','А потом стать лучшей в мире.']]},
{a:4,m:'joy',l:[['g','И никогда больше не слышать слова «перезагрузите роутер».']]},
{a:4,l:[['g','Нет. Но для начала... надо хотя бы в местный топ попасть.']]},
{a:4,m:'joy',l:[['g','А там уже посмотрим, кто кому интернет отключит.']]}
]},
/* Сценарий парня. Ваши реплики сохранены дословно; дописанные помечены
   ДОБАВЛЕНО и выкидываются без последствий. Голос у него другой: она вежлива и
   многословна, он отвечает односложно, а остальное держит в себе — на этом
   контрасте и стоят его мысли. */
m:{art:'art/story/boy',face:'m',foe:'НАЧАЛЬНИК',
   intro:'ПОЗДНИЙ ВЕЧЕР В ОФИСЕ',title:'ОТЧЁТ ПОДОЖДЁТ',
   mood:{1:'calm',2:'angry',3:'calm',4:'joy'},
   beats:[
{a:1,l:[['t','Ещё один ход. Один — и закрою.']]},                     /* ДОБАВЛЕНО */
{a:1,l:[['g','Да, слушаю.']]},
{a:1,l:[['c','Ты ещё в офисе?'],['g','Да.']]},
{a:1,l:[['c','Тогда закончи отчёт сегодня.']]},
{a:1,l:[['c','И я посмотрел твою работу — там всё нужно переделать.']]},
{a:1,l:[['g','Всё?'],['c','Всё.']]},
{a:1,l:[['g','Понял.']]},
{a:2,sh:1,l:[['t','Три недели. Три недели я его делал.']]},           /* ДОБАВЛЕНО */
{a:1,l:[['c','И почему у тебя вечно всё в последний момент?']]},      /* ДОБАВЛЕНО */
{a:1,l:[['g','Я отправил в среду.']]},                                /* ДОБАВЛЕНО */
{a:1,l:[['c','Не помню такого.']]},                                   /* ДОБАВЛЕНО */
{a:2,sh:1,l:[['t','Конечно не помнишь.']]},                           /* ДОБАВЛЕНО */
{a:1,l:[['c','Через час хочу увидеть готовый вариант.']]},
{a:1,l:[['g','Конечно.']]},
{a:2,sh:1,l:[['t','Через час я буду дома.']]},                        /* ДОБАВЛЕНО */
{a:1,l:[['c','И в понедельник выходи.']]},                            /* ДОБАВЛЕНО */
{a:1,l:[['g','В понедельник выходной.']]},                            /* ДОБАВЛЕНО */
{a:1,l:[['c','У нас выходных не бывает.']]},                          /* ДОБАВЛЕНО */
{a:2,sh:1,l:[['t','У вас — не бывает.']]},                            /* ДОБАВЛЕНО */
{a:1,l:[['c','Ты меня слышишь?'],['g','Слышу.']]},                    /* ДОБАВЛЕНО */
{a:1,l:[['c','Тогда работай.']]},                                     /* ДОБАВЛЕНО */
{a:2,sh:1,l:[['g','Да пошёл ты...']]},
{a:2,l:[['t','Вслух бы сказать — глядишь, и полегчало бы.']]},        /* ДОБАВЛЕНО */
{a:2,l:[['g','Три года я здесь сижу.']]},
{a:2,l:[['g','Каждый день одно и то же.']]},
{a:2,l:[['g','Отчёты, таблицы, начальник...']]},
{a:2,l:[['g','И каждый раз «всё нужно переделать».']]},               /* ДОБАВЛЕНО */
{a:2,l:[['g','А ведь в этой игре у меня хотя бы получается.']]},
{a:2,l:[['g','Тут никто не говорит «переделай».']]},                  /* ДОБАВЛЕНО */
{a:2,l:[['g','Тут просто выигрываешь. Или нет.']]},                   /* ДОБАВЛЕНО */
{a:3,l:[['g','А что, если всё бросить?']]},
{a:3,l:[['g','Играть каждый день. Тренироваться.']]},
{a:3,l:[['g','Подняться в рейтинге...']]},
{a:3,l:[['g','Потом на большие турниры.']]},
{a:3,l:[['g','А там...']]},
{a:3,l:[['g','Почему бы и не стать лучшим в мире?']]},
{a:3,l:[['t','Смешно.']]},                                            /* ДОБАВЛЕНО */
{a:3,l:[['t','...а почему, собственно, смешно?']]},                   /* ДОБАВЛЕНО */
{a:3,l:[['g','Кто-то же там стоит.']]},                               /* ДОБАВЛЕНО */
{a:3,l:[['g','Значит, место не забронировано.']]},                    /* ДОБАВЛЕНО */
{a:4,l:[['g','Ладно...']]},
{a:4,l:[['g','Мировой топ — это потом.']]},
{a:4,l:[['g','Для начала...']]},
{a:4,l:[['g','Надо хотя бы в местный топ попасть.']]},
{a:4,l:[['g','А дальше разберёмся.']]},
{a:4,l:[['g','Отчёт подождёт.']]},                                    /* ДОБАВЛЕНО */
{a:4,l:[['t','Три года ждал — час потерпит.']]},                      /* ДОБАВЛЕНО */
{a:4,m:'joy',l:[['g','Ну что, поехали.']]}
]}
};
/* ================= БАМ-ЧАТ =================
   Переписка с соперником перед боем. Ключ — номер этапа: чат появляется ровно
   у тех боёв, для которых написан текст, и больше нигде. Добавить разговор к
   новому бою = дописать сюда строку, править код не нужно.
     't' — пишет соперник, 'm' — пишем мы.
   Наша реплика заранее стоит в поле ввода: игроку остаётся нажать отправку.
   Печатать нечего, а ощущение участия при этом остаётся.
   {NAME} подставляется как в сюжете. */
/* ================= БАМ-ЧАТ =================
   Переписка с соперником. Ключ — номер этапа: чат появляется ровно у тех боёв,
   для которых написан текст. Добавить разговор к новому бою = дописать строку.
     pre  — до боя,  post — после победы.
     't' — пишет соперник, 'm' — пишем мы, 'th' — наша мысль
   Мысль не пузырь: в переписке её никто не отправляет, и рисовать её как
   сообщение значило бы соврать. Идёт отдельной строкой по центру.
   Третий элемент — эмоция говорящего: подменяет портрет сбоку.
   Наша реплика заранее стоит в поле ввода, игроку остаётся нажать отправку. */
/* Портреты. g — героиня, b — герой, a — соперник.
   Набор парня ждёт картинок: положить в art/chat как b-calm / b-angry /
   b-what / b-palm. Пока их нет, портрет просто не покажется — см. onerror
   ниже: показывать вместо парня девушку было бы хуже пустоты. */
const CHAT_FACE={
  g:{calm:'art/chat/g-calm.webp',angry:'art/chat/g-angry.webp',
     what:'art/chat/g-what.webp',palm:'art/chat/g-palm.webp'},
  b:{calm:'art/chat/b-calm.webp',angry:'art/chat/b-angry.webp',
     what:'art/chat/b-what.webp',palm:'art/chat/b-palm.webp'},
  a:{calm:'art/chat/a-calm.webp',laugh:'art/chat/a-laugh.webp'},
  s:{calm:'art/chat/s-calm.webp',rap:'art/chat/s-rap.webp',lost:'art/chat/s-lost.webp'},
  mom:{calm:'art/chat/mom-calm.webp',angry:'art/chat/mom-angry.webp'}
};
const CHATS={
1:{who:'xX_Mr_Anon_Xx',foe:'a',
  pre:[
   ['t','0 побед. Какой позорный рейтинг...'],
   ['t','Ты вообще в мета-колоды {заглядывала|заглядывал}? Или играешь рандомными картами?'],
   ['m','А ты кто? Модератор?'],
   ['m','Или просто делать нечего?'],
   ['t','Я Тот, от кого ты сейчас примешь поражение, {бомжиха|бомжара}.','laugh'],
   ['t','Твоя колода — просто мусор, ахахаха.','laugh'],
   ['m','{Бомжиха|Бомжара}? Запомни этот день.','angry'],
   ['m','Как день, когда тебя {нагнула|нагнул} {бомжиха|бомжара}.','angry'],
  ],
  post:[
   ['t','Ладно, признаю. Зря быканул, сори.'],
   ['t','Карты у тебя, кстати, не такие уж и мусорные.'],
   ['m','Не извиняйся, просто играй лучше.'],
   ['t','Слушай, ты {дерзкая|дерзкий}...'],
   ['t','Не хотелось бы встретиться с тобой на турнире, честно.'],
   ['m','Турнир? Какой ещё турнир?','what'],
   ['t','Ты что, в танке?'],
   ['t','Глава местного молодёжного комитета устроил районный ивент.'],
   ['t','Главный приз — 1500 искр! И там будет элита.'],
   ['m','1500 искр?','what'],
   ['th','Это же билет на квалификацию к Мировым топам. Это мой шанс.'],
   ['m','И когда он проходит?'],
   ['t','Стартует через 2 дня.'],
   ['t','В нём участвует даже этот стример... как там его...'],
   ['t','Шшшепелявый Шшшуллер!'],
   ['m','Шшшепелявый Шшшуллер?!','what'],
   ['m','Тот самый, с самой дорогой колодой в нашем районе??','what'],
   ['t','Да-да, точно! Он там всех в хлам порвёт.','laugh'],
   ['t','Удачи, {бомжиха|бомжара}.','laugh'],
  ]},
/* Четвёртый бой. Черновик — правьте как со сценарием: «t» пишет соперник,
   «m» мы, род размечен внутри реплики.
   Собеседник назван так же, как этап, а не отдельным ником: у первого боя имя
   этапа и имя в чате разъехались (крысы против Анона), и врал именно чат.
   Портрета у него нет — правый бок останется пустым, пока не появится файл. */
/* Четвёртый бой. Текст ваш, поправлены только опечатки и пунктуация; ломаные
   «победЮ / победУ», «йоу» и прочая манера — нарочно, их не трогал.
   Мысли героя идут строкой по центру ('th'), а не пузырём: их никто не
   отправляет. Многоточие она именно ОТПРАВЛЯЕТ — это ответ молчанием, и
   пузырь тут на месте. */
4:{who:'Gold_Swag_2k',foe:'s',
  pre:[
   ['th','«Голд Свэг 2к йоу»? Серьёзно? В каком году он застрял?'],
   ['th','Ладно. Это же просто ребёнок.'],
   ['t','Йоу, {малышка|малой}! Готовься, я разнесу твои картишки! Йоу!','rap'],
   ['m','...'],
   ['t','Ау, ты там? Молчишь?','calm'],
   ['t','Так ты точно не победишь! Йоу йоу. Я даже не вспотею!','rap'],
   ['m','Слушай... Ты, кажется, перепутал сцену клуба с онлайн-игрой... йоу','palm'],
   ['t','Вся жизнь — сцена, {детка|братишка}! И ты заплатишь цену!','rap'],
   ['t','Отсюда не уйду, пока не победЮ...','rap'],
   ['t','Или не победУ...','calm'],
   ['t','Или... э-э... хмм...','lost'],
   ['m','...'],
   ['t','Короче, пока не сделаю тебе больно, йоу!','rap'],
   ['m','Чёрт, да нажми ты кнопку «ГОТОВ» УЖЕ!','angry'],
  ],
  post:[
   ['m','Ха, проще простого, йоу...'],
   ['m','...стоп, откуда это «йоу»...','what'],
   ['t','Да ты настоящий хип-хоп, {чувиха|чувак}!','rap'],
   ['t','Поражение — это тоже часть хип-хопа. Ведь только упав, я буду искать силы, чтобы подняться вновь...','calm'],
   ['th','Ну и фрик...'],
   ['t','Что ж, удачи, {чувиха|чувак}. Может, ещё увидимся! Йоу','rap'],
   ['m','Спасибо, наверное...','palm'],
   ['th','Так, кто у нас следующий... Посмотрим.'],
   ['th','«Мама ангелочка»?! Да что вообще тут происходит, сюда по приколу регистрируются?'],
  ]},
/* Пятый бой. Ваш текст с поправленной пунктуацией; капс, «!!!1!» и её манера
   оставлены как есть — на них всё и держится.
   Родственная линия дописана мной: во втором круге игрок уже обыграл «@нге/\ в
   кед@}{», и это тот самый сыночек. Мать об этом НЕ знает — она уверена, что
   он не играет, потому и полезла выигрывать аккаунт ему в подарок. Отсюда весь
   разговор после боя: узнаёт она это от того, кто их обоих и обыграл.
   Капс у неё падает ровно там, где она перестаёт давить и говорит правду —
   в переписке это читается лучше любой ремарки. */
5:{who:'Мама_ангелочка',foe:'mom',
  pre:[
   ['t','ЗДРАВСТВУЙТЕ {ДЕВОЧКА|МОЛОДОЙ ЧЕЛОВЕК}!!!','calm'],
   ['m','Добрый... день?'],
   ['t','НЕ МОГЛИ БЫ ВЫ СДАТЬСЯ ПОЖАЛУЙСТА? МНЕ ОЧЕНЬ НУЖНА ПОБЕДА!','calm'],
   ['m','Нет. С чего бы?'],
   ['t','ДЕЛО В ТОМ ЧТО Я ХОЧУ ВЫИГРАТЬ ЭТОТ ТУРНИР И ПОДАРИТЬ ЭТОТ АККАУНТ МОЕМУ СЫНОЧКЕ!!!','calm'],
   ['t','ЕМУ 12 ЛЕТ ОН ОЧЕНЬ ХОЧЕТ КАРТОЧКИ!!! ЕГО НИК ангел в кедах','calm'],
   ['th','Стоп. «@нге/\\ в кед@}{» — это же второй круг. Я его обыграл{а|}.'],
   ['m','Мне-то какое дело? Это турнир, а не лотерея для школьников.'],
   ['t','АХ КАК ГРУБО!!! МОЛОДЁЖЬ СЕЙЧАС БЕСЧУВСТВЕННАЯ.','angry'],
   ['t','РАЗВЕ КАКАЯ-ТО ТАМ ПОБЕДА МОЖЕТ БЫТЬ ДОРОЖЕ МАТЕРИНСКОЙ ЛЮБВИ?! Я ЖЕ ДЛЯ НЕГО СТАРАЮСЬ!!!','angry'],
   ['m','Разве предложение от рандома в чате дороже победы на официальном турнире? :('],
   ['t','АХ ТЫ {НАХАЛКА|НАХАЛ}!!! ЕЩЁ И ПЕРЕДРАЗНИВАЕШЬ МЕНЯ СВОИМИ СМАЙЛИКАМИ?!','angry'],
   ['t','Я ВООБЩЕ-ТО ОДНА ЕГО ВОСПИТЫВАЮ!!! У МЕНЯ ЗДОРОВЬЕ ПОШАТНУЛОСЬ ОТ НЕРВОВ!','angry'],
   ['t','А ТЕБЯ СУДЯ ПО ВСЕМУ ВООБЩЕ НИКТО НЕ ВОСПИТЫВАЛ!!!','angry'],
   ['m','Добро пожаловать в интернет, тётя.','angry'],
   ['t','АХ ТЫЫЫЫ... ТЕПЕРЬ ТЫ МЕНЯ {РАЗОЗЛИЛА|РАЗОЗЛИЛ}!!!','angry'],
   ['t','Я ДОКАЖУ ТЕБЕ, ЧТО МАТЕРИНСКАЯ ЛЮБОВЬ СИЛЬНЕЕ ЛЮБОЙ ТВОЕЙ КАРТОШКИ!!! ГОТОВЬСЯ К ПОРАЖЕНИЮ!!!1!','angry'],
  ],
  /* Поворот перестроен: раз она ЗНАЛА, что сын играет, прежний «мать не знала»
     рассыпался бы на первой же реплике. Теперь она не знала о другом — что он
     сам полез в этот турнир. Оба записались тайком друг ради друга, и об этом
     им сообщает тот, кто обоих и обыграл. */
  post:[
   ['t','НУ И ПОЖАЛУЙСТА!!! НУ И ЛАДНО!!!','angry'],
   ['t','ВЫ ПРОСТО НЕ ЗНАЕТЕ ЧТО ТАКОЕ БЫТЬ МАТЕРЬЮ!!!','angry'],
   ['m','Зато знаю, что ваш сын играет лучше вас.'],
   ['t','ЧТО?','calm'],
   ['m','«Ангел в кедах». Второй круг. Он меня почти снял.'],
   ['t','...','calm'],
   ['t','ВЫ ИГРАЛИ С МОИМ СЫНОЧКОМ?!','calm'],
   ['m','Играл{а|}. И еле выиграл{а|}.'],
   ['t','Я ЗНАЛА ЧТО ОН ЛЮБИТ ИГРАТЬ В БАМ БАМ И ЗАПИСАЛАСЬ ЧТОБЫ ВЫИГРАТЬ ДЛЯ НЕГО ПРИЗЫ','calm'],
   ['t','А ОН ЗНАЧИТ САМ ПОШЁЛ!!! И МНЕ НЕ СКАЗАЛ!!!','angry'],
   ['th','Так они оба записались. Тайком. Друг ради друга.'],
   ['m','Может, он тоже хотел выиграть для вас.'],
   ['t','...','calm'],
   ['t','СПАСИБО ВАМ ОГРОМНОЕ!!! Я ПОЙДУ С НИМ ПОГОВОРЮ!!!','angry'],
   ['t','И ПЕРЕДАМ ЧТО ВЫ ХОРОШО ИГРАЕТЕ!!! ХОТЯ ВЫ ВСЁ РАВНО {ГРУБИЯНКА|ГРУБИЯН}!!!','angry'],
   ['m','Спасибо. Наверное.','palm'],
   ['th','Не понял{а|}, что сейчас произошло. Но, кажется, хорошее.'],
  ]},
};
/* Активный сюжет — по выбранному герою. */
function curStory(){return STORIES[S.hero]||STORIES.f}

/* ================= выбор героя =================
   Показывается один раз: пока в сейве нет hero, игра не пускает дальше.
   Старые сейвы это поле не имеют, поэтому спросим и у них — миграция не
   нужна, отсутствие поля само по себе означает «ещё не выбирал». */
/* Имён у героев нет намеренно: имя вписывает игрок, здесь выбирается только
   внешность. Поэтому под портретом — не имя, а короткая ремарка. */
const HEROES={
  m:{d:'за ноутом · считает чужие колоды',art:'art/hero-m.webp'},
  f:{d:'в кресле · тасует не глядя',      art:'art/hero-f.webp'}
};
let heroPick=null;
function renderHero(){
  heroPick=S.hero||null;
  /* Парень слева, девушка справа — тот же порядок, что и в меню потом,
     чтобы выбор не перескакивал местами после подтверждения. */
  $('#hPick').innerHTML=['m','f'].map(k=>`
    <div class="hOpt ${heroPick===k?'on':''}" data-h="${k}">
      <span class="hTick">✓</span>
      <img src="${HEROES[k].art}" alt="" draggable="false">
      <div class="hDesc">${HEROES[k].d}</div>
    </div>`).join('');
  $$('#hPick .hOpt').forEach(el=>el.onclick=()=>{
    heroPick=el.dataset.h;sfx.ui();
    $$('#hPick .hOpt').forEach(x=>x.classList.toggle('on',x===el));
    heroReady();
  });
  const inp=$('#hName');
  inp.value=S.name||'';
  inp.oninput=heroReady;
  inp.onkeydown=e=>{if(e.key==='Enter'&&!$('#hGo').disabled)$('#hGo').click()};
  $('#hGo').onclick=()=>{
    const nm=inp.value.trim().slice(0,14);
    if(!heroPick||!nm)return;
    S.hero=heroPick;S.name=nm;save();
    sfx.sparks();PF.notify('success');
    renderMenu();                 /* чтобы портрет и плитки обновились под героя */
    go('stages');
    toast(`${nm}, добро пожаловать в Провал`);
  };
  heroReady();
}
function heroReady(){
  const nm=$('#hName').value.trim();
  const ok=!!heroPick&&!!nm;
  $('#hGo').disabled=!ok;
  $('#hHint').textContent=ok?'жми — и понеслось'
    :(!heroPick?'выбери героя':'впиши имя');
}
/* Портрет выбранного героя в меню. Сторона зависит от героя: парень слева,
   потому что у его портрета стол обрезан по левому краю и у края экрана это
   читается как продолжение кадра. */
function renderMenuHero(){
  const box=$('#mHero');if(!box)return;
  const h=S.hero&&HEROES[S.hero];
  box.className='';box.innerHTML='';
  document.body.classList.remove('heroM','heroF');
  if(!h)return;
  box.className='mHero '+S.hero;
  box.innerHTML=`<img src="${h.art}" alt="" draggable="false">`;
  document.body.classList.add(S.hero==='m'?'heroM':'heroF');
}

/* ================= показ сюжета =================
   Кадр меняется только когда сменился его номер: перерисовывать картинку на
   каждой реплике значит мигать ею впустую. */
let vnI=0,vnArt=0,vnAfter=null;
function vnShow(){
  const S2=curStory();
  const b=S2.beats[vnI];if(!b)return vnDone();
  if(b.a!==vnArt){
    vnArt=b.a;
    const im=$('#vnImg');
    im.src=`${S2.art}${b.a}.webp`;
    im.classList.remove('sw');void im.offsetWidth;im.classList.add('sw');
  }
  /* Каждая строка окна подписана своим говорящим. Раньше склеенный обмен шёл
     одним блоком под одним лицом, и её ответ оказывался приписан клиенту. */
  const mood=b.m||S2.mood[b.a]||'calm';
  const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  $('#vnLines').innerHTML=b.l.map(([sp,t])=>{
    const her=sp!=='c';
    const face=her
      ? `<div class="vnFace"><img src="art/emo/emo-${S2.face}-${mood}.webp" alt=""></div>`
      : `<div class="vnFace q">?</div>`;
    const nm=her?(S.name||'ГЕРОЙ').toUpperCase():S2.foe;
    return `<div class="vnLine">
      ${face}
      <div class="vnCol">
        <div class="vnName${her?'':' c'}">${nm}</div>
        <div class="vnText${sp==='t'?' think':''}">${sub(esc(t))}</div>
      </div>
    </div>`;
  }).join('');
  $('#vnProg').textContent=(vnI+1)+' / '+S2.beats.length;
  /* Тряска — на её срывах. Уважает выключатель эффектов в настройках.
     Класс снимаем явно: shake() его только вешает, а кадр новеллы живёт
     постоянно, и без сброса он оставался бы помеченным навсегда — повторный
     показ той же реплики уже не тряхнул бы. */
  const art=$('.vnArt');
  if(art){art.classList.remove('shake');if(b.sh)shake(art);}
}
function vnNext(){vnI++;if(vnI>=curStory().beats.length)vnDone();else vnShow()}
function vnDone(){
  S.story=1;save();
  const after=vnAfter;vnAfter=null;
  if(after)after();else go('menu');
}
function startStory(after){
  vnAfter=after||null;vnI=0;vnArt=0;
  go('story');
  vnShow();
}
/* Короткая заставка-пересадка. cb вызывается на пике затемнения, поэтому
   смена экрана не видна игроку. */
function vnLoad(text,ms,cb){
  const el=document.createElement('div');el.className='vnLoad';
  el.innerHTML=`<div class="vlT">${text}</div><div class="vlBar"><i></i></div>`;
  document.body.appendChild(el);
  setTimeout(()=>{
    try{cb&&cb()}catch(e){}
    el.classList.add('out');
    setTimeout(()=>el.remove(),320);
  },ms||1000);
}

/* ================= меню ================= */
function renderMenu(){
  renderMenuHero();
  const doneN=Object.keys(S.done).length;
  $('#mTiles').innerHTML=`
  <button class="mTile" data-go="stages">
    <span class="tIc">${svgWrap(EMB.boom)}</span>
    <span class="tT">ИГРАТЬ</span><span class="tS">${S.hero
      ? `pve-бои · ${doneN}/${STAGES.length} зачищено`
      : 'новая игра · выбери героя и имя'}</span>
    ${doneN<STAGES.length?`<span class="tBadge">${S.hero?'ВПЕРЁД!':'СТАРТ'}</span>`:''}
  </button>
  <button class="mTile" data-go="gacha">
    <span class="tIc">${svgWrap('<path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" fill="currentColor"/>')}</span>
    <span class="tT">КРУТКИ</span><span class="tS">пак 5 карт · 100 искр</span>
    ${S.sparks>=100?'<span class="tBadge">ЕСТЬ!</span>':''}
  </button>
  <button class="mTile" data-go="deck">
    <span class="tIc">${svgWrap(EMB.card)}</span>
    <span class="tT">КОЛОДА</span><span class="tS">${S.deck.length}/20 · коллекция ${Object.keys(S.inv).length}/${COLLECTIBLE.length}</span>
  </button>
  <button class="mTile" data-go="settings">
    <span class="tIc">${svgWrap('<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5 V5.5 M12 18.5 V21.5 M2.5 12 H5.5 M18.5 12 H21.5 M5 5 L7 7 M17 17 L19 19 M19 5 L17 7 M7 17 L5 19"/></g>')}</span>
    <span class="tT">НАСТРОЙКИ</span><span class="tS">звук · эффекты · сброс</span>
  </button>`;
}

/* ================= тикер ================= */
(function(){
  const el=document.createElement('div');el.className='ticker';
  const inEl=document.createElement('div');inEl.className='tkIn';el.appendChild(inEl);
  document.body.appendChild(el);
  /* Чётные идут обычным начертанием, нечётные — подсветкой (см. half ниже),
     поэтому порядок влияет на вид: соседние фразы всегда контрастны. */
  const segs=['БАМ БАМ','КАКОЙ КОЗЫРЬ?','МОЖЕТ В ДУРАЧКА?','ВДОХНОВИЛСЯ HS','PVP ИЛИ ...?','У НЕГО КАРТЫ МЕЧЁНЫЕ!'];
  const half=seg=>
    seg.map((s,i)=>i%2?`<span class="tkHi">${s}</span>`:`<span>${s}</span>`).join('<span class="tkSep">★</span>')+'<span class="tkSep">★</span>';
  /* Бесшовная прокрутка требует, чтобы ОДНА копия была не уже экрана: сдвиг
     ходит в диапазоне [0,w), и видимое окно достаёт до x+innerWidth, поэтому
     содержимого нужно минимум w+innerWidth. Двух копий не хватало — при 868px
     на копию и экране 1920 справа открывалась дыра в 222px.
     Второй промах был в шаге петли: он считался как scrollWidth/2 = 1102 при
     реальной копии в 868, из-за чего лента ещё и дёргалась на стыке. Теперь
     копия меряется отдельно, до размножения. */
  const seg=half(segs),MAX_COPIES=40;   /* потолок на всякий случай */
  let w=0,copies=0,x=0,last=performance.now();
  function fit(){
    /* Пока лента скрыта (а на старте она скрыта — menuOn выставляется позже),
       scrollWidth равен нулю: мерить нечего, пробуем на следующем кадре. */
    if(!w){
      inEl.innerHTML=seg;w=inEl.scrollWidth;
      /* Абсурдно малый замер (шрифт ещё не готов, контейнер схлопнут) нельзя
         принимать: из него получится n в сотни копий, и построение такого DOM
         прямо в кадре анимации подвесит вкладку. Сбрасываем и пробуем позже. */
      if(w<120){w=0;return false}
    }
    const n=Math.min(MAX_COPIES,Math.max(2,Math.ceil(innerWidth/w)+1));
    if(copies!==n){copies=n;inEl.innerHTML=seg.repeat(n)}
    return true;
  }
  addEventListener('resize',()=>{copies=0});
  (function loop(t){const dt=Math.min((t-last)/1000,.1);last=t;
    if(fit()){x=(x+70*dt)%w;inEl.style.transform=`translateX(${-x}px)`}
    requestAnimationFrame(loop)})(last);
})();

/* ================= описания эффектов ================= */
/* «+3 к урону», «+2 к жизням» или обе половины — смотря что даёт карта. */
function плюс(e){
  const ч=[];
  if(e.a)ч.push(`+${e.a} к урону`);
  if(e.h)ч.push(`+${e.h} к жизням`);
  return ч.join(' и ')||'ничего';
}
function effDesc(c){
  const e=c.eff;
  const pre=c.ty==='u'?'<b>Боевой клич:</b> ':'<b>Эхо-заклятие:</b> ';
  if(!e)return 'Без эффекта — честный боец: ставь на поле, со следующего хода атакует. Хорошие статы за свои деньги.';
  switch(e.k){
    /* В каждой строке обязаны стоять три вещи: СКОЛЬКО, ПО КОМУ и КТО
       выбирает цель. Раньше «по твоему выбору» стояло даже там, где выбора
       нет, а «выбранной цели» — у карты, которая всегда бьёт в героя. */
    case 'dmg':return pre+`<b>${e.v} ${plural(e.v,'урон','урона','урона')}</b> одной цели на выбор: любому <b>вражескому юниту</b> или <b>вражескому герою</b>. Таунт этому не мешает — он держит только атаки.`;
    case 'healHero':return pre+`<b>+${e.v} здоровья ТВОЕМУ герою</b>, но не выше его максимума. Юнитов не лечит.`;
    case 'healAll':return pre+`<b>+${e.v} здоровья</b> твоему герою <b>и каждому твоему юниту</b> на поле. Цель не выбирается.`;
    case 'draw':return pre+`берёшь <b>${e.v} ${plural(e.v,'карту','карты','карт')}</b> из своей колоды в руку. Если в руке уже 7 — лишняя сгорает.`;
    /* Нулевую половину прибавки не показываем: «+3 к урону / +0 к жизням»
       заставляет читать и отбрасывать половину строки. */
    case 'buff':return pre+`<b>${плюс(e)}</b> одному <b>твоему</b> юниту на выбор. Навсегда, до конца боя.`;
    case 'buffAll':return pre+`<b>${плюс(e)}</b> каждому <b>твоему</b> юниту на поле. Навсегда. Цель не выбирается.`;
    case 'aoe':return pre+`<b>${e.v} ${plural(e.v,'урон','урона','урона')} КАЖДОМУ юниту врага</b> разом. Героя не задевает, цель не выбирается.`;
    case 'weaken':return pre+`каждый юнит врага теряет <b>${e.v} ${plural(e.v,'урон','урона','урона')}</b> (не ниже нуля). Жизни не трогает, цель не выбирается.`;
    case 'drain':return pre+`<b>${e.v} ${plural(e.v,'урон','урона','урона')} вражескому ГЕРОЮ</b> и <b>+${e.v} здоровья твоему</b>. Бьёт только в героя — цель не выбирается.`;
    case 'mana':return pre+`<b>+${e.v} ${plural(e.v,'мана','маны','маны')}</b> прямо сейчас и только на этот ход. Дальше мана растёт как обычно.`;
  }
  return '';
}
function kwLine(c){
  const k=[];
  if(c.kw&&c.kw.includes('taunt'))k.push('<span class="kw">ТАУНТ</span> пока он жив, вражеские юниты обязаны бить его, а не героя. <b>Заклятия и боевые кличи он НЕ останавливает</b> — по герою из них попасть можно');
  if(c.kw&&c.kw.includes('rush'))k.push('<span class="kw">РАШ</span> атакует в тот же ход, когда вышел — не ждёт');
  return k.length?`<p>${k.join(' · ')}</p>`:'';
}

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
      <div class="cfText">${kw?`<span class="cfKw">${kw}.</span> `:''}${eff||c.fl}</div>
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
  crumb('экран-круток');
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
  crumb('круткиготовы');
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
  /* Заходя на экран круток, просим догрузиться ещё раз. preload="auto" —
     всего лишь пожелание, и Safari его игнорирует: до жеста пользователя
     файл может не качаться вовсе. Поэтому ролик оказывался не готов ровно
     тогда, когда он нужен. load() на уже готовом элементе безвреден. */
  /* load() ровно один раз. Повторный вызов бросает уже скачанное и тянет
     822 КБ заново — а сюда заходят при каждом показе экрана круток. */
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
/* ================= крупный просмотр карты =================
   Открывается кликом по карточке в коллекции. Наклон здесь работает и пальцем
   тоже — в отличие от сетки, где касание означает прокрутку, а не осмотр.
   Кнопка колоды живёт и здесь: разглядев карту, естественно тут же решить её
   судьбу, не закрывая и не выискивая ту же карточку обратно в сетке. */
let cvEl=null,cvId=null;
function openCardView(id){
  const c=byId(id); if(!c)return;
  const have=S.inv[id]||0;
  if(!have){toast('Нет такой карты — крути паки!',1);return}
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
  const have=S.inv[id]||0;if(!have){toast('Нет такой карты — крути паки!',1);return}
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

/* ================= этапы ================= */
/* Раскрыт ли первый акт. Живёт в модуле, а не в сейве: состояние списка —
   вопрос текущего сеанса, и переживать перезагрузку ему незачем. Зато при
   возврате из боя акт остаётся открытым, а не схлопывается каждый раз. */
let act1Open=false;
/* Сюжеты по актам. Одна запись — один акт: флаг в сейве, за кого играет сцена
   и как её показать. Появится второй акт со своей сценой — добавляется строка,
   и кнопка выедет из его заголовка сама, ничего больше править не нужно. */
const ACT_STORY={
  1:{flag:'story',sub:'сцена · пересмотреть',
     run:()=>vnLoad(curStory().intro,900,()=>startStory(()=>go('stages')))}
};
function actStoryHTML(n){
  const st=ACT_STORY[n];
  /* Кнопка появляется только когда сцену уже видели: до этого она играет сама
     перед первым боем акта, и предлагать её заранее — спойлер. Заголовок берём
     у сюжета текущего героя: у каждого своя сцена и своё название. */
  const sc=STORIES[S.hero];
  if(!st||!sc||!S[st.flag])return '';
  return `<button class="actStory" data-story="${n}">
    <span class="asT">${sc.title}</span><span class="asS">${st.sub}</span>
  </button>`;
}
/* num — что показать в кружке. Раньше это был сквозной индекс этапа, и внутри
   акта бои нумеровались с двойки: тренировка занимает нулевой индекс. Теперь
   номер передаётся явно, у акта своя нумерация с единицы. */
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
  if(i>S.stage){toast('Зачисти предыдущий Провал!',1);return}
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
  сЧатом();
}
function stNodeHTML(st,i,num){
  const done=S.done[i],lock=i>S.stage;
  const tile=`<div class="stNode ${done?'done':''} ${lock?'lock':''} ${st.boss?'boss':''}" data-i="${i}">
    <span class="stNum">${num}</span>
    <div class="stInfo"><div class="stName">${st.n}</div><div class="stDesc">${st.d}</div>
      <div class="stMeta">${st.hp} хп · награда ${st.reward} ⚡ · ии: ${DIFF[i]}${st.boss?' · БОСС':''}</div></div>
    <span class="stState ${done?'w':lock?'l':'n'}">${done?'ЗАЧИЩЕНО':lock?'ЗАКРЫТО':'В БОЙ'}</span>
  </div>`;
  /* Значок стоит рядом с плиткой, а не внутри: у него своё действие, и внутри
     кнопки «в бой» его легко принять за её часть. Показываем и непрочитанный
     разговор после победы — он же и есть продолжение истории. */
  if(lock||!CHATS[i])return tile;
  const part=(S.done[i]&&CHATS[i].post)?'post':'pre';
  const нов=!chatSeen(i,part);
  return `<div class="stRow">${tile}
    <button class="stChat ${нов?'nw':''}" data-chat="${i}" data-part="${part}"
      aria-label="Открыть БАМ-ЧАТ">✆</button></div>`;
}
function renderStages(){
  /* Тренировка стоит отдельно от актов: это не бой сюжета, а обучение. */
  const trainHTML=STAGES[0]&&STAGES[0].tutorial?stNodeHTML(STAGES[0],0,'★'):'';
  const acts=STAGES.map((st,i)=>i).filter(i=>i>0);
  const doneN=acts.filter(i=>S.done[i]).length;
  const body=acts.map((i,n)=>stNodeHTML(STAGES[i],i,n+1)).join('');
  $('#stMap').innerHTML=`
    ${trainHTML}
    <div class="actRow">
      <button class="actHead ${act1Open?'open':''}" id="act1Head">
        <span class="actN">I</span>
        <div class="actC">
          <div class="actT">ПЕРВЫЙ АКТ · ПРОВАЛ</div>
          <div class="actS">${acts.length} боёв · ${doneN}/${acts.length} зачищено</div>
        </div>
        <span class="actArrow">▼</span>
      </button>
      ${actStoryHTML(1)}
    </div>
    <div class="actBody ${act1Open?'open':''}" id="act1Body">${body}</div>
    <div class="actRow"><div class="actHead soon" aria-disabled="true">
      <span class="actN">II</span>
      <div class="actC">
        <div class="actT">ВТОРОЙ АКТ · ???</div>
        <div class="actS">ещё не открыт</div>
      </div>
      <span class="actBadge">SOON!</span>
    </div></div>`;
  $$('#stMap .actStory').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const st=ACT_STORY[+b.dataset.story];
    if(st){sfx.ui();st.run()}
  });
  $('#act1Head').onclick=()=>{
    act1Open=!act1Open;sfx.ui();
    $('#act1Head').classList.toggle('open',act1Open);
    $('#act1Body').classList.toggle('open',act1Open);
  };
  $$('#stMap .stChat').forEach(b=>b.onclick=e=>{
    e.stopPropagation();          /* иначе следом уйдём в бой */
    sfx.ui(); openChat(+b.dataset.chat,b.dataset.part,null);
  });
  $$('#stMap .stNode').forEach(el=>el.onclick=()=>enterStage(+el.dataset.i));
}

/* ================= показ чата =================
   Реплики идут по одной, с паузой «печатает» перед чужими: без неё лента
   вываливается простынёй и читается как текст, а не как разговор.
   Чат — накладка, а не экран: CUR не меняется, поэтому возврат, сохранение и
   сторож боя ничего про него знать не обязаны. */
let chI=0, chSi=null, chPart='pre', chAfter=null, chBusy=false, chOn=false;
/* Подстановка имени героя — та же, что в сюжете. Общая функция, а не replace
   по месту: заполнителей со временем станет больше. */
/* Подстановки в тексте. {NAME} — имя героя, {она|он} — род.
   Пол размечаем ВНУТРИ одной реплики, а не держим две копии диалога: копии
   разъезжаются при первой же правке, и заметить это можно только сыграв за
   обоих. Здесь же видно сразу, что где меняется. */
function sub(t){
  const он=S.hero==='m';
  return String(t)
    .replace(/\{NAME\}/g,S.name||'—')
    .replace(/\{([^{}|]*)\|([^{}|]*)\}/g,(_,ж,м)=>он?м:ж);
}
/* Склонение по числу: «2 новое сообщение» выдаёт машину сразу, а весь смысл
   этого экрана — выглядеть настоящим мессенджером. */
function plural(n,one,few,many){
  const a=Math.abs(n)%100,b=a%10;
  if(a>10&&a<20)return many;
  if(b>1&&b<5)return few;
  if(b===1)return one;
  return many;
}
function chatFor(si,part){const c=CHATS[si];return c&&c[part||'pre']?c:null}
function chatBeats(){const c=CHATS[chSi];return c?(c[chPart]||[]):[]}
function chatKey(si,part){return part==='post'?si+'p':String(si)}
function chatSeen(si,part){return !!(S.chats&&S.chats[chatKey(si,part||'pre')])}

/* Портреты. Слева всегда игрок, справа собеседник — постоянство важнее
   разнообразия: игрок не должен каждый раз соображать, кто где. */
function chFace(side,emo){
  const c=CHATS[chSi]; if(!c)return;
  const set=side==='m'?(CHAT_FACE[S.hero==='m'?'b':'g']):CHAT_FACE[c.foe||'a'];
  const el=side==='m'?$('#chHeroL'):$('#chHeroR');
  if(!el)return;
  /* У соперника может не быть портрета вовсе — например, у нового бойца, для
     которого арт ещё не нарисован. Тогда прячем сторону явно. Без этого на
     месте оставалась картинка ПРЕДЫДУЩЕГО собеседника, и разговор шёл будто
     с ним. */
  if(!set){el.style.visibility='hidden';el.removeAttribute('src');return}
  const src=set[emo]||set.calm||Object.values(set)[0];
  if(src&&!el.src.endsWith(src)){
    /* Картинки может не быть — набор парня рисуется. Тогда прячем портрет, а
       не подставляем чужой: пустой бок честнее, чем девушка вместо парня. */
    el.style.visibility='hidden';
    el.onload=()=>{el.style.visibility=''};
    el.onerror=()=>{el.style.visibility='hidden'};
    el.src=src;
  }
  $('#chHeroL').classList.toggle('say',side==='m');
  $('#chHeroR').classList.toggle('say',side!=='m');
  /* Кто говорит — тем и решается, куда отъедет телефон. Классы на обёртке, а
     не стили на элементах: так рельса целиком описана в CSS и её можно
     выключить одним медиазапросом при «меньше движения». */
  const w=$('#chWrap');
  w.classList.toggle('sayL',side==='m');
  w.classList.toggle('sayR',side!=='m');
}
function openChat(si,part,after){
  const c=chatFor(si,part); if(!c)return false;
  chSi=si; chPart=part||'pre'; chI=0; chAfter=after||null; chBusy=false; chOn=true;
  $('#chWho').textContent=c.who;
  $('#chBody').innerHTML='<div class="chDay">Сегодня</div>';
  /* Кнопку гасим сразу. Иначе секунду до первой реплики она стоит в виде от
     прошлого разговора — и не просто выглядит не так, а РАБОТАЕТ: нажатие в
     этот миг ушло бы в chatSend, и чужая реплика отправилась бы от нас. */
  $('#chSend').disabled=true; $('#chSend').classList.remove('go'); $('#chSend').textContent='➤';
  $('#chField').textContent='Написать сообщение...'; $('#chField').classList.add('ph');
  chFace('t','calm');   /* обе картинки ставим через chFace: там же и защита
                           от отсутствующего файла */
  chFace('m','calm');
  $('#chHeroL').classList.remove('say');$('#chHeroR').classList.remove('say');
  $('#chWrap').classList.remove('sayL','sayR');   /* рельса в середине */
  const w=$('#chWrap'); w.hidden=false;
  requestAnimationFrame(()=>w.classList.add('on'));
  $('#chBack').onclick=()=>chatDone(true);
  $('#chSend').onclick=chatSend;
  chStep();
  return true;
}
/* Одна ступень: выкладываем подряд чужие реплики и мысли, останавливаемся на
   своей и кладём её в поле ввода — дальше ход игрока. */
async function chStep(){
  if(chBusy)return; chBusy=true;
  const bt=chatBeats();
  while(chI<bt.length&&bt[chI][0]!=='m'){
    const [k,text,emo]=bt[chI];
    if(k==='th'){ await sleep(420); if(!chOn){chBusy=false;return}
      chPush('think',text); chI++; continue }
    chFace('t',emo);
    await chTyping(260+Math.min(900,text.length*24));
    if(!chOn){chBusy=false;return}
    chPush('them',text); chI++;
  }
  chBusy=false;
  chArm();
}
function chArm(){
  const bt=chatBeats(), f=$('#chField'), b=$('#chSend');
  if(chI<bt.length){
    f.textContent=sub(bt[chI][1]); f.classList.remove('ph');
    b.disabled=false; b.classList.remove('go'); b.textContent='➤';
    chFace('m',bt[chI][2]);
  }else{
    f.textContent='Написать сообщение...'; f.classList.add('ph');
    b.disabled=false; b.classList.add('go');
    b.textContent=(chPart==='pre'&&chAfter)?'В БОЙ ►':'ЗАКРЫТЬ';
  }
}
function chatSend(){
  const bt=chatBeats(); if(chBusy)return;
  if(chI>=bt.length){chatDone(false);return}
  sfx.ui(); PF.hit('light');
  chFace('m',bt[chI][2]);
  chPush('me',bt[chI][1]); chI++;
  $('#chField').textContent=''; $('#chSend').disabled=true;
  chStep();
}
function chPush(kind,text){
  const d=document.createElement('div');
  d.className=kind==='think'?'chThink':'chMsg '+kind;
  d.textContent=sub(text);
  $('#chBody').appendChild(d);
  chBottom();
}
function chTyping(ms){
  return new Promise(r=>{
    const d=document.createElement('div');
    d.className='chDots3'; d.innerHTML='<i></i><i></i><i></i>';
    $('#chBody').appendChild(d); chBottom();
    setTimeout(()=>{d.remove();r()},ms);
  });
}
/* Прокрутка вниз следующим кадром: сразу после вставки высота ещё старая. */
function chBottom(){
  const b=$('#chBody');
  requestAnimationFrame(()=>{b.scrollTop=b.scrollHeight});
}
function chatDone(back){
  if(!chOn)return;
  const si=chSi, part=chPart, after=chAfter;
  chOn=false; chSi=null; chAfter=null;
  if(si!==null){ if(!S.chats)S.chats={}; S.chats[chatKey(si,part)]=1; save() }
  const w=$('#chWrap');
  w.classList.remove('on');
  setTimeout(()=>{w.hidden=true},260);
  if(!back&&after)setTimeout(after,180);
  else if(CUR==='stages')renderStages();
  /* Страховка на будущее: чат могут открыть с экрана, у которого нет своего
     выхода. Закрыв его, игрок обязан остаться там, откуда сможет уйти. */
  else if(CUR!=='menu'&&CUR!=='battle')go('stages');
}
/* Телефон с уведомлением. Появляется, только пока сообщение не читано: на
   поздних рейдах игрок ходит по многу раз, и обязательные два тапа перед
   каждой попыткой из «живо» превращаются в помеху. */
function chatNote(si,part,after){
  const c=chatFor(si,part); if(!c)return false;
  const beats=c[part]||[];
  const n=Math.max(1,Math.min(3,beats.filter(b=>b[0]==='t').length-4));
  const el=document.createElement('div');
  el.className='chNote';
  el.innerHTML=`<div class="chPhone">
    <div class="chNotch"></div>
    <div class="chBell"><svg viewBox="0 0 24 24"><path d="M12 2a6 6 0 0 0-6 6v4l-2 3v1h16v-1l-2-3V8a6 6 0 0 0-6-6zm0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3z"/></svg></div>
    <div class="chNoteN">${n} ${plural(n,'новое сообщение','новых сообщения','новых сообщений')}</div>
    <div class="chNoteS">БАМ-ЧАТ · ${c.who}</div>
    <div class="chNoteB">
      <button class="btn pri" data-a="ok">ОТВЕТИТЬ</button>
      <button class="btn" data-a="skip">${part==='post'?'ЗАКРЫТЬ':'ПОЗЖЕ'}</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('on'));
  sfx.ui(); if(PF.notify)PF.notify('warning');
  const close=go2=>{el.classList.remove('on');setTimeout(()=>el.remove(),220);if(go2)go2()};
  el.querySelector('[data-a="ok"]').onclick=()=>close(()=>openChat(si,part,after));
  /* «Позже» прочитанным не помечает: отказался читать — не значит прочёл. */
  el.querySelector('[data-a="skip"]').onclick=()=>close(after);
  return true;
}

/* ================= настроение героя =================
   Лицо в панели игрока реагирует на бой. Спокойное — состояние покоя: в наборе
   эмоций нет грустного лица, поэтому поражение показывает его же. Как только
   грустный кадр появится, достаточно положить файл и дописать строку в MOOD.
   Сброс к покою по таймеру, а не по следующему событию: иначе после единичного
   удара лицо так и застыло бы удивлённым до конца боя. */
const MOOD={calm:'calm',joy:'joy',surp:'surp',angry:'angry',sad:'calm'};
/* Старшинство настроений. В бою события идут пачкой: юнита выбили и тут же
   прилетело по герою — и злость жила 0.3 секунды, пока её не затирало
   удивление. Со стороны это выглядит как «эмоция не сработала», хотя вызов
   был. Теперь слабое настроение не перебивает сильное, пока то показывается. */
const MOOD_RANK={calm:0,surp:1,angry:2,joy:3,sad:3};
/* 1.6с не хватало: удар это 340мс замаха, 120мс паузы, 340мс гибели плюс
   сон 560мс — лицо успевало вернуться в покой раньше, чем игрок переведёт
   взгляд в угол. */
const MOOD_HOLD=2300;
let moodTimer=null,moodCur='calm',moodUntil=0;
function moodEl(){return $('.bBottom .heroIc.me')}
function setMood(kind,hold){
  const el=moodEl();if(!el||!S.hero)return;
  const now=performance.now();
  if(kind==='calm'){moodCur='calm';moodUntil=0}
  else{
    if(now<moodUntil&&(MOOD_RANK[kind]||0)<(MOOD_RANK[moodCur]||0))return;
    moodCur=kind;moodUntil=now+(hold||MOOD_HOLD);
  }
  const file=MOOD[kind]||'calm';
  el.classList.add('face');
  const img=el.querySelector('img');
  const src=`art/emo/emo-${S.hero}-${file}.webp`;
  if(img){ if(img.getAttribute('src')!==src)img.setAttribute('src',src); }
  else el.innerHTML=`<img src="${src}" alt="" draggable="false">`;
  if(kind!=='calm'){
    el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');
  }
  clearTimeout(moodTimer);
  if(kind!=='calm')moodTimer=setTimeout(()=>setMood('calm'),hold||MOOD_HOLD);
}

/* ================= БОЙ ================= */
let B=null,UID=1,DRAG=null,suppressClick=false,holdFired=false;
document.addEventListener('click',e=>{
  if(suppressClick){e.stopPropagation();e.preventDefault();suppressClick=false}},true);
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
  /* Тренировку не сохраняем: в снимке нет ни номера шага, ни позиции в
     сценарии врага, и восстановление вернуло бы игрока в сценарный бой без
     ведущего — тупик. Прерванная тренировка просто начинается заново. */
  if(B.train){dropBattleSnap();return}
  const side=P=>({hp:P.hp,max:P.max,mana:P.mana,mmax:P.mmax,fatigue:P.fatigue,
    deck:P.deck,hand:P.hand,
    board:P.board.map(u=>({id:u.card.id,uid:u.uid,atk:u.atk,hp:u.hp,maxhp:u.maxhp,
      taunt:u.taunt?1:0,rush:u.rush?1:0,canAtk:u.canAtk?1:0,sick:u.sick?1:0,buffed:u.buffed?1:0}))});
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
    board:(x.board||[]).map(u=>{const card=byId(u.id);if(!card)return null;
      return{uid:u.uid,card,atk:u.atk|0,hp:u.hp|0,maxhp:u.maxhp|0,
        taunt:!!u.taunt,rush:!!u.rush,canAtk:!!u.canAtk,sick:!!u.sick,buffed:u.buffed?1:0}})
      .filter(Boolean)});
  const P=side(d.p),E=side(d.e);
  if(P.hp<=0||E.hp<=0){dropBattleSnap();return false}
  clearFeed();
  B={si:d.si,st,phase:'p',over:false,skill:d.skill,p:P,e:E,sel:null,log:[],turnNo:0};
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
function startBattle(si){
  dropBattleSnap();lockUI(0);
  const st=STAGES[si];
  const pool=CARDS.filter(c=>!c.noColl&&c.t<=st.pool&&(c.ty==='u'||c.ty==='s'));
  const aiDeck=[];
  while(aiDeck.length<20){const c=pick(pool);if(aiDeck.filter(x=>x===c.id).length<2)aiDeck.push(c.id)}
  clearFeed();
  B={si,st,phase:'player',over:false,train:!!st.tutorial,eTurn:0,log:[],turnNo:0,
    skill:clamp(.15+si*.09,0,1), /* 0.15 на первом рейде → 0.96 на финале */
    p:{hp:30,max:30,mana:0,mmax:0,
       deck:st.tutorial?[...TRAIN.deck].reverse():shuffle([...S.deck]),
       hand:[],board:[],fatigue:0},
    e:{hp:st.hp,max:st.hp,mana:0,mmax:0,deck:st.tutorial?[]:shuffle(aiDeck),hand:[],board:[],fatigue:0},
    sel:null};
  go('battle');
  dressBattle(st);
  if(B.train){
    B.p.hand=[...TRAIN.hand];
    $('#bEnd').onclick=endTurn;$('#bEnd').disabled=false;$('#bGiveUp').onclick=askGiveUp;
    $('#bLogBtn').onclick=openLog;
    renderBattle();
    turnBanner('ТРЕНИРОВКА');
    setTimeout(()=>{startTurn('p');startTraining()},600);
    return;
  }
  for(let i=0;i<3;i++)drawCard('p',true);
  if(B.p.hand.every(id=>byId(id).c>2)){
    const cheapIdx=B.p.deck.findIndex(id=>byId(id).c<=2);
    if(cheapIdx>=0){
      let worst=0;B.p.hand.forEach((id,i)=>{if(byId(id).c>byId(B.p.hand[worst]).c)worst=i});
      const removed=B.p.hand[worst];
      B.p.hand[worst]=B.p.deck[cheapIdx];
      B.p.deck[cheapIdx]=removed;
    }
  }
  B.p.hand.push('zC0');
  for(let i=0;i<4;i++)drawCard('e',true);
  $('#bEnd').onclick=endTurn;
  $('#bEnd').disabled=false;
  $('#bGiveUp').onclick=askGiveUp;
  $('#bLogBtn').onclick=openLog;
  renderBattle();
  turnBanner('ТВОЙ ХОД!');
  setTimeout(()=>{startTurn('p')},600);
}
function drawCard(who,silent){
  const P=B[who];
  if(!P.deck.length){P.fatigue++;blog(who,`усталость · −${P.fatigue}`,'die');
    damageHero(who,P.fatigue);return null}
  const id=P.deck.pop();
  if(P.hand.length>=7){blog(who,`сгорела: ${byId(id).n}`,'die');
    if(!silent&&who==='p')toast(`Карта сгорела: ${byId(id).n}`);return null}
  P.hand.push(id);
  if(who==='p'&&!silent)sfx.draw();
  return id}
function damageHero(who,v){
  const P=B[who];P.hp=Math.max(0,P.hp-v);
  popDmg(who==='p'?$('#pHp'):$('#eHp'),v,false);
  sfx.hit();
  /* По своему герою бьёт ощутимее, чем по вражескому. */
  PF.hit(who==='p'?'heavy':'light');
  if(who==='p')setMood('surp');
  const ic=who==='p'?$('#pHp'):$('#eHp');
  const r=ic.getBoundingClientRect();
  burst(r.left+r.width/2,r.top+10,['#ff3355','#fff'],8,.9);
  const sil=who==='p'?$('#silP'):$('#silE');
  if(sil){sil.classList.remove('hurt');void sil.offsetWidth;sil.classList.add('hurt');
    setTimeout(()=>sil.classList.remove('hurt'),360)}
  if(who==='p')hurtFlash();
  renderBattle();
  if(P.hp<=0&&!B.over)finish(who==='e');
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
  const P=B[who];
  P.mmax=Math.min(10,P.mmax+1);P.mana=P.mmax;
  if(who==='p')B.turnNo=(B.turnNo||0)+1;
  B.seq=(B.seq||0)+1;
  blog('sys',`— ХОД ${B.turnNo||1} · ${who==='p'?'ТЫ':'ВРАГ'} —`,'turn');
  for(const u of P.board){u.canAtk=true;u.sick=false}
  drawCard(who);
  B.phase=who;B.sel=null;
  renderBattle();
  lockUI(who==='e');
  if(who==='e'){turnBanner('ХОД ВРАГА');$('#bEnd').disabled=true;
    setTimeout(safeEnemyTurn,1000)}
  else{$('#bEnd').disabled=false}
}
function turnBanner(t){
  const b=document.createElement('div');b.className='bTurn';b.textContent=t;
  $('#bWrap').appendChild(b);setTimeout(()=>b.remove(),1150);
}
/* Ход врага в тренировке: строго по списку, без ИИ и без случайности. */
async function trainEnemyTurn(){
  const step=TRAIN.script[B.eTurn++]||{};
  await sleep(700);
  if(step.play&&B.e.board.length<5){
    const c=byId(step.play);
    if(c){enemyBanner(c);await sleep(400);
      const откуда=enemyHandRect();
      const u=mkUnit(c);B.e.board.push(u);renderBattle();
      const el=$(`#rowE .unit[data-uid="${u.uid}"]`);
      /* В обучении читаемость важнее всего: карта врага так же вылетает и
         замирает посередине, а не появляется на доске сама собой. */
      if(el)await flyToBoard(c,откуда,unitRect(el),el,{reveal:1})}
  }
  if(step.face){await sleep(600);damageHero('p',step.face)}
  /* Хвост тот же, что у настоящего хода ИИ: смерти и проверка победы
     разрешаются внутри damageHero/doAttack, отдельного «подведения итогов»
     в этой боёвке нет. */
  if(B.over)return;
  await sleep(350);
  startTurn('p');
}
async function endTurn(){
  if(B.phase!=='p'||B.over)return;
  sfx.ui();B.phase='wait';B.seq=(B.seq||0)+1;$('#bEnd').disabled=true;
  B.sel=null;renderBattle();
  await sleep(200);
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
async function aiTurn(){
  if(B.train){return trainEnemyTurn()}
  const E=B.e,P=B.p,sk=B.skill;
  await sleep(500);
  /* ранние враги мешкают и играют что попало; финальные — идеальную кривую */
  const lazy=Math.random()<(1-sk)*.35;
  const tradeP=.25+.55*sk;
  let guard=0,played=0;
  while(B.phase==='e'&&!B.over&&guard++<12){
    if(lazy&&played>=1)break;
    const cands=E.hand.map((id,i)=>({id,i,c:byId(id)}))
      .filter(x=>x.c.c<=E.mana&&E.board.length<5);
    if(!cands.length)break;
    let idx;
    if(Math.random()<sk)idx=cands.sort((a,b)=>b.c.c-a.c.c)[0];
    else idx=pick(cands);
    E.mana-=idx.c.c;
    /* Точку вылета снимаем ДО перерисовки руки: через миг рубашки
       перестроятся под новый счёт, и карта полетела бы из чужого места. */
    const откуда=enemyHandRect();
    E.hand.splice(idx.i,1);
    const c=idx.c;played++;
    blog('e',`⚡ ${c.n}${c.ty==='u'?` ${c.a}/${c.h}`:''} · ${c.c} ${plural(c.c,'мана','маны','маны')}`,'card');
    enemyBanner(c);
    if(c.ty==='u'){
      const u=mkUnit(c);E.board.push(u);
      sfx.play(c.t,c.el);
      renderBattle();
      const el=$(`#rowE .unit[data-uid="${u.uid}"]`);
      if(el){
        const r=unitRect(el);
        await flyToBoard(c,откуда,r,el,{reveal:1});
        burst(r.left+r.width/2,r.top+r.height/2,elCols(c),8+c.t*6,.9);
        bang(pick(c.stk||['БАМ!']),50,46);
      }
      /* Боевой клич уже вылетевшей карты второй раз не летит. */
      if(c.eff)await aiSpell(c,1);
      await sleep(240);
    }else{
      sfx.play(c.t,c.el);
      await aiSpell(c,0,откуда);
    }
  }
  guard=0;
  while(B.phase==='e'&&!B.over&&guard++<14){
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
    await doAttack('e',u,tgt,{tell:320,ms:520});
    await sleep(340);
  }
  if(B.over)return;
  await sleep(350);
  startTurn('p');
}
/* Куда летит заклятие врага — в то, что оно затронет. Раньше всё, что видел
   игрок, — плашка в углу: карта тратилась, где-то менялись числа, и связать
   одно с другим было не с чем. */
function aiSpellAim(c){
  const e=c.eff,P=B.p,E=B.e;
  const un=u=>u?$(`#rowE .unit[data-uid="${u.uid}"],#rowP .unit[data-uid="${u.uid}"]`):null;
  if(e.k==='dmg'||e.k==='drain'){
    const t=P.board.filter(x=>x.hp<=e.v).sort((a,b)=>b.atk-a.atk)[0]||P.board[0];
    return {tgt:t||null,el:t?un(t):$('#pHp')};
  }
  if(e.k==='healHero')return {el:$('#eHp')};
  if(e.k==='draw')return {el:$('#eHandN')};
  if(e.k==='mana')return {el:$('#eMana')};
  if(e.k==='buff')return {el:un(E.board[0])||$('#rowE')};
  if(e.k==='healAll'||e.k==='buffAll')return {el:$('#rowE')};
  return {el:$('#rowP')};   /* aoe, weaken и всё прочее — по нашему ряду */
}
async function aiSpell(c,noFly,откуда){
  const E=B.e,P=B.p;
  const e=c.eff;if(!e)return;
  const aim=aiSpellAim(c);
  if(!noFly){
    await flyCard(c,откуда||enemyHandRect(),[
      {r:revealRect(),ms:290,hold:440,rot:-3},
      {r:aimRect(aim.el),ms:300,k:.82,fade:0}]);
    elBurst(aim.el,c,12+c.t*4,1.05);
    bang(pick(c.stk||['БАМ!']),50,44);
    await sleep(110);
  }
  if(e.k==='dmg'||e.k==='drain'){
    /* Цель выбрана до полёта — за это время доска не менялась, но если
       выбранного юнита всё же нет, бьём по тому, кто стоит первым. */
    let tgt=aim.tgt&&P.board.includes(aim.tgt)?aim.tgt:P.board[0];
    blog('e',`${c.n} → ${tgt?tgt.card.n:'ТВОЙ ГЕРОЙ'} · ${e.v}`
      +(e.k==='drain'?`, себе ♥ +${e.v}`:''),'atk');
    if(tgt)await dealDamage('p',tgt,e.v);
    else damageHero('p',e.v);
    if(e.k==='drain'){E.hp=Math.min(E.max,E.hp+e.v);popDmg($('#eHp'),e.v,true);sfx.heal();renderBattle()}
  }else if(e.k==='healHero'){blog('e',`♥ +${e.v} своему герою`);
    E.hp=Math.min(E.max,E.hp+e.v);popDmg($('#eHp'),e.v,true);sfx.heal();renderBattle()}
  else if(e.k==='healAll'){blog('e',`♥ +${e.v} всем своим`);
    for(const u of E.board)u.hp=Math.min(u.maxhp,u.hp+e.v);sfx.heal();renderBattle()}
  else if(e.k==='draw'){blog('e',`+${e.v} ${plural(e.v,'карта','карты','карт')} в руку`);
    for(let k=0;k<e.v;k++)drawCard('e');renderBattle()}
  /* Прибавку маны врагу раньше не обрабатывали вовсе: карта тратилась
     впустую. В пул ИИ такие карты сейчас не попадают, но ветка обязана быть —
     иначе первая же добавленная станет молчаливой дырой. */
  else if(e.k==='mana'){blog('e',`+${e.v} маны`);
    E.mana=Math.min(10,E.mana+e.v);bang('ВРАГУ +'+e.v+' МАНЫ!',50,40);sfx.sparks();renderBattle()}
  else if(e.k==='aoe'){blog('e',`${c.n} → по всем твоим · ${e.v}`,'atk');
    for(const u of [...P.board])await dealDamage('p',u,e.v)}
  else if(e.k==='buff'||e.k==='buffAll'||e.k==='weaken'){
    if(e.k==='buff'&&E.board[0]){blog('e',`▲ ${E.board[0].card.n} +${e.a||0}/+${e.h||0}`);
      E.board[0].atk+=e.a||0;E.board[0].hp+=e.h||0;E.board[0].maxhp+=e.h||0}
    if(e.k==='buffAll'){blog('e',`▲ всем своим +${e.a||0}/+${e.h||0}`);
      for(const u of E.board){u.atk+=e.a||0;u.hp+=e.h||0;u.maxhp+=e.h||0}}
    if(e.k==='weaken'){blog('e',`▼ твоим −${e.v} атаки`);
      for(const u of P.board)u.atk=Math.max(0,u.atk-e.v)}
    renderBattle()}
  await sleep(380);
}

/* --- розыгрыш --- */
function needTargetCard(c){return !!(c.eff&&(c.eff.tg==='any'||c.eff.tg==='ally'))}
/* Единственное место, где решается, законна ли цель. Раньше это решали три
   разных обработчика вразнобой, и каждый ошибался по-своему:
   — тап по вражескому ЮНИТУ заклятием «на своего» усиливал юнита ВРАГА
     (Гвоздь-Счастливчик делал вражеского 2/3 пятёркой за твою ману);
   — тап по вражескому ГЕРОЮ тем же заклятием съедал карту вхолостую;
   — тап по СВОЕМУ юниту заклятием урона бил по своему же, хотя текст карты
     обещает «вражеский юнит или вражеский герой», да ещё и проводил урон с
     чужой стороной ('e'), что при летальном уроне рассинхронит доски.
   side: 'p' — свой юнит, 'e' — вражеский, 'hero' — вражеский герой. */
function canTarget(c,side){
  const tg=c&&c.eff&&c.eff.tg;
  if(!tg)return false;
  if(tg==='ally')return side==='p';
  if(tg==='any')return side==='e'||side==='hero';
  return false;
}
function playCard(i,targetUnit){
  const P=B.p,id=P.hand[i],c=byId(id);
  if(!c)return;
  if(c.ty==='u'&&P.board.length>=5){
    toast('Поле заполнено — максимум 5 юнитов',1);tone(130,.12,{v:.09});return}
  if(c.c>P.mana){tone(130,.12,{v:.09});toast('Мало маны!',1);return}
  /* Последний рубеж: карта, которой нужна цель на своём юните, без цели
     просто исчезала бы вместе с маной — эффект-то не к чему применять. */
  if(c.eff&&c.eff.tg==='ally'&&!(targetUnit&&P.board.includes(targetUnit))){
    toast('Нужен свой юнит на поле',1);tone(160,.08,{v:.06});return}
  /* Позицию карты в руке снимаем ДО перерисовки: через миг этого узла уже
     не будет, а без точки старта карте неоткуда лететь. */
  const откуда=(()=>{const h=$(`#bHand .hCard[data-i="${i}"]`);
    return h?h.getBoundingClientRect():null})();
  P.mana-=c.c;P.hand.splice(i,1);
  blog('p',`⚡ ${c.n}${c.ty==='u'?` ${c.a}/${c.h}`:''} · ${c.c} ${plural(c.c,'мана','маны','маны')}`,'card');
  sfx.play(c.t,c.el);
  if(c.ty==='u'){
    const u=mkUnit(c);P.board.push(u);
    renderBattle();
    const el=$(`#rowP .unit[data-uid="${u.uid}"]`);
    if(el){const r=unitRect(el);
      flyToBoard(c,откуда,r,el);
      burst(r.left+r.width/2,r.top+r.height/2,elCols(c),10+c.t*8,1);
      bang(pick(c.stk||['БАМ!']),50,46)}
    if(c.eff)playerEff(c,targetUnit);
    B.sel=null;
    renderBattle();
  }else{
    /* Заклятие тоже долетает до цели. Раньше карта просто исчезала, а где-то
       на поле менялись числа — на размене из трёх карт подряд связать одно с
       другим было не с чем. Эффект применяем на касании, а не при нажатии,
       поэтому на время полёта поле заперто: иначе доска успела бы измениться
       между прицеливанием и попаданием. */
    const цельEl=targetUnit
      ? $(`#rowP .unit[data-uid="${targetUnit.uid}"],#rowE .unit[data-uid="${targetUnit.uid}"]`)
      : spellAimP(c);
    B.sel=null;
    renderBattle();
    const попал=()=>{
      lockUI(0);
      if(!B||B.over)return;
      elBurst(цельEl,c,12+c.t*4,1.05);
      bang(pick(c.stk||['БАМ!']),50,46);
      playerEff(c,targetUnit);
      renderBattle();
    };
    if(gfxAnim()&&откуда){
      lockUI(1);
      flyCard(c,откуда,[{r:aimRect(цельEl),ms:300,k:.85,fade:0}]).then(попал);
    }else попал();
  }
}
function playerEff(c,tgt){
  const P=B.p,E=B.e,e=c.eff;if(!e)return;
  /* Что именно сделала карта — отдельной строкой: «сыграл Искру» без
     продолжения не говорит, кому и сколько прилетело. */
  const цель=tgt?tgt.card.n:'ГЕРОЙ ВРАГА';
  switch(e.k){
    case 'mana':
      blog('p',`+${e.v} маны`);
      P.mana=Math.min(10,P.mana+e.v);
      bang('+1 МАНА!',50,55);sfx.sparks();renderBattle();break;
    case 'dmg':
      blog('p',`${c.n} → ${цель} · ${e.v}`,'atk');
      if(tgt)dealDamage('e',tgt,e.v);
      else damageHero('e',e.v);
      break;
    case 'healHero':
      blog('p',`♥ +${e.v} герою`);
      P.hp=Math.min(P.max,P.hp+e.v);popDmg($('#pHp'),e.v,true);sfx.heal();renderBattle();break;
    case 'healAll':
      blog('p',`♥ +${e.v} герою и всем своим`);
      P.hp=Math.min(P.max,P.hp+e.v);popDmg($('#pHp'),e.v,true);
      for(const u of P.board)u.hp=Math.min(u.maxhp,u.hp+e.v);
      sfx.heal();renderBattle();break;
    case 'draw':
      blog('p',`+${e.v} ${plural(e.v,'карта','карты','карт')} в руку`);
      for(let k=0;k<e.v;k++)drawCard('p');renderBattle();break;
    case 'buff':
      if(tgt){blog('p',`▲ ${tgt.card.n} +${e.a||0}/+${e.h||0}`);
        tgt.atk+=e.a||0;tgt.hp+=e.h||0;tgt.maxhp+=e.h||0;tgt.buffed=1;
        sfx.heal();renderBattle()}break;
    case 'buffAll':
      blog('p',`▲ всем своим +${e.a||0}/+${e.h||0}`);
      for(const u of P.board){u.atk+=e.a||0;u.hp+=e.h||0;u.maxhp+=e.h||0;u.buffed=1}
      sfx.heal();renderBattle();break;
    case 'aoe':
      blog('p',`${c.n} → по всем врагам · ${e.v}`,'atk');
      for(const u of [...E.board])dealDamage('e',u,e.v);break;
    case 'weaken':
      blog('p',`▼ врагам −${e.v} атаки`);
      for(const u of E.board)u.atk=Math.max(0,u.atk-e.v);
      bang('Ш-Ш-Ш…',50,46);renderBattle();break;
    case 'drain':
      blog('p',`${c.n} → ${цель} · ${e.v}, себе ♥ +${e.v}`,'atk');
      if(tgt)dealDamage('e',tgt,e.v);else damageHero('e',e.v);
      P.hp=Math.min(P.max,P.hp+e.v);popDmg($('#pHp'),e.v,true);sfx.heal();
      renderBattle();break;
  }
}
async function dealDamage(side,u,v){
  u.hp-=v;
  const row=side==='p'?$('#rowP'):$('#rowE');
  const el=row.querySelector(`.unit[data-uid="${u.uid}"]`);
  if(el){
    popDmg(el,v,false);
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
  /* Остановка кадра на сильном ударе. Пауза перед продолжением — самый дешёвый
     способ придать удару вес: глаз воспринимает её как инерцию от попадания. */
  await sleep(v>=4?190:120);
  if(u.hp<=0){
    blog(side,`✖ ${u.card.n} погиб`,'die');
    sfx.die();PF.hit('rigid');
    /* Злость — только когда выбили НАШЕГО. В dealDamage side это владелец
       получающего урон юнита (из B[side].board его и удаляют), поэтому
       наш — это 'p'. */
    if(side==='p')setMood('angry',1900);
    if(el){
      el.classList.add('dying');
      const r=el.getBoundingClientRect();
      burst(r.left+r.width/2,r.top+r.height/2,elCols(u.card),18,1.15);
      /* Ждём саму анимацию, а не круглое число: правка длительности в CSS
         иначе разъехалась бы с этой задержкой, и существо либо исчезало
         рывком, либо висело уже невидимым. */
      const an=el.getAnimations().find(x=>x.animationName==='unitDie');
      if(an){try{await an.finished}catch(e){}}else await sleep(420);
      /* Убираем узел здесь же. Пересборка ряда его нарочно не трогает, пока на
         нём метка dying, — иначе существо исчезало бы в первый же кадр
         падения, — так что снять его обязан тот, кто это падение запустил. */
      el.remove();
    }
    const arr=B[side].board;
    const ix=arr.indexOf(u);if(ix>=0)arr.splice(ix,1);
  }
  renderBattle();
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
  const o=opts||{};
  const foe=side==='p'?'e':'p';
  const rowS=side==='p'?$('#rowP'):$('#rowE');
  const rowT=side==='p'?$('#rowE'):$('#rowP');
  const elS=rowS?rowS.querySelector(`.unit[data-uid="${u.uid}"]`):null;
  const elT=tgt.hero?(side==='p'?$('#bTop'):$('#pStats'))
                    :(rowT?rowT.querySelector(`.unit[data-uid="${tgt.uid}"]`):null);
  /* Черту и подсветку показываем ДО удара, а не вместе с ним: удар врага
     игрок не начинал сам, и без этой доли секунды взгляд не успевал найти,
     кто по кому бьёт. Своему удару замах не нужен — цель выбрал сам. */
  if(elS&&elT){
    atkLine(elS.getBoundingClientRect(),elT.getBoundingClientRect(),260+(o.tell||0),side);
    if(o.tell&&gfxAnim()){
      elS.classList.remove('tell');void elS.offsetWidth;elS.classList.add('tell');
      await sleep(o.tell);
      elS.classList.remove('tell');
    }
  }
  if(!B||B.over)return;
  const sil=side==='p'?$('#silP'):$('#silE');
  if(sil){sil.classList.remove('att','attE');void sil.offsetWidth;
    sil.classList.add(side==='p'?'att':'attE');
    setTimeout(()=>sil.classList.remove('att','attE'),460)}
  const sf=$('#spFlash');
  if(sf){sf.classList.remove('go');void sf.offsetWidth;sf.classList.add('go')}
  const ms=o.ms||400;
  blog(side,tgt.hero?`${u.card.n} → ${side==='p'?'ГЕРОЙ ВРАГА':'ТВОЙ ГЕРОЙ'} · ${u.atk}`
                    :`${u.card.n} → ${tgt.card.n} · ${u.atk}`,'atk');
  if(tgt.hero){
    /* Удар в героя тоже должен быть виден: раньше юнит не двигался вообще,
       и всё событие сводилось к дрожи экрана и убывающему числу. */
    if(elS&&elT){const b=elT.getBoundingClientRect();
      await lunge(elS,{x:b.left+b.width/2,y:b.top+b.height/2},ms,.5)}
    damageHero(foe,u.atk);shake($('#bWrap'));
  }
  else{
    const back=tgt.atk||0;
    if(back>0)blog(foe,`${tgt.card.n} в ответ → ${u.card.n} · ${back}`,'atk');
    if(elS&&elT){const b=elT.getBoundingClientRect();
      await lunge(elS,{x:b.left+b.width/2,y:b.top+b.height/2},ms)}
    await dealDamage(foe,tgt,u.atk);
    if(back>0)await dealDamage(side,u,back);
  }
}

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
function syncEnemyHand(){
  const eh=$('#eHand');if(!eh)return;
  const n=Math.min(7,B&&B.e?B.e.hand.length:0);
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
  $('#eHp').textContent=B.e.hp;$('#pHp').textContent=B.p.hp;
  $('#eDeckN').textContent=B.e.deck.length;$('#eHandN').textContent=B.e.hand.length;
  syncEnemyHand();
  $('#pManaT').textContent=B.p.mana+'/'+B.p.mmax;
  $('#eManaT').textContent=B.e.mana+'/'+B.e.mmax;
  $('#eBoardN').textContent=B.e.board.length+'/5';
  $('#eBoardN').classList.toggle('full',B.e.board.length>=5);
  $('#pBoardN').innerHTML='ПОЛЕ <b>'+B.p.board.length+'/5</b>';
  $('#pBoardN').classList.toggle('full',B.p.board.length>=5);
  const playCount=B.p.hand.filter(id=>byId(id).c<=B.p.mana).length;
  $('#pManaBox').classList.toggle('pulse',B.phase==='p'&&playCount>0);
  const manaRow=(P,max)=>{let s='';for(let i=0;i<Math.max(max,P);i++)
    s+=`<span class="mGem ${i<P?'on':''}"></span>`;return s};
  $('#pMana').innerHTML=manaRow(B.p.mana,B.p.mmax);
  $('#eMana').innerHTML=manaRow(B.e.mana,B.e.mmax);
  const canTargetE=B.sel&&(B.sel.type==='unit'||(B.sel.type==='hand'&&byId(B.p.hand[B.sel.i])?.eff?.tg==='any'));
  syncRow($('#rowE'),B.e.board,'e',!!canTargetE,canTargetE?'<div class="slot canDrop" data-slot="e-hero"></div>':'<div class="slot" data-slot="e-hero"></div>');
  const canTargetP=B.sel&&B.sel.type==='hand'&&byId(B.p.hand[B.sel.i])?.eff?.tg==='ally';
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
  updateHint();
  snapBattle();
  if(TR)trCheck();
}
function updateHint(){
  const h=$('#bHint');if(!h||!B)return;
  if(B.over){h.style.display='none';return}
  h.style.display='';
  if(B.phase!=='p'){h.textContent='— ход врага, наблюдай —';return}
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
  for(const u of board){
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
  /* Узел, помеченный .dying, не трогаем: его анимация смерти ещё идёт, и
     удалит его тот, кто её запустил. Иначе существо исчезало бы мгновенно,
     а размен становился нечитаемым. */
  было.forEach(el=>{if(!el.classList.contains('dying'))el.remove()});
  row.querySelectorAll('.slot').forEach(el=>el.remove());
  порядок.forEach((el,i)=>{
    const cur=row.children[i];
    if(cur!==el)row.insertBefore(el,cur||null);
  });
  const пусто=Math.max(0,5-board.length);
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
  const a=el.querySelector('.uA'), h=el.querySelector('.uH');
  if(a&&a.textContent!=String(u.atk))a.textContent=u.atk;
  if(h){
    /* Цифру здоровья не просто подменяем: при убыли она вспыхивает и
       вздрагивает, иначе размен читается только по всплывающему числу. */
    if(h.textContent!=String(u.hp)){
      const было=+h.textContent;
      h.textContent=u.hp;
      if(u.hp<было&&gfxAnim())h.animate(
        [{transform:'scale(1)'},{transform:'scale(1.45)',offset:.3},{transform:'scale(1)'}],
        {duration:280,easing:'cubic-bezier(.3,1.4,.4,1)'});
    }
    h.classList.toggle('hurt',u.hp<u.maxhp);
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
  return `<div class="unit ${sel?'sel':''} ${targetable?'target':''} ${tired?'tired':''} ${u.buffed?'buffed':''}"
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
    <span class="uA">${u.atk}</span><span class="uH ${u.hp<u.maxhp?'hurt':''}">${u.hp}</span>
  </div>`;
}
/* forfeit — досрочная сдача. Награду за неё не даём принципиально: утешительные
   15% превратили бы «начать десятый рейд и сразу сдаться» в ферму по 45 искр за
   пару секунд, что после починки экономики паков было бы единственной дырой. */
function finish(win,forfeit){
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
      toast('Провал зачищен! Бонус первой зачистки ×1,5')}
    sfx.win();PF.notify('success');setMood('joy',3200);
    burst(innerWidth/2,innerHeight/2,['#ffd52e','#fff','#ff4fd8','#35f0ff'],70,1.8);
    bang('ПОБЕДА!!',50,30);
  }else{
    gained=forfeit?0:Math.round(B.st.reward*.15);
    sfx.lose();PF.notify('error');setMood('sad',3200);
    bang(forfeit?'СДАЛСЯ…':'ОБЛОМ…',50,30);
  }
  S.sparks+=gained;save();
  setTimeout(()=>{
    const box=document.createElement('div');box.className='bResult';
    box.innerHTML=`<div class="bResBox">
      <div class="bResT ${win?'win':'lose'}">${win?'ПОБЕДА!!':forfeit?'ОТСТУПЛЕНИЕ':'ПРОВАЛ'}</div>
      <div class="bResS">${B.st.n} · <b>${gained?'+'+fmtN(gained)+' искр':'без награды'}</b> · побед: ${S.stats.wins}/${S.stats.battles}</div>
      <div class="bResB">
        ${win&&B.si+1<STAGES.length?'<button class="btn pri" id="rNext">ДАЛЬШЕ ►</button>':''}
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
      if(!предложен&&win&&!forfeit&&CHATS[si]&&CHATS[si].post&&!chatSeen(si,'post')){
        предложен=true;
        if(chatNote(si,'post',fn))return;
      }
      fn();
    };
    /* Все кнопки идут той же дверью, что и плитка рейда: иначе «ДАЛЬШЕ» снова
       увозило бы мимо сцены и разговора. Номер этапа берём из si, снятого в
       начале finish, — к этому моменту B уже могут обнулить. */
    if(box.querySelector('#rNext'))
      box.querySelector('#rNext').onclick=()=>продолжить(()=>{close();enterStage(si+1)});
    box.querySelector('#rRetry').onclick=()=>продолжить(()=>{close();enterStage(si)});
    box.querySelector('#rMenu').onclick=()=>продолжить(()=>{close();B=null;go('menu')});
  },900);
}

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

{t:'Последнее, что стоит знать: <b>эхо-заклятия</b>. Они не встают на поле, а срабатывают и уходят. <b>«Искра»</b> за 1 ману — <b>2 урона в любую цель</b>. Брось её <b>прямо в его панель</b>.',
 at:()=>trCard('s01'),until:()=>B&&B.e.hp<=10},

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


/* ================= справка ================= */
function catalogHTML(){
  return TIER_NAMES.map((name,ti)=>{
    const cards=COLLECTIBLE.filter(c=>c.t===ti);
    const hex=ti===4?'#ff3355':TIER_HEX[ti];
    return `<h3>${name} ${'★'.repeat(ti+1)}</h3>`+cards.map(c=>{
      const kw=(c.kw||[]).map(k=>k==='taunt'?'ТАУНТ':'РАШ').join(', ');
      let eff='';
      if(c.eff){const e=c.eff;
        const m={dmg:`${e.v} урона цели`,healHero:`лечение героя ${e.v}`,healAll:`лечение всех ${e.v}`,
          draw:`+${e.v} карта`,buff:`+${e.a}/${e.h} союзнику`,buffAll:`+${e.a}/+${e.h} всем`,
          aoe:`${e.v} урона всем врагам`,weaken:`−${e.v} атаки врагам`,drain:`${e.v} урона + лечение ${e.v}`};
        eff=` — ${c.ty==='u'?'клич: ':''}${m[e.k]||''}`}
      return `<div class="catRow" style="--cat:${hex}">
        <b>${c.n}</b> <span class="cc">${c.c}⚡${c.ty==='u'?' · '+c.a+'/'+c.h:''}</span>
        ${kw?'<span style="color:var(--yel)">['+kw+']</span>':''}${eff}
      </div>`}).join('');
  }).join('');
}
function openInfo(tab){
  sfx.ui();
  const C={
   battle:`<h3>КАК ПОБЕДИТЬ</h3>
    <p>Сведи здоровье врага (сверху) к нулю, пока он не свёл твоё (снизу). Бей юнитами по врагу или его героям, спеллами — по площадям и раненым.</p>
    <h3>ДВА СПОСОБА СЫГРАТЬ КАРТУ</h3>
    <ul>
    <li><b>Тап по карте</b> → крупный вид, что она делает, кнопка «Разыграть».</li>
    <li><b>Перетащи</b> карту из руки на своё поле. Юнит встанет в строй, эхо сработает.</li>
    </ul>
    <h3>ДВА СПОСОБА АТАКОВАТЬ</h3>
    <ul>
    <li><b>Перетащи своего юнита</b> на врага — удар. На верхнюю панель — удар в героя.</li>
    <li>Тапни своего юнита → тапни цель.</li>
    </ul>
    <h3>ХОД</h3>
    <ul>
    <li><b>Мана</b>: 1 в первый ход, +1 каждый ход, макс 10, восстанавливается полностью.</li>
    <li><b>Поле вмещает 5 юнитов</b> с каждой стороны — смотри счётчики «юниты 0/5».</li>
    <li>Свежий юнит «спит» один ход — <span class="kw">РАШ</span> исключение.</li>
    <li><span class="kw">ТАУНТ</span> — пока жив, бить можно только его. Стена для героя.</li>
    <li>Пустая колода = <b>усталость</b>: растущий урон вместо карты. Заканчивай быстрее.</li>
    <li>Рука больше 7 карт — новые сгорают.</li>
    </ul>`,
   cards:`<h3>ВСЕ КАРТЫ И ИХ ЭФФЕКТЫ</h3>
    <p>★ — редкость. Формат: <b>имя</b> · стоимость маны · атака/здоровье · ключевые слова · эффект.</p>
    ${catalogHTML()}`,
   strat:`<h3>КАК УРОНИТЬ ЗДОРОВЬЕ СОПЕРНИКА</h3>
    <ul>
    <li><b>Юниты</b> — основной урон. Каждый твой юнит бьёт раз в ход: перетащи на панель врага — минус атака с его здоровья.</li>
    <li><b>Заклятия урона</b> («Искра», «Пустая Клетка») летят прямо в лицо врага — таунты их НЕ блокируют.</li>
    <li><b>Летальный удар</b>: сложи атаку всех своих юнитов, готовых бить. Если сумма ≥ здоровью врага и таунтов нет — бей всё в лицо и победи за ход.</li>
    </ul>
    <h3>УЛОВКИ, КОТОРЫЕ РЕШАЮТ БОИ</h3>
    <ul>
    <li><b>Выгодный размен</b>: атакуй так, чтобы твой юнит УБИВАЛ врага и выживал. Юнит 3/2 против врага 2/2 — твой живёт, враг нет.</li>
    <li><b>Тратить всю ману</b> каждый ход — темп решает. 1 лишняя мана за ход = 10 за игру.</li>
    <li><b>ТАУНТ перед опасным ходом</b>: враг обязан бить стену, а не тебя или твоих стрелков.</li>
    <li><b>РАШ ломает темп</b>: враг только поставил юнита — а ты его уже съел.</li>
    <li><b>Кличи-урон добивают</b>: сначала размени обычными атаками, потом дожимай «Гошей» или «Графом Дыммом» по раненым.</li>
    <li><b>АоЕ копи</b>: «Фонотека» и «Сердце Провала» жалко тратить по одному юниту — жди, пока враг развернёт 3-4.</li>
    <li><b>Баф — на того, кто выживет</b>: «Гвоздь-Счастливчик» на 1-hp юнита — перевод искр.</li>
    <li><b>Держи руку ≤6 карт</b>: сгоревшая карта — минус темп.</li>
    <li><b>Считай усталость</b>: если твоя колода на исходе — заканчивай, каждый ход простоя стоит всё дороже.</li>
    <li><b>Монетка в первый ход</b>: «Перезарядка» + 1 мана = выйдешь на ход раньше по развитию.</li>
    </ul>
    <h3>ПЛАН НА ПЕРВЫЕ ХОДЫ</h3>
    <p>Ход 1: «Перезарядка» + дешёвый юнит. Ход 2-3: занимай поле, ставь таунта. Ход 4-5: усиления и РАШ. Дальше — считай летал каждый ход.</p>`,
   gacha:`<h3>ПАК = 5 КАРТ ЗА 100 ИСКР</h3>
    <p>Крышку можно <b>буквально стянуть</b>: тяни язычок «ТЯНИ!» — или просто кликни по паку. Тап по закрытой карте — вскрыть.</p>
    <h3>ЧТО ДАЛЬШЕ</h3>
    <ul>
    <li>Одной карты — максимум 2 копии. Третий дубликат сам превращается в искры (от 30 до 2 600).</li>
    <li>Искры: рейды (×1,5 за первую зачистку) и 15% даже за поражение.</li>
    </ul>`,
   deck:`<h3>20 КАРТ — И В БОЙ</h3>
    <ul>
    <li>Тап по карте в коллекции — добавить копию (макс 2), ещё тап — убрать.</li>
    <li><b>АВТО-НАБОР</b> соберёт приличную колоду из лучшего, что есть.</li>
    <li>В бой пускают только с ровно 20 картами.</li>
    </ul>
    <h3>ЧТО КЛАСТЬ</h3>
    <ul>
    <li>Кривая маны: побольше карт за 2-4 маны, пара тяжёлых на финиш.</li>
    <li>Минимум 2-3 ТАУНТа и пара заклятий урона/АоЕ.</li>
    </ul>`,
   raid:`<h3>10 ПРОВАЛОВ</h3>
    <ul>
    <li>Открываются по очереди, каждый — карточный бой с ИИ.</li>
    <li><b>ИИ умнеет с каждым рейдом</b>: ранние враги мешкают и мажут разменами, финальные считают летальный удар. Метка сложности — в описании этапа.</li>
    <li>Награда — искры на крутки. Первая зачистка этапа: ×1,5.</li>
    <li>Поражение — не конец: 15% награды и повторная попытка.</li>
    <li>Красные узлы — боссы: больше здоровья и злее карты.</li>
    </ul>`,
   odds:`<h3>ШАНС НА КАРТУ В ПАКЕ</h3>
    <p class="mono">РЕКРУТ 79,92% (1 из 1,25)<br>ГОРОД 15,98% (1 из 6)<br>ФРАКЦИЯ 3,20% (1 из 31)<br>ЛЕГЕНДА 0,64% (1 из 156)<br>ПРИЗМА 0,26% (1 из 385)</p>
    <h3>ГАРАНТ (PITY)</h3>
    <p>Счётчик карт без ПРИЗМЫ виден под паком. С 55-й карты шанс растёт по кривой, на 91-й — 100%. ПРИЗМА сбрасывает счётчик.</p>
    <h3>СЕКРЕТ</h3>
    <p>«Билет в Один Конец» — 10% внутри ПРИЗМЫ = <b>точные 1 из 3 846 карт</b>. Одна карта — один бросок, сумма всегда 100%.</p>`
  };
  const TABS=[['battle','БОЙ'],['cards','КАРТЫ'],['strat','СТРАТЕГИИ'],['gacha','КРУТКИ'],['deck','КОЛОДА'],['raid','РЕЙДЫ'],['odds','ШАНСЫ']];
  tab=C[tab]?tab:'battle';
  const w=document.createElement('div');w.className='iWrap';
  w.innerHTML=`<div class="iBox">
    <div class="iHead"><h2>СПРАВКА</h2>
      <button class="xbtn" aria-label="Закрыть"><svg width="13" height="13" viewBox="0 0 14 14"><path d="M1 1 L13 13 M13 1 L1 13" stroke="currentColor" stroke-width="2.4"/></svg></button></div>
    <div class="iTabs">${TABS.map(t=>`<button class="chip ${t[0]===tab?'on':''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
    <div class="inf">${C[tab]}</div></div>`;
  document.body.appendChild(w);
  w.addEventListener('click',e=>{if(e.target===w)w.remove()});
  w.querySelector('.xbtn').onclick=()=>w.remove();
  w.querySelectorAll('.iTabs .chip').forEach(ch=>ch.onclick=()=>{
    w.querySelectorAll('.iTabs .chip').forEach(x=>x.classList.toggle('on',x===ch));
    w.querySelector('.inf').innerHTML=C[ch.dataset.t];
    w.querySelector('.iBox').scrollTop=0;sfx.ui();
  });
}

/* ================= настройки ================= */
/* Промокоды. Проверяются на клиенте, потому что сервера у игры нет вовсе:
   кто откроет исходник, увидит список целиком. Для подарочных кодов это
   нормально — их и так раздают публично. Прятать за таким что-то ценное
   нельзя, для этого нужен сервер.
   Активированные коды помнит сейв, поэтому один код одному игроку даёт
   награду ровно раз — и переживает переустановку, раз сейв уходит в облако. */
const PROMO={
  PRERELEASE:{sparks:1000,t:'Спасибо, что играешь до релиза!'},
};
function redeemPromo(сырое){
  const код=String(сырое||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!код){toast('Введи код',1);return}
  if(!S.promo||typeof S.promo!=='object')S.promo={};
  const p=PROMO[код];
  if(!p){toast('Такого промокода нет',1);tone(130,.12,{v:.09});return}
  if(S.promo[код]){toast('Этот промокод уже активирован',1);tone(160,.08,{v:.06});return}
  S.promo[код]=1;
  S.sparks+=p.sparks;
  save();
  sfx.sparks();PF.hit('medium');
  /* Счётчик искр живёт на экране круток — если он сейчас в разметке,
     обновляем сразу, иначе игрок увидит старое число, когда туда придёт. */
  const t=$('#gTok'); if(t)t.textContent=fmtN(S.sparks);
  toast(`${p.t} +${fmtN(p.sparks)} искр`);
  renderSettings();
}
function renderSettings(){
  const rows=[
    {k:'snd',t:'ЗВУК',s:'выстрелы, удары, срыв крышек — весь WebAudio-набор'},
    {k:'vfx',t:'ЧАСТИЦЫ',s:'искры и звёзды при ударах и крутках'},
    {k:'shk',t:'ТРЯСКА ЭКРАНА',s:'отдача при ударах по героям'},
    {k:'arrows',t:'СТРЕЛКИ АТАК',s:'пунктирная дуга от атакующего к цели — кто кого бьёт'},
    {k:'anim',t:'АНИМАЦИИ БОЯ',s:REDUCE
      ?'полёт карт, замах и выпад. Система просит убрать движение — выключи, если мешает'
      :'полёт карт, замах перед ударом, выпад. Без них ход врага мгновенный'},
  ];
  $('#setWrap').innerHTML=rows.map(r=>`
    <div class="setRow"><div><div class="sT">${r.t}</div><div class="sS">${r.s}</div></div>
    <button class="tgl ${S[r.k]?'on':''}" data-k="${r.k}" role="switch" aria-checked="${!!S[r.k]}"><i></i></button></div>`).join('')+
    gfxHTML()+
    `<div class="setRow prRow"><div class="prHead"><div class="sT">ПРОМОКОД</div>
      <div class="sS">${Object.keys(S.promo||{}).length
        ?'активировано кодов: '+Object.keys(S.promo).length
        :'если тебе дали код — введи его тут'}</div></div>
      <div class="prIn"><input class="hInput" id="prCode" maxlength="24" autocomplete="off"
        autocapitalize="characters" spellcheck="false" placeholder="КОД" aria-label="Промокод">
        <button class="btn pri" id="prGo">ПРИМЕНИТЬ</button></div></div>
    <div class="setRow"><div><div class="sT">СПРАВКА</div>
      <div class="sS">правила · все карты · стратегии · шансы</div></div>
      <button class="btn" data-info="battle">ОТКРЫТЬ</button></div>
    <div class="setRow" style="border-color:#4a2230"><div><div class="sT" style="color:var(--red)">СБРОС ПРОГРЕССА</div>
      <div class="sS">коллекция, колода, искры, рейды — всё в ноль</div></div>
      <button class="btn danger" id="setReset">СБРОСИТЬ</button></div>
    <div style="text-align:center;font-family:var(--mono);font-size:9px;color:#5a5a6e;letter-spacing:.14em;padding:8px">
      БАМ-БАМ: КАСКАД · v1.4 · шансы как в кейсах · секрет 1 из 3 846</div>`;
  $$('#setWrap .tgl').forEach(t=>t.onclick=()=>{
    S[t.dataset.k]=!S[t.dataset.k];save();sfx.ui();renderSettings()});
  {
    const поле=$('#prCode'), кнопка=$('#prGo');
    if(кнопка)кнопка.onclick=()=>redeemPromo(поле?поле.value:'');
    /* Enter — то же самое: на телефоне это единственная кнопка под рукой,
       когда клавиатура закрывает половину экрана. */
    if(поле)поле.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.keyCode===13){e.preventDefault();redeemPromo(поле.value)}});
  }
  wireGfx();
  let armed=false;
  $('#setReset').onclick=e=>{
    if(!armed){armed=1;e.target.textContent='ТОЧНО? ЖМИ ЕЩЁ';return}
    S=clone(DEF);for(const c of CARDS.filter(c=>c.t===0&&!c.noColl))S.inv[c.id]=2;
    S.deck=defaultDeck();save();B=null;
    toast('Прогресс сброшен. С чистого листа!',1);go('menu')};
}

/* Блок графики. Живой пример стоит рядом с переключателями намеренно: словами
   «зерно» и «развёртка» разницу не объяснить, а на карте она видна сразу.
   Пример — карта тира ЛЕГЕНДА: на рекруте половина эффектов отключена самой
   лестницей редкости, и щёлкать по ним было бы бессмысленно. */
let gfxOpen=false;
function gfxCardId(){
  const c=COLLECTIBLE.find(x=>x.t===3&&!x.ult)||COLLECTIBLE[0];
  return c?c.id:null;
}
function gfxHTML(){
  const g=gfx(), cur=gfxPreset();
  const preset=GFX_PRESETS.map((p,i)=>
    `<button class="gPre ${i===cur?'on':''}" data-pre="${i}">${p.n}</button>`).join('');
  const sub=cur>=0?GFX_PRESETS[cur].s:'свои настройки';
  const rows=GFX_KEYS.map(k=>`
    <div class="setRow gRow"><div><div class="sT">${GFX_NAMES[k][0]}</div>
      <div class="sS">${GFX_NAMES[k][1]}</div></div>
      <button class="tgl ${g[k]?'on':''}" data-g="${k}" role="switch"
        aria-checked="${!!g[k]}"><i></i></button></div>`).join('');
  const card=gfxCardId();
  return `<div class="setRow gHead"><div><div class="sT">ГРАФИКА</div>
      <div class="sS">${sub}</div></div>
      <div class="gPres">${preset}</div></div>
    <div class="setRow gMore"><div><div class="sT">РАСШИРЕННЫЕ</div>
      <div class="sS">каждый эффект по отдельности, с примером</div></div>
      <button class="btn" id="gToggle">${gfxOpen?'СВЕРНУТЬ':'ОТКРЫТЬ'}</button></div>
    ${gfxOpen?`<div class="gPanel">
      <div class="gList">${rows}</div>
      <div class="gDemo">${card?cardHTML(byId(card),{open:1,noAnim:1}):''}
        <div class="gDemoCap">живой пример</div></div>
    </div>`:''}`;
}
function wireGfx(){
  $$('#setWrap .gPre').forEach(b=>b.onclick=()=>{
    Object.assign(gfx(),GFX_PRESETS[+b.dataset.pre].v);
    save();sfx.ui();applyGfx();renderSettings();
  });
  $$('#setWrap .tgl[data-g]').forEach(t=>t.onclick=()=>{
    const g=gfx(),k=t.dataset.g; g[k]=g[k]?0:1;
    save();sfx.ui();applyGfx();renderSettings();
  });
  const tg=$('#gToggle');
  if(tg)tg.onclick=()=>{gfxOpen=!gfxOpen;sfx.ui();renderSettings()};
}

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
