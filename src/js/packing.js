// 袋詰めの計算（画面には触らない）
// 1. 入れる順番を決める：かごの上（レシートの下の方）から取り出しやすい順を基本に、詰め方のルールと折り合いをつける
// 2. 置く場所を決める：高さマップ方式。袋の底を格子に区切り、各マスの「今の高さ」を記録しながら、
//    「上面の高さ ＋ 足元の隙間 − 壁や隣との接触」が一番小さい位置に置いていく（pack）
// 3. 磨く：評価関数（袋の数・重さの偏り・重い物の高さ…）が小さくなるよう、商品を別の袋に移す・向きを変える、を
//    焼きなまし法で何百回も試す（improve）。入れる順番は 1 のまま変えない
// 袋の使い方は2通り：
//   おまかせ … 同じ袋・箱を、全部入るまで必要なだけ使う
//   袋を指定 … 決めた数・種類の袋だけを使う。入りきらない物は「余り」として返す（余りが少ないほど良い）
(function(App){
"use strict";
const { PALETTE, STEP_TEXT, KINDS, PACKING } = App.config;
// 一覧の色見本と3Dの色をそろえる。種類が分かればその種類の色
const colorFor = (it, i) => KINDS[it.kind]?.color || PALETTE[i % PALETTE.length];

// 1 重い・立てる物 → 2 箱物 → 3 軽い物 → 4 つぶれやすい物 → 5 日用品
function rankOf(it){
  if(it.separate === "chemical") return 5;
  if(it.fragile) return 4;
  if(it.kg >= 0.7 || it.upright) return 1;
  if(it.shape === "soft" || it.kg < 0.2) return 3;
  return 2;
}

// 上に載せてよい重さ(kg)の上限。これを超える置き方は、ほかに置き場所がないときしかしない
//   AI が「上に載せられる重さ」(cap) を返していればそれを使う（10kg以上は上限なし）。
//   ポテチ 0.05・パン 0.4 のように返ってくれば、「ポテチは大根の上」「軽い物ならパンの上」が自然に出てくる
//   cap が無いとき：柔らかくてつぶれやすい物（パン・袋菓子・バナナなど）… 0（何も載せない）
//                   硬い容器のつぶれやすい物（卵パック・豆腐など）……… 0.15（ごく軽い物だけ）
//                   それ以外 …………………………………………………………… 上限なし
const LIGHT_ON_FRAGILE = 0.15;
function loadLimitOf(it){
  if(Number.isFinite(it.cap)) return it.cap >= 10 ? Infinity : Math.max(0, it.cap);
  const soft = it.shape === "soft";
  if(it.fragile) return soft ? 0 : LIGHT_ON_FRAGILE;
  if(soft && it.kg < 0.5) return 0;   // 葉物など、印が付いていなくても軽くて柔らかい物はつぶれる
  return Infinity;
}

// 上下を変えずに平らに置く物（卵・肉や魚のトレー・豆腐など）。AI の印 H か、種類から決める
const FLAT_KINDS = new Set(["eg", "mt", "tf"]);
const isFlat = it => !!it.flat || FLAT_KINDS.has(it.kind);

// 置き方の候補。立てる物・つぶれやすい物・平らに置く物は向きを変えない（横回転だけ）
function orientations(it){
  const { w, d, h } = it;
  if(it.upright || it.fragile || isFlat(it)) return [[w, d, h], [d, w, h]];
  return [[w, d, h], [d, w, h], [w, h, d], [h, w, d], [d, h, w], [h, d, w]];
}

// ---------- 入れる順番 ----------
// レジでは、スキャンした順に商品を新しいかごへ入れていく。だからレシートの下の方の商品ほど、かごの上にあって取り出しやすい。
// 次に入れる商品は、次の点数の合計が一番小さい物にする（貪欲法）：
//   かごの深さ  … その商品の上に、まだ残っている商品がいくつあるか（レシートの下の方なら0。上の方へ離れるほど大きい）
//   ルール違反  … 同じ袋に入る物で、まだ入れていない「より下に入れるべき物」との段階の差の2乗の合計
//                  （重い物より先に卵を入れる＝差3 → 9点、のように、ルールから大きく外れるほど急に重くなる）
//   つぶれやすさ … つぶれやすい物は、同じ袋に入るつぶれない物が残っている限り後回し（レシート順より優先）。
//                  つぶれやすい物どうしでは、硬い容器の物（卵など）を柔らかい物（パンなど）より先に
// ルール違反の重みを大きめにしているので、重い物とつぶれやすい物の順番はほぼ守られ、近い段階どうしはレシート順が優先される。
const DEPTH_WEIGHT = 1, RULE_WEIGHT = 3, CRUSH_WEIGHT = 30, SOFT_LAST_WEIGHT = 5;
function orderUnits(units){
  const rest = [...units], out = [];
  while(rest.length){
    let best = null, bestCost = Infinity;
    for(const u of rest){
      let depth = 0, rule = 0;
      for(const v of rest){
        if(v === u) continue;
        if(v.pos > u.pos) depth++;
        if(v.group !== u.group) continue;
        if(v.rank < u.rank) rule += (u.rank - v.rank) ** 2;
        if(u.lim < Infinity && v.lim === Infinity) rule += CRUSH_WEIGHT;
        if(v.lim > u.lim && v.lim < Infinity) rule += SOFT_LAST_WEIGHT;
      }
      const cost = DEPTH_WEIGHT * depth + RULE_WEIGHT * rule;
      // 同じ点数なら、大きい物を先に（隙間を小さい物で埋められるように）
      if(cost < bestCost || (cost === bestCost && u.vol > best.vol)){ best = u; bestCost = cost; }
    }
    out.push(best);
    rest.splice(rest.indexOf(best), 1);
  }
  // 同じ段階が続くところを1つの手順にまとめる
  let step = -1, prev = null;
  for(const u of out){ if(u.rank !== prev){ step++; prev = u.rank; } u.step = step; }
  return out;
}


// ---------- 置く場所 ----------
// 計算に使う道具一式：商品（入れる順）、おまかせのときの袋 C、指定した袋の一覧 fixed（おまかせなら null）
function makeContext(items, C, fixed){
  const colorOf = new Map(items.map((it, i) => [it.id, colorFor(it, i)]));
  const raw = [];
  // group: 入れる順番のルールを比べる相手。日用品を食品と同じ袋に入れてよいなら、日用品も食品と比べて最後に回す
  const groupOf = it => !PACKING.mixChem && it.separate === "chemical" ? "chem" : "food";
  items.forEach((it, pos) => {
    for(let q = 0; q < it.qty && raw.length < 80; q++)
      raw.push({ it, pos, rank: rankOf(it), lim: loadLimitOf(it), group: groupOf(it), vol: it.w * it.d * it.h,
        chem: it.separate === "chemical", cold: it.temp === "frozen" || it.temp === "chilled", rawMeat: it.separate === "raw" });
  });
  const units = orderUnits(raw);
  units.forEach((u, i) => u.i = i);
  return { C, units, colorOf, fixed: fixed && fixed.length ? fixed : null };
}

// 袋1つ。袋ごとに大きさが違ってよいので、格子も袋ごとに持つ
// 2枚の地図：hm＝各マスの今の高さ、lim＝各マスの一番上に、あと何kgまで載せてよいか
// slack: 口から何cmまではみ出してよいか（袋は持ち手を結べるので少しならよい。箱はフタが閉まらなくなるので許さない）
function newBag(group, C){
  const cell = Math.max(C.W, C.D) < 40 ? 1.5 : 2;
  const nx = Math.max(1, Math.floor(C.W / cell)), nz = Math.max(1, Math.floor(C.D / cell));
  return { group, C, cell, nx, nz, slack: C.kind === "box" ? PACKING.slackBox : PACKING.slackBag,
    hm: new Float32Array(nx * nz), lim: new Float32Array(nx * nz).fill(Infinity), kg: 0, top: 0, list: [], spill: [] };
}
// 日用品を食品と同じ袋に入れてよいなら、袋の区別はしない（袋を指定したときも区別しない）
const bagGroupOf = (X, u) => PACKING.mixChem || X.fixed ? "all" : u.group;

// 幅 ca × 奥行 cb の窓の中の最大（または最小）を、全部の位置について求める（行→列の2段で計算を減らす）
function windowReduce(a, nx, nz, ca, cb, useMax){
  const wx = nx - ca + 1, wz = nz - cb + 1, row = new Float32Array(nz * wx), out = new Float32Array(wz * wx);
  const pick = useMax ? (m, v) => v > m ? v : m : (m, v) => v < m ? v : m, init = useMax ? 0 : Infinity;
  for(let z = 0; z < nz; z++) for(let x = 0; x < wx; x++){ let m = init; for(let k = 0; k < ca; k++) m = pick(m, a[z * nx + x + k]); row[z * wx + x] = m; }
  for(let z = 0; z < wz; z++) for(let x = 0; x < wx; x++){ let m = init; for(let k = 0; k < cb; k++) m = pick(m, row[(z + k) * wx + x]); out[z * wx + x] = m; }
  return out;
}
// 足元の高さの合計を一瞬で出すための累積和
function prefix(hm, nx, nz){
  const s = new Float64Array((nx + 1) * (nz + 1));
  for(let z = 0; z < nz; z++) for(let x = 0; x < nx; x++)
    s[(z + 1) * (nx + 1) + x + 1] = hm[z * nx + x] + s[z * (nx + 1) + x + 1] + s[(z + 1) * (nx + 1) + x] - s[z * (nx + 1) + x];
  return s;
}
// 足元のうち、いちばん高い所とほぼ同じ高さのマスの割合
function supportRatio(hm, nx, ix, iz, ca, cb, base){
  let c = 0;
  for(let z = iz; z < iz + cb; z++) for(let x = ix; x < ix + ca; x++) if(hm[z * nx + x] >= base - 0.8) c++;
  return c / (ca * cb);
}
// 側面のうち、壁か隣の物に接している割合
function contact(hm, nx, nz, ix, iz, ca, cb, base, h){
  const need = base + h * 0.3; let c = 0;
  for(let z = iz; z < iz + cb; z++){
    c += ix === 0 ? 1 : +(hm[z * nx + ix - 1] >= need);
    c += ix + ca === nx ? 1 : +(hm[z * nx + ix + ca] >= need);
  }
  for(let x = ix; x < ix + ca; x++){
    c += iz === 0 ? 1 : +(hm[(iz - 1) * nx + x] >= need);
    c += iz + cb === nz ? 1 : +(hm[(iz + cb) * nx + x] >= need);
  }
  return c / (2 * (ca + cb));
}

// 置き場所を探す。点数 = 上面の高さ ＋ 1.2 × 足元の隙間の平均 − 接触（立てる物は壁に寄せたいので倍）
//   足元の半分以上が浮く置き方は ＋30。rot: 向きの番号（-1 はおまかせ）
//   ignoreLim: false なら、下の物が耐えられない場所には置かない（置き場所が無ければ null）
//              true なら、耐えられない重さが一番小さい場所を選ぶ（ほかに置き場所がないときの逃げ道）
const GAP_W = 1.2, CONTACT_MAX = 4;
function find(bag, u, rot, ignoreLim){
  const { C, cell, nx, nz, hm, lim } = bag, kg = u.it.kg;
  const ors = orientations(u.it), list = rot >= 0 && rot < ors.length ? [rot] : ors.map((_, o) => o);
  const ps = prefix(hm, nx, nz);
  let r = null;
  for(const o of list){
    let [a, b, h] = ors[o];
    a = Math.min(a, C.W); b = Math.min(b, C.D); h = Math.min(h, C.H * 1.2);
    const ca = Math.min(nx, Math.ceil(a / cell - 0.01)), cb = Math.min(nz, Math.ceil(b / cell - 0.01)), n = ca * cb;
    const wx = nx - ca + 1, wz = nz - cb + 1, mx = windowReduce(hm, nx, nz, ca, cb, true), mn = windowReduce(lim, nx, nz, ca, cb, false);
    for(let iz = 0; iz < wz; iz++) for(let ix = 0; ix < wx; ix++){
      const base = mx[iz * wx + ix], minLim = mn[iz * wx + ix];
      if(!ignoreLim && kg > minLim + 1e-6) continue;
      const s = ps[(iz + cb) * (nx + 1) + ix + ca] - ps[iz * (nx + 1) + ix + ca] - ps[(iz + cb) * (nx + 1) + ix] + ps[iz * (nx + 1) + ix];
      let score = base + h + (ix + iz) * 0.01 + GAP_W * (base - s / n);
      if(ignoreLim) score += Math.max(0, kg - minLim) * 100;
      if(r && score - CONTACT_MAX >= r.score) continue; // どう転んでも今の最良に勝てない
      if(base > 0.5 && supportRatio(hm, nx, ix, iz, ca, cb, base) < 0.5) score += 30;
      score -= contact(hm, nx, nz, ix, iz, ca, cb, base, h) * (u.it.upright ? 4 : 2);
      if(!r || score < r.score) r = { score, base, minLim, ix, iz, ca, cb, a, b, h, o, raw: ors[o] };
    }
  }
  return r;
}

// その置き方で袋に収まるか（口からのはみ出しが許す高さ以内、重さが耐荷重以内）
const fits = (bag, u, r) => !!r && r.base + r.h <= bag.C.H + bag.slack + 0.5 && bag.kg + u.it.kg <= bag.C.kg + 1e-6;

function commit(bag, u, r){
  const { cell, nx } = bag, top = r.base + r.h, n = r.ca * r.cb;
  // 置いた物の上に載せてよい重さ＝「この商品自身の上限」と「下の物の残りの上限から、この商品の重さを引いた分」の小さい方
  const nextLim = Math.min(u.lim, r.minLim - u.it.kg);
  let dead = 0, sup = 0;
  for(let z = r.iz; z < r.iz + r.cb; z++) for(let x = r.ix; x < r.ix + r.ca; x++){
    const k = z * nx + x, v = bag.hm[k];
    dead += r.base - v; if(v >= r.base - 0.8) sup++;
    bag.hm[k] = top; bag.lim[k] = nextLim;
  }
  bag.kg += u.it.kg; bag.top = Math.max(bag.top, top);
  const x0 = r.ix * cell, z0 = r.iz * cell;
  bag.list.push({ u, r, x0, x1: x0 + r.a, z0, z1: z0 + r.b, y0: r.base, y1: top,
    dead: dead * cell * cell, support: r.base < 0.5 ? 1 : sup / n, over: Math.max(0, u.it.kg - r.minLim) });
}
// 袋に入れる。strict（袋を指定したとき）なら、収まらない物は入れずに spill（余り）へ回す
function placeIn(bag, u, rot, strict){
  const r = find(bag, u, rot, false) || find(bag, u, rot, true);
  if(strict && !fits(bag, u, r)){ bag.spill.push(u); return false; }
  commit(bag, u, r); return true;
}

// 最初の詰め方：入れる順に、入る袋のうち最初の袋へ（first-fit）
//   おまかせ … 入らなければ袋を増やす
//   袋を指定 … どの袋にも入らなければ余り（袋の番号 -1）
function greedy(X){
  const { units } = X;
  const bag = new Array(units.length).fill(-1), bagGroup = [], Cs = [], states = [];
  if(X.fixed) for(const C of X.fixed){ states.push(newBag("all", C)); bagGroup.push("all"); Cs.push(C); }
  for(const u of units){
    let k = -1, r = null;
    for(let j = 0; j < states.length; j++){
      if(bagGroup[j] !== bagGroupOf(X, u)) continue;
      const q = find(states[j], u, -1, false);
      if(fits(states[j], u, q)){ k = j; r = q; break; }
    }
    if(k < 0){
      if(X.fixed) continue;
      k = states.length; states.push(newBag(bagGroupOf(X, u), X.C)); bagGroup.push(bagGroupOf(X, u)); Cs.push(X.C);
      r = find(states[k], u, -1, false) || find(states[k], u, -1, true);
    }
    commit(states[k], u, r); bag[u.i] = k;
  }
  return { sol: { bag, rot: new Array(units.length).fill(-1), bagGroup, Cs }, bags: states };
}

// 解（どの商品をどの袋に・どの向きで）から袋を組み立てる。袋どうしは独立なので1袋ずつ作れる
function buildBag(X, sol, k){
  const b = newBag(sol.bagGroup[k], sol.Cs[k]);
  for(const u of X.units) if(sol.bag[u.i] === k) placeIn(b, u, sol.rot[u.i], !!X.fixed);
  return b;
}

// ---------- 評価関数（小さいほど良い） ----------
const overlap = (p, q) => p.x0 < q.x1 - 0.3 && q.x0 < p.x1 - 0.3 && p.z0 < q.z1 - 0.3 && q.z0 < p.z1 - 0.3;

// 袋1つ分の項目
function bagTerms(bag){
  const { C, slack } = bag, H = C.H, ps = bag.list;
  const nChem = ps.filter(p => p.u.chem).length;
  const t = { n: ps.length, food: ps.length - nChem, kg: bag.kg, cap: C.kg, cold: false, spill: bag.spill.length,
    overflow: Math.max(0, bag.top - H - slack), overweight: Math.max(0, bag.kg - C.kg),
    cog: 0, dead: 0, support: 0, crush: 0, raw: 0, mix: ps.length > nChem ? nChem : 0 };
  for(const p of ps){
    t.cog += p.u.it.kg * ((p.y0 + p.y1) / 2 / H);
    t.dead += p.dead / 1000;
    t.crush += p.over;
    if(p.y0 > 0.5 && p.support < 0.5) t.support++;
    if(p.u.cold) t.cold = true;
    if(p.u.rawMeat){ for(const q of ps) if(q !== p && !q.u.rawMeat && !q.u.chem && q.y1 <= p.y0 + 0.5 && overlap(p, q)) t.raw++; }
  }
  return t;
}

// 全体の点数。q は各項目の量、total は 量 × 重み（config.js の PACKING.weights）の合計
//   unplaced: どの袋にも割り当てていない商品の数（袋を指定したときの余り）
//   袋どうしの重さの差は「耐荷重に対する割合」の差 × 平均の耐荷重。同じ袋ばかりなら、ただの重さの差と同じ
function score(terms, W, unplaced = 0){
  const used = terms.filter(t => t.n > 0), food = used.filter(t => t.food > 0);
  const sum = k => terms.reduce((s, t) => s + t[k], 0);
  const ratio = food.map(t => t.kg / t.cap), capAvg = food.reduce((s, t) => s + t.cap, 0) / Math.max(1, food.length);
  const q = {
    bags: used.length, left: unplaced + sum("spill"), overflow: sum("overflow"), overweight: sum("overweight"),
    balance: food.length > 1 ? (Math.max(...ratio) - Math.min(...ratio)) * capAvg : 0,
    cog: sum("cog"), dead: sum("dead"), support: sum("support"), crush: sum("crush"),
    cold: Math.max(0, used.filter(t => t.cold).length - 1), raw: sum("raw"), mix: sum("mix")
  };
  let total = 0; for(const k in q) total += q[k] * (W[k] || 0);
  return { total, q };
}
// 袋を指定したときは、袋の数は決まっているので数えない
const weightsFor = X => X.fixed ? { ...PACKING.weights, bags: 0 } : PACKING.weights;
const countUnplaced = sol => sol.bag.reduce((s, b) => s + (b < 0), 0);

// ---------- 焼きなまし ----------
function mulberry32(a){
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// 乱数の種は商品と袋から作る。同じレシート・同じ袋なら毎回同じ詰め方になる
function seedFrom(X){
  let h = 2166136261;
  const bags = (X.fixed || [X.C]).map(C => [C.W, C.D, C.H, C.kg]);
  const s = JSON.stringify([X.units.map(u => [u.it.name, u.it.w, u.it.d, u.it.h, u.it.kg]), bags]);
  for(let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const cloneSol = s => ({ bag: s.bag.slice(), rot: s.rot.slice(), bagGroup: s.bagGroup.slice(), Cs: s.Cs.slice() });

function createAnnealer(X, init, { iters, seed, W }){
  const rnd = mulberry32(seed), U = X.units, n = U.length;
  const sol = cloneSol(init);
  // おまかせのときは、新しい袋を開けられるよう、空の袋を1つずつ足しておく
  if(!X.fixed) for(const g of new Set(sol.bagGroup)){ sol.bagGroup.push(g); sol.Cs.push(X.C); }
  const bags = sol.bagGroup.map((_, k) => buildBag(X, sol, k)), terms = bags.map(bagTerms);
  let cur = score(terms, W, countUnplaced(sol));
  const start = cur.total;
  let best = { ...cur, sol: cloneSol(sol), bags: bags.slice() };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const groupOfBag = k => k < 0 ? null : sol.bagGroup[k];

  // 近くの解を1つ作る。戻り値: 触った袋と、元に戻す関数。袋の番号 -1 は余り（袋を指定したときだけ使う）
  function propose(){
    const r = rnd(), i = Math.floor(rnd() * n), g = bagGroupOf(X, U[i]);
    if(r < 0.45){ // 別の袋（または余り）に移す
      const c = []; sol.bagGroup.forEach((bg, k) => { if(bg === g && k !== sol.bag[i]) c.push(k); });
      if(X.fixed && sol.bag[i] >= 0) c.push(-1);
      if(c.length){ const from = sol.bag[i], to = pick(c); sol.bag[i] = to; return { touched: [from, to], undo: () => { sol.bag[i] = from; } }; }
    } else if(r < 0.75){ // 違う袋（または余り）の2個を入れ替える
      const c = []; for(let j = 0; j < n; j++) if(bagGroupOf(X, U[j]) === g && sol.bag[j] !== sol.bag[i]) c.push(j);
      if(c.length){ const j = pick(c), a = sol.bag[i], b = sol.bag[j]; sol.bag[i] = b; sol.bag[j] = a;
        return { touched: [a, b], undo: () => { sol.bag[i] = a; sol.bag[j] = b; } }; }
    }
    // 向きを変える（-1 はおまかせ）
    const m = orientations(U[i].it).length, old = sol.rot[i]; let v;
    do { v = Math.floor(rnd() * (m + 1)) - 1; } while(v === old);
    sol.rot[i] = v; return { touched: [sol.bag[i]], undo: () => { sol.rot[i] = old; } };
  }
  // 動かして、触った袋だけ作り直して採点する
  function trial(){
    const mv = propose(), ks = [...new Set(mv.touched)].filter(k => k >= 0);
    const oldB = ks.map(k => bags[k]), oldT = ks.map(k => terms[k]);
    for(const k of ks){ bags[k] = buildBag(X, sol, k); terms[k] = bagTerms(bags[k]); }
    const nx = score(terms, W, countUnplaced(sol));
    return { d: nx.total - cur.total, nx, revert(){ mv.undo(); ks.forEach((k, j) => { bags[k] = oldB[j]; terms[k] = oldT[j]; }); } };
  }
  // 初期温度：ふつうの悪化幅なら半分くらいの確率で受け入れる温度にする。最後はその 1/500 まで下げる
  const ds = [];
  for(let t = 0; t < 40; t++){ const tr = trial(); if(tr.d > 0 && tr.d < 500) ds.push(tr.d); tr.revert(); }
  const T0 = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length / Math.LN2 : 20, T1 = T0 * 0.002;

  let it = 0;
  function step(k){
    for(let s = 0; s < k && it < iters; s++, it++){
      const T = T0 * Math.pow(T1 / T0, it / iters), tr = trial();
      if(tr.d <= 0 || rnd() < Math.exp(-tr.d / T)){
        cur = tr.nx;
        if(cur.total < best.total - 1e-9) best = { ...cur, sol: cloneSol(sol), bags: bags.slice() };
      } else tr.revert();
    }
  }
  return { step, start, get best(){ return best; }, get done(){ return it >= iters; } };
}

// ---------- 画面に渡す形にする ----------
// 戻り値の bags[i].C はその袋の大きさ。袋を指定したときは、空の袋も含めて指定した順に全部返す
// units は袋に入った商品だけ（入れる順）。入りきらなかった商品は leftover
function toPacked(X, bagStates, sol){
  const { colorOf } = X;
  const shown = X.fixed ? bagStates.slice(0, X.fixed.length) : bagStates.filter(b => b.list.length);
  const bags = shown.map(b => ({
    C: b.C, slack: b.slack, kg: b.kg, top: b.top, n: b.list.length,
    group: b.list.length && b.list.every(p => p.u.chem) ? "chem" : "food"
  }));
  const recs = shown.flatMap((b, bi) => b.list.map(p => ({ p, b, bi }))).sort((a, b) => a.p.u.i - b.p.u.i);
  // 手順は袋に入った商品だけで作り直す（余りを抜くと、同じ段階が続く所が変わるため）
  const stepOf = new Map(); let step = -1, prev = null;
  for(const { p } of recs){ if(p.u.rank !== prev){ step++; prev = p.u.rank; } stepOf.set(p.u.i, step); }
  const labeled = new Set(), placed = [], units = [];
  for(const { p, b, bi } of recs){
    const { u, r } = p, C = b.C;
    units.push({ it: u.it, rank: u.rank, step: stepOf.get(u.i) });
    // o: 置いた向き（orientations() の番号）。raw: その向きでの縮める前の寸法。3Dで向きと縮尺を合わせるのに使う
    // first: 同じ商品が複数あるとき、名前の札を1つだけ出すための目印
    const first = !labeled.has(u.it.id); labeled.add(u.it.id);
    placed.push({ bag: bi, step: stepOf.get(u.i), rank: u.rank, color: colorOf.get(u.it.id), shape: u.it.shape, kind: u.it.kind, name: u.it.name, first,
      o: r.o, raw: r.raw, dims: [u.it.w, u.it.h, u.it.d],
      w: r.a, d: r.b, h: r.h, x: r.ix * b.cell + r.a / 2 - C.W / 2, z: r.iz * b.cell + r.b / 2 - C.D / 2, y: r.base + r.h / 2 });
  }
  const inBag = new Set(recs.map(x => x.p.u.i));
  const leftover = X.units.filter(u => !inBag.has(u.i)).map(u => ({ it: u.it, rank: u.rank }));
  const total = score(bagStates.map(bagTerms), weightsFor(X), countUnplaced(sol)).total;
  return { C: X.C, fixed: !!X.fixed, bags, placed, colorOf, units, leftover, total, _state: { X, sol } };
}

// items: 商品の配列（レシートの上から順）、C: おまかせのときの袋・箱 { W, D, H, kg, kind }
// opt.bags: 袋を指定するときの袋・箱の配列（この数・この種類だけを使う）
// 戻り値: { C, fixed, bags, placed, colorOf, units, leftover, total }。すぐ返る（焼きなましはしない）
function pack(items, C, opt = {}){
  const X = makeContext(items, C, opt.bags);
  const g = greedy(X);
  return toPacked(X, g.bags, g.sol);
}

// pack() の結果を焼きなましで磨く。画面が固まらないよう、少しずつ後ろで計算する
// onDone(packed | null): 良い詰め方が見つかれば新しい結果、見つからなければ null。戻り値は途中でやめる関数
function improve(packed, onDone){
  const S = packed._state;
  if(!PACKING.anneal || !S || S.X.units.length < 2){ setTimeout(() => onDone(null), 0); return () => {}; }
  let stopped = false, ann = null;
  const tick = () => {
    if(stopped) return;
    if(!ann) ann = createAnnealer(S.X, S.sol, { iters: PACKING.iters, seed: seedFrom(S.X), W: weightsFor(S.X) });
    const t0 = performance.now();
    while(!ann.done && performance.now() - t0 < 12) ann.step(4);
    if(!ann.done){ setTimeout(tick, 0); return; }
    const b = ann.best;
    onDone(b.total < ann.start - 0.5 ? toPacked(S.X, b.bags, b.sol) : null);
  };
  setTimeout(tick, 0);
  return () => { stopped = true; };
}

// 入れる順番どおりの手順。同じ段階が続くところは1つの手順にまとめる
function buildSteps(packed){
  const steps = [];
  for(const u of packed.units) if(!steps[u.step]) steps[u.step] = { rank:u.rank, ...STEP_TEXT[u.rank] };
  return steps;
}

App.packing = { pack, improve, buildSteps, rankOf, colorFor, loadLimitOf };
})(window.App = window.App || {});
