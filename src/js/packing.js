// 袋詰めの計算（画面には触らない）
// 1. 入れる順番を決める：かごの上（レシートの下の方）から取り出しやすい順を基本に、詰め方のルールと折り合いをつける
// 2. 置く場所を決める：高さマップ方式。袋の底を格子に区切り、各マスの「今の高さ」を記録しながら、一番低く収まる位置に置いていく
(function(App){
"use strict";
const { PALETTE, STEP_TEXT, KINDS } = App.config;

// 一覧の色見本と3Dの色をそろえる。種類が分かればその種類の色
const colorFor = (it, i) => KINDS[it.kind]?.color || PALETTE[i % PALETTE.length];

// 1 重い・立てる物 → 2 箱物 → 3 軽い物 → 4 つぶれやすい物 → 5 日用品は別袋
function rankOf(it){
  if(it.separate === "chemical") return 5;
  if(it.fragile) return 4;
  if(it.kg >= 0.7 || it.upright) return 1;
  if(it.shape === "soft" || it.kg < 0.2) return 3;
  return 2;
}

// 上に載せてよい重さ(kg)の上限。これを超える置き方は絶対にしない
//   柔らかくてつぶれやすい物（パン・袋菓子・バナナなど）… 0（何も載せない）
//   硬い容器のつぶれやすい物（卵パック・豆腐など）……… 0.15（ごく軽い物だけ）
//   それ以外 …………………………………………………………… 上限なし
const LIGHT_ON_FRAGILE = 0.15;
function loadLimitOf(it){
  const soft = it.shape === "soft";
  if(it.fragile) return soft ? 0 : LIGHT_ON_FRAGILE;
  if(soft && it.kg < 0.5) return 0;   // 葉物など、印が付いていなくても軽くて柔らかい物はつぶれる
  return Infinity;
}

// 置き方の候補。立てる物と、つぶれやすい物は向きを変えない（横回転だけ）
function orientations(it){
  const { w, d, h } = it;
  if(it.upright || it.fragile) return [[w, d, h], [d, w, h]];
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
// items: 商品の配列（レシートの上から順）、C: 袋・箱 { W, D, H, kg }
// 戻り値: { C, bags, placed, colorOf, units }  units は入れる順番に並んでいる
function pack(items, C){
  const { W, D, H } = C;
  const cell = Math.max(W, D) < 40 ? 1.5 : 2;
  const nx = Math.max(1, Math.floor(W / cell)), nz = Math.max(1, Math.floor(D / cell));
  const colorOf = new Map(items.map((it, i) => [it.id, colorFor(it, i)]));
  const raw = [];
  items.forEach((it, pos) => {
    for(let q = 0; q < it.qty && raw.length < 80; q++)
      raw.push({ it, pos, rank: rankOf(it), lim: loadLimitOf(it), group: it.separate === "chemical" ? "chem" : "food", vol: it.w * it.d * it.h });
  });
  const units = orderUnits(raw);

  // 袋ごとに2枚の地図を持つ：hm＝各マスの今の高さ、lim＝各マスの一番上に、あと何kgまで載せてよいか
  const newBag = group => ({ group, hm:new Float32Array(nx * nz), lim:new Float32Array(nx * nz).fill(Infinity), kg:0, top:0, n:0 });
  const bags = [], placed = [];
  // 置ける場所がなければ null（つぶれやすい物の上にしか置けないとき）
  const best = (bag, it) => {
    const { hm, lim } = bag;
    let r = null;
    const ors = orientations(it);
    for(let o = 0; o < ors.length; o++){
      let [a, b, h] = ors[o];
      a = Math.min(a, W); b = Math.min(b, D); h = Math.min(h, H * 1.2);
      const ca = Math.min(nx, Math.ceil(a / cell - 0.01)), cb = Math.min(nz, Math.ceil(b / cell - 0.01));
      for(let iz = 0; iz + cb <= nz; iz++) for(let ix = 0; ix + ca <= nx; ix++){
        let base = 0, minLim = Infinity;
        for(let z = iz; z < iz + cb; z++) for(let x = ix; x < ix + ca; x++){
          const k = z * nx + x;
          if(hm[k] > base) base = hm[k];
          if(lim[k] < minLim) minLim = lim[k];
        }
        // 下にある物が耐えられない重さなら、この場所には置かない
        if(it.kg > minLim + 1e-6) continue;
        const score = base + h + (ix + iz) * 0.01;
        if(!r || score < r.score) r = { score, base, minLim, ix, iz, ca, cb, a, b, h, o, raw:ors[o] };
      }
    }
    return r;
  };
  const labeled = new Set();
  for(const u of units){
    let bag = null, p = null;
    for(const bg of bags){
      if(bg.group !== u.group || bg.kg + u.it.kg > C.kg) continue;
      const q = best(bg, u.it);
      if(q && q.base + q.h <= H + 0.5){ bag = bg; p = q; break; }
    }
    if(!bag){
      bag = newBag(u.group);
      bags.push(bag); p = best(bag, u.it);
    }
    // 置いた物の上に載せてよい重さ＝「この商品自身の上限」と「下の物の残りの上限から、この商品の重さを引いた分」の小さい方
    const nextLim = Math.min(u.lim, p.minLim - u.it.kg);
    for(let z = p.iz; z < p.iz + p.cb; z++) for(let x = p.ix; x < p.ix + p.ca; x++){
      bag.hm[z * nx + x] = p.base + p.h;
      bag.lim[z * nx + x] = nextLim;
    }
    bag.kg += u.it.kg; bag.top = Math.max(bag.top, p.base + p.h); bag.n++;
    // o: 置いた向き（orientations() の番号）。raw: その向きでの縮める前の寸法。3Dで向きと縮尺を合わせるのに使う
    // first: 同じ商品が複数あるとき、名前の札を1つだけ出すための目印
    const first = !labeled.has(u.it.id); labeled.add(u.it.id);
    placed.push({ bag: bags.indexOf(bag), step: u.step, rank: u.rank, color: colorOf.get(u.it.id), shape: u.it.shape, kind: u.it.kind, name: u.it.name, first,
      o: p.o, raw: p.raw, dims: [u.it.w, u.it.h, u.it.d],
      w:p.a, d:p.b, h:p.h, x: p.ix * cell + p.a / 2 - W / 2, z: p.iz * cell + p.b / 2 - D / 2, y: p.base + p.h / 2 });
  }
  return { C, bags, placed, colorOf, units };
}

// 入れる順番どおりの手順。同じ段階が続くところは1つの手順にまとめる
function buildSteps(packed){
  const steps = [];
  for(const u of packed.units) if(!steps[u.step]) steps[u.step] = { rank:u.rank, ...STEP_TEXT[u.rank] };
  return steps;
}

App.packing = { pack, buildSteps, rankOf, colorFor, loadLimitOf };
})(window.App = window.App || {});
