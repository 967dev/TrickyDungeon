/* 06-menu.js — меню, бегущая строка, описания эффектов карт

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
    <span class="tT">КАРТОЧНЫЙ ЛАРЁК</span><span class="tS">сегодня повезёт</span>
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
    case 'draw':return pre+`берёшь <b>${e.v} ${plural(e.v,'карту','карты','карт')}</b> из своей колоды в руку. Если в руке уже 7 — лишнее сгорает.`;
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
