/* 03-fx.js — звук и частицы

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
