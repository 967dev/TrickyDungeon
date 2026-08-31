/* 09-chat.js — показ БАМ-ЧАТа и настроение героя

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
