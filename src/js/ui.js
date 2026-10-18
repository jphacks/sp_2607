// 画面の操作と表示（入力欄、袋の選択、結果の一覧・手順・統計）
(function(App){
"use strict";
const { $, el, fmt, reduceMotion } = App.util;
const { PRESETS, DEFAULT_CONTAINER, nameOf, KINDS } = App.config;

// fixed: 袋の数・種類を決めたときの袋・箱のidの並び（おまかせなら null）
const state = { receipts:[], boxPhoto:[], containerId:DEFAULT_CONTAINER, fixed:null, photoContainer:null, data:App.SAMPLE, isSample:true, step:0 };
let aiReady = false, aiChecking = true, imgLimits = null, ctl = null, steps = [], playTimer = null, lastPacked = null;
// マイバッグ（bag-store.js に保存した袋・箱）を、袋詰めの計算で使う形にする
const fromMyBag = b => ({ id:b.id, group:"マイバッグ", label:b.name, kind:b.kind, W:b.W, D:b.D, H:b.H, kg:b.kg });
const myBags = () => App.bagStore.bags().map(fromMyBag);
// id から袋・箱を探す（写真で測った大きさ・マイバッグ・レジ袋と段ボール）。見つからなければ null
const findContainer = id => (id === "photo" ? state.photoContainer : null) || myBags().find(b => b.id === id) || PRESETS.find(p => p.id === id) || null;
function container(){
  return findContainer(state.containerId) || PRESETS.find(p => p.id === DEFAULT_CONTAINER);
}
// 袋の数・種類を決めているときは、その袋・箱の一覧。おまかせなら null
const MAX_FIXED = 8;
const fixedBags = () => state.fixed ? state.fixed.map(findContainer).filter(Boolean) : null;
function setFixed(list){
  state.fixed = list && list.length ? list.slice(0, MAX_FIXED) : null;
  renderContainerSeg(); renderPack();
}
// 「レジ袋 大×2・エコバッグ」のような短いまとめ
function fixedSummary(F){
  const m = new Map(); for(const C of F) m.set(nameOf(C), (m.get(nameOf(C)) || 0) + 1);
  return [...m].map(([n, c]) => c > 1 ? `${n}×${c}` : n).join("・");
}
function selectContainer(id){
  state.containerId = id;
  renderContainerSeg(); renderPack();
  if(id !== "photo") App.bagStore.setLast(id).catch(() => {});
}

// ---------- 袋・箱の選択 ----------
let armedDelete = "";   // 削除ボタンを1回押して「本当に消す？」の状態になっている袋のid

// 袋・箱の選択肢は2か所に出す：最初の画面の「使うバッグ」と、ふつうの画面の「2 詰める袋・箱」
function renderContainerSeg(){
  fillContainerHost($("containerSeg"), false);
  fillContainerHost($("introBagList"), true);
  const C = container(), F = fixedBags(), now = $("bpNow"); now.textContent = "";
  if(F) now.append(el("b", null, `袋${F.length}つ`), el("span", null, fixedSummary(F)));
  else now.append(el("b", null, nameOf(C)), el("span", null, `${Math.round(C.W)}×${Math.round(C.D)}×${Math.round(C.H)}cm・${C.kg}kgまで`));
}
function setIntroList(open){
  $("introBagList").hidden = !open;
  $("bpToggle").setAttribute("aria-expanded", String(open));
  $("bpToggle").textContent = open ? "閉じる" : "変更する";
}

// inIntro: 最初の画面の一覧なら、選んだら一覧を閉じる
// 袋の数を決めているときは、下の袋・箱を押すたびに、その袋が1つ足される
function fillContainerHost(host, inIntro){
  host.textContent = "";
  const fixed = state.fixed;
  const dims = p => el("small", null, `${Math.round(p.W)}×${Math.round(p.D)}×${Math.round(p.H)}`);
  const choice = p => {
    const b = el("button", null, p.label); b.type = "button";
    b.setAttribute("aria-pressed", String(!fixed && p.id === state.containerId));
    b.append(dims(p));
    const count = fixed ? fixed.filter(id => id === p.id).length : 0;
    if(count) b.append(el("span", "cnt", `×${count}`));
    if(fixed) b.setAttribute("aria-label", `${p.label}を1つ足す（今${count}つ）`);
    b.onclick = () => {
      if(!fixed){ selectContainer(p.id); if(inIntro) setIntroList(false); return; }
      if(fixed.length >= MAX_FIXED){ setStatus(`袋は${MAX_FIXED}つまでです`, true); return; }
      setFixed([...fixed, p.id]);
    };
    return b;
  };
  const group = (title, nodes) => {
    const g = el("div", "seggroup");
    const seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", title);
    seg.append(...nodes);
    g.append(el("span", "sub", title), seg); host.append(g);
  };

  // 袋の数：おまかせ（全部入るまで同じ袋を使う）か、数と種類を決める
  const mode = (label, on, act) => { const b = el("button", null, label); b.type = "button"; b.setAttribute("aria-pressed", String(on)); b.onclick = act; return b; };
  group("袋の数", [
    mode("おまかせ", !fixed, () => { if(fixed) setFixed(null); }),
    mode("数と種類を決める", !!fixed, () => { if(!fixed) setFixed([container().id, container().id]); })
  ]);
  // 決めた袋の一覧。× で外す、＋ で最後の袋をもう1つ。入りきらない物は結果に「余り」として出る
  if(fixed){
    const slots = fixed.map((id, i) => {
      const C = findContainer(id); if(!C) return null;
      const wrap = el("span", "mybag");
      const name = el("span", "slot", `${i + 1}. ${nameOf(C)}`); name.append(dims(C));
      const del = el("button", "del", "×"); del.type = "button"; del.disabled = fixed.length <= 1;
      del.setAttribute("aria-label", `${i + 1}つ目の${nameOf(C)}を外す`);
      del.onclick = () => setFixed(fixed.filter((_, j) => j !== i));
      wrap.append(name, del);
      return wrap;
    }).filter(Boolean);
    const more = el("button", "add", "＋ もう1つ"); more.type = "button"; more.disabled = fixed.length >= MAX_FIXED;
    more.onclick = () => setFixed([...fixed, fixed[fixed.length - 1]]);
    group(`使う袋（${fixed.length}つ）　下の袋・箱を押すと1つ足せます`, [...slots, more]);
  }

  // 写真から測った大きさ（＋そのまま保存するボタン）
  if(state.photoContainer){
    const save = el("button", "add", "＋ マイバッグに保存"); save.type = "button";
    save.onclick = () => openBagForm(state.photoContainer, host);
    group("写真から測った大きさ", [choice(state.photoContainer), save]);
  }

  // マイバッグ（各袋の横に削除ボタン。1回目で赤くなり、2回目で消す）
  const where = { cloud:"このアカウントに保存", local:"この端末に保存", memory:"このページを閉じると消えます" }[App.bagStore.mode()];
  const mine = myBags().map(p => {
    const wrap = el("span", "mybag");
    const del = el("button", "del" + (armedDelete === p.id ? " armed" : ""), armedDelete === p.id ? "削除" : "×"); del.type = "button";
    del.setAttribute("aria-label", `${p.label}を削除`);
    del.onclick = async () => {
      if(armedDelete !== p.id){ armedDelete = p.id; renderContainerSeg(); return; }
      armedDelete = "";
      try{ await App.bagStore.removeBag(p.id); setStatus(`「${p.label}」を削除しました`); }
      catch{ setStatus("削除できませんでした。通信状況を確認して、もう一度お試しください。", true); }
      if(state.fixed?.includes(p.id)){
        const rest = state.fixed.filter(id => id !== p.id);
        state.fixed = rest.length ? rest : [DEFAULT_CONTAINER];
      }
      if(state.containerId === p.id) selectContainer(DEFAULT_CONTAINER); else { renderContainerSeg(); renderPack(); }
    };
    wrap.append(choice(p), del);
    return wrap;
  });
  const add = el("button", "add", "＋ マイバッグを登録"); add.type = "button";
  add.onclick = () => openBagForm(container(), host);
  group(`マイバッグ（${where}）`, [...mine, add]);

  group("レジ袋", PRESETS.filter(p => p.group === "レジ袋").map(choice));
  group("段ボール（3辺合計cm）", PRESETS.filter(p => p.group === "段ボール").map(choice));
}

// ---------- マイバッグの登録フォーム ----------
let bfKind = "bag";
function setBfKind(k){
  bfKind = k;
  $("bfKind").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === k)));
  $("bfHint").textContent = k === "box" ? "箱は内側の寸法を測ってください。" : "袋は、底から持ち手の付け根までの高さを測ってください。";
}
// base: 入力欄の初期値にする袋・箱（写真で測った大きさ、または今選んでいる袋）
// anchor: 登録ボタンがあった一覧。フォームをそのすぐ下に移して開く（最初の画面でも、ふつうの画面でも使える）
function openBagForm(base, anchor){
  if(anchor) anchor.after($("bagForm"));
  $("bfName").value = "";
  $("bfW").value = String(Math.round(base?.W ?? 38));
  $("bfD").value = String(Math.round(base?.D ?? 20));
  $("bfH").value = String(Math.round(base?.H ?? 32));
  $("bfKg").value = String(base?.kg ?? 10);
  setBfKind(base?.kind === "box" ? "box" : "bag");
  $("bfMsg").textContent = ""; $("bfMsg").classList.remove("err");
  $("bagForm").hidden = false;
  $("bfName").focus();
}
function closeBagForm(){ $("bagForm").hidden = true; }
async function saveBagForm(){
  const name = $("bfName").value.trim();
  const v = id => Number($(id).value);
  const [W, D, H, kg] = [v("bfW"), v("bfD"), v("bfH"), v("bfKg")];
  const msg = $("bfMsg");
  const bad = (text, focusId) => { msg.textContent = text; msg.classList.add("err"); $(focusId).focus(); };
  if(!name) return bad("名前を入れてください。", "bfName");
  if(!(W >= 5 && W <= 150)) return bad("幅は5〜150cmで入れてください。", "bfW");
  if(!(D >= 3 && D <= 150)) return bad("奥行きは3〜150cmで入れてください。", "bfD");
  if(!(H >= 5 && H <= 150)) return bad("高さは5〜150cmで入れてください。", "bfH");
  if(!(kg >= 1 && kg <= 50)) return bad("耐荷重は1〜50kgで入れてください。", "bfKg");
  $("bfSave").disabled = true;
  try{
    const saved = await App.bagStore.saveBag({ name, kind:bfKind, W, D, H, kg });
    closeBagForm();
    selectContainer(saved.id);
    setIntroList(false);
    setStatus(`「${saved.name}」をマイバッグに保存しました`);
  }catch{
    msg.textContent = "保存できませんでした。通信状況を確認して、もう一度押してください。"; msg.classList.add("err");
  }finally{
    $("bfSave").disabled = false;
  }
}
function wireBagForm(){
  $("bfKind").addEventListener("click", e => { const b = e.target.closest("button"); if(b) setBfKind(b.dataset.v); });
  $("bfSave").onclick = saveBagForm;
  $("bfCancel").onclick = closeBagForm;
  $("bpToggle").onclick = () => setIntroList($("introBagList").hidden);
  // フォームの中で Enter を押しても、外側の「詰め方を考える」が動かないようにする
  $("bagForm").addEventListener("keydown", e => {
    if(e.key === "Enter" && e.target.tagName === "INPUT"){ e.preventDefault(); saveBagForm(); }
    if(e.key === "Escape"){ e.preventDefault(); closeBagForm(); }
  });
}

// ---------- 写真 ----------
const maxTotal = () => imgLimits?.maxCount ?? 4;
// after: 写真を追加し終えたあとに呼ぶ処理（任意）
function wirePhotos(input, dz, key, thumbs, cap, after){
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
    after?.();
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
  if(!aiReady && aiChecking) setStatus("Claudeに接続しています…");
  else if(!aiReady) setStatus("このページをClaudeの画面で開くと、レシートを解析できます");
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
      setScreen("result");
      setStatus("できました。下の3Dで順番を確認してください");
      requestAnimationFrame(() => $("summary").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block:"start" }));
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
// 再生：音声がオンなら、各手順を読み終わってから次へ進む（3Dの動きと声をそろえる）。オフなら1.6秒ごとに進む
let playToken = 0, playing = false;
const wait = ms => new Promise(r => { playTimer = setTimeout(r, ms); });
function stopPlay(){
  playToken++; playing = false;
  clearTimeout(playTimer); playTimer = null;
  App.voice.cancel();
  $("playBtn").textContent = "最初から再生";
}
async function play(){
  const my = ++playToken; playing = true;
  $("playBtn").textContent = "一時停止";
  for(let k = 0; k < steps.length; k++){
    if(my !== playToken) return;
    setStep(k, true);
    // 最初の読み上げはボタンを押した流れの中で始まる（iPhoneは、押した直後でないと声を出させてくれない）
    if(App.voice.enabled()){ await App.voice.speak(stepSpeech(k)); await wait(350); }
    else await wait(1600);
  }
  if(my !== playToken) return;
  if(App.voice.enabled()) await App.voice.speak(finishSpeech());
  if(my === playToken){ playing = false; $("playBtn").textContent = "最初から再生"; }
}
// 手順を1つ選んだとき（一覧・◀▶）。音声がオンならその手順を読み上げる
function goStep(k, animate){
  stopPlay();
  setStep(k, animate);
  if(App.voice.enabled()) App.voice.speak(stepSpeech(state.step));
}

// 読み上げる文。「手順2。箱やパックで面をそろえる。冷凍餃子、鶏むね肉 パックを入れます。」
// 袋が複数のときは「1つ目の袋に、〜を入れます。2つ目の袋に、〜を入れます。」
function stepSpeech(k){
  const s = steps[k], P = lastPacked;
  if(!s || !P) return "";
  const unit = P.C.kind === "box" ? "箱" : "袋", multi = P.bags.length > 1;
  const byBag = new Map();
  P.placed.filter(p => p.step === k).forEach(p => {
    if(!byBag.has(p.bag)) byBag.set(p.bag, new Map());
    const m = byBag.get(p.bag); m.set(p.name, (m.get(p.name) || 0) + 1);
  });
  const parts = [...byBag.entries()].sort((a, b) => a[0] - b[0]).map(([b, names]) => {
    const list = [...names.entries()].map(([n, c]) => c > 1 ? `${n} ${c}つ` : n).join("、");
    return (multi ? `${b + 1}つ目の${unit}に、` : "") + `${list}を入れます。`;
  });
  return `手順${k + 1}。${s.title}。${parts.join("")}`;
}
function finishSpeech(){
  const P = lastPacked; if(!P) return "";
  const unit = P.C.kind === "box" ? "箱" : "袋", n = P.bags.length, left = P.leftover.length;
  if(left) return `これで完了です。入りきらない物が${left}点あります。`;
  return n > 1 ? `これで完了です。${n}つの${unit}に分けました。` : `これで完了です。全部、1つの${unit}に入りました。`;
}

function syncVoiceBtn(){
  const b = $("voiceBtn");
  b.hidden = !App.voice.supported;
  b.setAttribute("aria-pressed", String(App.voice.enabled()));
  b.setAttribute("aria-label", App.voice.enabled() ? "音声の案内をオフにする" : "音声の案内をオンにする");
}
function wirePlayback(){
  $("playBtn").onclick = () => { if(playing){ stopPlay(); return; } play(); };
  $("prevBtn").onclick = () => goStep(state.step - 1, false);
  $("nextBtn").onclick = () => goStep(state.step + 1, true);
  $("voiceBtn").onclick = () => {
    App.voice.setEnabled(!App.voice.enabled());
    syncVoiceBtn();
    if(App.voice.enabled() && !playing) App.voice.speak("音声で案内します。");
  };
  syncVoiceBtn();
}

// ---------- 結果の表示 ----------
function flagsOf(it){
  const f = [];
  if(it.kg >= 0.7) f.push(["重い", ""]);
  if(it.upright) f.push(["立てる", ""]);
  if(it.fragile) f.push(["つぶれやすい", ""]);
  if(it.flat) f.push(["平らに", ""]);
  if(it.temp === "frozen") f.push(["冷凍", "cold"]);
  if(it.temp === "chilled") f.push(["冷蔵", "cold"]);
  if(it.separate === "raw") f.push(["ポリ袋に", "warn"]);
  if(it.separate === "chemical") f.push(["日用品", "warn"]);
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

// 詰め直す。まず手早く詰めた結果を出し、後ろで焼きなましをして、良い詰め方が見つかったら差し替える（再生中は差し替えない）
let stopImprove = () => {};
function renderPack(){
  stopPlay(); stopImprove();
  const C = container(), F = fixedBags(), items = state.data.items.filter(it => it.qty > 0);
  const packed = App.packing.pack(items, C, F ? { bags: F } : {});
  showPacked(packed, items, C, true);
  stopImprove = App.packing.improve(packed, better => {
    stopImprove = () => {};
    if(better && !playing) showPacked(better, items, C, false);
    else $("searchTag")?.remove();
  });
}

// searching: 「もっと良い詰め方を探しています」の札を出す
function showPacked(packed, items, C, searching){
  const d = state.data;
  lastPacked = packed;
  steps = App.packing.buildSteps(packed);

  $("banner").hidden = !state.isSample;
  $("store").textContent = d.store;
  $("summary").textContent = d.summary;

  // 統計（袋の数・種類を決めたときは、袋ごとに大きさが違うことがある。b.C がその袋の大きさ）
  const left = packed.leftover;
  const totalKg = [...packed.units, ...left].reduce((a, u) => a + u.it.kg, 0);
  const maxBag = packed.bags.reduce((a, b) => Math.max(a, b.kg), 0);
  const overAny = packed.bags.some(b => b.kg > b.C.kg + 1e-6);
  const unit = packed.bags.every(b => b.C.kind === "box") && C.kind === "box" ? "箱" : "袋";
  const st = $("stats"); st.textContent = "";
  const stat = (k, v, u, bad) => { const s = el("div", "stat"); const vv = el("span", "v" + (bad ? " bad" : ""), v); if(u) vv.append(el("small", null, u)); s.append(vv, el("span", "k", k)); st.append(s); };
  stat("商品", String(packed.units.length + left.length), "点");
  stat("合計の重さ", fmt(totalKg), "kg");
  stat(packed.fixed ? "使う袋" : nameOf(C), String(packed.bags.length), unit);
  stat("いちばん重い" + unit, fmt(maxBag), "kg", overAny);
  if(packed.fixed) stat("入りきらない", String(left.length), "点", left.length > 0);

  // 3Dの上に出す袋ごとの札
  const bt = $("bagtags"); bt.textContent = "";
  packed.bags.forEach((b, i) => {
    const pct = Math.round(b.top / b.C.H * 100);
    // 袋は持ち手を結ぶ分（b.slack cm）までならはみ出してよい
    const over = b.top > b.C.H + b.slack + 0.5 || b.kg > b.C.kg;
    const name = packed.fixed ? `${i + 1}. ${nameOf(b.C)}` : `${i + 1}${unit}目`;
    bt.append(el("span", "bagtag" + (over ? " over" : ""), `${name} ${fmt(b.kg)}kg・高さ${pct}%${b.group === "chem" ? "・日用品" : ""}`));
  });
  if(left.length) bt.append(el("span", "bagtag over", `入りきらない ${left.length}点`));
  if(packed.bags.some(b => b.C.kind === "bag")) bt.append(el("span", "bagtag note", "点線より上は持ち手を結ぶ分"));
  if(searching){ const s = el("span", "bagtag note", packed.fixed ? "もっと入る詰め方を探しています…" : "もっと良い詰め方を探しています…"); s.id = "searchTag"; bt.append(s); }

  // 入りきらなかった物（袋の数・種類を決めたとき）
  $("leftSec").hidden = !left.length;
  const ll = $("leftList"); ll.textContent = "";
  const leftCount = new Map(); for(const u of left) leftCount.set(u.it, (leftCount.get(u.it) || 0) + 1);
  for(const [it, n] of leftCount){
    const c = el("span", "chip"); const sw = el("span", "sw"); sw.style.background = packed.colorOf.get(it.id);
    c.append(sw, it.name + (n > 1 ? " ×" + n : "")); ll.append(c);
  }
  const leftKg = left.reduce((a, u) => a + u.it.kg, 0);
  $("leftNote").textContent = left.length ? `${left.length}点・${fmt(leftKg)}kg が入りません。袋を1つ足すか、大きい袋に変えてください。` : "";

  // 手順
  const ol = $("steps"); ol.textContent = "";
  steps.forEach((s, k) => {
    const li = el("li"); const b = el("button", "stepbtn"); b.type = "button";
    const body = el("div");
    body.append(el("h3", null, s.title), el("p", null, s.detail));
    const chips = el("div", "chips"); const seen = new Set();
    packed.units.filter(u => u.step === k).forEach(u => {
      if(seen.has(u.it.id)) return; seen.add(u.it.id);
      const c = el("span", "chip"); const sw = el("span", "sw"); sw.style.background = packed.colorOf.get(u.it.id);
      c.append(sw, u.it.name + (u.it.qty > 1 ? " ×" + u.it.qty : "")); chips.append(c);
    });
    body.append(chips);
    b.append(el("span", "n", String(k + 1)), body);
    b.onclick = () => goStep(k, true);
    li.append(b); ol.append(li);
  });

  // 注意
  const warns = [...d.warnings];
  if(items.some(i => i.temp !== "room")) warns.push("冷凍・冷蔵品は同じ袋の中で隣どうしに入れると、冷たさが長持ちします。");
  if(items.some(i => i.separate === "raw")) warns.push("肉・魚は、サッカー台のポリ袋に入れてから詰めると汁がもれません。");
  if(overAny) warns.push(packed.fixed ? `耐荷重の目安を超える${unit}があります。重い物を分けるか、大きい${unit}を選んでください。`
    : `1つの${unit}が目安の${C.kg}kgを超えます。重い物を分けるか、大きい${unit}を選んでください。`);
  $("warnSec").hidden = !warns.length;
  const wl = $("warnList"); wl.textContent = "";
  warns.forEach(w => wl.append(el("li", null, w)));

  App.scene3d.show(packed, steps);
  setStep(steps.length - 1, false);
}

function renderAll(){ renderContainerSeg(); renderTable(); renderPack(); }

// 画面の段階：「intro」（大きなボタンだけ）→「setup」（レシートの確認と袋・箱の選択）→「result」（結果）
function setScreen(name){
  $("app").classList.toggle("intro", name === "intro");
  $("app").classList.toggle("setup", name === "setup");
}

async function start(){
  // Claudeへの接続は最初に始め、ほかの準備が失敗しても結果を反映する
  // 写真は image-prep.js で必ずJPEGに変換してから送るので、iPhoneのHEICなども選べるよう accept は image/* のままにする
  App.ai.init().then(ai => { aiReady = ai.available; imgLimits = ai.imgLimits; }, () => {})
    .finally(() => { aiChecking = false; syncGo(); });
  try { App.scene3d.init($("cv"), $("stage")); } catch(e) { console.error(e); }
  wirePhotos($("receiptInput"), $("dzReceipt"), "receipts", "receiptThumbs", () => Math.max(1, maxTotal() - 1));
  // 上の大きな「レシートを撮る」ボタンと「写真から選ぶ」。撮ったら最初の画面を抜けて、写真と「詰め方を考える」が見える位置へ
  // 結果の画面にいるとき（撮り直し・追加）は、画面は切り替えずに入力欄まで動かすだけ
  const toIntake = () => {
    if($("app").classList.contains("intro")){ setScreen("setup"); window.scrollTo({ top:0 }); return; }
    $("intake").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block:"start" });
  };
  wirePhotos($("receiptCamera"), $("heroCam"), "receipts", "receiptThumbs", () => Math.max(1, maxTotal() - 1), toIntake);
  wirePhotos($("receiptPick"), $("heroPick"), "receipts", "receiptThumbs", () => Math.max(1, maxTotal() - 1), toIntake);
  const toSample = () => { setScreen("result"); window.scrollTo({ top:0 }); };
  $("skipIntro").onclick = toSample;
  $("homeBtn").onclick = () => { setScreen("intro"); window.scrollTo({ top:0 }); };
  $("showSample").onclick = toSample;
  wirePhotos($("boxInput"), $("dzBox"), "boxPhoto", "boxThumbs", () => 1);
  $("intake").addEventListener("submit", onSubmit);
  $("stopBtn").onclick = () => ctl?.abort();
  wirePlayback();
  wireBagForm();
  renderAll();

  // マイバッグを読み込み、前回選んだ袋・箱があればそれを選ぶ。別の端末で変わったときも描き直す
  App.bagStore.onChange(() => {
    if(state.containerId !== "photo" && !PRESETS.some(p => p.id === state.containerId) && !App.bagStore.bags().some(b => b.id === state.containerId)){
      state.containerId = DEFAULT_CONTAINER; renderPack();
    }
    renderContainerSeg();
  });
  App.bagStore.init().then(() => {
    const last = App.bagStore.last();
    if(last && last !== state.containerId && (PRESETS.some(p => p.id === last) || App.bagStore.bags().some(b => b.id === last))){
      state.containerId = last; renderContainerSeg(); renderPack();
    }
  });
}

App.ui = { start };
})(window.App = window.App || {});
