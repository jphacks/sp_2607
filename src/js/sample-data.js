// 開いたときに表示する例（スーパーで12点）
(function(App){
"use strict";

App.SAMPLE = {
  store: "サンプル：近所のスーパー",
  summary: "重い飲み物を底に、卵とパンは最後に上へ。洗剤は袋の端に立てて入れます。",
  items: [
    {id:"i1", receipt:"ｱｸｴﾘｱｽ 2L",       name:"スポーツドリンク 2L", qty:1, w:10.5,d:10.5,h:31, kg:2.1, shape:"box",      fragile:false, upright:false, temp:"room",    separate:"none",     confident:true,  tip:"寝かせて底に", cap:10, kind:"pb"},
    {id:"i2", receipt:"ｵｲｼｲｷﾞｭｳﾆｭｳ 1000", name:"牛乳 1L",            qty:1, w:7,   d:7,   h:19.5, kg:1.05, shape:"box",    fragile:false, upright:true,  temp:"chilled", separate:"none",     confident:true,  tip:"立てて角に", cap:2, kind:"pk"},
    {id:"i3", receipt:"ｼｰﾁｷﾝ 3P",          name:"ツナ缶 3缶パック",   qty:1, w:8.5, d:8.5, h:9,   kg:0.25, shape:"cylinder", fragile:false, upright:false, temp:"room",    separate:"none",     confident:true,  tip:"", cap:10, kind:"cn"},
    {id:"i4", receipt:"ﾄﾘﾑﾈﾆｸ",           name:"鶏むね肉 パック",     qty:1, w:20,  d:14,  h:4,   kg:0.35, shape:"box",      fragile:false, upright:false, temp:"chilled", separate:"raw",      confident:true,  tip:"ポリ袋に入れる", cap:2, flat:true, kind:"mt"},
    {id:"i5", receipt:"ﾚｲﾄｳｷﾞｮｳｻﾞ",       name:"冷凍餃子",           qty:1, w:26,  d:17,  h:3,   kg:0.4,  shape:"box",      fragile:false, upright:false, temp:"frozen",  separate:"none",     confident:true,  tip:"冷たい物どうし並べる", cap:3, flat:true, kind:"fz"},
    {id:"i6", receipt:"ﾀﾏﾈｷﾞ 3ｺ",          name:"玉ねぎ 3個入り",     qty:1, w:18,  d:12,  h:9,   kg:0.6,  shape:"soft",     fragile:false, upright:false, temp:"room",    separate:"none",     confident:true,  tip:"", cap:8, kind:"vg"},
    {id:"i7", receipt:"ｶｯﾌﾟﾒﾝ",           name:"カップ麺",           qty:2, w:10,  d:10,  h:11,  kg:0.1,  shape:"cylinder", fragile:false, upright:false, temp:"room",    separate:"none",     confident:false, tip:"", cap:0.3, kind:"cp"},
    {id:"i8", receipt:"ﾊﾞﾅﾅ",              name:"バナナ 1房",          qty:1, w:22,  d:12,  h:8,   kg:0.6,  shape:"soft",     fragile:true,  upright:false, temp:"room",    separate:"none",     confident:true,  tip:"上にそっと", cap:0.3, kind:"bn"},
    {id:"i9", receipt:"ﾀﾏｺﾞ 10ｺ",          name:"卵 10個パック",       qty:1, w:26,  d:11,  h:7,   kg:0.65, shape:"box",      fragile:true,  upright:false, temp:"chilled", separate:"none",     confident:true,  tip:"一番上に平らに", cap:0.3, flat:true, kind:"eg"},
    {id:"i10",receipt:"ｼｮｸﾊﾟﾝ 6ﾏｲ",        name:"食パン 6枚切り",      qty:1, w:19,  d:12,  h:13,  kg:0.4,  shape:"soft",     fragile:true,  upright:false, temp:"room",    separate:"none",     confident:true,  tip:"最後に上へ", cap:0.4, kind:"br"},
    {id:"i11",receipt:"ﾎﾟﾃﾄﾁｯﾌﾟｽ ｳｽｼｵ",    name:"ポテトチップス",      qty:1, w:20,  d:7,   h:27,  kg:0.06, shape:"soft",     fragile:true,  upright:false, temp:"room",    separate:"none",     confident:true,  tip:"", cap:0.05, kind:"sn"},
    {id:"i12",receipt:"ｾﾝﾀｸｾﾝｻﾞｲ ﾂﾒｶｴ",     name:"洗濯洗剤 詰め替え",   qty:1, w:16,  d:7,   h:26,  kg:0.8,  shape:"soft",     fragile:false, upright:false, temp:"room",    separate:"chemical", confident:true,  tip:"口を上にして袋の端へ", cap:3, kind:"pc"}
  ],
  container: null,
  warnings: []
};
})(window.App = window.App || {});
