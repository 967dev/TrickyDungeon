/* Стенд замера баланса: гоняет НАСТОЯЩИЕ simulate() из js/10-rules.js в node.
   36 000 боёв за четыре секунды. То, ради чего правила и разводились с
   подачей: правила не трогают DOM, значит их можно гонять без браузера.

   Лежит в репозитории намеренно. Первый заход он прожил в /tmp, а BACKLOG
   ссылался на него как на существующий — «мерить обязательно тем же
   bench.js». Одна чистка временной папки, и мерить стало нечем, а замеры в
   беклоге стали непроверяемыми числами.

     node tools/bench.js [файл-правил] [боёв-на-клетку] [политика] [флаги]

   политика:  chain — игрок, который ВИДИТ цепочки (по умолчанию simplePolicy,
              который про стихии не знает вовсе)
   флаги:     mull — замена стартовой руки по цене
              mullc — замена под цвет колоды
              pool9 / pool10 — сдвинуть открытие тира ЛЕГЕНДА врагу

   Развилки «герой растёт» и «тир 3 с 10-го» УЖЕ ПРИНЯТЫ в игре, их флаги
   держать смысла нет: hp снят (якорь в правилах больше не тот), pool10
   применился бы поверх уже применённого. Осталось то, что ещё выбирается.  */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..') + '/';

const правила = process.argv[2] || (ROOT + 'js/10-rules.js');
const N = parseInt(process.argv[3] || '800', 10);

const ядро = `
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
`;
const данные = fs.readFileSync(ROOT + 'js/02-data.js', 'utf8');
let rules = fs.readFileSync(правила, 'utf8');
const ФЛАГИ = (process.argv[5] || '');

const ctx = { console };
vm.createContext(ctx);
/* const на верхнем уровне vm-скрипта живёт в его собственной области и на
   объект контекста НЕ попадает — вытаскиваем нужное явно. */
const мост = ";globalThis.__ = {rStartTurn, rAiTurn, simplePolicy, CARDS, STAGES, simulate, byId, rPlayCard, rAttack, newBattle, rMulligan: (typeof rMulligan==='function'?rMulligan:null), rChainAuto: (typeof rChainAuto==='function'?rChainAuto:null)};";vm.runInContext(ядро + данные + rules + мост, ctx, { filename: 'склейка.js' });

const { CARDS, STAGES, simulate, byId, rPlayCard, rAttack, newBattle, rMulligan, rChainAuto } = ctx.__;

const колоды = {
  'стартовая': CARDS.filter(c => c.t === 0 && !c.noColl).flatMap(c => [c.id, c.id]).slice(0, 20),
};
/* «Собранная колода» строится так же, как колода врага: 20 карт из пула по
   тиру, не больше двух копий одной. Иначе сравнение с BACKLOG некорректно. */
function колодаТира(t) {
  const pool = CARDS.filter(c => !c.noColl && c.t <= t && (c.ty === 'u' || c.ty === 's'));
  const d = [];
  let guard = 0;
  while (d.length < 20 && guard++ < 4000) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (d.filter(x => x === c.id).length < 2) d.push(c.id);
  }
  return d;
}


/* Игрок, который ЦЕПОЧКУ ВИДИТ. Отличие от simplePolicy ровно одно: среди
   доступных карт он предпочитает ту, что продолжает набранный цвет, и особенно
   ту, что его замыкает. В остальном тот же топорный жадный игрок.
   Зачем: simplePolicy играет самое дорогое и про стихии не знает вообще — то
   есть меряет цепочки у того, кто их не собирает. Разница между этими двумя
   политиками и есть цена умения, которого у ИИ нет. */
function цепочнаяПолитика(st) {
  const P = st.p, E = st.e;
  let guard = 0;
  while (!st.over && guard++ < 12) {
    const cands = P.hand.map((id, i) => ({ i, c: byId(id) }))
      .filter(x => x.c.c <= P.mana && !(x.c.ty === 'u' && P.board.length >= 5))
      .filter(x => !(x.c.eff && x.c.eff.tg === 'ally' && !P.board.length));
    if (!cands.length) break;
    const ch = P.chain || { el: null, n: 0 };
    const вес = x => {
      let v = x.c.c;                       /* базово — как у simplePolicy */
      if (x.c.el === ch.el) v += (ch.n >= 2 ? 40 : 8);   /* замкнуть > продолжить */
      else if (ch.n >= 2) v -= 12;         /* не рвать почти собранную цепь */
      return v;
    };
    const x = cands.sort((a, b) => вес(b) - вес(a))[0];
    const tg = x.c.eff && x.c.eff.tg;
    const tgt = tg === 'ally' ? P.board[0] : (tg === 'any' ? (E.board[0] || null) : null);
    if (!rPlayCard(st, 'p', x.i, tgt).ok) break;
    if (st.pend && rChainAuto) rChainAuto(st);
  }
  guard = 0;
  while (!st.over && guard++ < 14) {
    const u = P.board.filter(x => x.canAtk && x.atk > 0 && (!x.sick || x.rush))[0];
    if (!u) break;
    const taunts = E.board.filter(x => x.taunt);
    const tgt = taunts.length ? taunts[0] : { hero: 1 };
    u.canAtk = false;
    rAttack(st, 'p', u, tgt);
  }
}
const ПОЛИТИКА = process.argv[4] === 'chain' ? цепочнаяПолитика : undefined;

/* Замена стартовой руки. Простая и честная эвристика живого игрока: убрать то,
   чем нельзя походить в первые ходы. Меняем до двух карт дороже трёх маны.
   Никакой стихийной хитрости — иначе замер покажет силу МОЕЙ эвристики, а не
   самой механики. */
function мулиганПросто(st){
  if(!rMulligan)return;
  const дорогие=[];
  st.p.hand.forEach((id,i)=>{ if(id!=='zC0' && byId(id).c>3) дорогие.push([i,byId(id).c]) });
  дорогие.sort((a,b)=>b[1]-a[1]);
  rMulligan(st, дорогие.slice(0,2).map(x=>x[0]));
}
/* Тот же бой, что и в simulate(), но со сменой руки перед первым ходом.
   Копия цикла нужна потому, что simulate() создаёт состояние внутри себя и
   вмешаться между раздачей и первым ходом снаружи нельзя. */
function симМулиган(si,колода,политика,предел){
  const st=newBattle(si,колода);
  if(st.train)return{win:true,turns:0,st};
  МУЛ(st);
  st.ev.length=0;
  let ходов=0; const лимит=предел||60;
  const {rStartTurn,rAiTurn}=ctx.__;
  rStartTurn(st,'p');
  while(!st.over&&ходов++<лимит){
    st.ev.length=0;
    if(st.phase==='p'){
      (политика||ctx.__.simplePolicy)(st);
      if(st.over)break;
      st.phase='wait'; st.seq=(st.seq||0)+1;
      if(!rStartTurn(st,'e'))break;
      rAiTurn(st);
      if(st.over)break;
      if(!rStartTurn(st,'p'))break;
    } else break;
  }
  return{win:!!(st.over&&st.e.hp<=0),turns:ходов,st};
}
/* Второй вариант: игрок, который меняет руку ПОД ЦВЕТ. Считает, какой стихии в
   колоде больше, и выкидывает карты не в цвет (и заодно самые дорогие). Это
   потолок: так сыграл бы человек, собравший одноцветную колоду ради цепочек.
   Мерим отдельно, потому что колодами по цвету и так выигрывают чаще всех, и
   подтолкнуть их ещё выше было бы плохо. */
function мулиганЦвет(st){
  if(!rMulligan)return;
  const счёт={};
  for(const id of st.p.deck.concat(st.p.hand)){const e=byId(id).el; if(e)счёт[e]=(счёт[e]||0)+1}
  const главный=Object.keys(счёт).sort((a,b)=>счёт[b]-счёт[a])[0];
  const плохие=[];
  st.p.hand.forEach((id,i)=>{
    if(id==='zC0')return;
    const c=byId(id);
    let вес=0;
    if(c.el!==главный)вес+=10;
    if(c.c>3)вес+=c.c;
    if(вес)плохие.push([i,вес]);
  });
  плохие.sort((a,b)=>b[1]-a[1]);
  rMulligan(st, плохие.slice(0,2).map(x=>x[0]));
}
const МУЛ = ФЛАГИ.includes('mullc') ? мулиганЦвет : мулиганПросто;
const БОЙ = (ФЛАГИ.includes('mull')) ? симМулиган : simulate;

/* Развилка 1 из BACKLOG: тир ЛЕГЕНДА открывается врагу не на 8-м этапе, а на
   10-м. Правим КОПИЮ данных в стенде, игру не трогаем. */
/* STAGES[8].pool УЖЕ равен 2 в данных игры — развилка принята. Флаг оставлен
   на будущее (сдвинуть ещё раз), но если он ничего не меняет, лучше сказать
   это вслух, чем показать ту же таблицу под другим заголовком. */
if (ФЛАГИ.includes('pool10')) {
  if (STAGES[8].pool === 2 && STAGES[9].pool === 2) console.log('  (флаг pool10 ничего не изменил: так уже в данных)');
  STAGES[8].pool = 2; STAGES[9].pool = 2;
}
else if (ФЛАГИ.includes('pool9')) { STAGES[8].pool = 2; }                     /* тир 3 с 9-го */

const этапы = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/* Колода, СОБРАННАЯ ПО ЦВЕТУ — ровно то, ради чего механика затевалась.
   Сначала всё доступное в своей стихии по две копии, остаток добираем чем
   попало из того же пула. */
function колодаЦвета(el, t) {
  const свои = CARDS.filter(c => !c.noColl && c.t <= t && c.el === el && (c.ty === 'u' || c.ty === 's'));
  const d = [];
  for (const c of свои) { d.push(c.id); if (d.length < 20) d.push(c.id); if (d.length >= 20) break; }
  const прочие = CARDS.filter(c => !c.noColl && c.t <= t && c.el !== el && (c.ty === 'u' || c.ty === 's'));
  let guard = 0;
  while (d.length < 20 && guard++ < 4000) {
    const c = прочие[Math.floor(Math.random() * прочие.length)];
    if (d.filter(x => x === c.id).length < 2) d.push(c.id);
  }
  return d.slice(0, 20);
}

const ряды = [
  ['стартовая', () => колоды['стартовая']],
  ['до ГОРОДА (т1)', () => колодаТира(1)],
  ['до ФРАКЦИИ (т2)', () => колодаТира(2)],
  ['до ЛЕГЕНДЫ (т3)', () => колодаТира(3)],
  ['цвет: эфир (т3)', () => колодаЦвета('ether', 3)],
  ['цвет: лёд (т3)', () => колодаЦвета('ice', 3)],
  ['цвет: вольта (т3)', () => колодаЦвета('volta', 3)],
  ['цвет: огонь (т3)', () => колодаЦвета('fire', 3)],
  ['цвет: сталь (т3)', () => колодаЦвета('steel', 3)],
];

const t0 = Date.now();
console.log('правила: ' + правила.split(/[\\/]/).pop() + '   пул: ' + (ФЛАГИ.includes('pool10')?'тир3 с 10-го':ФЛАГИ.includes('pool9')?'тир3 с 9-го':'как есть') + '   герой: 30+si   '+'   рука: ' + (ФЛАГИ.includes('mullc')?'замена под цвет':ФЛАГИ.includes('mull')?'замена по цене':'как раздали') + '   боёв на клетку: ' + N);
console.log('колода            ' + этапы.map(s => String(s).padStart(5)).join(''));
for (const [имя, ген] of ряды) {
  const row = этапы.map(si => {
    let w = 0;
    for (let k = 0; k < N; k++) if (БОЙ(si, ген(), ПОЛИТИКА).win) w++;
    return Math.round(w / N * 100);
  });
  console.log(имя.padEnd(18) + row.map(v => (v + '%').padStart(5)).join(''));
}
console.log('всего боёв: ' + (ряды.length * этапы.length * N) + '   за ' + ((Date.now() - t0) / 1000).toFixed(2) + ' с');
