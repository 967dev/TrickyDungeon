/* 13-ui.js — справка и настройки

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
    <li>Награда — искры на паки в ларьке. Первая зачистка этапа: ×1,5.</li>
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
  const TABS=[['battle','БОЙ'],['cards','КАРТЫ'],['strat','СТРАТЕГИИ'],['gacha','ЛАРЁК'],['deck','КОЛОДА'],['raid','РЕЙДЫ'],['odds','ШАНСЫ']];
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
    {k:'vfx',t:'ЧАСТИЦЫ',s:'искры и звёзды при ударах и вскрытии паков'},
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
      БАМ-БАМ: КАСКАД · рабочая версия · шансы как в кейсах · секрет 1 из 3 846</div>`;
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
