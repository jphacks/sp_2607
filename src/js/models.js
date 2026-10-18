// 商品の3Dモデル。種類ごとに、ひと目で何か分かる形を Three.js の基本図形を組み合わせて作る。
// build() は「普通に置いた向き」（幅w=x、高さh=y、奥行きd=z）で、中心を原点にした Group を返す。
// 寝かせる・回す・袋に合わせて縮めるのは scene3d.js 側でやる。
(function(App){
"use strict";
if(typeof THREE === "undefined"){ App.models = { build: () => null, get: () => null, cacheSize: () => 0 }; return; }

// 材質。t を渡すと半透明
const M = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.r ?? 0.6, metalness: o.m ?? 0,
  transparent: o.t != null, opacity: o.t ?? 1, depthWrite: o.t == null, side: o.side ?? THREE.FrontSide
});
function add(g, geo, mat, x = 0, y = 0, z = 0){ const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; }

// 半径1で作って、あとから横幅w・奥行きdに合わせて伸ばす（丸い物を楕円にも対応させる）
function roundGroup(g, w, d){ const s = new THREE.Group(); s.scale.set(w / 2, 1, d / 2); g.add(s); return s; }

// ---------- 種類ごとの形 ----------

// 紙パック：白い本体＋色の帯＋三角の屋根＋てっぺんの継ぎ目
function carton(w, h, d){
  const g = new THREE.Group(), y0 = -h / 2, bodyH = h * 0.82, roofH = h * 0.13;
  add(g, new THREE.BoxGeometry(w, bodyH, d), M("#F4F4EF"), 0, y0 + bodyH / 2);
  add(g, new THREE.BoxGeometry(w * 1.01, bodyH * 0.35, d * 1.01), M("#2F7FD0"), 0, y0 + bodyH * 0.42);
  const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, roofH); tri.lineTo(-d / 2, 0);
  const roof = new THREE.ExtrudeGeometry(tri, { depth:w, bevelEnabled:false });
  roof.rotateY(Math.PI / 2); roof.translate(-w / 2, y0 + bodyH, 0);
  add(g, roof, M("#F4F4EF"));
  add(g, new THREE.BoxGeometry(w, h * 0.05, d * 0.06), M("#E8E8E2"), 0, y0 + bodyH + roofH + h * 0.025);
  return g;
}

// ボトル：回転体で肩と首を作る。ペットボトルは透明＋ラベル＋キャップ、瓶は色付きガラス
function bottle(w, h, d, glass){
  const g = new THREE.Group(), s = roundGroup(g, w, d), y0 = -h / 2;
  const prof = [[0, 0], [0.9, 0], [1, 0.03], [1, 0.6], [0.78, 0.74], [0.36, 0.85], [0.33, 0.92], [0, 0.92]]
    .map(([r, y]) => new THREE.Vector2(r, y0 + y * h));
  add(s, new THREE.LatheGeometry(prof, 28), glass ? M("#3F6E30", { r:0.2, t:0.85 }) : M("#BFE3F2", { r:0.1, t:0.45 }));
  if(!glass) add(s, new THREE.CylinderGeometry(1.015, 1.015, h * 0.24, 28, 1, true), M("#2F9E6E", { side:THREE.DoubleSide }), 0, y0 + h * 0.34);
  else add(s, new THREE.CylinderGeometry(1.01, 1.01, h * 0.2, 28, 1, true), M("#F1E7CF", { side:THREE.DoubleSide }), 0, y0 + h * 0.3);
  add(s, new THREE.CylinderGeometry(0.38, 0.38, h * 0.08, 16), M(glass ? "#C9A227" : "#F2F2F2"), 0, y0 + h * 0.96);
  return g;
}

// 缶：銀色の円柱＋上下の縁＋ラベル
function can(w, h, d){
  const g = new THREE.Group(), s = roundGroup(g, w, d);
  add(s, new THREE.CylinderGeometry(1, 1, h * 0.94, 28), M("#C3CBD1", { r:0.3, m:0.35 }));
  add(s, new THREE.CylinderGeometry(0.95, 0.95, h * 0.03, 28), M("#9EA7AE", { r:0.35, m:0.4 }), 0, h / 2 - h * 0.015);
  add(s, new THREE.CylinderGeometry(0.95, 0.95, h * 0.03, 28), M("#9EA7AE", { r:0.35, m:0.4 }), 0, -h / 2 + h * 0.015);
  add(s, new THREE.CylinderGeometry(1.01, 1.01, h * 0.6, 28, 1, true), M("#2E6DB5", { side:THREE.DoubleSide }));
  return g;
}

// カップ：下がすぼまった筒＋紙のふた
function cup(w, h, d){
  const g = new THREE.Group(), s = roundGroup(g, w, d);
  add(s, new THREE.CylinderGeometry(1, 0.76, h * 0.95, 28), M("#F5F3EE"), 0, -h * 0.025);
  add(s, new THREE.CylinderGeometry(0.95, 0.83, h * 0.38, 28, 1, true), M("#E5503B", { side:THREE.DoubleSide }), 0, -h * 0.1);
  add(s, new THREE.CylinderGeometry(1.04, 1.04, h * 0.05, 28), M("#E9C54A"), 0, h / 2 - h * 0.025);
  return g;
}

// 卵パック：透明のトレーに卵を2列に並べる
function eggs(w, h, d){
  const g = new THREE.Group(), alongX = w >= d, L = alongX ? w : d, S = alongX ? d : w;
  const cols = Math.max(1, Math.round(L / S * 2)), rows = 2;
  add(g, new THREE.BoxGeometry(w, h * 0.45, d), M("#D7E7EA", { r:0.2, t:0.4 }), 0, -h / 2 + h * 0.225);
  const rr = Math.min(L / cols, S / rows) * 0.42, egg = new THREE.SphereGeometry(rr, 16, 12); egg.scale(1, Math.min(1.3, h * 0.45 / rr), 1);
  const em = M("#F3E2C4", { r:0.5 });
  for(let i = 0; i < cols; i++) for(let j = 0; j < rows; j++){
    const u = -L / 2 + L * (i + 0.5) / cols, v = -S / 2 + S * (j + 0.5) / rows;
    add(g, egg, em, alongX ? u : v, -h / 2 + h * 0.5, alongX ? v : u);
  }
  add(g, new THREE.BoxGeometry(w, h * 0.55, d), M("#E8F2F4", { r:0.1, t:0.18 }), 0, h / 2 - h * 0.275);
  return g;
}

// 食パン：四角い本体＋山形の上部＋透明の袋＋袋の留め具
function bread(w, h, d){
  const g = new THREE.Group(), y0 = -h / 2, bodyH = h * 0.66;
  add(g, new THREE.BoxGeometry(w, bodyH, d), M("#E8BF80", { r:0.9 }), 0, y0 + bodyH / 2);
  const top = new THREE.CylinderGeometry(1, 1, w, 24, 1, false, 0, Math.PI);
  top.rotateZ(Math.PI / 2); top.scale(1, h * 0.32, d / 2); top.translate(0, y0 + bodyH, 0);
  add(g, top, M("#C98A45", { r:0.9 }));
  add(g, new THREE.BoxGeometry(w * 1.03, h * 1.0, d * 1.04), M("#FFFFFF", { r:0.1, t:0.16 }));
  add(g, new THREE.BoxGeometry(w * 0.05, h * 0.28, d * 0.3), M("#2F7FD0"), w / 2 + w * 0.02, y0 + h * 0.62);
  return g;
}

// 袋菓子：まくら形にふくらんだ袋。上下はぺたんこに閉じてギザギザ、正面にロゴとチップスの絵
const SEAL = 0.1;   // 上下の閉じ目の高さ（h に対する割合）
function snack(w, h, d, color){
  const g = new THREE.Group(), base = new THREE.Color(color || "#D8412F");
  // 箱を、中央ほど厚く・上下の閉じ目と左右の折り目ほど薄くなるようにつぶす
  const body = new THREE.BoxGeometry(w, h, d, 16, 24, 4), p = body.attributes.position;
  for(let i = 0; i < p.count; i++){
    const u = Math.abs(p.getX(i)) / (w / 2), v = Math.min(1, Math.abs(p.getY(i)) / (h / 2) / (1 - SEAL));
    p.setZ(i, p.getZ(i) * Math.max(0.04, Math.sqrt(1 - v ** 3) * (1 - 0.45 * u ** 6)));
  }
  body.computeVertexNormals();
  add(g, body, M(base, { r:0.3, m:0.25 }));
  // 閉じ目：縦の溝が並ぶ細い帯（前後の面を1本おきに出っ張らせる）
  const n = 30, seal = new THREE.BoxGeometry(w, h * SEAL * 0.9, Math.max(0.15, d * 0.05), n, 1, 1), q = seal.attributes.position;
  for(let i = 0; i < q.count; i++) if(Math.round((q.getX(i) / w + 0.5) * n) % 2) q.setZ(i, q.getZ(i) * 2.2);
  seal.computeVertexNormals();
  const sm = M(base.clone().multiplyScalar(0.8), { r:0.35, m:0.3 });
  add(g, seal, sm, 0, h / 2 - h * SEAL / 2); add(g, seal, sm, 0, -h / 2 + h * SEAL / 2);
  // 正面の絵（ふくらんだ面より少し手前に貼る）
  const zf = d / 2 + 0.05, disc = (sx, sy, mat, x, y, rot = 0) => {
    const c = new THREE.CircleGeometry(1, 28); c.scale(sx, sy, 1);
    const m = add(g, c, mat, x, y, zf); m.rotation.z = rot; return m;
  };
  disc(w * 0.3, h * 0.11, M("#FFF6D8", { r:0.5 }), 0, h * 0.2);
  disc(w * 0.22, h * 0.06, M("#F2CF3A", { r:0.5 }), 0, h * 0.2).position.z += 0.02;
  const chip = M("#E9B949", { r:0.7 });
  [[-0.14, -0.08, 0.4], [0.06, -0.12, -0.3], [0.16, -0.02, 0.9], [-0.04, 0.0, -0.8]].forEach(([x, y, r], i) =>
    disc(w * 0.12, h * 0.055, chip, w * x, h * y, r).position.z += i * 0.01);
  return g;
}

// 袋入り野菜（玉ねぎなど）：丸い野菜を並べて、赤いネットをかぶせる
function veggieBag(w, h, d){
  const g = new THREE.Group(), side = Math.min(d, h), cols = Math.max(1, Math.round(w / side));
  const r = Math.min(w / cols, d, h) / 2 * 0.95, onion = new THREE.SphereGeometry(r, 18, 14), om = M("#C78A3B", { r:0.7 });
  const tip = new THREE.ConeGeometry(r * 0.25, r * 0.5, 10), tm = M("#8A5A26");
  for(let i = 0; i < cols; i++){
    const x = -w / 2 + w * (i + 0.5) / cols;
    add(g, onion, om, x, -h / 2 + r, 0);
    add(g, tip, tm, x, -h / 2 + r * 2.1, 0);
  }
  const net = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 6, 4, 4), new THREE.MeshBasicMaterial({ color:"#D23B2E", wireframe:true, transparent:true, opacity:0.7 }));
  g.add(net);
  return g;
}

// 丸い野菜・果物（キャベツ・りんごなど）
function roundVeg(w, h, d){
  const g = new THREE.Group(), s = new THREE.SphereGeometry(1, 24, 18); s.scale(w / 2, h / 2, d / 2);
  add(g, s, M("#6FA544", { r:0.8 }));
  const leaf = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 3); leaf.scale(w / 2 * 1.02, h / 2 * 1.02, d / 2 * 1.02);
  add(g, leaf, M("#9BC86A", { r:0.8 }));
  return g;
}

// 長い野菜（大根・ねぎ）：いちばん長い辺に沿って、白い根元と緑の葉
function longVeg(w, h, d){
  const g = new THREE.Group(), axis = [w, h, d].indexOf(Math.max(w, h, d)), L = Math.max(w, h, d);
  const r = [w, h, d].filter((_, i) => i !== axis).reduce((a, b) => Math.min(a, b)) / 2;
  const holder = new THREE.Group(); g.add(holder);
  add(holder, new THREE.CylinderGeometry(r, r * 0.8, L * 0.72, 18), M("#EEE9DC", { r:0.8 }), 0, -L * 0.14);
  add(holder, new THREE.ConeGeometry(r * 1.05, L * 0.28, 12), M("#4E9A3A", { r:0.8 }), 0, L * 0.36);
  if(axis === 0) holder.rotation.z = -Math.PI / 2;
  if(axis === 2) holder.rotation.x = Math.PI / 2;
  return g;
}

// バナナ：曲がった筒を4本並べ、先を茶色にする
function banana(w, h, d){
  const g = new THREE.Group(), n = 4, rad = Math.min(h * 0.32, d / n * 0.45);
  const ym = M("#F2CF3A", { r:0.7 }), bm = M("#6B4A1F");
  for(let i = 0; i < n; i++){
    const z = -d / 2 + d * (i + 0.5) / n;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-w / 2 + rad, h / 2 - rad, z), new THREE.Vector3(0, -h / 2 - h * 0.25, z), new THREE.Vector3(w / 2 - rad, h / 2 - rad, z));
    add(g, new THREE.TubeGeometry(curve, 24, rad, 10, false), ym);
    add(g, new THREE.SphereGeometry(rad * 0.7, 8, 6), bm, w / 2 - rad, h / 2 - rad, z);
  }
  add(g, new THREE.CylinderGeometry(rad * 0.6, rad * 0.8, d * 0.9, 10).rotateX(Math.PI / 2), M("#7A8A3A"), -w / 2 + rad, h / 2 - rad, 0);
  return g;
}

// 肉・魚：白いトレー＋赤身＋ラップ＋値札シール
function meat(w, h, d){
  const g = new THREE.Group(), y0 = -h / 2;
  add(g, new THREE.BoxGeometry(w, h * 0.35, d), M("#F2F2EE"), 0, y0 + h * 0.175);
  const m = new THREE.SphereGeometry(1, 24, 14); m.scale(w * 0.42, h * 0.36, d * 0.4);
  add(g, m, M("#C9505C", { r:0.5 }), 0, y0 + h * 0.4);
  add(g, new THREE.BoxGeometry(w, h, d), M("#FFFFFF", { r:0.1, t:0.14 }));
  add(g, new THREE.BoxGeometry(w * 0.32, Math.max(0.15, h * 0.04), d * 0.28), M("#F2CF3A"), w * 0.22, h / 2, d * 0.2);
  return g;
}

// 豆腐・惣菜：透明の容器に白い中身
function deli(w, h, d){
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w * 0.84, h * 0.72, d * 0.84), M("#F6F2E4", { r:0.7 }), 0, -h * 0.1);
  add(g, new THREE.BoxGeometry(w, h, d), M("#DDEBEE", { r:0.1, t:0.3 }));
  add(g, new THREE.BoxGeometry(w * 1.01, h * 0.06, d * 1.01), M("#FFFFFF", { r:0.2, t:0.55 }), 0, h / 2 - h * 0.03);
  return g;
}

// 上が少し広い容器の形（四角か丸）。高さ h・中心が原点。k で全体の大きさ、bottom で底の細さを変える
function tubGeo(w, h, d, round, k = 1, bottom = 0.86, open = false){
  const geo = new THREE.CylinderGeometry(1, bottom, h, round ? 32 : 4, 1, open);
  if(round) geo.scale(w / 2 * k, 1, d / 2 * k);
  else { geo.rotateY(Math.PI / 4); geo.scale(w / Math.SQRT2 * k, 1, d / Math.SQRT2 * k); }
  return geo;
}

// キムチ・漬物：半透明の容器に赤い中身（上に白菜のかけら）＋透明なふた＋正面のラベル。shape が筒なら丸い容器
function kimchi(w, h, d, color, shape){
  const g = new THREE.Group(), round = shape === "cylinder", y0 = -h / 2;
  add(g, tubGeo(w, h * 0.78, d, round, 0.93), M(color || "#C8402E", { r:0.8 }), 0, y0 + h * 0.41);
  const leaf = M("#EDE3B0", { r:0.8 }), red = M("#A92E22", { r:0.8 });
  [[-0.22, -0.15, leaf], [0.18, 0.12, leaf], [0.02, -0.02, red], [-0.1, 0.18, red], [0.25, -0.18, leaf]].forEach(([x, z, m]) => {
    const s = new THREE.SphereGeometry(1, 12, 8); s.scale(w * 0.12, h * 0.04, d * 0.1);
    add(g, s, m, w * x, y0 + h * 0.8, d * z);
  });
  add(g, tubGeo(w, h * 0.92, d, round), M("#F4F2EC", { r:0.3, t:0.35 }), 0, y0 + h * 0.46);
  add(g, tubGeo(w, h * 0.08, d, round, 1.04, 1), M("#E6F0F2", { r:0.1, t:0.35 }), 0, y0 + h * 0.96);
  // ラベル：容器の胴に巻いた白い帯と、正面の赤い印
  add(g, tubGeo(w, h * 0.34, d, round, 0.965, 0.93, true), M("#F7F3EA", { r:0.6, side:THREE.DoubleSide }), 0, y0 + h * 0.5);
  const mark = new THREE.CircleGeometry(1, 24); mark.scale(w * 0.2, h * 0.11, 1);
  add(g, mark, M("#C8402E", { r:0.6 }), 0, y0 + h * 0.5, d / 2 * 0.95 + 0.08);
  return g;
}

// 冷凍食品：青い平たい箱＋白い帯＋雪の結晶の印
function frozen(w, h, d){
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h, d), M("#3D7CC9", { r:0.4 }));
  add(g, new THREE.BoxGeometry(w * 0.22, h * 1.01, d * 1.01), M("#F4F8FC"), -w * 0.3, 0, 0);
  const flake = new THREE.Group(), fm = M("#FFFFFF");
  const arm = Math.min(w, d) * 0.18;
  for(let i = 0; i < 3; i++){ const b = add(flake, new THREE.BoxGeometry(arm * 2, 0.2, Math.max(0.3, arm * 0.18)), fm); b.rotation.y = i * Math.PI / 3; }
  flake.position.set(w * 0.18, h / 2 + 0.1, 0); g.add(flake);
  return g;
}

// 箱物（お菓子・シリアルなど）：色付きの箱＋正面の白いラベル
function box(w, h, d, color){
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h, d), M(color || "#E07A3F", { r:0.5 }));
  add(g, new THREE.BoxGeometry(w * 0.62, h * 0.45, d * 1.01), M("#FAF6EE"), 0, h * 0.08, 0);
  return g;
}

// 詰め替えパウチ：自立する袋＋上の閉じ目＋注ぎ口
function pouch(w, h, d){
  const g = new THREE.Group(), y0 = -h / 2;
  const body = new THREE.CylinderGeometry(0.62, 1, h * 0.9, 4, 1); body.rotateY(Math.PI / 4); body.scale(w / Math.SQRT2, 1, d / Math.SQRT2);
  add(g, body, M("#2BA39A", { r:0.35, m:0.15 }), 0, y0 + h * 0.45);
  add(g, new THREE.BoxGeometry(w * 0.62, h * 0.06, Math.max(0.3, d * 0.2)), M("#E9F4F2"), 0, y0 + h * 0.93);
  add(g, new THREE.CylinderGeometry(Math.min(w, d) * 0.14, Math.min(w, d) * 0.14, h * 0.07, 12), M("#F2F2F2"), w * 0.18, y0 + h * 0.965);
  return g;
}

// ティッシュ箱：白い箱＋色の帯＋上の取り出し口
function tissue(w, h, d){
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h, d), M("#F6F6F4", { r:0.8 }));
  add(g, new THREE.BoxGeometry(w * 1.01, h * 0.4, d * 1.01), M("#8FB8D8", { r:0.8 }), 0, -h * 0.2);
  const slot = new THREE.CylinderGeometry(1, 1, 0.2, 24); slot.scale(w * 0.3, 1, d * 0.12);
  add(g, slot, M("#5A6660"), 0, h / 2, 0);
  return g;
}

// 種類が分からないときの形
function fallback(w, h, d, shape, color){
  const g = new THREE.Group(), mat = M(color || "#9AA7B0", { r:0.6 });
  if(shape === "cylinder"){ const s = roundGroup(g, w, d); add(s, new THREE.CylinderGeometry(1, 1, h, 24), mat); }
  else if(shape === "soft"){ const s = new THREE.SphereGeometry(1, 24, 16); s.scale(w / 2, h / 2, d / 2); add(g, s, mat); }
  else add(g, new THREE.BoxGeometry(w, h, d), mat);
  return g;
}

// ---------- 回転体で作る形（ペットボトル・缶・カップ・紙パック） ----------
// 輪郭 [半径, 高さ]（どちらも 0〜1）を回して立体にする。本体は商品の色、ペットボトルのふたは白。
// x,z が -1〜1、y が -0.5〜0.5 の単位の大きさで作り、最後に w,h,d へ伸ばす
const PROFILE = {
  bottle: [[0,0],[0.86,0],[0.97,0.03],[1,0.08],[1,0.56],[0.95,0.63],[0.72,0.74],[0.48,0.82],[0.36,0.86],[0.36,0.9],[0,0.9]],
  can:    [[0,0],[0.84,0],[0.95,0.03],[1,0.08],[1,0.91],[0.88,0.97],[0.9,1],[0,1]],
  cup:    [[0,0],[0.76,0],[0.8,0.03],[0.96,0.93],[1,0.95],[1,1],[0,1]]
};
const CAP = [[0,0.89],[0.42,0.89],[0.42,1],[0,1]];

function lathe(prof, square){
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y - 0.5));
  if(!square) return new THREE.LatheGeometry(pts, 28);
  // 角型：4面で回し、角が外寸の角に来るよう広げる。面は平らに見せる
  const geo = new THREE.LatheGeometry(pts, 4, Math.PI / 4).toNonIndexed();
  geo.scale(Math.SQRT2, 1, Math.SQRT2); geo.computeVertexNormals();
  return geo;
}

// 単位の大きさの本体に輪郭線を付け、w,h,d に伸ばす。s は伸ばしたグループ（ふたなどを足すとき用）
function fitted(w, h, d, geo, mat){
  const g = new THREE.Group(), s = new THREE.Group(); s.scale.set(w / 2, h, d / 2); g.add(s);
  const m = add(s, geo, mat);
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color:0x000000, transparent:true, opacity:0.25 })));
  return { g, s };
}

// ペットボトル：胴→肩→首＋白いキャップ。箱として扱う物（2Lなど）は角型
function latheBottle(w, h, d, color, shape){
  const { g, s } = fitted(w, h, d, lathe(PROFILE.bottle, shape === "box"), M(color, { r:0.45 }));
  add(s, lathe(CAP), M("#F4F4F0", { r:0.4 }));
  return g;
}
const latheCan = (w, h, d, color) => fitted(w, h, d, lathe(PROFILE.can), M(color, { r:0.35, m:0.3 })).g;
const latheCup = (w, h, d, color) => fitted(w, h, d, lathe(PROFILE.cup), M(color, { r:0.55 })).g;

// 紙パック：横から見た家形（屋根＋てっぺんの継ぎ目）を奥行き方向に押し出す
function gableCarton(w, h, d, color){
  const sh = new THREE.Shape();
  [[-1,-0.5],[1,-0.5],[1,0.3],[0.06,0.44],[0.06,0.5],[-0.06,0.5],[-0.06,0.44],[-1,0.3]].forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
  const geo = new THREE.ExtrudeGeometry(sh, { depth:2, bevelEnabled:false });
  geo.translate(0, 0, -1);
  return fitted(w, h, d, geo, M(color, { r:0.55 })).g;
}

const BUILDERS = {
  pk: gableCarton, pb: latheBottle, gb: (w, h, d) => bottle(w, h, d, true),
  cn: latheCan, cp: latheCup, eg: eggs, br: bread, sn: snack, vg: veggieBag, rv: roundVeg, lv: longVeg,
  bn: banana, mt: meat, tf: deli, kc: kimchi, fz: frozen, bx: box, pc: pouch, tx: tissue
};

// kind: KINDS のコード、shape: "box"|"cylinder"|"soft"（種類が分からないとき用）、w,h,d: 普通に置いたときの幅・高さ・奥行き(cm)
function build(kind, shape, w, h, d, color){
  const f = BUILDERS[kind];
  return f ? f(w, h, d, color, shape) : fallback(w, h, d, shape, color);
}

// ---------- 一度作ったモデルを保存して使い回す ----------
// 形は「種類・寸法・色」で決まるので、それを目印に、最初に作ったモデル（ひな形）を取っておく。
// 2回目からはひな形を複製するだけ。形のデータ（ジオメトリ）は全部の複製で共有し、
// 材質だけ複製する（手順の再生で今の商品を光らせるとき、ほかの同じ形まで光らないように）。
// ひな形の形データには keep の印を付け、scene3d.js の後片付けで捨てないようにする。
const CACHE_MAX = 200, SHAPED = new Set(["pb", "kc"]);
const cache = new Map();
const round = v => Math.round(v * 2) / 2;   // 0.5cm単位にそろえて、ほぼ同じ寸法は同じひな形にする
function get(kind, shape, w, h, d, color){
  // ペットボトルとキムチは shape で丸型・角型が変わるので、shape も目印に入れる
  const key = [kind || "-", kind && !SHAPED.has(kind) ? "" : shape, round(w), round(h), round(d), kind && kind !== "bx" ? "" : color].join("|");
  let tpl = cache.get(key);
  if(tpl){ cache.delete(key); cache.set(key, tpl); }   // 最近使った物を後ろへ（古い物から捨てるため）
  else{
    tpl = build(kind, shape, w, h, d, color);
    tpl.traverse(o => { if(o.geometry) o.geometry.userData.keep = true; });
    cache.set(key, tpl);
    if(cache.size > CACHE_MAX){
      const [oldKey, old] = cache.entries().next().value;
      cache.delete(oldKey);
      old.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
  }
  const copy = tpl.clone(true);
  copy.traverse(o => { if(o.material) o.material = o.material.clone(); });
  return copy;
}

App.models = { build, get, cacheSize: () => cache.size };
})(window.App = window.App || {});
