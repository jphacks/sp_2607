// 共通の小さな道具
(function(App){
"use strict";

const $ = id => document.getElementById(id);

function el(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text != null) e.textContent = text;
  return e;
}

// 小数を桁数そろえて表示（1.0kg など）
const fmt = (v, dg = 1) => (Math.round(v * 10 ** dg) / 10 ** dg).toLocaleString("ja-JP", { maximumFractionDigits:dg, minimumFractionDigits:dg });

// 数値に変換して範囲内に収める。変換できなければ d
function num(v, lo, hi, d){ v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

App.util = { $, el, fmt, num, reduceMotion };
})(window.App = window.App || {});
