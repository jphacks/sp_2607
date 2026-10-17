// 音声での案内（ブラウザ標準の読み上げ機能 speechSynthesis を使う。マイクは使わない）
(function(App){
"use strict";

const synth = window.speechSynthesis;
const supported = !!synth && typeof SpeechSynthesisUtterance !== "undefined";
const PREF_KEY = "fukurozume.voice";
let enabled = true;
try { const v = localStorage.getItem(PREF_KEY); if(v != null) enabled = v === "1"; } catch {}

// 日本語の声を選ぶ（声の一覧はあとから読み込まれることがあるので、毎回探す）
function jaVoice(){
  if(!supported) return null;
  const vs = synth.getVoices();
  return vs.find(v => /^ja(-|_|$)/i.test(v.lang) && v.localService) || vs.find(v => /^ja(-|_|$)/i.test(v.lang)) || null;
}

// 商品名の単位を、読み上げで自然に聞こえる言葉に直す（「1L」→「1リットル」など）
function speakable(text){
  return String(text)
    .replace(/(\d+(?:\.\d+)?)\s*(?:ml|mL|ML|ｍｌ)/g, "$1ミリリットル")
    .replace(/(\d+(?:\.\d+)?)\s*(?:L|ℓ|Ｌ)(?![a-zA-Z])/g, "$1リットル")
    .replace(/(\d+(?:\.\d+)?)\s*kg/gi, "$1キロ")
    .replace(/(\d+(?:\.\d+)?)\s*g(?![a-zA-Z])/g, "$1グラム")
    .replace(/[×xX]\s*(\d+)/g, "$1個")
    .replace(/\s+/g, " ");
}

let speakId = 0;
// 読み終わったら解決する Promise を返す。止めたとき・失敗したときも解決する（再生の流れが止まらないように）
function speak(text){
  if(!supported || !enabled) return Promise.resolve(false);
  synth.cancel();
  const id = ++speakId;
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.lang = "ja-JP"; u.rate = 1.05;
    const v = jaVoice(); if(v) u.voice = v;
    let done = false;
    const finish = ok => { if(done) return; done = true; clearTimeout(guard); resolve(ok && id === speakId); };
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    // 読み終わりの合図が来ないブラウザがあるので、文の長さから見た時間で打ち切る
    const guard = setTimeout(() => finish(true), 2500 + text.length * 220);
    synth.speak(u);
  });
}
function cancel(){ speakId++; if(supported) synth.cancel(); }

function setEnabled(on){
  enabled = !!on;
  try { localStorage.setItem(PREF_KEY, enabled ? "1" : "0"); } catch {}
  if(!enabled) cancel();
}

App.voice = { supported, speak, cancel, setEnabled, enabled: () => supported && enabled };
})(window.App = window.App || {});
