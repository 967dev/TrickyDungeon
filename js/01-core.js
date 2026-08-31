/* 01-core.js — аварийный обработчик, утилиты, платформа (Telegram/веб), хранилище, эмблемы и силуэты

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
