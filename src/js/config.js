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

const nameOf = c => c.id === "photo" ? c.label : c.id === "eco" ? "エコバッグ" : c.group + " " + c.label + (c.kind === "box" ? "サイズ" : "");

// 1 重い・立てる物 → 2 箱物 → 3 軽い物 → 4 つぶれやすい物 → 5 日用品は別袋
const STEP_TEXT = {
  1:{ title:"重い物・立てる物を底に", detail:"飲み物や缶詰など重い物を底に並べます。紙パックは立てて角に寄せると倒れません。" },
  2:{ title:"箱やパックで面をそろえる", detail:"箱物・トレーを平らに積んで、上に物を置ける面を作ります。" },
  3:{ title:"軽い物で隙間を埋める", detail:"野菜の袋や軽い物を、空いている隙間に入れます。" },
  4:{ title:"つぶれやすい物を一番上に", detail:"卵・パン・お菓子は最後に、上にそっと置きます。" },
  5:{ title:"日用品は別の袋に", detail:"洗剤などは食品と同じ袋に入れず、別の袋にまとめます。" }
};

App.config = { PALETTE, PRESETS, DEFAULT_CONTAINER, nameOf, STEP_TEXT };
})(window.App = window.App || {});
