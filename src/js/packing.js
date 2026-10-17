// 袋詰めの計算（画面には触らない）
// 高さマップ方式：袋の底を格子に区切り、各マスの「今の高さ」を記録しながら、一番低く収まる位置に置いていく
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

// 置き方の候補。立てる物は向きを変えない（横回転だけ）
function orientations(it){
  const { w, d, h } = it;
  if(it.upright) return [[w, d, h], [d, w, h]];
  return [[w, d, h], [d, w, h], [w, h, d], [h, w, d], [d, h, w], [h, d, w]];
}

// items: 商品の配列、C: 袋・箱 { W, D, H, kg }
// 戻り値: { C, bags, placed, colorOf, units }
function pack(items, C){
  const { W, D, H } = C;
  const cell = Math.max(W, D) < 40 ? 1.5 : 2;
  const nx = Math.max(1, Math.floor(W / cell)), nz = Math.max(1, Math.floor(D / cell));
  const colorOf = new Map(items.map((it, i) => [it.id, colorFor(it, i)]));
  const units = [];
  for(const it of items) for(let q = 0; q < it.qty && units.length < 80; q++)
    units.push({ it, rank: rankOf(it), group: it.separate === "chemical" ? "chem" : "food", vol: it.w * it.d * it.h });
  units.sort((a, b) => (a.group === b.group ? 0 : a.group === "food" ? -1 : 1) || a.rank - b.rank || b.vol - a.vol);

  const bags = [], placed = [];
  const best = (hm, it) => {
    let r = null;
    const ors = orientations(it);
    for(let o = 0; o < ors.length; o++){
      let [a, b, h] = ors[o];
      a = Math.min(a, W); b = Math.min(b, D); h = Math.min(h, H * 1.2);
      const ca = Math.min(nx, Math.ceil(a / cell - 0.01)), cb = Math.min(nz, Math.ceil(b / cell - 0.01));
      for(let iz = 0; iz + cb <= nz; iz++) for(let ix = 0; ix + ca <= nx; ix++){
        let base = 0;
        for(let z = iz; z < iz + cb; z++) for(let x = ix; x < ix + ca; x++){ const v = hm[z * nx + x]; if(v > base) base = v; }
        const score = base + h + (ix + iz) * 0.01;
        if(!r || score < r.score) r = { score, base, ix, iz, ca, cb, a, b, h, o, raw:ors[o] };
      }
    }
    return r;
  };
  const labeled = new Set();
  for(const u of units){
    let bag = null, p = null;
    for(const bg of bags){
      if(bg.group !== u.group || bg.kg + u.it.kg > C.kg) continue;
      const q = best(bg.hm, u.it);
      if(q && q.base + q.h <= H + 0.5){ bag = bg; p = q; break; }
    }
    if(!bag){
      bag = { group:u.group, hm:new Float32Array(nx * nz), kg:0, top:0, n:0 };
      bags.push(bag); p = best(bag.hm, u.it);
    }
    for(let z = p.iz; z < p.iz + p.cb; z++) for(let x = p.ix; x < p.ix + p.ca; x++) bag.hm[z * nx + x] = p.base + p.h;
    bag.kg += u.it.kg; bag.top = Math.max(bag.top, p.base + p.h); bag.n++;
    // o: 置いた向き（orientations() の番号）。raw: その向きでの縮める前の寸法。3Dで向きと縮尺を合わせるのに使う
    // first: 同じ商品が複数あるとき、名前の札を1つだけ出すための目印
    const first = !labeled.has(u.it.id); labeled.add(u.it.id);
    placed.push({ bag: bags.indexOf(bag), rank: u.rank, color: colorOf.get(u.it.id), shape: u.it.shape, kind: u.it.kind, name: u.it.name, first,
      o: p.o, raw: p.raw, dims: [u.it.w, u.it.h, u.it.d],
      w:p.a, d:p.b, h:p.h, x: p.ix * cell + p.a / 2 - W / 2, z: p.iz * cell + p.b / 2 - D / 2, y: p.base + p.h / 2 });
  }
  return { C, bags, placed, colorOf, units };
}

// 実際に出てきた段階だけを手順にする
function buildSteps(packed){
  const ranks = [...new Set(packed.units.map(u => u.rank))].sort((a, b) => a - b);
  return ranks.map(r => ({ rank:r, ...STEP_TEXT[r] }));
}

App.packing = { pack, buildSteps, rankOf, colorFor };
})(window.App = window.App || {});
