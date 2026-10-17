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

  // ドラッグで回転（タッチは横方向だけ。縦はページのスクロールに譲る）、ホイールで拡大
  let drag = null;
  stage.addEventListener("pointerdown", e => { drag = { x:e.clientX, y:e.clientY }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener("pointermove", e => {
    if(!drag) return;
    view.rotY -= (e.clientX - drag.x) * 0.01;
    if(e.pointerType === "mouse") view.tilt = Math.min(1.35, Math.max(0.05, view.tilt + (e.clientY - drag.y) * 0.008));
    drag = { x:e.clientX, y:e.clientY };
  });
  ["pointerup","pointercancel"].forEach(ev => stage.addEventListener(ev, () => drag = null));
  stage.addEventListener("wheel", e => { e.preventDefault(); view.dist = Math.min(view.base * 2.5, Math.max(view.base * 0.4, view.dist * (1 + e.deltaY * 0.001))); }, { passive:false });

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
function disposeAll(){ root.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); root.clear(); meshes = []; }
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

function itemGeometry(p){
  const k = 0.95;
  if(p.shape === "cylinder"){
    // 円柱の軸は、いちばん長い辺の向きに合わせる
    const axis = [p.w, p.h, p.d].indexOf(Math.max(p.w, p.h, p.d));
    const len = Math.max(p.w, p.h, p.d) * k;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 28);
    if(axis === 1) geo.scale(p.w / 2 * k, p.h * k, p.d / 2 * k);
    else if(axis === 0){ geo.rotateZ(Math.PI / 2); geo.scale(len, p.h / 2 * k, p.d / 2 * k); }
    else { geo.rotateX(Math.PI / 2); geo.scale(p.w / 2 * k, p.h / 2 * k, len); }
    return geo;
  }
  if(p.shape === "soft"){ const geo = new THREE.SphereGeometry(1, 24, 16); geo.scale(p.w / 2 * k, p.h / 2 * k, p.d / 2 * k); return geo; }
  return new THREE.BoxGeometry(p.w * k, p.h * k, p.d * k);
}

// packed: packing.pack() の結果、steps: packing.buildSteps() の結果
function show(packedResult, steps){
  packed = packedResult;
  if(!ready) return;
  disposeAll();
  const { C, bags, placed } = packed;
  const n = Math.max(1, bags.length), gap = C.W * 0.35, span = n * C.W + (n - 1) * gap;
  let topY = C.H;
  for(let b = 0; b < n; b++){
    const g = new THREE.Group(); g.position.x = -span / 2 + C.W / 2 + b * (C.W + gap); root.add(g);
    topY = C.kind === "box" ? addBox(g, C) : addBag(g, C);
  }
  placed.forEach(p => {
    const geo = itemGeometry(p);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color:new THREE.Color(p.color), roughness:p.shape === "soft" ? 0.95 : 0.55 }));
    m.position.set(p.x, p.y, p.z); root.children[p.bag].add(m);
    if(p.shape !== "soft") m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color:0x000000, transparent:true, opacity:0.25 })));
    meshes.push({ m, step: steps.findIndex(s => s.rank === p.rank), y:p.y, t0:0 });
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
    o.m.material.emissive.setRGB(cur ? 0.18 : 0, cur ? 0.15 : 0, cur ? 0.05 : 0);
  }
  renderer.render(scene, camera);
}

App.scene3d = { init, show, setStep };
})(window.App = window.App || {});
