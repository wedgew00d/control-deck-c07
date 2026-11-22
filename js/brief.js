// CONTROL DECK C-07 — ブリーフィング／端末メニュー
// 台本（文章、選択肢、図の指定）を1つ持ち、同じ絵を二通りに出す。
//   screen：全画面の 2D 画面（私室の机の端末）
//   holo  ：同じ canvas をテクスチャにして、デッキの空間にパネルとして浮かべる
// 絵は3層の canvas に分けて描く。B＝背景（起動画面、枠線）、P＝パネル、O＝字幕と選択肢（常に画面に直接出す）
import * as THREE from 'three';

const FE = '"Saira Condensed","Arial Narrow","Helvetica Neue",sans-serif';
const FJ = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic",sans-serif';
const INK = '#d3dcea', DIM = 'rgba(160,176,200,.6)', FAINT = 'rgba(150,170,200,.22)', FILL = 'rgba(30,44,70,.5)', ACC = '#f4d41f', RED = '#e2493d', PAPER = '#dfe6ee', PINK = '#1b2433';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), ease = t => { t = clamp(t); return 1 - Math.pow(1 - t, 3); }, TAU = Math.PI * 2;
const ty = (s, t, rate = 34) => t <= 0 ? '' : s.slice(0, Math.floor(t * rate));
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// 字間を空けた文字（欧文の見出し用）。戻り値は幅
function sp(c, s, x, y, px, tr = 0, al = 'left', wt = 600, font = FE) {
  c.font = `${wt} ${px}px ${font}`;
  if (!tr) { c.textAlign = al; c.fillText(s, x, y); const w = c.measureText(s).width; c.textAlign = 'left'; return w; }
  const ch = [...s], ws = ch.map(k => c.measureText(k).width + tr); let w = ws.reduce((a, b) => a + b, 0) - tr; if (!ch.length) return 0;
  let cx = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x; c.textAlign = 'left'; ch.forEach((k, i) => { c.fillText(k, cx, y); cx += ws[i]; }); return w;
}
function ln(c, x0, y0, x1, y1, p = 1) { p = clamp(p); if (p <= 0) return; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); c.stroke(); }
function box(c, x, y, w, h, p = 1) { p = clamp(p) * 2; ln(c, x, y, x + w, y, p); ln(c, x, y, x, y + h, p); ln(c, x + w, y, x + w, y + h, p - 1); ln(c, x, y + h, x + w, y + h, p - 1); }
function corners(c, x, y, w, h, s = 14) { for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { c.beginPath(); c.moveTo(px + s * sx, py); c.lineTo(px, py); c.lineTo(px, py + s * sy); c.stroke(); } }
function greek(c, x, y, w, rows, seed, a = .3) { c.fillStyle = `rgba(160,176,200,${a})`; for (let i = 0; i < rows; i++) { let cx = x; for (let k = 0; cx < x + w * (.6 + .4 * hash(seed + i)); k++) { const l = 8 + hash(seed + i * 9 + k) * 44; c.fillRect(cx, y + i * 9, l, 3); cx += l + 6; } } }

// ---- 話者の紋章（すべて自前の図形）
function emblem(c, id, x, y, r) {
  c.save(); c.translate(x, y); c.lineWidth = Math.max(1.5, r * .06); c.strokeStyle = INK; c.fillStyle = INK;
  if (id === 'NOC') {                          // 三日月と、縦の一線
    c.beginPath(); c.arc(0, 0, r, .5, TAU - .5); c.stroke(); c.beginPath(); c.arc(r * .34, 0, r * .74, .95, TAU - .95); c.stroke();
    c.fillRect(-r * .03, -r * 1.2, r * .06, r * 2.4); c.beginPath(); c.moveTo(0, r * .1); c.lineTo(r * .14, r * .3); c.lineTo(0, r * .5); c.lineTo(-r * .14, r * .3); c.fill();
  } else if (id === 'YOU') {                   // 下向きの山形を3段
    for (let i = 0; i < 3; i++) { const yy = -r * .7 + i * r * .5, w = r * (1 - i * .22); c.beginPath(); c.moveTo(-w, yy); c.lineTo(0, yy + r * .5); c.lineTo(w, yy); c.stroke(); }
    c.fillRect(-r, -r * 1.02, r * 2, r * .08);
  } else if (id === 'UNK') {                   // 破線の輪
    c.setLineDash([r * .16, r * .12]); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(0, 0, r * .55, 0, TAU); c.stroke();
    c.font = `700 ${r * .9}px ${FE}`; c.textAlign = 'center'; c.fillText('?', 0, r * .32); c.textAlign = 'left';
  } else {                                     // SYS：四角と十字
    c.strokeRect(-r * .8, -r * .8, r * 1.6, r * 1.6); c.fillRect(-r * .45, -r * .04, r * .9, r * .08); c.fillRect(-r * .04, -r * .45, r * .08, r * .9); corners(c, -r, -r, r * 2, r * 2, r * .3);
  }
  c.restore();
}
const WHO = { SYS: { jp: 'メインシステム', en: 'MAIN SYSTEM' }, UNK: { jp: '？？？', en: 'UNKNOWN' }, NOC: { jp: 'ノクターン', en: 'NOCTURNE' }, YOU: { jp: 'R-0417', en: 'R-0417' } };

// ---- 中央のパネルに出す図。座標は 1000 × 600 の仮想座標。t はその図が出てからの秒
const SLIDES = {
  request(c, t) {
    c.strokeStyle = DIM; c.lineWidth = 1.5; ln(c, 80, 48, 920, 48, ease(t * 2)); ln(c, 80, 552, 920, 552, ease(t * 2)); c.fillStyle = INK; sp(c, ty('INCOMING REQUEST', t, 30), 500, 104, 38, 11, 'center');
    c.lineWidth = 2; c.strokeStyle = 'rgba(200,214,236,.75)'; box(c, 110, 176, 240, 240, ease((t - .3) * 2)); if (t > .7) { c.globalAlpha = clamp((t - .7) * 3); emblem(c, 'UNK', 230, 296, 80); c.globalAlpha = 1; }
    if (t > .5) { c.fillStyle = INK; c.fillRect(396, 180, 15, 15); sp(c, 'CLIENT', 424, 195, 22, 6); } c.strokeStyle = DIM; c.lineWidth = 1.5; box(c, 396, 216, 500, 92, ease((t - .6) * 2));
    c.fillStyle = INK; sp(c, ty('UNREGISTERED', t - .9, 26), 416, 262, 34, 5); c.fillStyle = DIM; sp(c, ty('匿名回線 ／ 発信元秘匿', t - 1.2, 26), 418, 292, 18, 2, 'left', 500, FJ);
    [['ROUTE', '7 RELAYS — ORIGIN MASKED'], ['PRIORITY', 'PERSONAL'], ['ADDRESSEE', 'R-0417  〈退役登録〉'], ['CIPHER', 'VERIFIED']].forEach(([k, v], i) => { const a = clamp((t - 1.4 - i * .14) * 4); if (a <= 0) return; c.globalAlpha = a; c.fillStyle = DIM; sp(c, k, 398, 350 + i * 30, 16, 3); c.fillStyle = INK; sp(c, v, 540, 350 + i * 30, 17, 2, 'left', 500, i === 2 ? FJ : FE); c.globalAlpha = 1; });
    if (t > 1.9) { greek(c, 110, 470, 780, 5, 3, .22 * clamp((t - 1.9) * 2)); }
  },
  operator(c, t, T) {
    c.fillStyle = INK; c.fillRect(70, 62, 12, 12); sp(c, ty('OPERATOR DATA', t, 30), 94, 76, 24, 7); c.strokeStyle = DIM; c.lineWidth = 1.5; ln(c, 70, 96, 930, 96, ease(t * 2));
    // 声の波形（輪）。映像の代わりに、これだけが動く
    const cx = 270, cy = 330, R = 120, a0 = clamp((t - .3) * 2); c.strokeStyle = `rgba(200,214,236,${.7 * a0})`; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R * ease((t - .2) * 1.5), 0, TAU); c.stroke(); c.beginPath(); c.arc(cx, cy, R * 1.5, -.4, .9); c.stroke(); c.beginPath(); c.arc(cx, cy, R * 1.5, 2.6, 3.9); c.stroke();
    c.lineWidth = 3; for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, v = (.12 + .88 * T.voice) * (.25 + .75 * Math.abs(Math.sin(T.time * (5 + hash(i) * 9) + i * 1.7) * Math.sin(T.time * 2.3 + i * .4))), l = 8 + v * 62; c.strokeStyle = `rgba(211,220,234,${(.35 + .65 * v) * a0})`; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8)); c.lineTo(cx + Math.cos(a) * (R + 8 + l), cy + Math.sin(a) * (R + 8 + l)); c.stroke(); }
    if (t > .6) { c.globalAlpha = clamp((t - .6) * 3); emblem(c, 'NOC', cx, cy, 56); c.fillStyle = DIM; sp(c, 'VOICE ONLY', cx, cy + 232, 17, 6, 'center'); c.globalAlpha = 1; }
    [['CALLSIGN', 'NOCTURNE', 0], ['ROLE', 'OPERATOR ／ 専属', 0], ['AFFILIATION', '', 150], ['RECORD', '', 96], ['VISUAL FEED', 'DISABLED BY SENDER', 0], ['体格データ', '規格外  〈閲覧権限なし〉', 0]].forEach(([k, v, red], i) => {
      const a = clamp((t - .8 - i * .16) * 4); if (a <= 0) return; const y = 176 + i * 58; c.globalAlpha = a; c.fillStyle = DIM; sp(c, k, 520, y, 15, 3, 'left', 600, i === 5 ? FJ : FE); c.strokeStyle = FAINT; c.lineWidth = 1; ln(c, 520, y + 34, 920, y + 34);
      c.fillStyle = i === 4 ? ACC : INK; if (red) { c.fillRect(520, y + 10, red * ease((t - 1 - i * .16) * 2), 16); c.fillStyle = DIM; sp(c, i === 3 ? 'MISSIONS  ／  LOSS 0' : 'REDACTED', 532 + red, y + 25, 16, 2); } else sp(c, ty(v, t - .9 - i * .16, 30), 520, y + 26, i ? 20 : 30, i ? 2 : 6, 'left', 600, /[^\x00-\x7f]/.test(v) ? FJ : FE); c.globalAlpha = 1;
    });
  },
  map(c, t, T) {
    c.fillStyle = INK; sp(c, ty('TRANSFER PLAN', t, 30), 60, 62, 22, 7); c.fillStyle = DIM; sp(c, 'RING SEGMENT C  →  KESTREL-9', 60, 86, 15, 3);
    c.strokeStyle = FAINT; c.lineWidth = 1; for (let x = 100; x < 1000; x += 100) ln(c, x, 110, x, 560, ease(t * 2 - x / 900)); for (let y = 160; y < 560; y += 80) ln(c, 40, y, 960, y, ease(t * 2 - y / 600));
    // 惑星の縁と、高度の弧
    const px = -40, py = 1010, pr = 640, a = ease((t - .2) * 1.2); const g = c.createRadialGradient(px, py, pr - 6, px, py, pr + 70); g.addColorStop(0, `rgba(120,170,255,${.4 * a})`); g.addColorStop(1, 'rgba(120,170,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(px, py, pr + 70, 0, TAU); c.fill();
    c.fillStyle = 'rgba(8,12,22,.9)'; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); c.strokeStyle = `rgba(200,214,236,${.8 * a})`; c.lineWidth = 2; c.beginPath(); c.arc(px, py, pr, -1.5, -1.5 + 1.2 * a); c.stroke();
    c.setLineDash([3, 7]); c.lineWidth = 1; c.strokeStyle = DIM; for (const r of [720, 800]) { c.beginPath(); c.arc(px, py, r, -1.5, -1.5 + 1.25 * a); c.stroke(); } c.setLineDash([]);
    // 現在地と目標
    const A = [270, 372], B = [770, 196], C = [470, 150], k = ease((t - .9) * .8), q = u => [(1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * C[0] + u * u * B[0], (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * C[1] + u * u * B[1]];
    if (t > .5) { c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(A[0], A[1], 9, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(A[0], A[1], 22, 8, -.3, 0, TAU); c.stroke(); c.fillStyle = INK; sp(c, 'RING / C-07', A[0] - 20, A[1] + 44, 16, 3); c.fillStyle = DIM; sp(c, '現在地', A[0] - 20, A[1] + 64, 14, 2, 'left', 500, FJ); }
    c.setLineDash([10, 8]); c.strokeStyle = ACC; c.lineWidth = 2; c.beginPath(); for (let i = 0; i <= 40 * k; i++) { const p = q(i / 40); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke(); c.setLineDash([]);
    if (k > 0 && k < 1) { const p = q(k); c.fillStyle = ACC; c.beginPath(); c.arc(p[0], p[1], 5, 0, TAU); c.fill(); }
    if (t > 1.6) { const b = clamp((t - 1.6) * 2), pu = (T.time * .8) % 1; c.strokeStyle = RED; c.lineWidth = 2; c.strokeRect(B[0] - 13, B[1] - 13, 26, 26); c.globalAlpha = (1 - pu) * b; c.beginPath(); c.arc(B[0], B[1], 16 + pu * 50, 0, TAU); c.stroke(); c.globalAlpha = b; c.lineWidth = 1; c.strokeStyle = 'rgba(226,73,61,.5)'; c.beginPath(); c.arc(B[0], B[1], 92, 0, TAU); c.stroke();
      c.fillStyle = INK; sp(c, 'KESTREL-9', B[0] + 28, B[1] - 6, 22, 4); c.fillStyle = DIM; sp(c, '採掘プラットフォーム ／ 放棄', B[0] + 28, B[1] + 16, 14, 2, 'left', 500, FJ); c.globalAlpha = 1; }
    if (t > 2) { c.globalAlpha = clamp((t - 2) * 3); c.strokeStyle = DIM; c.lineWidth = 1.5; box(c, 660, 420, 280, 116); [['ΔV', '412 m/s'], ['ETA', '06:40:00'], ['WINDOW', 'OPEN — 02:15']].forEach(([a2, b2], i) => { c.fillStyle = DIM; sp(c, a2, 680, 452 + i * 30, 15, 3); c.fillStyle = i === 2 ? ACC : INK; sp(c, b2, 780, 452 + i * 30, 19, 2); }); c.globalAlpha = 1; }
  },
  target(c, t) {                                   // 明るい紙の上の図面
    c.fillStyle = PAPER; c.globalAlpha = .93 * ease(t * 3); c.fillRect(0, 0, 1000, 600); c.globalAlpha = 1; c.strokeStyle = 'rgba(27,36,51,.1)'; c.lineWidth = 1; for (let x = 0; x < 1000; x += 25) ln(c, x, 0, x, 600); for (let y = 0; y < 600; y += 25) ln(c, 0, y, 1000, y);
    c.fillStyle = PINK; sp(c, ty('KESTREL-9 ／ STRUCTURE', t - .1, 30), 46, 60, 22, 5, 'left', 700); c.fillStyle = 'rgba(27,36,51,.6)'; sp(c, 'SECTION A-A  ·  NOT TO SCALE', 46, 84, 14, 3);
    c.strokeStyle = PINK; c.lineWidth = 2.5; const P = (i, n = .12) => ease((t - .3 - i * n) * 2.2);
    box(c, 380, 230, 240, 150, P(0)); box(c, 420, 190, 160, 40, P(1)); ln(c, 380, 305, 150, 305, P(2)); ln(c, 620, 305, 860, 305, P(2)); c.lineWidth = 1.5; for (let i = 0; i < 9; i++) { const x = 160 + i * 25, x2 = 630 + i * 25; ln(c, x, 290, x + 25, 320, P(3)); ln(c, x, 320, x + 25, 290, P(3)); ln(c, x2, 290, x2 + 25, 320, P(3)); ln(c, x2, 320, x2 + 25, 290, P(3)); } ln(c, 150, 290, 380, 290, P(3)); ln(c, 150, 320, 380, 320, P(3)); ln(c, 620, 290, 860, 290, P(3)); ln(c, 620, 320, 860, 320, P(3));
    c.lineWidth = 2.5; for (const [x, y, r] of [[150, 305, 46], [860, 305, 46], [500, 440, 42]]) { c.beginPath(); c.arc(x, y, r, 0, TAU * P(4)); c.stroke(); c.lineWidth = 1; c.beginPath(); c.arc(x, y, r * .6, 0, TAU * P(5)); c.stroke(); c.lineWidth = 2.5; } ln(c, 500, 380, 500, 398, P(4));
    c.beginPath(); c.arc(500, 150, 60, Math.PI * 1.15, Math.PI * (1.15 + .7 * P(5))); c.stroke(); ln(c, 500, 190, 500, 150, P(5)); c.lineWidth = 1; for (let i = 0; i < 5; i++) box(c, 392 + i * 45, 244, 36, 50, P(6)); for (let i = 0; i < 3; i++) box(c, 392 + i * 76, 310, 66, 56, P(6));
    if (t > 1.5) { const a = clamp((t - 1.5) * 3); c.globalAlpha = a; c.fillStyle = 'rgba(226,73,61,.32)'; c.fillRect(544, 310, 66, 56); c.strokeStyle = RED; c.lineWidth = 2.5; c.strokeRect(544, 310, 66, 56); ln(c, 610, 366, 700, 452, ease((t - 1.6) * 3)); ln(c, 700, 452, 930, 452, ease((t - 1.8) * 3)); c.fillStyle = RED; sp(c, 'VAULT 3', 706, 440, 22, 4, 'left', 700); c.fillStyle = PINK; sp(c, '試料 12-B', 706, 480, 20, 2, 'left', 700, FJ); c.fillStyle = 'rgba(27,36,51,.6)'; sp(c, 'CRYO HOLD  ·  SEALED', 706, 502, 13, 3); c.globalAlpha = 1; }
    if (t > 1) { c.fillStyle = 'rgba(27,36,51,.6)'; sp(c, 'DOCK 01', 110, 376, 13, 3); sp(c, 'DOCK 02', 820, 376, 13, 3); sp(c, 'REACTOR', 466, 506, 13, 3); sp(c, 'COMM', 574, 128, 13, 3); c.strokeStyle = 'rgba(27,36,51,.5)'; c.lineWidth = 1; ln(c, 150, 540, 860, 540); ln(c, 150, 532, 150, 548); ln(c, 860, 532, 860, 548); sp(c, '184 m', 505, 562, 14, 3, 'center'); }
  },
  threat(c, t, T) {
    c.fillStyle = 'rgba(70,10,8,.34)'; c.globalAlpha = ease(t * 3); c.fillRect(0, 0, 1000, 600); c.globalAlpha = 1; c.fillStyle = RED; c.fillRect(60, 48, 12, 12); sp(c, ty('HOSTILE ESTIMATE', t, 30), 84, 62, 24, 7); c.strokeStyle = 'rgba(226,73,61,.6)'; c.lineWidth = 1.5; ln(c, 60, 84, 940, 84, ease(t * 2));
    c.fillStyle = INK; sp(c, 'HALCYON 保安部', 60, 132, 26, 3, 'left', 700, FJ); c.fillStyle = DIM; sp(c, 'CORPORATE SECURITY  ·  KESTREL DETACHMENT', 60, 158, 14, 3);
    for (let i = 0; i < 12; i++) { const a = clamp((t - .5 - i * .07) * 6); if (a <= 0) continue; const x = 86 + (i % 6) * 84, y = 226 + Math.floor(i / 6) * 96; c.globalAlpha = a; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x + 24, y + 20); c.lineTo(x - 24, y + 20); c.closePath(); c.stroke(); c.fillStyle = INK; c.fillRect(x - 3, y, 6, 6); c.fillStyle = DIM; sp(c, 'SD-' + String(i + 1).padStart(2, '0'), x, y + 42, 12, 2, 'center'); c.globalAlpha = 1; }
    for (let i = 0; i < 2; i++) { const a = clamp((t - 1.5 - i * .15) * 5); if (a <= 0) continue; const x = 680 + i * 150, y = 270, bl = .6 + .4 * Math.sin(T.time * 6); c.globalAlpha = a; c.strokeStyle = RED; c.lineWidth = 2.5; c.strokeRect(x - 44, y - 54, 88, 108); c.beginPath(); c.moveTo(x, y - 34); c.lineTo(x + 26, y - 4); c.lineTo(x + 14, y + 34); c.lineTo(x - 14, y + 34); c.lineTo(x - 26, y - 4); c.closePath(); c.stroke(); c.fillStyle = `rgba(226,73,61,${bl})`; c.fillRect(x - 5, y - 8, 10, 10); c.fillStyle = RED; sp(c, 'MANNED', x, y + 76, 14, 4, 'center', 700); c.globalAlpha = 1; }
    if (t > 1.9) { c.globalAlpha = clamp((t - 1.9) * 3); [['自律警備機', '× 12', INK], ['有人機', '× 2', RED], ['増援の到着', '18 分', INK]].forEach(([k, v, col], i) => { c.fillStyle = DIM; sp(c, k, 60 + i * 300, 470, 16, 2, 'left', 500, FJ); c.fillStyle = col; sp(c, v, 60 + i * 300, 518, 44, 2, 'left', 700, i === 2 ? FJ : FE); }); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(226,73,61,.5)'; for (let x = -40; x < 1000; x += 34) { c.beginPath(); c.moveTo(x, 590); c.lineTo(x + 14, 590); c.lineTo(x + 28, 572); c.lineTo(x + 14, 572); c.fill(); }
  },
  reward(c, t) {
    c.fillStyle = INK; c.fillRect(60, 48, 12, 12); sp(c, ty('CONTRACT TERMS', t, 30), 84, 62, 24, 7); c.strokeStyle = DIM; c.lineWidth = 1.5; ln(c, 60, 84, 940, 84, ease(t * 2));
    c.fillStyle = DIM; sp(c, 'REWARD', 60, 150, 18, 6); const n = Math.floor(480000 * ease((t - .3) / 1.3)); c.fillStyle = ACC; const w = sp(c, n.toLocaleString('en-US'), 60, 262, 124, 4, 'left', 700); c.fillStyle = INK; sp(c, 'Cr', 80 + w, 262, 46, 4); c.strokeStyle = ACC; c.lineWidth = 3; ln(c, 60, 288, 60 + 620 * ease((t - .3) / 1.3), 288);
    [['前金', '30%  ―  受諾と同時に送金'], ['経費', '依頼主が負担'], ['回収物', '試料 12-B は依頼主へ'], ['追加条項', '帰還後、直接会って話すこと']].forEach(([k, v], i) => { const a = clamp((t - 1.5 - i * .18) * 4); if (a <= 0) return; const y = 352 + i * 48; c.globalAlpha = a; c.fillStyle = DIM; sp(c, k, 60, y, 18, 3, 'left', 500, FJ); c.fillStyle = i === 3 ? ACC : INK; sp(c, v, 220, y, 22, 2, 'left', 500, FJ); c.strokeStyle = FAINT; c.lineWidth = 1; ln(c, 60, y + 16, 940, y + 16); c.globalAlpha = 1; });
  },
  decide(c, t, T) {
    const pu = .5 + .5 * Math.sin(T.time * 3); c.strokeStyle = `rgba(211,220,234,${.35 + .4 * pu})`; c.lineWidth = 2; corners(c, 200 - pu * 10, 150 - pu * 6, 600 + pu * 20, 300 + pu * 12, 40); c.fillStyle = INK; sp(c, ty('AWAITING RESPONSE', t, 26), 500, 290, 40, 11, 'center'); c.fillStyle = DIM; sp(c, '回答を待機中', 500, 334, 18, 8, 'center', 500, FJ);
    for (let i = 0; i < 24; i++) { c.fillStyle = `rgba(244,212,31,${(i / 24 < (T.time * .4) % 1) ? .9 : .18})`; c.fillRect(320 + i * 15, 380, 10, 4); }
  },
  menu(c, t) {
    c.fillStyle = INK; c.fillRect(60, 48, 12, 12); sp(c, ty('PERSONAL TERMINAL', t, 40), 84, 62, 24, 7); c.fillStyle = DIM; sp(c, 'C-08-D  ·  OCCUPANT 01  ·  R-0417', 84, 88, 14, 3); c.strokeStyle = DIM; c.lineWidth = 1.5; ln(c, 60, 108, 940, 108, ease(t * 3));
    const d = new Date(), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); c.fillStyle = INK; sp(c, hh, 60, 270, 150, 4, 'left', 700); c.fillStyle = DIM; sp(c, 'LOCAL  ·  CYCLE 0412', 64, 306, 16, 4);
    [['MESSAGE', '1 件 ― 匿名回線', ACC], ['LINK PAD', 'STANDBY', INK], ['CABIN', '22.4°C ／ O2 21.0%', INK], ['WATER', '84%', INK]].forEach(([k, v, col], i) => { const a = clamp((t - .2 - i * .08) * 5); c.globalAlpha = a; const y = 380 + i * 44; c.fillStyle = col; c.fillRect(60, y - 12, 10, 10); c.fillStyle = DIM; sp(c, k, 84, y, 16, 3); c.fillStyle = col; sp(c, v, 250, y, 20, 2, 'left', 500, FJ); c.globalAlpha = 1; });
    c.strokeStyle = FAINT; c.lineWidth = 1; box(c, 560, 150, 380, 400, ease(t * 2)); for (let i = 0; i < 16; i++) { const bh = 30 + 150 * Math.abs(Math.sin(i * 1.37 + .6)); c.fillStyle = 'rgba(160,176,200,.45)'; c.fillRect(584 + i * 21, 380 - bh * ease(t * 2 - i * .04), 13, bh * ease(t * 2 - i * .04)); } c.fillStyle = DIM; sp(c, 'POWER DRAW / 24H', 584, 410, 14, 3); greek(c, 584, 440, 330, 8, 21, .25);
  },
};

// ---- 台本。l＝行き先の名前、sp＝話者、tx＝字幕、sl＝中央の図、ch＝選択肢（go＝行き先、act＝処理、set＝記録）、go＝次の行き先
const SCRIPTS = {
  brief: [
    { sp: 'SYS', sl: 'request', tx: '匿名回線より着信。発信元は、七つの中継の向こうです。' },
    { sp: 'UNK', tx: '聞こえるかしら。〈墓標〉……いえ、今はただの R-0417 だったわね。' },
    { sp: 'YOU', tx: 'その名で呼ぶ奴は、もう残っていないはずだ。' },
    { sp: 'NOC', sl: 'operator', tx: 'ノクターン、と呼んで。オペレーターよ。あなた専属の、ね。' },
    { sp: 'NOC', tx: '映像は切ってあるの。見たら、断れなくなるでしょう？' },
    { sp: 'YOU', tx: '……声だけで分かる。厄介な女だ。' },
    { sp: 'NOC', sl: 'map', tx: '目標は採掘プラットフォーム〈ケストレル9〉。あなたのリングから、六時間四十分。' },
    { sp: 'NOC', sl: 'target', tx: '第三保管庫に、試料 12-B が眠っている。あなたのデッキに浮いている 12-A の、片割れよ。' },
    { sp: 'YOU', tx: '……', ch: [{ t: 'なぜ、俺の部屋の中身を知っている', go: 'q1' }, { t: '片割れを揃えると、何が起きる', go: 'q2' }] },
    { l: 'q1', sp: 'NOC', tx: 'あら。隠居先の内装くらい、調べるわ。いい趣味ね、あの床。', go: 'th' },
    { l: 'q2', sp: 'NOC', tx: 'それを確かめたいの。あの二つは、互いを呼んでいるから。' },
    { l: 'th', sp: 'NOC', sl: 'threat', tx: '障害はハルシオン保安部。自律警備機が十二、有人機が二。あなたなら、準備運動にもならない。' },
    { sp: 'NOC', sl: 'reward', tx: '報酬は四十八万。前金三割。それと……帰ってきたら、直接会って話しましょう。' },
    { sp: 'YOU', tx: '隠居の身に、ずいぶんな条件だ。' },
    { sp: 'NOC', sl: 'decide', tx: '返事を聞かせて。', ch: [{ t: '受ける', go: 'yes', set: 'accepted' }, { t: '考えさせろ', go: 'no', set: 'held' }] },
    { l: 'yes', sp: 'NOC', tx: 'そう言うと思った。……おかえりなさい、〈墓標〉。' },
    { sp: 'SYS', tx: '依頼を受諾しました。出撃の準備は、まだ実装されていません。', end: true },
    { l: 'no', sp: 'NOC', tx: 'いいわ。待つのは得意よ。回線は、開けておくから。', end: true },
  ],
  menu: [
    { l: 'm', sp: 'SYS', sl: 'menu', tx: '個人端末 C-08-D。操作を選択してください。', ch: [{ t: 'ブリーフィングを再生', act: 'brief' }, { t: o => '照明を切り替える ― ' + o.lightLabel(), act: 'light' }, { t: '閉じる', act: 'close' }] },
  ],
};
const BOOT = { brief: 2.7, menu: .45 };

export function createBriefing(opt) {
  const { audio, parent, camera, coarse } = opt;
  const el = document.getElementById('brief'), cv = { B: document.getElementById('bB'), P: document.getElementById('bP'), O: document.getElementById('bO') }, g = { B: cv.B.getContext('2d'), P: cv.P.getContext('2d'), O: cv.O.getContext('2d') };
  const S = { active: false, mode: 'screen', name: 'brief', steps: [], i: 0, t: 0, st: 0, slide: null, slideT: 0, flash: 0, order: [], sel: 0, voice: 0, time: 0, hits: [], flags: {}, portrait: false, LW: 1600, LH: 900, done: false, typed: 0, k: 1, frame: 0 };
  let L = null; const thumbs = {};
  // 配置（論理座標）。横長は 1600 × 900、縦長は 900 × 1600
  function layout() {
    S.portrait = innerWidth < innerHeight * .8; S.LW = S.portrait ? 900 : 1600; S.LH = S.portrait ? 1600 : 900;
    L = S.portrait ? { em: [40, 130, 250, 190], list: [320, 130, 540, 190], main: [40, 356, 820, 500], th: [0, 1, 2].map(i => [40 + i * 280, 886, 260, 156]), subY: 1136, subW: 800 }
      : { em: [50, 130, 250, 190], list: [50, 346, 250, 274], main: [330, 100, 940, 520], th: [0, 1, 2].map(i => [1300, 130 + i * 168, 250, 150]), subY: 676, subW: 1100 };
    const q = coarse && S.mode === 'holo' ? .75 : 1; for (const k of 'BP') { cv[k].width = Math.round(S.LW * q); cv[k].height = Math.round(S.LH * q); } fit();
  }
  function fit() {
    const k = Math.min(innerWidth / S.LW, innerHeight / S.LH), w = S.LW * k, h = S.LH * k; S.k = k;
    for (const key of 'BPO') { const s = cv[key].style; s.width = w + 'px'; s.height = h + 'px'; s.left = (innerWidth - w) / 2 + 'px'; s.top = (innerHeight - h) / 2 + 'px'; }
    const d = Math.min(devicePixelRatio || 1, 2); cv.O.width = Math.round(w * d); cv.O.height = Math.round(h * d);
  }
  addEventListener('resize', () => { if (S.active) fit(); });
  function mkThumbs() { for (const id in SLIDES) { const c = document.createElement('canvas'); c.width = 250; c.height = 150; const x = c.getContext('2d'); x.scale(.25, .25); try { SLIDES[id](x, 99, { time: 1.3, voice: .5 }); } catch (e) { } thumbs[id] = c; } }

  cv.B.style.display = cv.P.style.display = 'none'; el.style.background = 'transparent';   // 板はどちらの形でも 3D で描く。DOM に残すのは字幕と選択肢だけ
  // ---- 空間に浮かべる板（holo）。起動時に作っておき、開くたびに配置だけ直す
  const tex = { B: new THREE.CanvasTexture(cv.B), P: new THREE.CanvasTexture(cv.P) }; for (const k in tex) { tex[k].colorSpace = THREE.SRGBColorSpace; tex[k].generateMipmaps = false; tex[k].premultiplyAlpha = true;   // 加算で重ねるので、半透明の色は不透明度を掛けた値で受け取る
    tex[k].minFilter = tex[k].magFilter = THREE.LinearFilter; }
  const uT = { value: 0 }, uOp = { value: 0 }, uFlat = { value: 0 }, oScene = new THREE.Scene(), oCam = new THREE.PerspectiveCamera(), group = new THREE.Group(); group.visible = false; parent.add(group);
  const holoMat = (map, gain) => new THREE.ShaderMaterial({ uniforms: { isFlat: uFlat, map: { value: map }, uvr: { value: new THREE.Vector4(0, 0, 1, 1) }, time: uT, op: uOp, gain: { value: gain }, rows: { value: 300 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D map; uniform vec4 uvr; uniform float time, op, gain, rows, isFlat; varying vec2 vUv;
      void main(){ vec2 uv=uvr.xy+vUv*uvr.zw;
        if(isFlat>.5){ vec4 t=texture2D(map,uv); vec3 col=t.a>0.001?t.rgb/t.a:vec3(0.); col=pow(col,vec3(1./2.2)); gl_FragColor=vec4(col*t.a,t.a)*op; return; }   // 後処理の後に直接描くので、色の変換は自前で
        float ca=.0009; vec3 c=vec3(texture2D(map,uv+vec2(ca,0.)).r,texture2D(map,uv).g,texture2D(map,uv-vec2(ca,0.)).b);
        float scan=.88+.12*sin(vUv.y*rows*6.2831853); float fl=.95+.05*sin(time*37.)*sin(time*5.3);
        float roll=1.+.25*exp(-pow((fract(vUv.y-time*.11)-.5)/.02,2.));                                  // ゆっくり下る走査の帯
        float ed=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)); float soft=smoothstep(0.,.006,ed);
        gl_FragColor=vec4(c*gain*scan*fl*roll*soft*op,1.); }` });
  let snapTex = null; const snapQ = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`, fragmentShader: `uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor=vec4(texture2D(map,vUv).rgb,1.); }` }));
  snapQ.frustumCulled = false; snapQ.renderOrder = -1; snapQ.visible = false; oScene.add(snapQ);
  const geo = new THREE.PlaneGeometry(1, 1), M3 = {};
  const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x020408, transparent: true, opacity: 0, depthWrite: false })); back.renderOrder = 5; group.add(back);      // 部屋のほかのホログラムより後に描いて、覆い隠す
  for (const [k, t, gn] of [['bg', 'B', 1.2], ['em', 'P', 1.4], ['list', 'P', 1.4], ['main', 'P', 1.25], ['th0', 'P', 1.0], ['th1', 'P', 1.0], ['th2', 'P', 1.0]]) { M3[k] = new THREE.Mesh(geo, holoMat(tex[t], gn)); M3[k].frustumCulled = false; M3[k].renderOrder = 6; group.add(M3[k]); }
  const cam = { x: 0, z: 0, y: 1.55, yaw: 0 };
  function place(cam) {
    for (const k in tex) tex[k].dispose();
    const D = 2.25, vh = 2 * D * Math.tan(camera.fov * Math.PI / 360), vw = vh * camera.aspect, k = Math.min(vw * .95 / S.LW, vh * .84 / S.LH), cx = cam.x, cz = cam.z - D, cy = cam.y + vh * .03;
    const put = (m, r0, dz, ry) => { const pm = m === M3.bg ? 0 : 18, r = [r0[0] - pm, r0[1] - pm, r0[2] + pm * 2, r0[3] + pm * 2];   // 枠の外に出る角の飾りと見出しの分だけ広げる
      m.scale.set(r[2] * k, r[3] * k, 1); m.position.set(cx + (r[0] + r[2] / 2 - S.LW / 2) * k, cy + (S.LH / 2 - r[1] - r[3] / 2) * k, cz + dz); m.rotation.y = ry; m.material.uniforms.uvr.value.set(r[0] / S.LW, 1 - (r[1] + r[3]) / S.LH, r[2] / S.LW, r[3] / S.LH); m.material.uniforms.rows.value = r[3] / 3; };
    put(M3.bg, [0, 0, S.LW, S.LH], -.12, 0); put(M3.main, L.main, 0, 0); const side = S.portrait ? 0 : .2;
    put(M3.em, L.em, .16, side); put(M3.list, L.list, .16, S.portrait ? 0 : side); L.th.forEach((r, i) => put(M3['th' + i], r, .16, -side));
    back.scale.set(14, 7, 1); back.position.set(cx, cam.y + .25, cz - .4);
  }

  // ---- 進行
  const cur = () => S.steps[S.i];
  function enter(i) {
    S.i = i; S.st = 0; S.sel = 0; S.typed = 0; const s = cur(); if (!s) return finish();
    if (s.sl && s.sl !== S.slide) { S.slide = s.sl; S.slideT = S.t < BOOT[S.name] ? 0 : -.2; S.flash = S.t < BOOT[S.name] ? 0 : 1; audio.uiSlide && audio.uiSlide(); }
  }
  function start(name) { S.name = name; S.steps = SCRIPTS[name]; S.t = 0; S.slide = null; S.done = false; S.order = [...new Set(S.steps.map(s => s.sl).filter(Boolean))]; enter(0); audio.uiOpen && audio.uiOpen(); }
  const textOf = s => typeof s.tx === 'function' ? s.tx(opt) : s.tx, labelOf = c => typeof c.t === 'function' ? c.t(opt) : c.t;
  const typing = () => S.st * 30 < [...textOf(cur())].length;
  function next() { const s = cur(); if (s.end) return finish(); if (s.go) { const j = S.steps.findIndex(x => x.l === s.go); return enter(j < 0 ? S.i + 1 : j); } enter(S.i + 1); }
  function advance() { if (!S.active || S.t < BOOT[S.name]) { if (S.active) S.t = BOOT[S.name]; return; } const s = cur(); if (!s) return; if (typing()) { S.st = 999; return; } if (s.ch) return; audio.uiTick && audio.uiTick(1); next(); }
  function choose(k) {
    const s = cur(); if (!s || !s.ch || typing()) return; const c = s.ch[k]; if (!c) return; audio.uiSelect && audio.uiSelect(); if (c.set) { S.flags.answer = c.set; }
    if (c.act === 'close') return close(); if (c.act === 'brief') return start('brief'); if (c.act === 'light') { opt.onLight(); return; }
    const j = S.steps.findIndex(x => x.l === c.go); enter(j < 0 ? S.i + 1 : j);
  }
  function finish() { const f = S.flags.answer; close(); if (S.name === 'brief' && opt.onEnd) opt.onEnd(f); }
  function open(mode, name) { S.active = true; S.mode = mode; S.flags = {}; layout(); if (!thumbs.menu) mkThumbs(); el.className = 'on ' + mode; const scr = mode === 'screen'; (scr ? oScene : parent).add(group); uFlat.value = scr ? 1 : 0; for (const k in M3) { const m = M3[k].material; m.blending = scr ? THREE.CustomBlending : THREE.AdditiveBlending; m.blendSrc = THREE.OneFactor; m.blendDst = scr ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor; m.needsUpdate = true; }
    if (scr) { oCam.fov = camera.fov; oCam.aspect = camera.aspect; oCam.position.set(0, 1.55, 0); oCam.updateProjectionMatrix(); oCam.updateMatrixWorld(); } place(scr ? { x: 0, y: 1.55, z: 0 } : cam); group.visible = true; start(name); draw(); }
  function close() { if (!S.active) return; S.active = false; snapQ.visible = false; el.className = ''; S.done = true; opt.onClose && opt.onClose(); }
  function key(e) {
    const s = cur(), n = s && s.ch ? s.ch.length : 0;
    if (e.code === 'Escape') { close(); return; }
    if (n && (e.code === 'ArrowDown' || e.code === 'KeyS')) { S.sel = (S.sel + 1) % n; audio.uiTick && audio.uiTick(1); }
    else if (n && (e.code === 'ArrowUp' || e.code === 'KeyW')) { S.sel = (S.sel + n - 1) % n; audio.uiTick && audio.uiTick(1); }
    else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { if (e.repeat) return; if (n && !typing() && S.t >= BOOT[S.name]) choose(S.sel); else advance(); }
    e.preventDefault();
  }
  const toLogical = e => { const r = cv.O.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S.LW, (e.clientY - r.top) / r.height * S.LH]; };
  el.addEventListener('pointerdown', e => { if (!S.active) return; e.preventDefault(); const [x, y] = toLogical(e); for (const h of S.hits) if (x > h[0] && x < h[0] + h[2] && y > h[1] && y < h[1] + h[3]) { S.sel = h[4]; return choose(h[4]); } advance(); });
  el.addEventListener('pointermove', e => { if (!S.active || e.pointerType === 'touch') return; const [x, y] = toLogical(e); for (const h of S.hits) if (x > h[0] && x < h[0] + h[2] && y > h[1] && y < h[1] + h[3]) S.sel = h[4]; });

  // ---- 描画
  function panel(c, r, a, title) { const scr = S.mode === 'screen'; c.globalAlpha = a; c.fillStyle = scr ? 'rgba(150,175,220,.045)' : FILL; c.fillRect(r[0], r[1], r[2], r[3]); c.strokeStyle = scr ? 'rgba(180,198,226,.32)' : 'rgba(180,198,226,.6)'; c.lineWidth = scr ? 1 : 1.5; c.strokeRect(r[0] + .5, r[1] + .5, r[2] - 1, r[3] - 1); c.strokeStyle = INK; c.lineWidth = 2; corners(c, r[0] - 6, r[1] - 6, r[2] + 12, r[3] + 12, 12); if (title) { c.fillStyle = DIM; sp(c, title, r[0] + 2, r[1] - 14, 12, 3); } c.globalAlpha = 1; }
  function drawB(c) {
    const W = S.LW, H = S.LH, bt = BOOT[S.name], t = S.t; c.clearRect(0, 0, W, H);
    // 枠線と目盛り（常時）
    const a = clamp(t * 2); c.globalAlpha = a; c.strokeStyle = FAINT; c.lineWidth = 1.5; for (const y of [70, H - 70]) { ln(c, 60, y, W / 2 - 60, y); ln(c, W / 2 + 60, y, W - 60, y); c.beginPath(); c.moveTo(W / 2 - 60, y); c.lineTo(W / 2 - 44, y + (y < H / 2 ? -14 : 14)); c.moveTo(W / 2 + 60, y); c.lineTo(W / 2 + 44, y + (y < H / 2 ? -14 : 14)); c.stroke(); }
    c.fillStyle = FAINT; for (let i = 0; i < 14; i++) { c.fillRect(80 + i * 26, 50, 14, 3); c.fillRect(W - 94 - i * 26, 50, 14, 3); } sp(c, 'C-07 // SECURE LINK', 80, H - 44, 13, 4); sp(c, S.name === 'brief' ? 'BRF-0412' : 'TERM-08D', W - 80, H - 44, 13, 4, 'right'); c.globalAlpha = 1;
    // 起動画面：左右を流れる文字の列と、中央の表示
    if (t < bt + .5 && S.name === 'brief') {
      const fo = 1 - clamp((t - bt + .3) / .5); c.globalAlpha = fo; const colW = S.portrait ? 190 : 330;
      for (const sd of [0, 1]) for (let i = 0; i < (S.portrait ? 60 : 44); i++) { const y = ((i * 19 + t * (60 + sd * 30)) % (H - 120)) + 60, x0 = sd ? W - colW - 40 : 40, w = (.3 + .7 * hash(i * 3 + sd * 50 + Math.floor(t * 3 + i * .37))) * colW; c.fillStyle = `rgba(190,205,230,${.12 + .3 * hash(i + sd * 9)})`; c.fillRect(sd ? x0 + colW - w : x0, y, w, 2.5); if (hash(i * 7 + sd) > .7) c.fillRect(sd ? x0 + colW - w - 40 : x0 + w + 12, y, 26, 2.5); }
      const cy = H / 2 - 30; c.fillStyle = INK; sp(c, ty('MAIN SYSTEM', t - .15, 24), W / 2, cy, 30, 12, 'center'); c.strokeStyle = DIM; c.lineWidth = 1.5; ln(c, W / 2 - 230, cy + 16, W / 2 + 230, cy + 16, ease(t * 2)); c.fillStyle = DIM; sp(c, ty('MISSION BRIEFING', t - .5, 24), W / 2, cy + 46, 20, 10, 'center');
      const p = clamp((t - .7) / (bt - 1.2)); c.fillStyle = 'rgba(150,170,200,.25)'; c.fillRect(W / 2 - 150, cy + 76, 300, 5); c.fillStyle = p >= 1 ? ACC : INK; c.fillRect(W / 2 - 150, cy + 76, 300 * p, 5); sp(c, p >= 1 ? 'COMPLETE' : 'LOADING', W / 2 - 150, cy + 104, 13, 4); sp(c, String(Math.floor(p * 100)), W / 2 + 150, cy + 104, 13, 2, 'right');
      c.globalAlpha = 1;
    }
  }
  function drawP(c) {
    const W = S.LW, H = S.LH, bt = BOOT[S.name], pa = ease((S.t - bt + .25) / .5); c.clearRect(0, 0, W, H); if (pa <= 0) return; const s = cur(), who = s ? s.sp : 'SYS';
    // 話者の紋章と、声の波形
    panel(c, L.em, pa, 'SPEAKER'); c.globalAlpha = pa; emblem(c, who, L.em[0] + 88, L.em[1] + L.em[3] / 2 - 4, 56); c.fillStyle = INK; for (let i = 0; i < 9; i++) { const v = (.1 + .9 * S.voice) * Math.abs(Math.sin(S.time * (7 + i) + i * 2.1)), hh = 6 + v * 70; c.fillRect(L.em[0] + 168 + i * 8, L.em[1] + L.em[3] / 2 - hh / 2, 4, hh); } c.fillStyle = DIM; sp(c, WHO[who].en, L.em[0] + 12, L.em[1] + L.em[3] - 12, 14, 3); c.globalAlpha = 1;
    // 参加者の一覧（今の話者を強調）
    panel(c, L.list, pa, 'CHANNEL'); c.globalAlpha = pa; const names = S.name === 'brief' ? ['SYS', S.i < 3 ? 'UNK' : 'NOC', 'YOU'] : ['SYS', 'YOU']; names.forEach((n, i) => { const cols = S.portrait ? 3 : 1, rw = (L.list[2] - 24) / cols, x = L.list[0] + 12 + (S.portrait ? i * rw : 0), y = L.list[1] + 18 + (S.portrait ? 0 : i * 62), on = n === who || (n === 'NOC' && who === 'UNK'); c.fillStyle = on ? 'rgba(211,220,234,.9)' : 'rgba(150,170,200,.14)'; c.fillRect(x, y, rw - 8, 50); c.save(); c.globalCompositeOperation = on ? 'destination-out' : 'source-over'; c.globalAlpha = on ? 1 : pa * .8; emblem(c, n, x + 26, y + 25, 15); c.restore(); c.globalAlpha = pa; c.fillStyle = on ? '#0a0f18' : DIM; sp(c, WHO[n].en, x + 50, y + 31, S.portrait ? 14 : 17, S.portrait ? 1 : 2, 'left', 700); });
    if (!S.portrait) { c.fillStyle = DIM; sp(c, 'ENCRYPTION', L.list[0] + 12, L.list[1] + L.list[3] - 44, 12, 3); c.fillStyle = INK; for (let i = 0; i < 18; i++) if (hash(i + Math.floor(S.time * 4)) > .35) c.fillRect(L.list[0] + 12 + i * 12, L.list[1] + L.list[3] - 30, 8, 12); } c.globalAlpha = 1;
    // 中央のパネル
    const m = L.main; panel(c, m, pa, S.slide ? S.slide.toUpperCase() : ''); c.save(); c.beginPath(); c.rect(m[0], m[1], m[2], m[3]); c.clip(); const k = Math.min(m[2] / 1000, m[3] / 600); c.translate(m[0] + (m[2] - 1000 * k) / 2, m[1] + (m[3] - 600 * k) / 2); c.scale(k, k);
    if (S.slide && S.slideT > 0 && pa >= 1) { try { SLIDES[S.slide](c, S.slideT, S); } catch (e) { } } c.restore();
    if (S.flash > 0) { c.fillStyle = `rgba(235,242,255,${S.flash * .85})`; c.fillRect(m[0], m[1], m[2], m[3]); }
    // 右：これから出る図
    const idx = S.order.indexOf(S.slide); L.th.forEach((r, i) => { const id = S.order[idx + 1 + i]; if (!id) return; panel(c, r, pa * (1 - i * .22)); c.globalAlpha = pa * (.85 - i * .22); if (S.mode === 'holo') { c.fillStyle = 'rgba(20,30,50,.9)'; c.fillRect(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4); } c.drawImage(thumbs[id], r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4); c.fillStyle = DIM; sp(c, String(idx + 2 + i).padStart(2, '0'), r[0] + r[2] - 8, r[1] + r[3] - 8, 13, 2, 'right'); c.globalAlpha = 1; });
  }
  // 字幕の折り返し。行の長さをそろえ、できれば句読点の後ろで切る
  function wrap(c, s, maxW, px) {
    c.font = `500 ${px}px ${FJ}`; const ch = [...s], n = Math.ceil(c.measureText(s).width / maxW); if (n <= 1) return [s];
    const out = []; let from = 0; for (let k = 1; k < n; k++) { const target = Math.round(ch.length * k / n); let cut = target; for (let d = 0; d <= 7; d++) { if ('。、…？！」'.includes(ch[target + d - 1]) && target + d < ch.length) { cut = target + d; break; } if ('。、…？！」'.includes(ch[target - d - 1]) && target - d > from) { cut = target - d; break; } } out.push(ch.slice(from, cut).join('')); from = cut; }
    out.push(ch.slice(from).join('')); return out;
  }
  function drawO(c) {
    const q = cv.O.width / S.LW; c.setTransform(q, 0, 0, q, 0, 0); c.clearRect(0, 0, S.LW, S.LH); S.hits = []; if (S.t < BOOT[S.name]) return; const s = cur(); if (!s) return; const W = S.LW, cx = W / 2, px = S.portrait ? 40 : 30, a = clamp((S.t - BOOT[S.name]) * 3);
    // 字幕の下地
    const g2 = c.createLinearGradient(0, L.subY - 90, 0, S.LH); g2.addColorStop(0, 'rgba(2,4,8,0)'); g2.addColorStop(.35, 'rgba(2,4,8,.72)'); g2.addColorStop(1, 'rgba(2,4,8,.86)'); c.fillStyle = g2; c.fillRect(0, L.subY - 90, W, S.LH - L.subY + 90);
    c.globalAlpha = a; c.fillStyle = DIM; sp(c, WHO[s.sp].jp, cx, L.subY - 14, px * .56, 4, 'center', 500, FJ); c.strokeStyle = FAINT; c.lineWidth = 1; ln(c, cx - 150, L.subY - 2, cx + 150, L.subY - 2);
    const full = textOf(s), n = Math.floor(S.st * 30), lines = wrap(c, full, L.subW, px); let left = n; c.fillStyle = INK; c.textAlign = 'center'; c.font = `500 ${px}px ${FJ}`; c.shadowColor = '#000'; c.shadowBlur = 8;
    lines.forEach((lnx, i) => { const len = [...lnx].length, shown = [...lnx].slice(0, Math.max(0, left)).join(''); left -= len; const w = c.measureText(lnx).width; c.textAlign = 'left'; c.fillText(shown, cx - w / 2, L.subY + px * 1.25 + i * px * 1.45); }); c.shadowBlur = 0; c.textAlign = 'left';
    const done = n >= [...full].length, yb = L.subY + px * 1.25 + lines.length * px * 1.45;
    if (done && s.ch) { const bw = S.portrait ? 780 : 640, bh = S.portrait ? 84 : 46, gap = S.portrait ? 12 : 8; s.ch.forEach((ch, i) => { const x = cx - bw / 2, y = (S.portrait ? yb + 10 : yb - 26) + i * (bh + gap), on = i === S.sel; c.fillStyle = on ? ACC : 'rgba(8,12,20,.55)'; c.fillRect(x, y, bw, bh); c.strokeStyle = on ? ACC : 'rgba(180,198,226,.6)'; c.lineWidth = 1.5; c.strokeRect(x + .5, y + .5, bw - 1, bh - 1); c.fillStyle = on ? '#0a0a0a' : INK; sp(c, String(i + 1).padStart(2, '0'), x + 18, y + bh / 2 + 7, px * .6, 2, 'left', 700); sp(c, labelOf(ch), x + 70, y + bh / 2 + px * .3, px * .8, 1, 'left', 500, FJ); S.hits.push([x, y, bw, bh, i]); }); }
    else if (done && Math.floor(S.time * 2) % 2) { c.fillStyle = ACC; c.beginPath(); c.moveTo(cx - 9, yb - 4); c.lineTo(cx + 9, yb - 4); c.lineTo(cx, yb + 8); c.fill(); }
    c.fillStyle = 'rgba(160,176,200,.5)'; sp(c, coarse ? 'TAP : 次へ' : 'E / CLICK : 次へ　　ESC : 閉じる', W - 70, S.LH - 22, S.portrait ? 20 : 14, 2, 'right', 500, FJ); c.globalAlpha = 1;
  }
  function draw() { const q = cv.B.width / S.LW; for (const k of 'BP') g[k].setTransform(q, 0, 0, q, 0, 0); const bgNew = S.t < BOOT[S.name] + .6 || S.frame % 12 === 0 || S.t < .05; if (bgNew) { drawB(g.B); tex.B.needsUpdate = true; } if (S.mode === 'screen' || S.frame % 2 === 0 || S.flash > 0) { drawP(g.P); tex.P.needsUpdate = true; } drawO(g.O); }
  function update(dt, time) {
    uT.value = time % 1000; const want = S.active ? 1 : 0; uOp.value += (want - uOp.value) * (1 - Math.exp(-dt * 9)); back.material.opacity = S.mode === 'holo' ? Math.min(1, uOp.value * 1.05) : uOp.value * .9; if (!want && uOp.value < .01) group.visible = false;
    if (!S.active) return; S.frame++; S.time = time; S.t += dt; if (S.t >= BOOT[S.name]) { const was = Math.floor(S.st * 30); S.st += dt; S.slideT += dt; const s = cur(); if (s && typing()) { S.voice += ((s.sp === 'YOU' || s.sp === 'SYS' ? .35 : 1) - S.voice) * .3; if (Math.floor(S.st * 30) > was && Math.floor(S.st * 30) % 3 === 0) audio.uiTick && audio.uiTick(0); } else S.voice *= .86; }
    S.flash = Math.max(0, S.flash - dt * 3.2); draw();
  }
  return { open, close, update, key, advance, choose, cam, group, state: S, get active() { return S.active; }, get mode() { return S.mode; }, get holoOp() { return S.mode === 'holo' ? uOp.value : 0; },
    // 全画面の板は、後処理（ブルーム・色収差・粒子）を通さずに最後に重ねる
    // 部屋の絵を 1 枚とっておく（null で捨てる）。全画面の間は、これを下地にして部屋の描画を止める
    snapshot(renderer) {
      if (!renderer) { snapQ.visible = false; return; } const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
      if (!snapTex || snapTex.image.width !== sz.x || snapTex.image.height !== sz.y) { if (snapTex) snapTex.dispose(); snapTex = new THREE.FramebufferTexture(sz.x, sz.y); snapQ.material.uniforms.map.value = snapTex; }
      renderer.setRenderTarget(null); renderer.copyFramebufferToTexture(snapTex); snapQ.visible = true;
    },
    overlay(renderer) { if (S.mode !== 'screen' || !group.visible) return; const ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(null); renderer.clearDepth(); renderer.render(oScene, oCam); renderer.autoClear = ac; } };
}
