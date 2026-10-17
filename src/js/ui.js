// 画面の操作と表示（入力欄、袋の選択、結果の一覧・手順・統計）
(function(App){
"use strict";
const { $, el, fmt, reduceMotion } = App.util;
const { PRESETS, DEFAULT_CONTAINER, nameOf, KINDS } = App.config;

const state = { receipts:[], boxPhoto:[], containerId:DEFAULT_CONTAINER, photoContainer:null, data:App.SAMPLE, isSample:true, step:0 };
let aiReady = false, imgLimits = null, ctl = null, steps = [], playTimer = null;
const container = () => state.containerId === "photo" && state.photoContainer ? state.photoContainer : PRESETS.find(p => p.id === state.containerId);

// ---------- 袋・箱の選択 ----------
function renderContainerSeg(){
  const host = $("containerSeg"); host.textContent = "";
  const groups = [["レジ袋", PRESETS.filter(p => p.group === "レジ袋")], ["段ボール（3辺合計cm）", PRESETS.filter(p => p.group === "段ボール")]];
  if(state.photoContainer) groups.unshift(["写真から測った大きさ", [state.photoContainer]]);
  for(const [title, list] of groups){
    const g = el("div", "seggroup");
    const seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", title);
    for(const p of list){
      const b = el("button", null, p.label); b.type = "button";
      b.setAttribute("aria-pressed", String(p.id === state.containerId));
      b.append(el("small", null, `${Math.round(p.W)}×${Math.round(p.D)}×${Math.round(p.H)}`));
      b.onclick = () => { state.containerId = p.id; renderContainerSeg(); renderPack(); };
      seg.append(b);
    }
    g.append(el("span", "sub", title), seg); host.append(g);
  }
}

// ---------- 写真 ----------
const maxTotal = () => imgLimits?.maxCount ?? 4;
function wirePhotos(input, dz, key, thumbs, cap){
  const add = async list => {
    for(const f of [...list]){
      if(!f.type.startsWith("image/")) continue;
      if(key === "boxPhoto") state.boxPhoto = [];
      if(state[key].length >= cap() || state.receipts.length + state.boxPhoto.length >= maxTotal()) break;
      try{
        setStatus("写真を軽くしています…");
        state[key].push(await App.imagePrep.prepImage(f, key === "receipts" ? "receipt" : "box"));
      }catch{
        setStatus("この写真は読み込めませんでした。別の写真を選ぶか、カメラで撮り直してください。", true); return;
      }
    }
    draw();
  };
  const draw = () => {
    const t = $(thumbs); t.textContent = "";
    state[key].forEach((f, i) => {
      const d = el("div", "thumb");
      const img = document.createElement("img"); img.src = URL.createObjectURL(f.blob); img.alt = (key === "receipts" ? "レシート" : "袋・箱") + (i + 1);
      img.onload = () => URL.revokeObjectURL(img.src);
      const x = el("button", null, "×"); x.type = "button"; x.setAttribute("aria-label", img.alt + "を外す");
      x.onclick = () => { state[key].splice(i, 1); draw(); };
      d.append(img, x); t.append(d);
    });
    syncGo();
  };
  input.addEventListener("change", e => { add(e.target.files); e.target.value = ""; });
  ["dragenter","dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", e => add(e.dataTransfer.files));
}

function setStatus(msg, err){ const s = $("status"); s.textContent = msg; s.classList.toggle("err", !!err); }
function syncGo(updateStatus = true){
  const busy = !!ctl;
  $("goBtn").disabled = busy || !aiReady || !imgLimits || state.receipts.length === 0;
  if(busy || !updateStatus) return;
  if(!aiReady) setStatus("このページをClaudeの画面で開くと、レシートを解析できます");
  else if(!imgLimits) setStatus("この環境では写真を送れません", true);
  else if(!state.receipts.length) setStatus("レシートを選ぶと解析できます");
  else{
    const all = [...state.receipts, ...state.boxPhoto];
    const tok = all.reduce((a, p) => a + p.tokens, 0), orig = all.reduce((a, p) => a + p.origTokens, 0);
    const kb = Math.round(all.reduce((a, p) => a + p.bytes, 0) / 1024), okb = Math.round(all.reduce((a, p) => a + p.origBytes, 0) / 1024);
    setStatus(`レシート${state.receipts.length}枚${state.boxPhoto.length ? "と袋・箱の写真" : ""}を解析できます（画像 約${tok.toLocaleString()}トークン・${kb.toLocaleString()}KB。加工前は約${orig.toLocaleString()}トークン・${okb.toLocaleString()}KB）`);
  }
}

// ---------- 解析 ----------
async function onSubmit(e){
  e.preventDefault();
  if(!aiReady || !state.receipts.length || ctl) return;
  ctl = new AbortController();
  $("goBtn").disabled = true; $("stopBtn").hidden = false;
  setStatus("レシートを読んでいます…（30秒〜1分ほどかかります）");
  try{
    const data = await App.ai.analyze({
      images: [...state.receipts, ...state.boxPhoto].map(p => p.blob),
      nReceipts: state.receipts.length, hasBox: state.boxPhoto.length > 0, signal: ctl.signal,
      onText: ({ text }) => setStatus("商品の大きさを調べています… " + text.length + "字")
    });
    if(!data.items.length){ setStatus(data.summary || "商品を読み取れませんでした。レシート全体が写るように撮り直してください。", true); }
    else{
      state.data = data; state.isSample = false;
      if(data.container){ state.photoContainer = data.container; state.containerId = "photo"; }
      renderAll();
      setStatus("できました。下の3Dで順番を確認してください");
      $("summary").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block:"start" });
    }
  }catch(err){
    if(err?.code === "cancelled") setStatus("止めました");
    else setStatus(App.ai.errorMessage(err?.code), true);
  }finally{
    ctl = null; $("stopBtn").hidden = true; syncGo(false);
  }
}

// ---------- 手順の再生 ----------
function setStep(k, animate){
  const n = steps.length;
  state.step = Math.max(0, Math.min(n - 1, k));
  App.scene3d.setStep(state.step, animate);
  document.querySelectorAll(".stepbtn").forEach((b, i) => b.setAttribute("aria-current", i === state.step ? "step" : "false"));
  $("stepnow").textContent = n ? `手順 ${state.step + 1} / ${n}` : "";
}
function stopPlay(){ clearInterval(playTimer); playTimer = null; $("playBtn").textContent = "最初から再生"; }
function wirePlayback(){
  $("playBtn").onclick = () => {
    if(playTimer){ stopPlay(); return; }
    setStep(0, true); $("playBtn").textContent = "一時停止";
    playTimer = setInterval(() => {
      if(state.step >= steps.length - 1){ stopPlay(); return; }
      setStep(state.step + 1, true);
    }, 1600);
  };
  $("prevBtn").onclick = () => { stopPlay(); setStep(state.step - 1, false); };
  $("nextBtn").onclick = () => { stopPlay(); setStep(state.step + 1, true); };
}

// ---------- 結果の表示 ----------
function flagsOf(it){
  const f = [];
  if(it.kg >= 0.7) f.push(["重い", ""]);
  if(it.upright) f.push(["立てる", ""]);
  if(it.fragile) f.push(["つぶれやすい", ""]);
  if(it.temp === "frozen") f.push(["冷凍", "cold"]);
  if(it.temp === "chilled") f.push(["冷蔵", "cold"]);
  if(it.separate === "raw") f.push(["ポリ袋に", "warn"]);
  if(it.separate === "chemical") f.push(["食品と別の袋", "warn"]);
  return f;
}

// 買った物の一覧。数字を直すと renderPack() で詰め直す（一覧自体は作り直さないので入力中のフォーカスが外れない）
function renderTable(){
  const tb = $("itemRows"); tb.textContent = "";
  const colorOf = new Map(state.data.items.map((it, i) => [it.id, App.packing.colorFor(it, i)]));
  state.data.items.forEach((it, idx) => {
    const tr = el("tr");
    // class と data-label はスマホでカード表示にするときに使う（styles.css）
    const cell = (cls, label) => { const td = el("td", cls); td.dataset.label = label; return td; };
    const nameTd = cell("c-name", "");
    const c = el("span", "chip"); const sw = el("span", "sw"); sw.style.background = colorOf.get(it.id); c.append(sw, it.name);
    nameTd.append(c);
    if(!it.confident) nameTd.append(el("span", "guess", "推測"));
    const kindLabel = KINDS[it.kind]?.label;
    const sub = [kindLabel, it.receipt].filter(Boolean).join("・");
    if(sub) nameTd.append(el("span", "rc", sub));
    const numIn = (key, cls, step, label) => {
      const inp = document.createElement("input"); inp.type = "number"; inp.id = `f-${key}-${idx}`; inp.className = cls || "";
      inp.min = "0"; inp.step = step; inp.value = String(it[key]); inp.setAttribute("aria-label", `${it.name}の${label}`);
      inp.addEventListener("change", () => {
        const v = Number(inp.value);
        if(!Number.isFinite(v) || v < 0){ inp.value = String(it[key]); return; }
        it[key] = key === "qty" ? Math.round(Math.min(v, 30)) : key === "kg" ? Math.min(v, 30) : Math.max(0.5, Math.min(v, 80));
        inp.value = String(it[key]);
        renderPack();
      });
      return inp;
    };
    const qTd = cell("c-qty", "個数"); qTd.append(numIn("qty", "q", "1", "個数"));
    const dTd = cell("c-dims", "1個のサイズ（幅×奥行き×高さ cm）"); const dims = el("div", "dims");
    dims.append(numIn("w", "", "0.5", "幅"), "×", numIn("d", "", "0.5", "奥行き"), "×", numIn("h", "", "0.5", "高さ"));
    dTd.append(dims);
    const kTd = cell("c-kg", "重さ（kg）"); kTd.append(numIn("kg", "", "0.05", "重さ"));
    const fTd = cell("c-flags", "");
    flagsOf(it).forEach(([t, cls]) => fTd.append(el("span", "flag" + (cls ? " " + cls : ""), t)));
    if(it.tip) fTd.append(el("div", "tip", it.tip));
    tr.append(nameTd, qTd, dTd, kTd, fTd);
    tb.append(tr);
  });
}

function renderPack(){
  stopPlay();
  const d = state.data, C = container();
  const items = d.items.filter(it => it.qty > 0);
  const packed = App.packing.pack(items, C);
  steps = App.packing.buildSteps(packed);

  $("banner").hidden = !state.isSample;
  $("store").textContent = d.store;
  $("summary").textContent = d.summary;

  // 統計
  const totalKg = packed.units.reduce((a, u) => a + u.it.kg, 0);
  const maxBag = packed.bags.reduce((a, b) => Math.max(a, b.kg), 0);
  const unit = C.kind === "box" ? "箱" : "袋";
  const st = $("stats"); st.textContent = "";
  const stat = (k, v, u, bad) => { const s = el("div", "stat"); const vv = el("span", "v" + (bad ? " bad" : ""), v); if(u) vv.append(el("small", null, u)); s.append(vv, el("span", "k", k)); st.append(s); };
  stat("商品", String(packed.units.length), "点");
  stat("合計の重さ", fmt(totalKg), "kg");
  stat(nameOf(C), String(packed.bags.length), unit);
  stat("いちばん重い" + unit, fmt(maxBag), "kg", maxBag > C.kg);

  // 3Dの上に出す袋ごとの札
  const bt = $("bagtags"); bt.textContent = "";
  packed.bags.forEach((b, i) => {
    const pct = Math.round(b.top / C.H * 100);
    const over = pct > 100 || b.kg > C.kg;
    bt.append(el("span", "bagtag" + (over ? " over" : ""), `${i + 1}${unit}目 ${fmt(b.kg)}kg・高さ${pct}%${b.group === "chem" ? "・日用品" : ""}`));
  });
  if(C.kind === "bag") bt.append(el("span", "bagtag note", "点線より上は持ち手を結ぶ分"));

  // 手順
  const ol = $("steps"); ol.textContent = "";
  steps.forEach((s, k) => {
    const li = el("li"); const b = el("button", "stepbtn"); b.type = "button";
    const body = el("div");
    body.append(el("h3", null, s.title), el("p", null, s.detail));
    const chips = el("div", "chips"); const seen = new Set();
    packed.units.filter(u => u.rank === s.rank).forEach(u => {
      if(seen.has(u.it.id)) return; seen.add(u.it.id);
      const c = el("span", "chip"); const sw = el("span", "sw"); sw.style.background = packed.colorOf.get(u.it.id);
      c.append(sw, u.it.name + (u.it.qty > 1 ? " ×" + u.it.qty : "")); chips.append(c);
    });
    body.append(chips);
    b.append(el("span", "n", String(k + 1)), body);
    b.onclick = () => { stopPlay(); setStep(k, true); };
    li.append(b); ol.append(li);
  });

  // 注意
  const warns = [...d.warnings];
  if(items.some(i => i.temp !== "room")) warns.push("冷凍・冷蔵品は同じ袋の中で隣どうしに入れると、冷たさが長持ちします。");
  if(items.some(i => i.separate === "raw")) warns.push("肉・魚は、サッカー台のポリ袋に入れてから詰めると汁がもれません。");
  if(maxBag > C.kg) warns.push(`1つの${unit}が目安の${C.kg}kgを超えます。重い物を分けるか、大きい${unit}を選んでください。`);
  $("warnSec").hidden = !warns.length;
  const wl = $("warnList"); wl.textContent = "";
  warns.forEach(w => wl.append(el("li", null, w)));

  App.scene3d.show(packed, steps);
  setStep(steps.length - 1, false);
}

function renderAll(){ renderContainerSeg(); renderTable(); renderPack(); }

async function start(){
  App.scene3d.init($("cv"), $("stage"));
  wirePhotos($("receiptInput"), $("dzReceipt"), "receipts", "receiptThumbs", () => Math.max(1, maxTotal() - 1));
  wirePhotos($("receiptCamera"), $("camReceipt"), "receipts", "receiptThumbs", () => Math.max(1, maxTotal() - 1));
  wirePhotos($("boxInput"), $("dzBox"), "boxPhoto", "boxThumbs", () => 1);
  $("intake").addEventListener("submit", onSubmit);
  $("stopBtn").onclick = () => ctl?.abort();
  wirePlayback();
  renderAll();

  const ai = await App.ai.init();
  // 写真は image-prep.js で必ずJPEGに変換してから送るので、iPhoneのHEICなども選べるよう accept は image/* のままにする
  aiReady = ai.available; imgLimits = ai.imgLimits;
  syncGo();
}

App.ui = { start };
})(window.App = window.App || {});
