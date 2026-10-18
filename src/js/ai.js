// Claudeへの問い合わせ（レシートの読み取り）
// claude.ai の中では sample 機能を使い、外ではNodeサーバー（server/server.js）経由で Claude Agent SDK を使う。
(function(App){
"use strict";
const { num } = App.util;
const { KINDS } = App.config;
// 指示文に入れる種類の一覧（例 "pk=紙パック飲料 pb=ペットボトル ..."）。config.js の KINDS と必ず同じになる
const KIND_CODES = Object.entries(KINDS).map(([k, v]) => `${k}=${v.label}`).join(" ") + " 当てはまらなければ\"\"";

let sample = null, imgLimits = null;

// 戻り値: { available, imgLimits }  imgLimits は写真を送れないときは null
// claude.ai の中なら sample 機能、外なら同じサーバーの /api/analyze（server/server.js）を使う
async function init(){
  try { sample = window.claude ? await window.claude.use("sample") : null; } catch { sample = null; }
  if(sample){
    const lim = await sample.limits().catch(() => null);
    imgLimits = lim?.images ?? null;
    return { available: true, imgLimits };
  }
  try{
    const r = await fetch("/api/health", { cache: "no-store" });
    if(!r.ok) return { available: false, imgLimits: null };
    const h = await r.json();
    imgLimits = h.limits?.images ?? null;
    return { available: !!h.ok, imgLimits };
  }catch{ return { available: false, imgLimits: null }; }
}

const toBase64 = blob => new Promise((ok, ng) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).split(",")[1] || "");
  fr.onerror = () => ng(fr.error);
  fr.readAsDataURL(blob);
});

async function postAnalyze(body, signal){
  const headers = { "content-type": "application/json" };
  let r;
  try{ r = await fetch("/api/analyze", { method: "POST", headers, body, signal }); }
  catch(e){ throw Object.assign(new Error("network"), { code: e?.name === "AbortError" ? "cancelled" : "network" }); }
  const data = await r.json().catch(() => null);
  if(!r.ok) throw Object.assign(new Error("api"), { code: data?.error?.code || "unknown" });
  return data;
}

function buildPrompt(nR, hasBox){
  // 返答はキー名なしの配列にして、出力トークン（入力の5倍の単価）を減らす
  return `画像${nR}枚はレシート${nR > 1 ? "（分割撮影。重複行は1回だけ数える）" : ""}${hasBox ? "、最後の1枚は詰める袋か箱" : ""}。
商品行ごとに1要素、レシートの上から順に（値引き・袋代・小計・税・支払い行は除く）：
[名前と内容量(略称から推定。例 ｵｲｼｲｷﾞｭｳﾆｭｳ1000→牛乳1L),個数,幅cm,奥行cm,高さcm,1個kg,形,性質,温度,分別,確信,種類,載kg]
形 b=箱・パック c=缶・ボトル・カップ s=袋物・野菜・パン
性質 F=つぶれやすい U=立てないとこぼれる H=傾けず平らに置く(卵・トレー・豆腐) 複数なら並べる(例FH) なければ""
載kg=上に載せても傷まない重さkg(例 ポテチ0.05 パン0.4 卵0.3 豆腐0.5 肉トレー2 硬い野菜・缶・飲料10)
温度 f=冷凍 c=冷蔵 r=常温　分別 r=肉魚 x=洗剤など非食品 ""=なし　確信 1=特定できた 0=推測
種類 ${KIND_CODES}
${hasBox ? "箱袋は内寸[幅,奥行,高さ(袋は持ち手の付け根まで),b=箱/g=袋]をレシート幅58/80mmやサイズ表記を物差しに推定。\n" : ""}JSONのみで返答：
{"m":"詰め方の要点(30字以内)","c":${hasBox ? "[30,15,28,\"g\"]" : "null"},"i":[["卵10個パック",1,26,11,7,0.65,"b","FH","c","",1,"eg",0.3]],"w":["注意(なければ空)"]}
レシートが無ければ i を空にし m に理由。`;
}

// AIの短い配列形式を、アプリ内で使う形に戻す
function normalize(raw){
  const r = raw && typeof raw === "object" ? raw : {};
  const SHAPE = { b:"box", c:"cylinder", s:"soft" }, TEMP = { f:"frozen", c:"chilled", r:"room" }, SEP = { r:"raw", x:"chemical" };
  const items = (Array.isArray(r.i) ? r.i : []).filter(Array.isArray).slice(0, 60).map((a, i) => {
    const [name, qty, w, d, h, kg, shape, flags, temp, sep, conf, kind, cap] = a;
    const f = String(flags ?? "").toUpperCase();
    return {
      id: "i" + i, receipt: "", tip: "",
      name: String(name ?? "商品"),
      qty: Math.round(num(qty, 0, 30, 1)),
      w: num(w, 0.5, 80, 10), d: num(d, 0.5, 80, 10), h: num(h, 0.5, 80, 10),
      kg: num(kg, 0, 30, 0.3),
      shape: SHAPE[shape] || "box",
      fragile: f.includes("F"), upright: f.includes("U"), flat: f.includes("H"),
      cap: num(cap, 0, 30, undefined), // 上に載せられる重さ。返ってこなければ packing.js が形から推定する
      temp: TEMP[temp] || "room",
      separate: SEP[sep] || "none",
      confident: Number(conf) !== 0,
      kind: KINDS[kind] ? kind : ""
    };
  });
  let c = null;
  const rc = r.c;
  if(Array.isArray(rc) && Number(rc[0]) > 0 && Number(rc[1]) > 0 && Number(rc[2]) > 0){
    const box = rc[3] === "b";
    c = { id:"photo", group:"写真", label: box ? "写真の箱" : "写真の袋", kind: box ? "box" : "bag",
          W:num(rc[0], 8, 120, 30), D:num(rc[1], 5, 120, 15), H:num(rc[2], 8, 120, 28), kg: box ? 15 : 8 };
  }
  return { store:"", summary:String(r.m ?? ""), items, container:c,
           warnings:(Array.isArray(r.w) ? r.w : []).map(String).filter(Boolean).slice(0, 6) };
}

// 画像つきで問い合わせ、JSONの返答をそのまま返す（claude.ai なら sample、外ならサーバー経由）
async function ask(prompt, images, signal, onText){
  if(sample) return sample.json(prompt, { images, signal, onText });
  const imgs = await Promise.all(images.map(async b => ({ type: b.type || "image/jpeg", data: await toBase64(b) })));
  return postAnalyze(JSON.stringify({ prompt, images: imgs }), signal);
}

// images: Blob[]（レシート → 袋・箱の順）
async function analyze({ images, nReceipts, hasBox, signal, onText }){
  return normalize(await ask(buildPrompt(nReceipts, hasBox), images, signal, onText));
}

// マイバッグ登録用：袋・箱1つの写真から、内寸と耐荷重の目安を推定する
const BAG_PROMPT = `画像は買い物に使う袋（エコバッグ・レジ袋など）か箱（段ボールなど）1つ。
内寸を推定する。物差しは写っている物を使う（レシートの幅58/80mm、A4用紙21×29.7cm、500mlペットボトルの高さ約21cm、手のひら、段ボールのサイズ表記・印字など）。
袋は 幅=口の横幅、奥行=まち、高さ=底から持ち手の付け根まで。まちが見えなければ幅の半分程度。
JSONのみで返答：
{"n":"名前(例 青いエコバッグ。15字以内)","k":"g(袋)かb(箱)","s":[幅cm,奥行cm,高さcm],"kg":耐荷重の目安kg,"r":"物差しにした物(20字以内。無ければ\\"見た目\\")","c":物差しがあれば1、無ければ0}
袋も箱も写っていなければ "s":null とし、r に理由。`;

// 戻り値: { name, kind:"bag"|"box", W, D, H, kg, ruler, confident }。袋・箱が写っていなければ { none:true, reason }
async function measureBag({ image, signal }){
  const r = await ask(BAG_PROMPT, [image], signal);
  const s = Array.isArray(r?.s) ? r.s.map(Number) : null;
  if(!s || !(s[0] > 0 && s[1] > 0 && s[2] > 0)) return { none: true, reason: String(r?.r ?? "") };
  const box = r.k === "b";
  return {
    name: String(r.n ?? "").slice(0, 20),
    kind: box ? "box" : "bag",
    // 範囲はマイバッグの入力欄と同じ
    W: Math.round(num(s[0], 5, 150, 38)), D: Math.round(num(s[1], 3, 150, 20)), H: Math.round(num(s[2], 5, 150, 32)),
    kg: Math.round(num(r.kg, 1, 50, box ? 15 : 10)),
    ruler: String(r.r ?? "").slice(0, 30),
    confident: Number(r.c) !== 0
  };
}

const ERR = {
  not_granted:"Claudeの利用が許可されなかったため、解析できません。",
  sampling_disabled:"このアカウントではClaudeを利用できません。",
  rate_limited:"混み合っています。少し待ってから、もう一度押してください。",
  image_rejected:"写真を読み込めませんでした。JPEGかPNGの別の写真を選んでください。",
  images_unavailable:"この環境では写真を送れません。",
  invalid_json:"結果をうまく読み取れませんでした。もう一度押してください。",
  refused:"この写真は解析できませんでした。別の写真でお試しください。",
  session_expired:"ログインが切れています。Claudeにログインし直してください。",
  empty_completion:"結果が空でした。レシートの写真を撮り直してお試しください。"
};
const errorMessage = code => ERR[code] || "解析に失敗しました。通信状況を確認して、もう一度押してください。";

App.ai = { init, analyze, measureBag, errorMessage };
})(window.App = window.App || {});
