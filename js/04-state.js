/* 04-state.js — состояние игры, сохранение, переключение экранов

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
