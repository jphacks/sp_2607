// 3D表示（Three.js）。袋・箱と商品を描き、手順ごとに落とし込むアニメーションをする
(function(App){
"use strict";
const { reduceMotion } = App.util;

let renderer, scene, camera, root, stage, meshes = [], packed = null, curStep = 0;
const view = { rotY:-0.7, tilt:0.55, dist:120, base:120, target:null };
const ready = typeof THREE !== "undefined";

// 戻り値: 3Dが使えるか
function init(canvas, stageEl){
  stage = stageEl;
  if(!ready){
    stage.insertAdjacentHTML("beforeend", '<p style="position:absolute;inset:0;display:grid;place-items:center;color:var(--muted)">3D表示を読み込めませんでした</p>');
    return false;
  }
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 1, 3000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a948f, 0.85));
  const dl = new THREE.DirectionalLight(0xffffff, 0.75); dl.position.set(60, 120, 80); scene.add(dl);
  root = new THREE.Group(); scene.add(root);
  new ResizeObserver(resize).observe(stage);

  // マウス：ドラッグで回転と傾き、ホイールで拡大
  // 指：1本で横になぞると回転（縦はページのスクロールに譲る）、2本でつまむと拡大・縮小、2本で上下になぞると傾き
  const clampDist = v => Math.min(view.base * 2.5, Math.max(view.base * 0.4, v));
  const pts = new Map();
  let pinch = null;
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, y: (a.y + b.y) / 2 };
  };
  stage.addEventListener("pointerdown", e => {
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    stage.setPointerCapture(e.pointerId);
    if(pts.size === 2){ const s = pinchState(); pinch = { d0:s.d, y0:s.y, dist0:view.dist, tilt0:view.tilt }; }
  });
  stage.addEventListener("pointermove", e => {
    const prev = pts.get(e.pointerId);
    if(!prev) return;
    const cur = { x:e.clientX, y:e.clientY };
    pts.set(e.pointerId, cur);
    if(pts.size >= 2 && pinch){
      const s = pinchState();
      view.dist = clampDist(pinch.dist0 * pinch.d0 / s.d);
      view.tilt = Math.min(1.35, Math.max(0.05, pinch.tilt0 + (s.y - pinch.y0) * 0.008));
      return;
    }
    view.rotY -= (cur.x - prev.x) * 0.01;
    if(e.pointerType === "mouse") view.tilt = Math.min(1.35, Math.max(0.05, view.tilt + (cur.y - prev.y) * 0.008));
  });
  ["pointerup","pointercancel","lostpointercapture"].forEach(ev => stage.addEventListener(ev, e => {
    pts.delete(e.pointerId);
    if(pts.size < 2) pinch = null;
  }));
  stage.addEventListener("wheel", e => { e.preventDefault(); view.dist = clampDist(view.dist * (1 + e.deltaY * 0.001)); }, { passive:false });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);
  new MutationObserver(retheme).observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
  requestAnimationFrame(loop);
  return true;
}

function cssColor(name){ return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888"); }
function resize(){
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
// 後片付け。保存してあるモデルの形データ（keep）と札の画像（keep）は、使い回すので捨てない
function disposeAll(){
  root.traverse(o => {
    if(o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
    if(o.material){ if(o.material.map && !o.material.map.userData?.keep) o.material.map.dispose(); o.material.dispose?.(); }
  });
  root.clear(); meshes = [];
}
function retheme(){ if(ready && root) root.traverse(o => { if(o.userData.themed) o.material.color = cssColor(o.userData.themed); }); }

// レジ袋：半透明の袋＋持ち手。点線は「ここまで詰めてOK」の高さ。戻り値は描いた物の一番上
function addBag(g, C){
  const { W, D, H } = C, BH = H * 1.3;
  const lineC = cssColor("--bag-line"), fillC = cssColor("--bag-fill");
  const box = new THREE.BoxGeometry(W, BH, D); box.translate(0, BH / 2, 0);
  g.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color:fillC, transparent:true, opacity:0.1, side:THREE.DoubleSide, depthWrite:false })));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color:lineC }));
  edges.userData.themed = "--bag-line"; g.add(edges);
  const lim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-W/2, H, -D/2), new THREE.Vector3(W/2, H, -D/2), new THREE.Vector3(W/2, H, D/2), new THREE.Vector3(-W/2, H, D/2)]),
    new THREE.LineDashedMaterial({ color:lineC, dashSize:1.5, gapSize:1.2 }));
  lim.computeLineDistances(); lim.userData.themed = "--bag-line"; g.add(lim);
  for(const sx of [-1, 1]){
    const hd = new THREE.Mesh(new THREE.TorusGeometry(D / 2, 0.5, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color:lineC }));
    hd.rotation.y = Math.PI / 2; hd.position.set(sx * (W / 2 - W * 0.13), BH, 0); hd.userData.themed = "--bag-line"; g.add(hd);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color:lineC, transparent:true, opacity:0.18 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; floor.userData.themed = "--bag-line"; g.add(floor);
  return BH + D / 2;
}

// 段ボール：茶色の箱＋開いたフタ4枚
function addBox(g, C){
  const { W, D, H } = C;
  const kraft = new THREE.Color("#C49A6C"), kraftDark = new THREE.Color("#8A6440");
  const box = new THREE.BoxGeometry(W, H, D); box.translate(0, H / 2, 0);
  g.add(new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color:kraft, transparent:true, opacity:0.22, side:THREE.DoubleSide, depthWrite:false, roughness:1 })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color:kraftDark })));
  const f = D / 2;
  [[0, 0, D / 2, W], [Math.PI, 0, -D / 2, W], [Math.PI / 2, W / 2, 0, D], [-Math.PI / 2, -W / 2, 0, D]].forEach(([ry, x, z, len]) => {
    const hinge = new THREE.Group(); hinge.position.set(x, H, z); hinge.rotation.y = ry; g.add(hinge);
    const pg = new THREE.PlaneGeometry(len, f); pg.translate(0, f / 2, 0);
    const flap = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color:kraft, transparent:true, opacity:0.55, side:THREE.DoubleSide, depthWrite:false, roughness:1 }));
    flap.rotation.x = 0.55; hinge.add(flap);
    flap.add(new THREE.LineSegments(new THREE.EdgesGeometry(pg), new THREE.LineBasicMaterial({ color:kraftDark })));
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color:kraft, transparent:true, opacity:0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; g.add(floor);
  return H + f;
}

// 置いた向き（packing.js の orientations() の番号）ごとの回転。
// モデルは「普通に置いた向き」で作るので、inner を先に回し、outer で横に回して、置いた向きに合わせる
//   0 そのまま / 1 横に90° / 2〜5 寝かせる
const ROT = [
  { ix:0,           iz:0,           oy:0 },
  { ix:0,           iz:0,           oy:Math.PI / 2 },
  { ix:Math.PI / 2, iz:0,           oy:0 },
  { ix:Math.PI / 2, iz:0,           oy:Math.PI / 2 },
  { ix:0,           iz:Math.PI / 2, oy:Math.PI / 2 },
  { ix:0,           iz:Math.PI / 2, oy:0 }
];

// 1個の商品を組み立てる：holder（位置・落下アニメ）→ wrap（袋に合わせて縮める）→ outer → inner（向き）→ モデル
function itemObject(p){
  const [w, h, d] = p.dims;
  const model = App.models.get(p.kind, p.shape, w, h, d, p.color);
  const inner = new THREE.Group(); inner.add(model);
  const r = ROT[p.o] || ROT[0];
  inner.rotation.set(r.ix, 0, r.iz);
  const outer = new THREE.Group(); outer.add(inner); outer.rotation.y = r.oy;
  // 少しだけ小さくして、隣の商品とくっついて見えないようにする
  const k = 0.95, [ra, rb, rh] = p.raw;
  const wrap = new THREE.Group(); wrap.add(outer); wrap.scale.set(p.w / ra * k, p.h / rh * k, p.d / rb * k);
  const holder = new THREE.Group(); holder.add(wrap); holder.position.set(p.x, p.y, p.z);
  const mats = [];
  model.traverse(o => { if(o.material?.emissive) mats.push(o.material); });
  return { holder, mats };
}

// 商品名の札（常にカメラの方を向く板）。札の画像は名前ごとに保存して使い回す
const labelCache = new Map();
function makeLabel(text, worldH){
  let tex = labelCache.get(text);
  if(!tex){
    tex = drawLabel(text);
    tex.userData = tex.userData || {};   // three.js r128 の Texture には userData が無い
    tex.userData.keep = true;
    labelCache.set(text, tex);
    if(labelCache.size > 200){ const [k, old] = labelCache.entries().next().value; labelCache.delete(k); old.dispose(); }
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, depthTest:false, transparent:true }));
  sp.scale.set(worldH * tex.image.width / tex.image.height, worldH, 1);
  sp.renderOrder = 10;
  return sp;
}
function drawLabel(text){
  const fs = 44, pad = 14, c = document.createElement("canvas"), g = c.getContext("2d");
  const font = `700 ${fs}px "Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",sans-serif`;
  g.font = font;
  const tw = Math.ceil(g.measureText(text).width);
  c.width = tw + pad * 2; c.height = fs + pad * 2;
  g.font = font;
  g.fillStyle = "rgba(28,36,32,0.88)";
  const rr = 16; g.beginPath();
  g.moveTo(rr, 0); g.arcTo(c.width, 0, c.width, c.height, rr); g.arcTo(c.width, c.height, 0, c.height, rr);
  g.arcTo(0, c.height, 0, 0, rr); g.arcTo(0, 0, c.width, 0, rr); g.fill();
  g.fillStyle = "#FFFFFF"; g.textBaseline = "middle"; g.fillText(text, pad, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  return tex;
}

// packed: packing.pack() の結果、steps: packing.buildSteps() の結果
function show(packedResult, steps){
  packed = packedResult;
  if(!ready) return;
  disposeAll();
  const { C, bags, placed } = packed;
  // 袋ごとに大きさが違ってよい（袋の数・種類を指定したとき）。左から順に、隙間をあけて並べる
  const Cs = bags.length ? bags.map(b => b.C || C) : [C];
  const maxW = Math.max(...Cs.map(c => c.W)), gap = maxW * 0.35;
  const span = Cs.reduce((s, c) => s + c.W, 0) + (Cs.length - 1) * gap;
  let topY = C.H, x = -span / 2;
  for(const Cb of Cs){
    const g = new THREE.Group(); g.position.x = x + Cb.W / 2; x += Cb.W + gap; root.add(g);
    topY = Math.max(topY, Cb.kind === "box" ? addBox(g, Cb) : addBag(g, Cb));
  }
  const labelH = Math.max(2.2, maxW * 0.085);
  placed.forEach(p => {
    const { holder, mats } = itemObject(p);
    root.children[p.bag].add(holder);
    let label = null;
    if(p.first){
      label = makeLabel(p.name, labelH);
      label.position.set(0, p.h / 2 + labelH * 0.8, 0);
      label.visible = false;
      holder.add(label);
    }
    meshes.push({ m:holder, mats, label, step: p.step, y:p.y, t0:0 });
  });
  view.target = new THREE.Vector3(0, topY * 0.42, 0);
  view.base = Math.max(span * 1.25, topY * 2.2) + 15;
  view.dist = view.base;
  resize();
}

// k番目の手順までを表示。animate なら k番目の商品を上から落とす
function setStep(k, animate){
  curStep = k;
  if(!ready) return;
  const now = performance.now(), drop = packed ? packed.C.H : 30;
  for(const o of meshes){
    o.m.visible = o.step <= k;
    // 名前の札は、いま入れる手順の商品にだけ出す（全部出すと重なって読めない）
    if(o.label) o.label.visible = o.step === k;
    if(animate && !reduceMotion && o.step === k){ o.t0 = now; o.m.position.y = o.y + drop; }
    else if(!o.t0) o.m.position.y = o.y;
  }
}

function loop(now){
  requestAnimationFrame(loop);
  if(!view.target) return;
  const t = view.target;
  camera.position.set(
    t.x + view.dist * Math.sin(view.rotY) * Math.cos(view.tilt),
    t.y + view.dist * Math.sin(view.tilt),
    t.z + view.dist * Math.cos(view.rotY) * Math.cos(view.tilt));
  camera.lookAt(t);
  const drop = packed ? packed.C.H : 30;
  for(const o of meshes){
    if(!o.m.visible) continue;
    if(o.t0){
      const k = Math.min(1, (now - o.t0) / 650), ease = 1 - Math.pow(1 - k, 3);
      o.m.position.y = o.y + (1 - ease) * drop;
      if(k >= 1) o.t0 = 0;
    }
    const cur = o.step === curStep;
    for(const m of o.mats) m.emissive.setRGB(cur ? 0.12 : 0, cur ? 0.1 : 0, cur ? 0.03 : 0);
  }
  renderer.render(scene, camera);
}

App.scene3d = { init, show, setStep };
})(window.App = window.App || {});
