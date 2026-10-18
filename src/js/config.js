// 袋・箱のサイズ、色、詰める手順の文言など「設定値」
(function(App){
"use strict";

// 3Dと一覧で商品を見分けるための色
const PALETTE = ["#E07A3F","#3A7BD5","#2FA38F","#C9A227","#8B6BD1","#D2577A","#5E8C3A","#4A9BB5","#B5653A","#6A7FD9","#C2478F","#7F9A2E"];

// 内寸(cm)と耐荷重(kg)の目安
const PRESETS = [
  { id:"rs",  group:"レジ袋",   label:"小",   kind:"bag", W:22, D:12, H:22, kg:3 },
  { id:"rm",  group:"レジ袋",   label:"中",   kind:"bag", W:28, D:15, H:27, kg:5 },
  { id:"rl",  group:"レジ袋",   label:"大",   kind:"bag", W:34, D:18, H:32, kg:8 },
  { id:"eco", group:"レジ袋",   label:"エコバッグ", kind:"bag", W:38, D:20, H:32, kg:10 },
  { id:"b60", group:"段ボール", label:"60",  kind:"box", W:25, D:18, H:15, kg:10 },
  { id:"b80", group:"段ボール", label:"80",  kind:"box", W:32, D:24, H:22, kg:15 },
  { id:"b100",group:"段ボール", label:"100", kind:"box", W:38, D:30, H:28, kg:20 },
  { id:"b120",group:"段ボール", label:"120", kind:"box", W:45, D:35, H:35, kg:25 }
];
const DEFAULT_CONTAINER = "rl";

const nameOf = c => c.id === "photo" || c.group === "マイバッグ" ? c.label : c.id === "eco" ? "エコバッグ" : c.group + " " + c.label + (c.kind === "box" ? "サイズ" : "");

// 1 重い・立てる物 → 2 箱物 → 3 軽い物 → 4 つぶれやすい物 → 5 日用品
const STEP_TEXT = {
  1:{ title:"重い物・立てる物を底に", detail:"飲み物や缶詰など重い物を底に並べます。紙パックは立てて角に寄せると倒れません。" },
  2:{ title:"箱やパックで面をそろえる", detail:"箱物・トレーを平らに積んで、上に物を置ける面を作ります。" },
  3:{ title:"軽い物で隙間を埋める", detail:"野菜の袋や軽い物を、空いている隙間に入れます。" },
  4:{ title:"つぶれやすい物を一番上に", detail:"卵・パン・お菓子は最後に、上にそっと置きます。この上には重い物を載せません。" },
  5:{ title:"日用品は最後に", detail:"洗剤などは、空いている袋の端に立てて入れます。食品と同じ袋でも、液がこぼれないよう口を上にします。" }
};

// 詰め方の計算（packing.js）の設定
//   anneal:   true なら、すぐ出した詰め方を後ろで焼きなまし法で磨き、良くなったら差し替える。false で磨かない
//   iters:    焼きなましで試す回数。例の12〜26点で試すと、500回と1,500回で結果はほぼ同じだった
//             （500回 ≒ パソコンで0.4〜1.3秒。袋・箱が大きいほど時間がかかる。スマホはその数倍）
//   slackBag: 袋の口から何cmまではみ出してよいか（持ち手を結べる分）。slackBox は段ボール（フタが閉まる必要がある）
//   mixChem:  true なら日用品を食品と同じ袋に入れてもよい（weights.mix の分だけ減点）。false なら必ず別の袋
//   weights:  評価関数の重み。項目の量 × 重み の合計が小さい詰め方ほど良い
const PACKING = {
  anneal: true, iters: 500, slackBag: 5, slackBox: 0, mixChem: true,
  maxItemsPerStep: 2,   // 1つの手順に出す商品の種類（個数は数えない）。3Dを広く見せるため
  weights: {
    bags: 1000,      // 袋の数（個）。袋の数・種類を指定したときは数えない
    left: 1000,      // 袋を指定したとき、入りきらずに余った商品（個）
    overflow: 60,    // はみ出してよい高さを超えた分（cm）
    overweight: 200, // 耐荷重を超えた重さ（kg）
    balance: 20,     // 食品の袋どうしの重さの差（kg）
    cog: 25,         // Σ 重さ × 置いた高さ / 袋の高さ（重い物が上ほど大きい）
    dead: 8,         // 物の下にできた隙間（L）
    support: 40,     // 足元の半分以上が浮いている物（個）
    crush: 300,      // つぶれやすい物に、載せてよい重さを超えて載った分（kg）。置き場所が無いときだけ起こる
    cold: 30,        // 冷凍・冷蔵品が散らばった袋の数 − 1
    raw: 15,         // 肉・魚の下にある食品（個）
    mix: 30          // 食品と同じ袋に入った日用品（個）
  }
};

// 商品の種類。3Dで本物らしい形に描き分けるのに使う（models.js）。color は一覧の色見本にも使う
// コードはAIが返す短い記号（ai.js の指示文にも同じ一覧を書いている）
const KINDS = {
  pk:{ label:"紙パック飲料",       color:"#2F7FD0" },
  pb:{ label:"ペットボトル",       color:"#8CC8E8" },
  gb:{ label:"瓶",                 color:"#4E7F3A" },
  cn:{ label:"缶",                 color:"#A9B2B8" },
  cp:{ label:"カップ",             color:"#E5503B" },
  eg:{ label:"卵",                 color:"#EBD3A8" },
  br:{ label:"パン",               color:"#D59A4E" },
  sn:{ label:"袋菓子",             color:"#D8412F" },
  vg:{ label:"袋入り野菜",         color:"#C78A3B" },
  rv:{ label:"丸い野菜・果物",     color:"#6FA544" },
  lv:{ label:"長い野菜",           color:"#4E9A3A" },
  bn:{ label:"バナナ",             color:"#F2CF3A" },
  mt:{ label:"肉・魚のトレー",     color:"#C9505C" },
  tf:{ label:"豆腐・惣菜パック",   color:"#E9E3D0" },
  kc:{ label:"キムチ・漬物",       color:"#C8402E" },
  fz:{ label:"冷凍食品",           color:"#3D7CC9" },
  bx:{ label:"箱",                 color:"#E07A3F" },
  pc:{ label:"詰め替えパウチ",     color:"#2BA39A" },
  tx:{ label:"ティッシュ・紙製品", color:"#9AA7B0" }
};

App.config = { PALETTE, PRESETS, DEFAULT_CONTAINER, nameOf, STEP_TEXT, PACKING, KINDS };
})(window.App = window.App || {});
