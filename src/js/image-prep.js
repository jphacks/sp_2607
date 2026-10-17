// 送る前に写真を軽くする。画像のトークン数はおよそ「幅×高さ÷750」なので、ピクセル数を減らすほど安くなる。
// レシート：用紙部分だけ切り抜き → 白黒・濃淡補正 → 文字が読める幅（720px）まで縮小
// 袋・箱：寸法を見るだけなので、小さめのカラー画像にする
(function(App){
"use strict";

const RECEIPT_MAX_W = 720, RECEIPT_MAX_PX = 1.0e6, BOX_MAX_PX = 0.3e6, PLATFORM_MAX_PX = 1.2e6;

// kind: "receipt" | "box"
// 戻り値: { blob, tokens, origTokens, bytes, origBytes }
async function prepImage(file, kind){
  const bmp = await createImageBitmap(file, { imageOrientation:"from-image" });
  const W0 = bmp.width, H0 = bmp.height;
  const crop = (kind === "receipt" && findPaper(bmp)) || { x:0, y:0, w:W0, h:H0 };
  const sc = kind === "receipt"
    ? Math.min(1, RECEIPT_MAX_W / crop.w, Math.sqrt(RECEIPT_MAX_PX / (crop.w * crop.h)))
    : Math.min(1, Math.sqrt(BOX_MAX_PX / (crop.w * crop.h)));
  const w = Math.max(1, Math.round(crop.w * sc)), h = Math.max(1, Math.round(crop.h * sc));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d", { willReadFrequently:true });
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  bmp.close?.();
  if(kind === "receipt") grayStretch(g, w, h);
  const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("toBlob")), "image/jpeg", kind === "receipt" ? 0.8 : 0.72));
  return { blob, tokens: Math.ceil(w * h / 750), origTokens: Math.ceil(Math.min(W0 * H0, PLATFORM_MAX_PX) / 750), bytes: blob.size, origBytes: file.size };
}

// 明るい（白い紙の）領域の外枠を探す。見つからない・ほぼ全面なら null（切り抜かない）
function findPaper(bmp){
  const aw = 160, ah = Math.max(1, Math.round(bmp.height * aw / bmp.width));
  const c = document.createElement("canvas"); c.width = aw; c.height = ah;
  const g = c.getContext("2d", { willReadFrequently:true }); g.drawImage(bmp, 0, 0, aw, ah);
  const px = g.getImageData(0, 0, aw, ah).data, n = aw * ah, lum = new Uint8Array(n), hist = new Array(256).fill(0);
  for(let i = 0; i < n; i++){ const v = (px[i*4] * 0.299 + px[i*4+1] * 0.587 + px[i*4+2] * 0.114) | 0; lum[i] = v; hist[v]++; }
  // 大津の二値化でしきい値を決める
  let sum = 0; for(let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, th = 160;
  for(let t = 0; t < 256; t++){
    wB += hist[t]; if(!wB) continue; const wF = n - wB; if(!wF) break;
    sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if(between > best){ best = between; th = t; }
  }
  const colHit = x => { let k = 0; for(let y = 0; y < ah; y++) if(lum[y * aw + x] > th) k++; return k / ah; };
  let x0 = 0, x1 = aw - 1;
  while(x0 < aw && colHit(x0) < 0.3) x0++;
  while(x1 > x0 && colHit(x1) < 0.3) x1--;
  const rowHit = y => { let k = 0; for(let x = x0; x <= x1; x++) if(lum[y * aw + x] > th) k++; return k / (x1 - x0 + 1); };
  let y0 = 0, y1 = ah - 1;
  while(y0 < ah && rowHit(y0) < 0.3) y0++;
  while(y1 > y0 && rowHit(y1) < 0.3) y1--;
  const area = (x1 - x0 + 1) * (y1 - y0 + 1) / n;
  if(x1 <= x0 || y1 <= y0 || area < 0.12 || area > 0.92) return null;
  const s = bmp.width / aw, mx = 0.03 * aw, my = 0.02 * ah;
  const X0 = Math.max(0, (x0 - mx) * s), Y0 = Math.max(0, (y0 - my) * s);
  const X1 = Math.min(bmp.width, (x1 + 1 + mx) * s), Y1 = Math.min(bmp.height, (y1 + 1 + my) * s);
  return { x:X0, y:Y0, w:X1 - X0, h:Y1 - Y0 };
}

// 白黒にして、暗い2%〜明るい2%を0〜255に引き伸ばす（かすれた感熱紙の文字を読みやすくする）
function grayStretch(g, w, h){
  const im = g.getImageData(0, 0, w, h), d = im.data, n = w * h, hist = new Array(256).fill(0), lum = new Uint8Array(n);
  for(let i = 0; i < n; i++){ const v = (d[i*4] * 0.299 + d[i*4+1] * 0.587 + d[i*4+2] * 0.114) | 0; lum[i] = v; hist[v]++; }
  let lo = 0, hi = 255, acc = 0;
  for(; lo < 255; lo++){ acc += hist[lo]; if(acc > n * 0.02) break; }
  acc = 0; for(; hi > 0; hi--){ acc += hist[hi]; if(acc > n * 0.02) break; }
  const span = Math.max(1, hi - lo);
  for(let i = 0; i < n; i++){ const v = Math.max(0, Math.min(255, (lum[i] - lo) * 255 / span)); d[i*4] = d[i*4+1] = d[i*4+2] = v; }
  g.putImageData(im, 0, 0);
}

App.imagePrep = { prepImage };
})(window.App = window.App || {});
