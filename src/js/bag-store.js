// マイバッグ（自分で登録した袋・箱）の保存
// - claude.ai で開いたとき：アカウントの本人専用の保存場所（db の data/users/<自分のid>/bags）。スマホとPCで共有される
// - それ以外（手元のファイル・GitHub Pages など）：この端末のブラウザ（localStorage）
// - どちらも使えないとき：ページを閉じるまでだけ覚えておく
(function(App){
"use strict";

const LOCAL_KEY = "fukurozume.mybags";
const MAX_BAGS = 12;
let mode = "memory";              // "cloud" | "local" | "memory"
let ref = null;                   // cloud のときの保存先ドキュメント
let data = { bags:[], last:"" };  // bags: [{ id, name, kind:"bag"|"box", W, D, H, kg }]、last: 最後に選んだ袋・箱のid
let writing = Promise.resolve();
const listeners = [];

const num = (v, lo, hi, d) => App.util.num(v, lo, hi, d);
function clean(raw){
  const r = raw && typeof raw === "object" ? raw : {};
  const bags = (Array.isArray(r.bags) ? r.bags : []).slice(0, MAX_BAGS).filter(b => b && typeof b.id === "string").map(b => ({
    id: b.id, name: String(b.name || "マイバッグ").slice(0, 20), kind: b.kind === "box" ? "box" : "bag",
    W: num(b.W, 5, 150, 35), D: num(b.D, 3, 150, 18), H: num(b.H, 5, 150, 30), kg: num(b.kg, 1, 50, 10)
  }));
  return { bags, last: typeof r.last === "string" ? r.last : "" };
}
function emit(){ for(const f of listeners) f(); }

function readLocal(){ try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch { return null; } }
function localWorks(){ try { localStorage.setItem(LOCAL_KEY + ".t", "1"); localStorage.removeItem(LOCAL_KEY + ".t"); return true; } catch { return false; } }

async function init(){
  try{
    if(window.claude){
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      const uid = user ? await user.id() : null;
      if(db && uid){
        ref = db.doc("data/users/" + uid + "/bags");
        const snap = await ref.get();
        if(snap.exists) data = clean(snap.data());
        mode = "cloud";
        // 別の端末で登録・削除したときも、この画面に反映する
        ref.onSnapshot(s => { if(s.exists && !s.metadata.hasPendingWrites){ data = clean(s.data()); emit(); } }, () => {});
      }
    }
  }catch{ ref = null; mode = "memory"; }
  if(mode !== "cloud" && localWorks()){ mode = "local"; data = clean(readLocal()); }
  emit();
  return mode;
}

// 書き込みは1つずつ順番に（同じドキュメントへの同時書き込みを避ける）
function persist(){
  const body = { bags: data.bags.map(b => ({ ...b })), last: data.last };
  if(mode === "cloud"){
    const p = writing.then(() => ref.set(body));
    writing = p.catch(() => {});
    return p;
  }
  if(mode === "local"){ try { localStorage.setItem(LOCAL_KEY, JSON.stringify(body)); } catch {} }
  return Promise.resolve();
}

const newId = () => "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// 戻り値: 保存した袋（id付き）。上限を超えるときは古いものから消す
async function saveBag(bag){
  const b = clean({ bags:[{ ...bag, id: bag.id || newId() }] }).bags[0];
  const rest = data.bags.filter(x => x.id !== b.id);
  data = { bags: [b, ...rest].slice(0, MAX_BAGS), last: b.id };
  emit();
  await persist();
  return b;
}
async function removeBag(id){
  data = { bags: data.bags.filter(b => b.id !== id), last: data.last === id ? "" : data.last };
  emit();
  await persist();
}
async function setLast(id){
  if(data.last === id) return;
  data = { bags: data.bags.map(b => ({ ...b })), last: id };
  await persist();
}

App.bagStore = {
  init, saveBag, removeBag, setLast,
  bags: () => data.bags, last: () => data.last, mode: () => mode,
  onChange: f => { listeners.push(f); }
};
})(window.App = window.App || {});
