// CONTROL DECK C-07 — 艶のある床とホログラムの管制デッキを、主観視点で歩くプロトタイプ
// 素材はすべてコードで生成（three.js r170）。PRIVATE MODULE K-12 / ANFINI LOUNGE と同じ土台。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createAudio } from './audio.js';
const audio = createAudio();

let DEBUG = location.hash === '#debug';
const COARSE = matchMedia('(pointer:coarse)').matches;
const $ = id => document.getElementById(id);
const canvas = $('view');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010206); scene.environmentIntensity = .7;
const camera = new THREE.PerspectiveCamera(66, 1, 0.05, 700);
camera.rotation.order = 'YXZ';

// ---------------------------------------------------------------- helpers
let seed = 20261122;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rr = (a, b) => a + rnd() * (b - a);
const FE = '"Saira Condensed","Arial Narrow","Helvetica Neue",sans-serif';
const FJ = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic",sans-serif';

function mkTex(c, srgb = true, repeat) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function canvasTex(w, h, draw, { srgb = true, repeat } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return mkTex(c, srgb, repeat);
}
function dualTex(w, h, draw, { repeat } = {}) {
  const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = w; a.height = b.height = h;
  draw(a.getContext('2d'), b.getContext('2d'), w, h);
  return { map: mkTex(a, true, repeat), orm: mkTex(b, false, repeat) };
}
const orm = (r, m = 0) => `rgb(0,${Math.round(r * 255)},${Math.round(m * 255)})`;
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (shadow && mat.isMeshStandardMaterial && !mat.transparent) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m); return m;
}
const box = (p, w, h, d, x, y, z, mat, sh) => mesh(new THREE.BoxGeometry(w, h, d), mat, p, x, y, z, sh);
const rbox = (p, w, h, d, x, y, z, mat, r = 0.02, sh) => mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat, p, x, y, z, sh);
const cyl = (p, rt, rb, h, x, y, z, mat, seg = 32, sh) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, p, x, y, z, sh);
const plane = (p, w, h, x, y, z, mat) => mesh(new THREE.PlaneGeometry(w, h), mat, p, x, y, z, false);

// 角丸の四角の外周（x, z）。反時計まわり
function rrPts(hw, hd, r, n = 10) {
  const P = [], C = [[hw - r, hd - r], [-(hw - r), hd - r], [-(hw - r), -(hd - r)], [hw - r, -(hd - r)]];
  C.forEach(([cx, cz], q) => { for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; P.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } });
  return P;
}
const toShape = (pts, S = THREE.Shape) => { const s = new S(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; };
// 外周に沿って立てた帯（床の段の光、天井の縁の光）
function ribbon(pts, y0, y1, skip = null) {
  const pos = [], uv = [], n = pts.length; let L = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (skip && skip(a, b)) continue;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
    uv.push(L, 0, L + l, 0, L + l, 1, L, 0, L + l, 1, L, 1); L += l;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
// 水平に寝かせた角丸の輪
function flatRing(hw, hd, r, w) {
  const s = toShape(rrPts(hw, hd, r, 12)); s.holes.push(toShape(rrPts(hw - w, hd - w, Math.max(r - w, .01), 12), THREE.Path));
  const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g;
}

// ---------------------------------------------------------------- room metrics
const X0 = -6, X1 = 6, Z0 = -4.5, Z1 = 4.5, WH = 3.6, PH = .16;      // 部屋の箱と、壁際の段の高さ
const IW = 5.25, ID = 3.75, IR = 1.1;                                  // 歩ける床（角丸の四角）の半幅・半奥行き・角の半径
const PAD = { x: 0, z: 1.1 }, PED = { x: 0, z: -2.35 };
// 隣の私室（C-08）。東の壁の扉でつながる。通路は z が DZ0〜DZ1
const BX0 = 6.4, BX1 = 13.6, BZ0 = -2.4, BZ1 = 4.5, BH = 3.0, DZ0 = .95, DZ1 = 2.55, DZC = 1.75, DOOR_H = 2.45;
const BCX = (BX0 + BX1) / 2, BCZ = (BZ0 + BZ1) / 2;
// 管制デッキの歩ける床の外周に、扉へ向かう切り欠きを足したもの
const aPts = (n, off = 0) => rrPts(IW - off, ID - off, IR, n).concat([[IW - off, DZ0 + off], [X1, DZ0 + off], [X1, DZ1 - off], [IW - off, DZ1 - off]]);
const segs = [], circles = [];
const addSeg = (ax, az, bx, bz) => { const s = { ax, az, bx, bz, on: true }; segs.push(s); return s; };
const addRect = (x0, z0, x1, z1) => { addSeg(x0, z0, x1, z0); addSeg(x1, z0, x1, z1); addSeg(x1, z1, x0, z1); addSeg(x0, z1, x0, z0); };
function wallGroup(x, z, ry) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); g.updateMatrixWorld(true); return g; }

// ---------------------------------------------------------------- shared uniforms
const uTime = { value: 0 }, uAcc = { value: new THREE.Color(1, .86, .32) }, uVh = { value: 800 };
const ACCENTS = [{ n: 'AMBER', c: [1, .86, .32] }, { n: 'ICE', c: [.42, .86, 1] }, { n: 'ROSE', c: [1, .4, .58] }];
let accent = 0;
const holoGroup = new THREE.Group(); scene.add(holoGroup);

// ---------------------------------------------------------------- 等高線の高さ場（床の艶のむらと、起動時の床の発火で共用）
const HW = 384, HH = 288, LEV = 11;
function genHeight(x0, z0, w, d, cx, cz) {
  const hs = (x, y) => { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); return lerp(lerp(hs(i, j), hs(i + 1, j), fx), lerp(hs(i, j + 1), hs(i + 1, j + 1), fx), fy); };
  const dd = new Uint16Array(HW * HH);
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const x = x0 + (i + .5) / HW * w, z = z0 + (j + .5) / HH * d;
    let h = 0, a = .5, f = .34; for (let o = 0; o < 4; o++) { h += a * vn(x * f + 11.3 * o, z * f + 5.7 * o); a *= .5; f *= 2.05; }
    const dp = Math.hypot(x - cx, z - cz); h += .3 * Math.exp(-dp * dp / 5);       // 指定した点のまわりは同心円に寄せる
    dd[j * HW + i] = THREE.DataUtils.toHalfFloat(h);
  }
  const t = new THREE.DataTexture(dd, HW, HH, THREE.RedFormat, THREE.HalfFloatType); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
const heightTex = genHeight(X0, Z0, 12, 9, PAD.x, PAD.z);
const H_UV = `( wp.xz - vec2( ${X0.toFixed(1)}, ${Z0.toFixed(1)} ) ) / vec2( 12.0, 9.0 )`;

// ---------------------------------------------------------------- textures
const T = {};
function buildTextures() {
  // 壁のパネル（継ぎ目、小さな表記）
  const wallTex = (base, ink, tag, rough) => dualTex(1024, 1024, (c, o, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h); o.fillStyle = orm(rough, .2); o.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = rr(-5, 5); c.fillStyle = `rgba(${128 + v * 20},${128 + v * 20},${132 + v * 20},.035)`; c.fillRect(rr(0, w), rr(0, h), rr(2, 60), rr(1, 3)); }
    const seam = (x0, y0, x1, y1) => { c.strokeStyle = 'rgba(0,0,0,.75)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + 2, y0 + 2); c.lineTo(x1 + 2, y1 + 2); c.stroke(); o.strokeStyle = orm(.85, 0); o.lineWidth = 4; o.beginPath(); o.moveTo(x0, y0); o.lineTo(x1, y1); o.stroke(); };
    for (const x of [0, 512]) seam(x, 0, x, h); for (const y of [0, 300, 860]) seam(0, y, w, y);
    for (const [x, y] of [[20, 20], [492, 20], [532, 20], [1004, 20], [20, 280], [1004, 280], [20, 320], [492, 840], [532, 320], [1004, 840]]) { c.fillStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.arc(x, y - 1, 2, 0, TAU); c.fill(); }
    c.fillStyle = ink; c.font = `600 22px ${FE}`; c.fillText(tag + ' / PNL 04', 548, 352); c.font = `500 13px ${FE}`; c.fillText('RING SEGMENT C  ·  PRESSURE RATED  ·  DO NOT OBSTRUCT', 548, 372);
    c.fillStyle = 'rgba(244,212,31,.75)'; c.fillRect(548, 384, 44, 5);
    c.strokeStyle = ink; c.lineWidth = 2; for (const [x, y] of [[40, 340], [470, 340], [40, 820], [470, 820]]) { c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x + 10, y); c.moveTo(x, y - 10); c.lineTo(x, y + 10); c.stroke(); }
  }, { repeat: [1, 1] });
  T.wall = wallTex('#1a1b1f', 'rgba(210,214,220,.42)', 'C-07', .5); T.wallB = wallTex('#62656b', 'rgba(16,18,22,.6)', 'C-08', .62);      // 私室の壁は明るめ（窓の光と影が見えるように）
  // 床：暗い地、象嵌の細い線、＋印、角の括弧、黄色の短い線（等高線の艶のむらはシェーダ側）
  T.floor = canvasTex(2048, 1536, (c, w, h) => {
    const S = w / 12, X = x => (x - X0) * S, Z = z => (z - Z0) * S;
    c.fillStyle = '#0a0b0d'; c.fillRect(0, 0, w, h);
    const path = pts => { c.beginPath(); pts.forEach(([x, z], i) => i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.closePath(); };
    path(rrPts(4.55, 3.05, .8, 14)); c.fillStyle = '#0d0e11'; c.fill(); c.strokeStyle = '#3c4046'; c.lineWidth = 2.5; c.stroke();
    path(rrPts(4.42, 2.92, .7, 14)); c.strokeStyle = 'rgba(120,126,134,.35)'; c.lineWidth = 1.2; c.stroke();
    // パッドの台座と、そこへ向かう線
    c.fillStyle = '#060708'; c.beginPath(); c.arc(X(PAD.x), Z(PAD.z), 1.62 * S, 0, TAU); c.fill(); c.strokeStyle = '#4a4e55'; c.lineWidth = 3; c.stroke();
    c.strokeStyle = '#2c2f34'; c.lineWidth = 2; c.beginPath(); c.arc(X(PAD.x), Z(PAD.z), 1.5 * S, 0, TAU); c.stroke();
    c.fillStyle = '#060708'; c.beginPath(); c.arc(X(PED.x), Z(PED.z), 1.0 * S, 0, TAU); c.fill(); c.strokeStyle = '#3c4046'; c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = '#34373c'; c.lineWidth = 2;
    for (const [x0, z0, x1, z1] of [[-4.55, PAD.z, -1.62, PAD.z], [1.62, PAD.z, 4.55, PAD.z], [0, -1.35, 0, -.52], [-2.6, -3.05, -2.6, 3.05], [2.6, -3.05, 2.6, 3.05]]) { c.beginPath(); c.moveTo(X(x0), Z(z0)); c.lineTo(X(x1), Z(z1)); c.stroke(); }
    // ＋印と括弧
    c.strokeStyle = 'rgba(200,204,210,.5)'; c.lineWidth = 2;
    for (let x = -4; x <= 4; x += 2) for (let z = -2.4; z <= 2.4; z += 1.6) { if (Math.hypot(x - PAD.x, z - PAD.z) < 1.8 || Math.hypot(x - PED.x, z - PED.z) < 1.2) continue; const px = X(x), pz = Z(z); c.beginPath(); c.moveTo(px - 9, pz); c.lineTo(px + 9, pz); c.moveTo(px, pz - 9); c.lineTo(px, pz + 9); c.stroke(); }
    for (const [x, z, sx, sz] of [[-4.1, -2.6, 1, 1], [4.1, -2.6, -1, 1], [-4.1, 2.6, 1, -1], [4.1, 2.6, -1, -1]]) { c.beginPath(); c.moveTo(X(x) + 34 * sx, Z(z)); c.lineTo(X(x), Z(z)); c.lineTo(X(x), Z(z) + 34 * sz); c.stroke(); }
    // 黄色の短い線と、小さな表記
    c.fillStyle = '#d9bb14';
    for (const [x, z, l, v] of [[-3.4, 3.05, .5, 0], [3.0, -3.05, .5, 0], [-4.55, -1.2, .4, 1], [4.55, .2, .4, 1], [1.2, 3.05, .22, 0], [-1.0, -3.05, .22, 0]]) v ? c.fillRect(X(x) - 5, Z(z), 10, l * S) : c.fillRect(X(x), Z(z) - 5, l * S, 10);
    c.fillStyle = 'rgba(200,204,210,.42)'; c.font = `600 20px ${FE}`;
    c.fillText('C-07  LINK PAD', X(1.75), Z(PAD.z) - 8); c.fillText('DECK FLOOR 03', X(-4.3), Z(2.78)); c.fillText('SAMPLE 12-A', X(1.1), Z(PED.z) - 8);
    c.font = `500 12px ${FE}`; c.fillText('KEEP CLEAR DURING LINK', X(1.75), Z(PAD.z) + 16);
  });
  T.floor.anisotropy = 16;
  // 六角壁の奥の光（むらのある青白）
  T.hexBack = canvasTex(1024, 320, (c, w, h) => {
    c.fillStyle = '#04060c'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) { const x = rr(0, w), y = rr(0, h), r = rr(40, 150), g = c.createRadialGradient(x, y, 0, x, y, r), k = rr(.12, .5); g.addColorStop(0, `rgba(${90 * k | 0},${130 * k | 0},${255 * k | 0},1)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 260); g.addColorStop(0, 'rgba(150,180,255,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  // 六角の蓋（縁の面取りと小さなねじ）
  T.hexCap = dualTex(256, 256, (c, o, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, w * .2, w / 2, w / 2, w * .5); g.addColorStop(0, '#202227'); g.addColorStop(.86, '#1b1d21'); g.addColorStop(1, '#34373d'); c.fillStyle = g; c.fillRect(0, 0, w, w);
    o.fillStyle = orm(.42, .55); o.fillRect(0, 0, w, w);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + TAU / 12, x = w / 2 + Math.cos(a) * w * .36, y = w / 2 + Math.sin(a) * w * .36; c.fillStyle = '#0c0d0f'; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); }
  });
}
// 文字と図を白で描いたテクスチャ（ホログラムの元絵。ドットで抜くのはシェーダ側）
// 格子の中心で読むので、ミップマップは使わない（格子の境目で読む段が跳ねて、点が欠ける）
function inkTex(w, h, draw) { const t = canvasTex(w, h, (c, ww, hh) => { c.fillStyle = '#000'; c.fillRect(0, 0, ww, hh); draw(c, ww, hh); }, { srgb: false }); t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.anisotropy = 1; return t; }

// ---------------------------------------------------------------- materials
const M = {};
function buildMaterials() {
  const std = o => new THREE.MeshStandardMaterial(o);
  M.wall = std({ map: T.wall.map, roughnessMap: T.wall.orm, metalnessMap: T.wall.orm, roughness: 1, metalness: 1 });
  M.dark = std({ color: 0x15161a, roughness: .42, metalness: .45 });
  M.gloss = std({ color: 0x08090b, roughness: .16, metalness: .6 });
  M.light = std({ color: 0x7d8188, roughness: .5, metalness: .12 });
  M.lightGloss = std({ color: 0x9a9da3, roughness: .3, metalness: .1 });
  M.ceil = std({ color: 0x0d0e11, roughness: .92, metalness: 0 });
  M.panel = std({ color: 0x08090b, roughness: .36, metalness: .5 });
  M.yellow = std({ color: 0xd8b40e, roughness: .42, metalness: .15 });
  M.hex = std({ map: T.hexCap.map, roughnessMap: T.hexCap.orm, metalnessMap: T.hexCap.orm, roughness: 1, metalness: 1 });
  M.hexFrame = std({ color: 0x1c1e23, roughness: .34, metalness: .7 });
  M.crystal = std({ color: 0x2c3046, roughness: .14, metalness: .95, flatShading: true, emissive: 0x10132c, emissiveIntensity: .35, envMapIntensity: 1.8 });
  M.strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.74, 1.86), side: THREE.DoubleSide });
  M.stripDim = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.08, 1.16), side: THREE.DoubleSide });
  M.stripY = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.6, .16) });
  M.stripB = new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .75, 2.4) });
  M.hexBack = new THREE.MeshBasicMaterial({ map: T.hexBack, color: new THREE.Color(1.5, 1.5, 1.65) });
  M.black = new THREE.MeshBasicMaterial({ color: 0x030304 });
  M.warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.75, .92, .4) });
  // 壁際の段の上面：板の継ぎ目、表記、警告の縞。押し出し形状の uv は (x, -z) の実寸なので、repeat と offset で 12m × 9m に合わせる
  const pt = decalTex(2048, 1536, LIGHT_BG, .5, .12, (c, U, w, h) => {
    const K = w / 12, X = x => (x - X0) * K, Z = z => (z - Z0) * K;
    for (let x = -4.5; x <= 4.5; x += 1.5) { U.seam(X(x), 0, X(x), Z(-ID + .02), 2); U.seam(X(x), Z(ID - .02), X(x), h, 2); }
    for (let z = -3; z <= 3; z += 1.5) { U.seam(0, Z(z), X(-IW + .02), Z(z), 2); U.seam(X(IW - .02), Z(z), w, Z(z), 2); }
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 2; c.beginPath(); rrPts(IW + .32, ID + .32, IR + .3, 12).forEach(([x, z], i) => i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))); c.closePath(); c.stroke();
    let n = 1; for (const [x, z] of [[-3.7, -4.12], [-.7, -4.12], [2.3, -4.12], [-3.7, 4.36], [2.3, 4.36], [-5.9, -1.3], [-5.9, 1.7], [5.4, -2.8]]) { U.text('C-07 / PL-' + String(n++).padStart(2, '0'), X(x), Z(z), 17, { wt: 600, col: 'rgba(18,20,24,.6)' }); U.tag(X(x), Z(z) + 6, 40, 6); }
    for (const [x, z] of [[-4.5, -4.2], [4.5, -4.2], [-4.5, 4.2], [4.5, 4.2], [-5.7, 0], [5.7, -1.5]]) U.plus(X(x), Z(z), 9, 'rgba(18,20,24,.55)');
    for (const [x, z] of [[-2.2, -4.3], [.8, -4.3], [3.8, -4.3], [-2.2, 4.12], [3.8, 4.12]]) { U.frame(X(x), Z(z), 150, 30, 5, 2); U.slots(X(x) + 8, Z(z) + 6, 134, 18, 12, true); }
    U.hazard(X(IW + .06), Z(DZ0 - .16), (X1 - IW - .1) * K, 14); U.hazard(X(IW + .06), Z(DZ1 + .08), (X1 - IW - .1) * K, 14);
    for (let x = -5.25; x <= 5.25; x += 1.5) for (const z of [-4.42, 4.42]) U.bolt(X(x) + 10, Z(z), 3);
  });
  for (const t of [pt.map, pt.orm]) { t.repeat.set(1 / 12, 1 / 9); t.offset.set(.5, .5); }
  M.plat = std({ map: pt.map, roughnessMap: pt.orm, metalnessMap: pt.orm, roughness: 1, metalness: 1 });
  const ct = decalTex(1536, 1152, '#0d0e11', .92, 0, (c, U, w, h) => { for (let x = 0; x <= w; x += 256) U.seam(x, 0, x, h, 2); for (let y = 0; y <= h; y += 288) U.seam(0, y, w, y, 2);
    for (const [x, y] of [[60, 50], [w - 260, 50], [60, h - 140], [w - 260, h - 140]]) { U.frame(x, y, 200, 90, 8, 2); U.slots(x + 14, y + 14, 172, 62, 6); } U.text('C-07 / CLG 01', 290, 80, 20, { wt: 500, col: 'rgba(206,210,216,.3)' }); });
  M.ceilA = std({ map: ct.map, roughnessMap: ct.orm, roughness: 1, metalness: 0 });
  M.darkDS = std({ color: 0x15161a, roughness: .42, metalness: .45, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------- floor（平面反射）
// 床の面で視点を折り返したカメラから、部屋をもう一度描く。床のシェーダは、その絵を自分の画面位置で読む。
const mirror = { rt: null, cam: new THREE.PerspectiveCamera(), mat: new THREE.Matrix4(), on: true, scale: .6 };
const uMir = { value: null }, uMirMat = { value: mirror.mat }, uMirOn = { value: 1 };
const floors = [];
const GUARD = (v, cap = '48.0') => `${v} = vec3( ${['r', 'g', 'b'].map(c => `${v}.${c} >= 0.0 ? min( ${v}.${c}, ${cap} ) : 0.0`).join(', ')} );`;
// 床を1枚作る。x0, z0, w, d は床の範囲（等高線の高さ場も同じ範囲に対応させる）
function makeFloor(map, hTex, x0, z0, w, d, key) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: .1, metalness: 0, envMapIntensity: 0 }); mat.userData.floor = true;
  mat.onBeforeCompile = sh => {
    sh.uniforms.tMir = uMir; sh.uniforms.mirMat = uMirMat; sh.uniforms.mirOn = uMirOn; sh.uniforms.tHeight = { value: hTex }; sh.uniforms.hb = { value: new THREE.Vector4(x0, z0, w, d) };
    sh.vertexShader = 'uniform mat4 mirMat; varying vec4 vMir; varying vec3 vFWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvec4 fwp = modelMatrix * vec4( transformed, 1.0 ); vFWP = fwp.xyz; vMir = mirMat * fwp;');
    sh.fragmentShader = 'uniform sampler2D tMir, tHeight; uniform float mirOn; uniform vec4 hb; varying vec4 vMir; varying vec3 vFWP;\n' + sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float fh = texture2D( tHeight, ( vFWP.xz - hb.xy ) / hb.zw ).r * ${LEV.toFixed(1)} * 6.2831853;
        float fq = fh / 6.2831853; float fd = abs( fract( fq - 0.5 ) - 0.5 ) / max( fwidth( fq ), 1e-4 );
        float band = 1.0 - smoothstep( 0.8, 2.2, fd );                                  // 等高線の細い線
        float tone = 0.5 + 0.5 * sin( fh * 0.5 );                                      // 線と線の間の、ごく弱い濃淡
        roughnessFactor = mix( 0.035 + 0.02 * tone, 0.2, band );`)
      .replace('#include <opaque_fragment>', `
        vec2 muv = vMir.xy / max( vMir.w, 1e-4 );
        vec3 mir = textureLod( tMir, muv, roughnessFactor * 16.0 ).rgb; ${GUARD('mir')}
        float ndv = clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
        outgoingLight += mir * mirOn * mix( 0.34, 0.92, pow( 1.0 - ndv, 4.0 ) ) * mix( 1.0, 0.55, band ) * ( 0.9 + 0.1 * tone );
        #include <opaque_fragment>`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\t' + GUARD('gl_FragColor.rgb'));
  };
  mat.customProgramCacheKey = () => key;
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(x0 + w / 2, 0, z0 + d / 2); m.receiveShadow = true; scene.add(m); floors.push(m); return m;
}
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3(), _pl = new THREE.Plane(), _cp = new THREE.Vector4(), _q = new THREE.Vector4(), _n = new THREE.Vector3(0, 1, 0), _o = new THREE.Vector3(0, .003, 0);
function renderMirror() {
  if (!mirror.on || !mirror.rt) return;
  camera.updateMatrixWorld(); const vc = mirror.cam, m = camera.matrixWorld.elements, cp = camera.position;
  _f.set(-m[8], -m[9], -m[10]); _u.set(m[4], m[5], m[6]);
  vc.position.set(cp.x, -cp.y, cp.z); _t.set(cp.x + _f.x, -(cp.y + _f.y), cp.z + _f.z); vc.up.set(_u.x, -_u.y, _u.z); vc.lookAt(_t);
  vc.near = camera.near; vc.far = camera.far; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
  mirror.mat.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
  // 斜めの切り取り面は使わない（奥行きの精度が落ちて、映りこみの中で近い面どうしがちらつく）。床より下に物は置いていない
  for (const f of floors) f.visible = false; const rt = renderer.getRenderTarget();
  renderer.setRenderTarget(mirror.rt); renderer.clear(); renderer.render(scene, vc); renderer.setRenderTarget(rt);
  for (const f of floors) f.visible = true;
}

// ---------------------------------------------------------------- hologram materials
const HOLO_VS = `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const DOT_GLSL = `
  // ドットマトリクス：元絵を格子の中心で読み、丸い点で抜く。遠くでは点が潰れるので、面に寄せる
  float dotMask( vec2 uv, vec2 n ){ vec2 f=fract(uv*n)-.5; float d=1.-smoothstep(.24,.44,length(f)); float aa=clamp(max(fwidth(uv.x)*n.x,fwidth(uv.y)*n.y)*.9,0.,1.); return mix(d,.42,aa); }
  vec2 dotCell( vec2 uv, vec2 n ){ return (floor(uv*n)+.5)/n; }`;
// 元絵（白黒または色つき）をドットで出す。tint が null のときは共通のアクセント色
function dotMat(map, nx, ny, { tint = null, gain = 1.6, scroll = 0, rep = 1, bg = 0, side = THREE.DoubleSide, flick = .06 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, n: { value: new THREE.Vector2(nx, ny) }, tint: tint ? { value: new THREE.Color(...tint) } : uAcc, gain: { value: gain }, op: { value: 1 }, time: uTime, scroll: { value: scroll }, rep: { value: rep }, bg: { value: bg }, flick: { value: flick } },
    vertexShader: HOLO_VS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
    fragmentShader: `uniform sampler2D map; uniform vec2 n; uniform vec3 tint; uniform float gain, op, time, scroll, rep, bg, flick; varying vec2 vUv; ${DOT_GLSL}
      void main(){ vec2 q=vec2(vUv.x+time*scroll, vUv.y); vec2 c=dotCell(q,n);
        vec3 t=texture2D(map,vec2(c.x*rep,c.y)).rgb; float d=dotMask(q,n);
        float fl=1.-flick+flick*sin(time*31.+vUv.y*40.)*sin(time*7.3);
        vec3 col=(t+bg)*tint*d*gain*op*fl; gl_FragColor=vec4(col,1.); }`
  });
  return m;
}

// ---------------------------------------------------------------- shell
function buildShell() {
  makeFloor(T.floor, heightTex, X0, Z0, 12, 9, 'floorA');
  // 天井
  const ceil = plane(scene, 12, 9, 0, WH, 0, M.ceilA); ceil.rotation.x = Math.PI / 2; ceil.castShadow = true;
  // 壁際の段（明るいグレー）。内側の縁の下に白い光の帯
  // 段は、扉の切り欠きで輪が切れた C 字の形。穴ではなく一筆書きの外形にする（穴が外周に触れると、扉の敷居に厚みのない壁ができて、ちらつく）。
  // 形状は寝かせると z が反転するので、先に裏返しておく
  const ps = toShape([[X1, DZ1], [X1, Z1], [X0, Z1], [X0, Z0], [X1, Z0], [X1, DZ0], [IW, DZ0], ...rrPts(IW, ID, IR, 12).reverse(), [IW, DZ1]].map(([x, z]) => [x, -z]));
  const pg = new THREE.ExtrudeGeometry(ps, { depth: PH, bevelEnabled: false, curveSegments: 4 }); pg.rotateX(-Math.PI / 2);
  mesh(pg, M.plat, scene);
  mesh(ribbon(aPts(12, .004), .022, .072, (a, b) => a[0] === X1 && b[0] === X1), M.strip, scene, 0, 0, 0, false);   // 扉の敷居には帯を渡さない
  // 歩ける範囲の外周。扉の開口にあたる辺だけは壁にしない
  const bp = aPts(8); for (let i = 0; i < bp.length; i++) { const a = bp[i], b = bp[(i + 1) % bp.length]; if (a[0] === X1 && b[0] === X1) continue; addSeg(a[0], a[1], b[0], b[1]); }
  addSeg(X1, DZ0, BX0, DZ0); addSeg(X1, DZ1, BX0, DZ1);
  // 吊り天井（角丸の板）と、その縁の白い線。部屋の主な光に見せる
  const rs = toShape(rrPts(3.9, 2.5, 1.0, 12)); const rg = new THREE.ExtrudeGeometry(rs, { depth: .16, bevelEnabled: false }); rg.rotateX(-Math.PI / 2);
  mesh(rg, M.ceil, scene, 0, 3.16, 0);
  mesh(flatRing(3.9, 2.5, 1.0, .07), M.strip, scene, 0, 3.157, 0, false);
  mesh(ribbon(rrPts(4.25, 2.85, 1.2, 12), 3.36, 3.6), M.darkDS, scene, 0, 0, 0, false);
  mesh(flatRing(4.25, 2.85, 1.2, .05), M.strip, scene, 0, 3.362, 0, false);
  // 四隅の太い柱（暗い）と、根元と上の光の輪
  for (const [x, z] of [[X0 + .15, Z0 + .15], [X1 - .15, Z0 + .15], [X0 + .15, Z1 - .15], [X1 - .15, Z1 - .15]]) {
    cyl(scene, .62, .62, WH, x, WH / 2, z, M.dark, 40);
    cyl(scene, .635, .635, .045, x, PH + .14, z, M.strip, 40, false); cyl(scene, .635, .635, .03, x, 3.05, z, M.stripDim, 40, false);
  }
}
// 壁1面の共通部分。g のローカル座標は、x が壁に沿う向き、+z が部屋の内側
function wallBase(g, width, { panel = true, cut = null, H = WH, base = PH, S = M, strips = true, cast = false } = {}) {
  const spans = cut ? [[-width / 2, cut[0]], [cut[1], width / 2]] : [[-width / 2, width / 2]];
  for (const [a, b] of spans) {
    const w = b - a, c = (a + b) / 2;
    if (panel) { const p = plane(g, w, H, c, H / 2, 0, S.wall); p.receiveShadow = true; p.castShadow = cast; }
    box(g, w, .5, .05, c, base + .25, .025, S.dark);
    if (strips) box(g, Math.max(w - (cut ? .5 : 1.6), .1), .012, .012, c, base + .5, .055, S.stripDim, false);
  }
  if (cut && panel) { const p = plane(g, cut[1] - cut[0], H - DOOR_H, (cut[0] + cut[1]) / 2, (H + DOOR_H) / 2, 0, S.wall); p.receiveShadow = true; p.castShadow = cast; }
  box(g, width, .26, .16, 0, H - .13, .08, S.gloss);
  if (strips) box(g, width - 1.6, .03, .02, 0, H - .3, .17, S.strip, false);
}

// ---------------------------------------------------------------- north：六角壁
function buildHexWall() {
  const g = wallGroup(0, Z0, 0); wallBase(g, 12, { panel: false, strips: false });
  plane(g, 12, WH, 0, WH / 2, 0, M.black);
  plane(g, 9.6, 3.0, 0, 1.78, .03, M.hexBack);
  const R = .27, dx = Math.sqrt(3) * R, dy = 1.5 * R, cells = [];
  for (let j = 0; j < 7; j++) for (let i = -11; i <= 11; i++) { const x = i * dx + (j & 1 ? dx / 2 : 0), y = .62 + j * dy; if (Math.abs(x) > 4.55) continue; cells.push({ x, y, open: Math.abs(x) < 1.42 - Math.abs(y - 1.83) * .55 && Math.abs(y - 1.83) < .7 }); }
  const closed = cells.filter(c => !c.open), open = cells.filter(c => c.open);
  const hg = new THREE.CylinderGeometry(R * .955, R * .955, 1, 6); hg.rotateX(Math.PI / 2);
  const im = new THREE.InstancedMesh(hg, M.hex, closed.length), d = new THREE.Object3D();
  closed.forEach((c, k) => { const dep = Math.abs(c.x) > 4.2 ? .34 : [.1, .16, .16, .24, .3][Math.floor(rnd() * 5)]; d.position.set(c.x, c.y, .04 + dep / 2); d.scale.set(1, 1, dep); d.updateMatrix(); im.setMatrixAt(k, d.matrix); });
  im.castShadow = true; im.receiveShadow = true; g.add(im);
  // 中央：開いた六角の枠と、奥へ向かう三角の羽根。奥の光が隙間から漏れる
  const hexPts = (r) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 2 + k * Math.PI / 3; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const fs = toShape(hexPts(R * .955)); fs.holes.push(toShape(hexPts(R * .8), THREE.Path));
  const fg = new THREE.ExtrudeGeometry(fs, { depth: .2, bevelEnabled: false });
  const fm = new THREE.InstancedMesh(fg, M.hexFrame, open.length), fin = new THREE.InstancedMesh(new THREE.BoxGeometry(R * 1.62, .014, .17), M.hexFrame, open.length * 3);
  open.forEach((c, k) => { d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.position.set(c.x, c.y, .05); d.updateMatrix(); fm.setMatrixAt(k, d.matrix);
    for (let q = 0; q < 3; q++) { d.position.set(c.x, c.y, .135); d.rotation.set(0, 0, Math.PI / 2 + q * Math.PI / 3); d.updateMatrix(); fin.setMatrixAt(k * 3 + q, d.matrix); } });
  d.rotation.set(0, 0, 0);
  fm.castShadow = fin.castShadow = true; g.add(fm, fin);
  // 両脇の縦の柱と、黄色の線
  const pil = decalTex(160, 1160, LIGHT_BG, .5, .12, (c, U, w, h) => { U.frame(8, 8, w - 16, h - 16, 8); for (const y of [220, 520, 900]) U.seam(8, y, w - 8, y); U.slots(30, 40, w - 60, 120, 9); U.slots(30, 940, w - 60, 160, 12);
    c.save(); c.translate(w / 2 + 22, 500); c.rotate(-Math.PI / 2); U.text('HEX ARRAY', 0, 0, 44, { wt: 700, col: 'rgba(18,20,24,.7)' }); c.restore(); U.text('N-01', 34, 560, 20); U.tag(34, 572, 50, 8); U.hazard(24, 860, w - 48, 16); for (const y of [24, 236, 536, 916, h - 24]) { U.bolt(22, y, 3); U.bolt(w - 22, y, 3); } });
  for (const s of [-1, 1]) { rbox(g, .46, 3.0, .5, s * 4.95, 1.78, .25, M.light, .05); decal(g, .4, 2.9, s * 4.95, 1.78, .5015, pil, 0, 'A'); box(g, .03, 2.5, .012, s * 4.78, 1.78, .506, M.yellow, false); box(g, .012, 2.7, .02, s * 4.69, 1.78, .44, M.stripB, false); }
  box(g, 9.5, .1, .46, 0, .47, .23, M.dark); box(g, 9.5, .1, .46, 0, 3.12, .23, M.dark);
  box(g, 9.2, .014, .014, 0, .53, .465, M.stripB, false);
}

// ---------------------------------------------------------------- west：情報ボードと卓
const board = { mats: [] }, consolePos = new THREE.Vector3(X0 + .95, 1, 0);
function buildWest() {
  const g = wallGroup(X0, 0, Math.PI / 2); wallBase(g, 9);
  rbox(g, 6.9, 2.5, .08, 0, 2.0, .04, M.panel, .03);
  for (const y of [.74, 3.26]) box(g, 6.9, .03, .1, 0, y, .05, M.light, false);
  // 奥の層：格子、点、つなぐ線（アクセント色）
  const nodes = []; for (let i = 0; i < 15; i++) nodes.push([rr(.06, .94), rr(.12, .88)]);
  nodes[0] = [.5, .5];
  const back = inkTex(1792, 588, (c, w, h) => {
    c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 1; for (let x = 0; x <= w; x += 56) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 56) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = '#fff'; c.lineWidth = 3;
    for (let i = 1; i < nodes.length; i++) { let b = 0, bd = 9; for (let k = 0; k < i; k++) { const dd = Math.hypot(nodes[i][0] - nodes[k][0], (nodes[i][1] - nodes[k][1]) * .33); if (dd < bd) { bd = dd; b = k; } } c.beginPath(); c.moveTo(nodes[i][0] * w, nodes[i][1] * h); c.lineTo(nodes[b][0] * w, nodes[b][1] * h); c.stroke(); if (i % 3 === 0) { c.beginPath(); c.moveTo(nodes[i][0] * w, nodes[i][1] * h); c.lineTo(nodes[0][0] * w, nodes[0][1] * h); c.stroke(); } }
    c.lineWidth = 5; c.beginPath(); c.arc(w / 2, h / 2, 112, -.3, TAU - .9); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(w / 2, h / 2, 132, 0, TAU); c.stroke();
    c.fillStyle = '#000'; c.beginPath(); c.arc(w / 2, h / 2, 106, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `700 46px ${FJ}`; c.fillText('同期中', w / 2, h / 2 + 4); c.font = `600 24px ${FE}`; c.fillText('SYNCHRONIZING', w / 2, h / 2 + 40);
    for (let i = 0; i < 26; i++) { const x = rr(40, w - 40), y = rr(30, h - 30); c.lineWidth = 4; c.beginPath(); c.moveTo(x - 11, y - 11); c.lineTo(x + 11, y + 11); c.moveTo(x + 11, y - 11); c.lineTo(x - 11, y + 11); c.stroke(); }
    c.textAlign = 'left'; c.font = `600 22px ${FE}`; c.fillText('C-07 // RELAY MAP // RING POSITION 212.4', 24, 34); c.textAlign = 'right'; c.fillText('NODES 15  ·  LINKS 19  ·  LATENCY 0.8', w - 24, h - 18);
  });
  const bm = dotMat(back, 448, 147, { gain: .95, bg: .012 }); plane(holoGroup, 6.4, 2.1, 0, 0, 0, bm).userData.wall = [g, 0, 2.0, .16];
  // 手前の層：カード（自前の図）
  const front = inkTex(1792, 588, (c, w, h) => {
    const card = (cx, cy, cw, ch, kind) => {
      const x = cx - cw / 2, y = cy - ch / 2; c.fillStyle = ['rgba(235,238,242,.95)', 'rgba(120,150,255,.9)', 'rgba(255,90,80,.85)', 'rgba(150,235,190,.9)'][kind % 4]; c.fillRect(x, y, cw, ch);
      c.fillStyle = 'rgba(0,0,0,.82)'; c.fillRect(x + 6, y + 6, cw - 12, ch * .62);
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.beginPath();
      if (kind % 3 === 0) { for (let i = 0; i <= 20; i++) { const px = x + 10 + (cw - 20) * i / 20, py = y + 6 + ch * .31 + Math.sin(i * .9 + cx) * ch * .2 * Math.sin(i * .31 + cy); i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
      else if (kind % 3 === 1) { for (let r = 8; r < ch * .28; r += 9) { c.beginPath(); c.arc(cx + Math.sin(r) * 6, y + 6 + ch * .31, r, 0, TAU); c.stroke(); } }
      else { for (let i = 0; i < 7; i++) { const bh = (.2 + .8 * Math.abs(Math.sin(i * 1.7 + cx))) * ch * .5; c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(x + 12 + i * (cw - 24) / 7, y + 6 + ch * .6 - bh, (cw - 24) / 7 - 4, bh); } }
      c.fillStyle = 'rgba(0,0,0,.85)'; for (let i = 0; i < 3; i++) c.fillRect(x + 8, y + ch * .72 + i * ch * .08, (cw - 16) * (i === 2 ? .5 : 1), ch * .04);
    };
    nodes.forEach(([nx, ny], i) => { if (!i) return; const s = rr(.75, 1.25); card(nx * w, ny * h, 78 * s, 104 * s, i); });
    c.fillStyle = 'rgba(255,255,255,.9)'; c.font = `600 16px ${FE}`; nodes.forEach(([nx, ny], i) => { if (i) c.fillText('N-' + String(i).padStart(2, '0'), nx * w + 46, ny * h - 40); });
  });
  const fmat = dotMat(front, 448, 147, { tint: [1, 1, 1], gain: .6 }); plane(holoGroup, 6.4, 2.1, 0, 0, 0, fmat).userData.wall = [g, 0, 2.0, .27];
  board.mats.push(bm, fmat);
  // 卓
  rbox(g, 3.4, .62, .56, 0, PH + .31, .42, M.dark, .06); rbox(g, 3.5, .06, .66, 0, PH + .65, .42, M.gloss, .02);
  box(g, 2.9, .012, .34, 0, PH + .687, .42, M.stripDim, false);
  box(g, 3.1, .014, .012, 0, PH + .04, .705, M.warm, false);
  decal(g, 3.26, .5, 0, PH + .33, .7015, decalTex(1300, 200, DARK_BG, .42, .45, (c, U, w, h) => { U.frame(6, 6, w - 12, h - 12, 8, 2); for (const x of [w * .25, w * .5, w * .75]) U.seam(x, 6, x, h - 6, 2);
    U.text('RELAY CONSOLE', 26, 50, 30, { wt: 700, col: INK_L }); U.text('C-07-R  ·  ACCENT SELECT', 26, 76, 16, { wt: 500, col: 'rgba(206,210,216,.4)' }); U.hazard(26, h - 44, 200, 14);
    U.slots(w * .25 + 30, 40, 240, 110, 8); U.slots(w * .5 + 30, 40, 240, 110, 8); for (let i = 0; i < 4; i++) U.fill(w * .75 + 30, 44 + i * 30, 70, 14, i === 1 ? '#d8b40e' : 'rgba(0,0,0,.6)', 4); U.text('PWR / LINK / AUX', w * .75 + 120, 70, 16, { wt: 500, col: 'rgba(206,210,216,.4)' }); }), 0, 'A');
  const sb = decalTex(240, 460, LIGHT_BG, .5, .12, (c, U, w, h) => { U.frame(8, 8, w - 16, h - 16, 8); U.seam(8, 150, w - 8, 150); U.slots(30, 30, w - 60, 90, 6); U.text('AUX', 28, 210, 54, { wt: 700, col: 'rgba(18,20,24,.72)' }); U.text('POWER UNIT', 30, 236, 16, { wt: 500 }); U.tag(30, 248, 60, 9); U.slots(30, h - 110, w - 60, 70, 5); U.bolt(22, 22); U.bolt(w - 22, 22); U.bolt(22, h - 22); U.bolt(w - 22, h - 22); });
  for (const s of [-1, 1]) { rbox(g, .5, .9, .4, s * 3.9, PH + .45, .34, M.light, .05); decal(g, .44, .84, s * 3.9, PH + .45, .5415, sb, 0, 'A'); }
}

// ---------------------------------------------------------------- east：鉱石の表示と、閉じた通路
const ORE_FS = `uniform float time; uniform vec3 acc; varying vec2 vUv;
  vec2 h2(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i).x,h2(i+vec2(1,0)).x,f.x),mix(h2(i+vec2(0,1)).x,h2(i+vec2(1,1)).x,f.x),f.y); }
  float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+3.1; a*=.5; } return s; }
  // 面の割れた黒い鉱石：ボロノイの各面にばらばらの向きを与えて、動く光で照らす
  vec3 facet(vec2 p, out float edge){ vec2 i=floor(p), f=fract(p); float d1=9., d2=9.; vec2 id=vec2(0.);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 o=h2(i+g); float d=length(g+o-f); if(d<d1){ d2=d1; d1=d; id=i+g; } else if(d<d2) d2=d; }
    edge=d2-d1; vec2 r=h2(id+7.3)-.5; return normalize(vec3(r*1.7,.55)); }
  void main(){ vec2 p=vUv*vec2(4.6,2.25); vec2 w=p+vec2(fbm(p*.7),fbm(p*.7+9.))*1.3;
    float e1, e2; vec3 n1=facet(w*1.6,e1), n2=facet(w*4.1+4.,e2); vec3 n=normalize(n1+n2*.6+vec3(vn(w*13.)-.5,vn(w*13.+5.)-.5,0.)*.9);
    vec3 l=normalize(vec3(sin(time*.11)*.7,cos(time*.083)*.5,.75)); float sp=pow(max(dot(n,l),0.),46.); float df=max(dot(n,l),0.);
    float gold=smoothstep(.52,.7,fbm(w*.5+2.)); float vein=1.-smoothstep(.0,.05,e1);
    float grit=fbm(w*9.);
    float crease=1.-smoothstep(.0,.035,e1); float crease2=1.-smoothstep(.0,.03,e2);
    vec3 col=vec3(.004,.0045,.006)+vec3(.02,.021,.026)*pow(df,5.)+vec3(.8,.84,.95)*sp*.4;
    col+=vec3(.5,.52,.6)*(crease*.05+crease2*.025)*(.3+df);                        // 折れ目の細い照り
    vec3 au=vec3(.085,.055,.01)*(.2+1.3*pow(df,2.))*(.4+1.2*grit)+vec3(1.15,.8,.22)*sp*1.3+vec3(.6,.42,.1)*crease*.25;
    col=mix(col,au,gold*smoothstep(.3,.55,grit+gold*.35));
    vec2 v=vUv-.5; col*=1.-dot(v,v)*1.1; gl_FragColor=vec4(col,1.); }`;
const door = { mat: null, pos: new THREE.Vector3(X1 + .2, 0, DZC), panel: null, seg: null, open: 0, want: 0 };
let oreMat;
function buildEast() {
  const g = wallGroup(X1, 0, -Math.PI / 2); wallBase(g, 9, { cut: [DZ0, DZ1] }); door.group = g;
  const ox = -1.75;
  rbox(g, 4.4, 2.62, .16, ox, 2.0, .08, M.light, .06); rbox(g, 4.12, 2.34, .05, ox, 2.0, .155, M.gloss, .02);
  // 鉱石の表示：画像があればそれを映し、ゆっくり動く光だけをシェーダで重ねる
  oreMat = T.ore ? new THREE.ShaderMaterial({ uniforms: { time: uTime, map: { value: T.ore } }, vertexShader: HOLO_VS,
    fragmentShader: `uniform sampler2D map; uniform float time; varying vec2 vUv;
      void main(){ vec3 t=texture2D(map,vec2(vUv.x*.908+.046,vUv.y)).rgb; float l=dot(t,vec3(.3,.6,.1));
        float q=(vUv.x+vUv.y*.4-fract(time*.03)*2.4+.5)/.2; float sweep=exp(-q*q);
        vec3 col=t*(.8+.2*sin(time*.5+vUv.x*7.+vUv.y*4.))+t*l*sweep*2.4; vec2 v=vUv-.5; col*=1.-dot(v,v)*.7; gl_FragColor=vec4(col*1.15,1.); }` })
    : new THREE.ShaderMaterial({ uniforms: { time: uTime, acc: uAcc }, vertexShader: HOLO_VS, fragmentShader: ORE_FS });
  plane(g, 3.96, 2.18, ox, 2.0, .184, oreMat);
  box(g, 1.2, .05, .012, ox - 1.5, .78, .164, M.yellow, false);
  // 表示の手前に浮く、区画名の帯（紫の点）
  const band = inkTex(2048, 96, (c, w, h) => {
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(0, 22, w, 52);
    c.fillStyle = '#fff'; c.font = `700 44px ${FE}`; c.textAlign = 'center';
    for (const x of [w * .25, w * .75]) { c.fillText('CONTROL  SECTOR', x, 64); c.fillRect(x - 230, 30, 26, 5); c.fillRect(x - 230, 30, 5, 36); c.fillRect(x + 204, 61, 26, 5); c.fillRect(x + 225, 30, 5, 36); }
  });
  plane(holoGroup, 5.0, .26, 0, 0, 0, dotMat(band, 580, 30, { tint: [.72, .56, 1.0], gain: 1.5, scroll: .006 })).userData.wall = [g, ox, 1.5, .5];
  // 私室への通路。壁の厚みの中に引き戸があり、近づくと開く
  const dw = DZ1 - DZ0;
  box(g, DZ0 + 4.5, WH, .39, (DZ0 - 4.5) / 2, WH / 2, -.2, M.dark); box(g, 4.5 - DZ1, WH, .39, (DZ1 + 4.5) / 2, WH / 2, -.2, M.dark); box(g, dw, WH - DOOR_H, .39, DZC, (WH + DOOR_H) / 2, -.2, M.dark);
  for (const s of [-1, 1]) { rbox(g, .24, DOOR_H + .22, .34, DZC + s * (dw / 2 + .12), (DOOR_H + .22) / 2, .08, M.lightGloss, .06); box(g, .02, DOOR_H - .2, .03, DZC + s * (dw / 2 - .012), DOOR_H / 2, .12, M.yellow, false); box(g, .012, DOOR_H - .3, .012, DZC + s * (dw / 2 - .008), DOOR_H / 2, -.2, M.stripDim, false); }
  rbox(g, dw + .48, .26, .34, DZC, DOOR_H + .13, .08, M.lightGloss, .06); box(g, dw - .2, .02, .03, DZC, DOOR_H - .012, .12, M.yellow, false);
  door.panel = rbox(g, dw + .06, DOOR_H + .02, .07, DZC, DOOR_H / 2, -.2, M.dark, .01);
  box(door.panel, dw - .3, .05, .075, 0, .25, 0, M.yellow, false);
  door.seg = addSeg(X1 + .2, DZ0, X1 + .2, DZ1);
  const cur = inkTex(512, 800, (c, w, h) => {
    c.strokeStyle = '#fff'; c.lineWidth = 12; c.lineJoin = 'miter';
    c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3, x = w / 2 + Math.cos(a) * 120, y = 300 + Math.sin(a) * 120; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.stroke();
    c.lineWidth = 18; c.beginPath(); c.moveTo(w / 2 - 54, 268); c.lineTo(w / 2, 322); c.lineTo(w / 2 + 54, 268); c.stroke(); c.beginPath(); c.moveTo(w / 2 - 54, 312); c.lineTo(w / 2, 366); c.lineTo(w / 2 + 54, 312); c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `700 72px ${FE}`; c.fillText('C-08', w / 2, 540); c.font = `700 40px ${FJ}`; c.fillText('私室', w / 2, 604); c.font = `600 24px ${FE}`; c.fillText('PRIVATE QUARTERS', w / 2, 640);
    c.lineWidth = 5; for (const [x, y] of [[50, 60], [w - 50, 60], [50, h - 60], [w - 50, h - 60]]) { c.beginPath(); c.moveTo(x - 14, y - 14); c.lineTo(x + 14, y + 14); c.moveTo(x + 14, y - 14); c.lineTo(x - 14, y + 14); c.stroke(); }
    c.fillRect(40, 30, w - 80, 4); c.fillRect(40, h - 34, w - 80, 4);
  });
  door.mat = dotMat(cur, 96, 150, { gain: 1.3, bg: .03 });
  plane(holoGroup, dw - .06, DOOR_H - .06, 0, 0, 0, door.mat).userData.wall = [g, DZC, DOOR_H / 2, .1];
}
function updateDoor(dt) {
  const d = Math.hypot(player.x - door.pos.x, player.z - door.pos.z), want = d < 2.3 && Math.abs(player.z - DZC) < 1.5 && state === 'play' ? 1 : 0;
  if (want !== door.want) { door.want = want; audio.door(want); }
  door.open += (want - door.open) * (1 - Math.exp(-dt * 5.5)); const e = door.open * door.open * (3 - 2 * door.open);
  door.panel.position.x = DZC - (DZ1 - DZ0 + .08) * e; door.seg.on = door.open < .75;
  door.mat.uniforms.op.value = lerp(.5, 1.25, 1 - sstep(1.6, 5, d)) * (1 - .75 * e);
}

// ---------------------------------------------------------------- south：展望窓と、窓の外
// 窓の外：低い軌道から見た惑星と星。距離は「半径600に対して高度40」で、地平線がゆるい弧になる
const SUN = new THREE.Vector3(.7, .35, .6).normalize(), NADIR = new THREE.Vector3(-.45, -.75, .48).normalize();
// 惑星と大気と天の川のもやは重いので、起動時に一度だけキューブマップへ焼く。毎フレーム計算するのは星と太陽だけ
const SKY_VS = `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const SKY_COMMON = `precision highp float; varying vec3 vW; uniform float time; uniform vec3 sunDir, cdir;
    float hash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float fbm5(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+7.1; a*=.5; } return s; }
    float fbm3(vec3 p){ float a=.5,s=0.; for(int i=0;i<3;i++){ s+=a*noise(p); p=p*2.03+7.1; a*=.5; } return s*1.14; }
`;
const skyRT = new THREE.WebGLCubeRenderTarget(COARSE ? 512 : 1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
const SKY_TEX = src => { for (const [a, b] of [["        float land=fbm5(n*6.5+vec3(3.1,0.,1.7)); float coast=smoothstep(.5,.535,land+.03*(noise(n*60.)-.5));\n        vec3 ocean=mix(vec3(.004,.02,.07),vec3(.012,.075,.14),smoothstep(.2,.5,land));\n        float veg=fbm3(n*18.+5.); vec3 landc=mix(vec3(.045,.08,.03),vec3(.2,.15,.085),smoothstep(.35,.65,veg)); landc=mix(landc,vec3(.33,.32,.3),smoothstep(.66,.8,land)); landc*=1.2+.6*noise(n*90.);\n        vec3 surf=mix(ocean,landc,coast);", "        // 地表は画像。見えている範囲（真下を中心にした円）へ、真上からの写真を1枚貼る\n        vec3 n0=-cdir; vec3 e1=normalize(cross(vec3(0.,1.,0.),n0)); vec3 e2=cross(n0,e1); vec2 tp=vec2(dot(n,e1),dot(n,e2));\n        vec3 tx=texture2D(tSurf,vec2(tp.x/.69,tp.y/.46)+vec2(.5,.62)).rgb; float coast=1.-smoothstep(0.,.05,tx.b-max(tx.r,tx.g)*1.02);\n        vec3 surf=tx*vec3(.42,.44,.52)*(.85+.3*noise(n*240.));"], ["        vec3 w=n*13.+vec3(time*.004,0.,time*.002); w+=1.5*vec3(fbm3(n*5.+1.),fbm3(n*5.+8.),fbm3(n*5.+15.));\n        float cd=fbm3(w*4.5)+(noise(w*21.)-.5)*.16; float cb=fbm5(w)*.72+cd*.3; float cl=smoothstep(.535,.66,cb);\n        vec3 st=sunDir-n*ndl; float cb2=fbm5(w+st*.1)*.72+cd*.3; float cl2=smoothstep(.535,.66,cb2);", "        // 雲も画像。細かいむらで読む位置を少しずらし、太陽の側へずらして読んだ差で陰影と地表への影を出す\n        float cdn=fbm3(n*80.)-.5; vec2 cuv=vec2(tp.x/.84,tp.y/.56)+vec2(.22,.8)+cdn*.004;\n        float cb=texture2D(tCloud,cuv).r; float cl=smoothstep(.2,.8,cb)*(.9+.4*cdn);\n        vec3 st=sunDir-n*ndl; float cb2=texture2D(tCloud,cuv+vec2(dot(st,e1),dot(st,e2))*.007).r; float cl2=smoothstep(.2,.8,cb2);"], ["vec3 cc=vec3(.9,.93,.98)*clamp(.72+(cb-cb2)*7.,.5,1.15);", "vec3 cc=vec3(.9,.93,.98)*clamp(.78+(cb-cb2)*2.2,.5,1.15);"]]) { if (!src.includes(a)) { console.warn('sky: 置き換えに失敗'); return src; } src = src.replace(a, b); } return src; };
const loadTex = (url, srgb) => new Promise(res => new THREE.TextureLoader().load(url, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => res(null)));
// 画像があれば地表と雲に使う。無ければ、コードで描いた模様のまま
function bakeSky(tSurf, tCloud) {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { time: { value: 0 }, sunDir: { value: SUN }, cdir: { value: NADIR }, tSurf: { value: tSurf }, tCloud: { value: tCloud } }, vertexShader: SKY_VS,
    fragmentShader: SKY_COMMON + 'uniform sampler2D tSurf, tCloud;\n' + ((tSurf && tCloud) ? SKY_TEX : (x => x))(`
    void main(){ vec3 d=normalize(vW-vec3(0.,1.6,0.)); vec3 ax=normalize(vec3(.35,.8,-.48)); float bb=dot(d,ax); float band=exp(-bb*bb/.03); float lane=smoothstep(.42,.68,fbm3(d*8.+11.));
      vec3 col=vec3(.07,.075,.11)*band*(.3+1.4*fbm3(d*5.+3.))*(1.-.85*lane)*.26+vec3(.014,.01,.03)*pow(fbm3(d*2.4+2.),3.); float alpha=0.;
      float pr=600.; vec3 oc=-cdir*640.; float b=dot(oc,d); float disc=b*b-(dot(oc,oc)-pr*pr); float closest=sqrt(max(dot(oc,oc)-b*b,0.));
      if(disc>0.&&b<0.){
        vec3 n=(oc+d*(-b-sqrt(disc)))/pr; vec3 v=-d; float ndl=dot(n,sunDir); float day=smoothstep(-.1,.22,ndl); float sunl=max(ndl,0.);
        // 地表：海の深さ、植生と乾いた土地、山
        float land=fbm5(n*6.5+vec3(3.1,0.,1.7)); float coast=smoothstep(.5,.535,land+.03*(noise(n*60.)-.5));
        vec3 ocean=mix(vec3(.004,.02,.07),vec3(.012,.075,.14),smoothstep(.2,.5,land));
        float veg=fbm3(n*18.+5.); vec3 landc=mix(vec3(.045,.08,.03),vec3(.2,.15,.085),smoothstep(.35,.65,veg)); landc=mix(landc,vec3(.33,.32,.3),smoothstep(.66,.8,land)); landc*=1.2+.6*noise(n*90.);
        vec3 surf=mix(ocean,landc,coast);
        float spec=pow(max(dot(n,normalize(sunDir+v)),0.),220.)*(1.-coast);
        // 雲：流れをゆがめた二層。太陽の側へずらして読んだ差で、雲の陰影と地表への影を出す
        vec3 w=n*13.+vec3(time*.004,0.,time*.002); w+=1.5*vec3(fbm3(n*5.+1.),fbm3(n*5.+8.),fbm3(n*5.+15.));
        float cd=fbm3(w*4.5)+(noise(w*21.)-.5)*.16; float cb=fbm5(w)*.72+cd*.3; float cl=smoothstep(.535,.66,cb);
        vec3 st=sunDir-n*ndl; float cb2=fbm5(w+st*.1)*.72+cd*.3; float cl2=smoothstep(.535,.66,cb2);
        surf*=1.-.5*cl2*(1.-cl);
        vec3 cc=vec3(.9,.93,.98)*clamp(.72+(cb-cb2)*7.,.5,1.15);
        vec3 lit=surf*(.03+1.25*sunl)+vec3(1.,.88,.7)*spec*.9*day*(1.-cl);
        lit=mix(lit,cc*(.04+1.3*sunl),cl*.93);
        lit*=mix(vec3(1.,.5,.28),vec3(1.),smoothstep(-.02,.3,ndl));                        // 昼夜の境目は赤く
        vec3 cg=n*900.; vec3 cf=fract(cg)-.5; float city=step(.82,hash(floor(cg)))*coast*smoothstep(.4,.6,fbm3(n*40.+2.))*(1.-day)*(1.-cl)*exp(-dot(cf,cf)*8.);
        lit+=vec3(1.,.66,.3)*city*1.4;
        // 大気：地平線に近いほど青く霞み、縁に細い光
        float mu=max(dot(n,v),0.); float lim=smoothstep(-.1,.3,ndl);
        col=mix(lit,vec3(.14,.38,1.)*(.05+1.0*smoothstep(-.15,.4,ndl)),clamp(pow(1.-mu,3.5)*.8+.04,0.,1.));
        col+=vec3(.45,.7,1.)*pow(1.-mu,10.)*lim*1.2; alpha=1.;
      } else if(b<0.){
        float hh=max(closest-pr,0.); vec3 pn=normalize(oc+d*(-b)); float sl=dot(pn,sunDir); float dl=smoothstep(-.15,.35,sl);
        col+=vec3(.45,.7,1.)*exp(-hh/1.4)*1.15*dl+vec3(.12,.3,1.)*exp(-hh/7.)*.4*dl+vec3(1.,.4,.15)*exp(-hh/2.5)*(1.-smoothstep(0.,.3,abs(sl)))*.5; alpha=clamp(exp(-hh/3.)*1.2,0.,1.);
      }
      gl_FragColor=vec4(col,alpha); }`) });
  const sc = new THREE.Scene(), geo = new THREE.SphereGeometry(140, 32, 16); sc.add(new THREE.Mesh(geo, m));
  const cam = new THREE.CubeCamera(1, 300, skyRT); cam.position.set(0, 1.6, 0); cam.update(renderer, sc); geo.dispose(); m.dispose();
}
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: { sky: { value: skyRT.texture }, sunDir: { value: SUN }, gain: { value: 1 } }, vertexShader: SKY_VS,
  fragmentShader: `precision highp float; varying vec3 vW; uniform samplerCube sky; uniform vec3 sunDir; uniform float gain;
    float hash(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    // 星：大きさと明るさをばらつかせた二層と、天の川の帯（暗い筋つき）
    vec3 stars(vec3 d){ vec3 col=vec3(0.); vec3 ax=normalize(vec3(.35,.8,-.48)); float b=dot(d,ax); float band=exp(-b*b/.03);
      for(int L=0;L<2;L++){ float fl=float(L); float sc=mix(190.,75.,fl); vec3 g=d*sc; vec3 id=floor(g); vec3 f=fract(g)-.5; float h=hash(id+fl*17.);
        vec3 o=(vec3(hash(id+1.3),hash(id+2.7),hash(id+4.1))-.5)*.55; vec3 q=f-o; float r2=dot(q,q);
        float th=mix(.9,.975,fl)-band*mix(.3,.012,fl); float br=pow(fract(h*91.7),3.)*mix(.7,3.4,fl)+.1;
        col+=step(th,h)*exp(-r2*mix(300.,110.,fl))*br*mix(vec3(.62,.76,1.),vec3(1.,.8,.6),fract(h*37.)); }
      return col; }
    void main(){ vec3 d=normalize(vW-vec3(0.,1.6,0.)); vec4 bk=textureCube(sky,d);
      vec3 col=bk.rgb+stars(d)*(1.-clamp(bk.a,0.,1.));
      float sd=dot(d,sunDir); col+=vec3(1.,.93,.82)*(smoothstep(.99988,.99996,sd)*14.+pow(max(sd,0.),1400.)*1.4+pow(max(sd,0.),60.)*.06)*(1.-clamp(bk.a,0.,1.));
      gl_FragColor=vec4(col*gain,1.); }`
});
// 展望窓のある南の壁。cx は窓の中心の x、WX は窓の半幅。mull は斜めの桟の位置（null でなし）
function buildWindow({ cx, wallW, WX, Y0, Y1, H, base, S, envTex, boxGlsl, mull, hud, clipX, strips = true, cast = false }) {
  const g = wallGroup(cx, Z1, Math.PI); wallBase(g, wallW, { panel: false, H, base, S, strips });
  for (const s of [-1, 1]) { const p = plane(g, wallW / 2 - WX, H, s * (WX + (wallW / 2 - WX) / 2), H / 2, 0, S.wall); p.receiveShadow = true; p.castShadow = cast; }
  box(g, WX * 2, Y0, .3, 0, Y0 / 2, -.15, S.dark); box(g, WX * 2, H - Y1, .3, 0, (H + Y1) / 2, -.15, S.dark);
  for (const s of [-1, 1]) rbox(g, .16, Y1 - Y0 + .16, .36, s * (WX + .02), (Y0 + Y1) / 2, -.1, S.light, .04);
  rbox(g, WX * 2 + .2, .1, .36, 0, Y0 - .02, -.1, S.light, .03); rbox(g, WX * 2 + .2, .1, .36, 0, Y1 + .02, -.1, S.light, .03);
  box(g, WX * 2 - .3, .014, .014, 0, Y0 + .045, .085, S.strip, false);
  if (mull) for (const s of [-1, 1]) { const b = box(g, .07, Y1 - Y0 + .3, .14, s * mull, (Y0 + Y1) / 2, -.2, S.dark); b.rotation.z = s * .16; }
  // 窓ガラス：室内の映りこみ（視線が浅いほど強い）と、縁の曇り。外の景色との間に一枚はさむ
  const glass = new THREE.ShaderMaterial({ uniforms: { env: { value: envTex }, time: uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: HOLO_VS,
    fragmentShader: `uniform samplerCube env; uniform float time; varying vec2 vUv; varying vec3 vW; ${boxGlsl}
      float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec3 vd=normalize(vW-cameraPosition); vec3 n=vec3(0.,0.,-1.); float ndv=max(dot(-vd,n),0.);
        vec3 r=boxProject(reflect(vd,n),vW); vec3 refl=textureCube(env,r).rgb; ${GUARD('refl', '8.0')}
        float fr=.04+.5*pow(1.-ndv,5.);
        float sm=vn(vUv*vec2(26.,7.))*.6+vn(vUv*vec2(90.,24.)+3.)*.4;                       // 拭きむら
        float ed=min(min(vUv.x,1.-vUv.x)*4.2,min(vUv.y,1.-vUv.y));
        float frost=(1.-smoothstep(0.,.16,ed))*(.5+.5*sm);
        vec3 col=refl*fr*(.75+.5*sm)+vec3(.05,.075,.12)*frost*.3+vec3(.012,.018,.03)*sm*(.2+.8*(1.-ndv));
        gl_FragColor=vec4(col,1.); }` });
  plane(holoGroup, WX * 2, Y1 - Y0, 0, 0, 0, glass).userData.wall = [g, 0, (Y0 + Y1) / 2, -.03];
  // ガラスに出る表示（淡い点）
  const ht = inkTex(2048, 64, (c, w, h) => { c.fillStyle = '#fff'; c.font = `600 34px ${FE}`; c.textBaseline = 'middle'; let x = 30;
    for (const t of hud) { c.fillText(t, x, h / 2 + 2); x += c.measureText(t).width + 40; }
    c.fillRect(0, 4, w, 3); c.fillRect(0, h - 7, w, 3); });
  plane(holoGroup, WX * 2 - .3, .2, 0, 0, 0, dotMat(ht, Math.round(WX * 200), 20, { tint: [.55, .8, 1.0], gain: .32, scroll: .003, flick: .03 })).userData.wall = [g, 0, Y0 + .24, .0];
  // 窓から差す光の筋：窓の開口を、太陽と逆の向きへ床まで掃いた薄い面を重ねる
  const L = SUN.clone().negate(), zw = Z1 - .12, kx = L.x / -L.y, kz = L.z / -L.y, pos = [], uv = [], sd = [], nr = [];
  const quad = (a, b, k) => { const fa = [a[0] + kx * a[1], 0, zw + kz * a[1]], fb = [b[0] + kx * b[1], 0, zw + kz * b[1]], A = [a[0], a[1], zw], B = [b[0], b[1], zw];
    pos.push(...A, ...B, ...fb, ...A, ...fb, ...fa); uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0); const r0 = rnd(), e1 = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]), e2 = new THREE.Vector3(fa[0] - A[0], fa[1] - A[1], fa[2] - A[2]), nn = e1.cross(e2).normalize(); for (let i = 0; i < 6; i++) { sd.push(k, r0); nr.push(nn.x, nn.y, nn.z); } };
  const nv = Math.round(WX * 4), ml = mull || 99;
  for (let i = 0; i < nv; i++) { const x = lerp(-WX + .1, WX - .1, (i + rr(.2, .8)) / nv); if (Math.abs(Math.abs(x) - ml) < .22) continue; quad([cx + x, Y0], [cx + x, Y1], 0); }
  for (let j = 0; j < 9; j++) { const y = lerp(Y0 + .05, Y1 - .05, (j + rr(.2, .8)) / 9); for (const [x0, x1] of mull ? [[-WX, -ml - .2], [-ml + .2, ml - .2], [ml + .2, WX]] : [[-WX, WX]]) quad([cx + x0, y], [cx + x1, y], 1); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setAttribute('sd', new THREE.Float32BufferAttribute(sd, 2)); sg.setAttribute('nr', new THREE.Float32BufferAttribute(nr, 3));
  const shafts = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: { time: uTime, amp: { value: 1 }, clipX: { value: clipX } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 sd; attribute vec3 nr; varying vec2 vUv; varying vec2 vS; varying vec3 vN; varying vec3 vP; void main(){ vUv=uv; vS=sd; vN=nr; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float time, amp, clipX; varying vec2 vUv; varying vec2 vS; varying vec3 vN; varying vec3 vP;
      void main(){ if(vP.x<clipX) discard;                                                // 隣の部屋へ突き抜けた分は描かない
        vec3 vd=vP-cameraPosition; float face=abs(dot(vN,vd))/max(length(vd),1e-4); float thin=smoothstep(.03,.3,face);   // 面を真横から見たときは消す（線に見えるため）
        float u=vUv.x; float f=(1.-smoothstep(.35,.95,u))*smoothstep(0.,.04,u);
        float e=mix(1.,smoothstep(0.,.06,vUv.y)*(1.-smoothstep(.94,1.,vUv.y)),vS.x);
        float dust=.75+.25*sin(u*37.+vS.y*60.+time*.25)*sin(vUv.y*23.+vS.y*17.);
        gl_FragColor=vec4(vec3(1.,.95,.86)*f*e*dust*thin*(.0035+.0045*vS.y)*amp,1.); }` }));
  shafts.frustumCulled = false; holoGroup.add(shafts); return g;
}
function buildSouth() {
  buildWindow({ cx: 0, wallW: 12, WX: 4.3, Y0: .92, Y1: 2.98, H: WH, base: PH, S: M, envTex: cubeRT.texture, boxGlsl: BOX_A, mull: 1.9, clipX: X0, strips: false, cast: true, hud: ['OBSERVATION PORT 02', '///', 'RING POS 212.4', '///', 'ORBIT ALT 412 KM', '///', 'LOCAL 14:22', '▶▶▶', 'SHADE 00%', '///', 'DECK C-07'] });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(140, 48, 32), skyMat));
  // 窓の外の航行灯
  const pts = [], cols = []; for (let i = 0; i < 16; i++) { pts.push(rr(-12, 16), rr(-.5, 4.6), Z1 + rr(8, 24)); const y = rnd() < .3; cols.push(y ? 1.8 : .3, y ? .5 : .8, y ? .1 : 1.8); }
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Points(ng, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
}
function softDot() { return softDot.t || (softDot.t = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); })); }

// ---------------------------------------------------------------- 台座と、浮かぶ試料、ドットの輪
const ped = { crystal: null, frags: null, ring: null, a: 0 };
function buildPedestal() {
  const g = new THREE.Group(); g.position.set(PED.x, 0, PED.z); scene.add(g);
  cyl(g, .5, .58, .2, 0, .1, 0, M.dark, 48); cyl(g, .42, .5, .1, 0, .25, 0, M.gloss, 48); cyl(g, .585, .585, .022, 0, .045, 0, M.strip, 48, false);
  { const rg0 = new THREE.RingGeometry(.25, .3, 48); rg0.rotateX(-Math.PI / 2); mesh(rg0, M.stripDim, g, 0, .304, 0, false); }
  // 浮かぶ試料：面の割れた黒い鉱物に、金の面が混じる。薄い膜の干渉色と、縁の光、まわりを回る欠片
  // 形を作り、面を「黒い面」と「金の面」の2つの形状に分けて返す
  const shard = (r, det, sy, gold, wide = .8) => {
    const geo = new THREE.IcosahedronGeometry(r, det), P = geo.attributes.position, jit = new Map(), out = [[], []];
    for (let i = 0; i < P.count; i++) { const k = [P.getX(i), P.getY(i), P.getZ(i)].map(v => v.toFixed(3)).join(); if (!jit.has(k)) jit.set(k, rr(.62, 1.22)); const j = jit.get(k), y = P.getY(i) / r, tp = 1 - .5 * y * y;      // 上下の端を細らせる
      P.setXYZ(i, P.getX(i) * j * wide * tp, P.getY(i) * sy * (.85 + .3 * j), P.getZ(i) * j * wide * tp); }
    for (let f = 0; f < P.count / 3; f++) { const o = out[rnd() < gold ? 1 : 0]; for (let k = 0; k < 3; k++) o.push(P.getX(f * 3 + k), P.getY(f * 3 + k), P.getZ(f * 3 + k)); }
    return out.map(a => { const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); b.computeVertexNormals(); return b; }); };
  const cm = new THREE.MeshPhysicalMaterial({ color: 0x343848, metalness: .8, roughness: .16, flatShading: true, clearcoat: 1, clearcoatRoughness: .05, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [160, 560], envMapIntensity: 2.4, emissive: 0x06070f });
  const gm = new THREE.MeshStandardMaterial({ color: 0xffc04a, metalness: 1, roughness: .24, flatShading: true, envMapIntensity: 2.2, emissive: 0x7a4a0c, emissiveIntensity: .6 });
  ped.crystal = new THREE.Group(); ped.crystal.position.set(0, 1.25, 0); g.add(ped.crystal);
  const [cd, cgd] = shard(.3, 1, 1.75, .16); mesh(cd, cm, ped.crystal, 0, 0, 0, false); mesh(cgd, gm, ped.crystal, 0, 0, 0, false);
  const rim = new THREE.Mesh(cd, new THREE.ShaderMaterial({ uniforms: { acc: uAcc, time: uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position*1.03,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 acc; uniform float time; varying vec3 vN; varying vec3 vW; void main(){ float f=pow(1.-abs(dot(normalize(vN),normalize(cameraPosition-vW))),2.5); gl_FragColor=vec4(mix(acc,vec3(.5,.6,1.),.4)*f*(.8+.2*sin(time*1.3)),1.); }` }));
  ped.crystal.add(rim);
  ped.frags = new THREE.Group(); ped.frags.position.set(0, 1.25, 0); g.add(ped.frags);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + rr(-.2, .2), rad = rr(.38, .62), gd = i % 3 === 0, f = mesh(shard(rr(.035, .07), 0, rr(1.2, 2.0), gd ? 1 : 0, .7)[gd ? 1 : 0], gd ? gm : cm, ped.frags, Math.cos(a) * rad, rr(-.55, .55), Math.sin(a) * rad, false); f.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3)); f.userData.w = rr(.3, 1.2); }
  // 台座から試料へ上がる、淡い光の柱
  mesh(new THREE.CylinderGeometry(.1, .3, .72, 40, 1, true), new THREE.ShaderMaterial({ uniforms: { acc: uAcc, time: uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: HOLO_VS,
    fragmentShader: `uniform vec3 acc; uniform float time; varying vec2 vUv; void main(){ float v=vUv.y; float m=(1.-v)*(1.-v)*.07+.025*(1.-v)*(.5+.5*sin(v*40.-time*3.)); gl_FragColor=vec4(mix(acc,vec3(1.),.3)*m,1.); }` }), holoGroup, PED.x, .67, PED.z, false);
  const rt = inkTex(1024, 32, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 2, w, 6); c.fillRect(0, h - 8, w, 6); for (let x = 0; x < w; x += 64) { c.fillRect(x, 10, 40, 12); } c.fillStyle = '#000'; c.font = `700 12px ${FE}`; });
  const rg = new THREE.CylinderGeometry(1.15, 1.15, .11, 96, 1, true);
  ped.ring = new THREE.Mesh(rg, dotMat(rt, 420, 6, { gain: 1.4, scroll: .004, rep: 2 })); ped.ring.position.set(PED.x, .78, PED.z); holoGroup.add(ped.ring);
  circles.push({ x: PED.x, z: PED.z, r: .6 });
}

// ---------------------------------------------------------------- 中央のパッド（乗ると起動するホログラム）
const pad = { on: false, force: false, a: 0, t: 99, idle: null, col: null, chev: null, text: null, floor: null, embers: null, light: null };
const uPadA = { value: 0 }, uPadT = { value: 99 }, uPlayer = { value: new THREE.Vector2() }, uHeat = { value: 0 };
function buildPad() {
  const C = new THREE.Vector3(PAD.x, 0, PAD.z);
  const add = (m, y) => { m.position.set(C.x, y, C.z); holoGroup.add(m); return m; };
  const mat = (fs, extra = {}, opt = {}) => new THREE.ShaderMaterial({ uniforms: { time: uTime, acc: uAcc, a: uPadA, t: uPadT, heat: uHeat, ...extra }, vertexShader: HOLO_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...opt });
  const HOT = `vec3 hot( vec3 c, float k ){ return mix( c, vec3( 1.0, .42, .08 ), clamp( k, 0., 1. ) ); }`;
  // 待機中の床の同心円と、中央の表記
  const lab = inkTex(512, 512, (c, w) => { c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `700 150px ${FE}`; c.fillText('C-07', w / 2, 262); c.font = `600 44px ${FE}`; c.fillText('LINK  PAD', w / 2, 330); c.fillRect(w / 2 - 110, 356, 220, 6); c.font = `700 40px ${FJ}`; c.fillText('接続', w / 2, 150); });
  const ig = new THREE.PlaneGeometry(3.3, 3.3); ig.rotateX(-Math.PI / 2);
  pad.idle = add(new THREE.Mesh(ig, mat(`uniform float time, a, t, heat; uniform vec3 acc; uniform sampler2D lab; varying vec2 vUv; ${HOT}
    void main(){ vec2 p=(vUv-.5)*3.3; float r=length(p); float an=atan(p.y,p.x);
      float w=fwidth(r)*1.2;
      float ring=(1.-smoothstep(.016,.016+w,abs(r-1.24)))+.7*(1.-smoothstep(.005,.005+w,abs(r-1.36)))+.5*(1.-smoothstep(.004,.004+w,abs(r-.62)));
      float ticks=(1.-smoothstep(.03,.03+w,abs(r-1.05)))*step(.5,fract((an+time*.12)/6.2831853*36.));
      float sweep=(1.-smoothstep(.0,.9,fract((an-time*.5)/6.2831853)))*(1.-smoothstep(.035,.035+w,abs(r-.86)))*.7;
      vec2 lu=p/1.05+.5; float l=(lu.x>0.&&lu.x<1.&&lu.y>0.&&lu.y<1.)?texture2D(lab,lu).r:0.;
      float glow=exp(-r*r*1.1)*.12*(1.+a*2.5);
      float m=ring+ticks*.8+sweep+l*.8+glow; float pulse=.75+.25*sin(time*2.2);
      vec3 col=hot(acc,.55-.35*a+heat)*m*(.5*pulse+1.1*a); gl_FragColor=vec4(col,1.); }`, { lab: { value: lab } }, { side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })), .004);
  // 起動の瞬間：床から立つ光の筒と、上へ抜ける輪
  const cg = new THREE.CylinderGeometry(1.26, 1.26, 3.0, 64, 1, true);
  pad.col = add(new THREE.Mesh(cg, mat(`uniform float time, t; uniform vec3 acc; varying vec2 vUv; ${HOT}
    void main(){ float v=vUv.y; float fl=exp(-max(t-.02,0.)*13.)*step(0.,t);
      float body=fl*pow(1.-v,1.3)*2.6;
      float rings=0.; for(int i=0;i<3;i++){ float yb=(t-.06-float(i)*.055)*3.4; rings+=exp(-pow((v-yb)/.022,2.))*step(0.,yb); }
      rings*=(1.-smoothstep(.2,.55,t))*2.4;
      float streak=.75+.25*sin(vUv.x*240.);
      vec3 col=hot(vec3(1.,.95,.8),.25)*(body*streak+rings); gl_FragColor=vec4(col,1.); }`)), 1.5);
  // 外周を流れる山形の矢印
  const hg = new THREE.CylinderGeometry(1.78, 1.78, .4, 96, 1, true);
  pad.chev = add(new THREE.Mesh(hg, mat(`uniform float time, a, t, heat; uniform vec3 acc; varying vec2 vUv; ${HOT}
    float chev( float u, float v ){ float x=u+abs(v-.5)*1.05; float f=fract(x); float w=fwidth(x)*1.1; return smoothstep(0.,w,f)*(1.-smoothstep(.46,.46+w,f)); }
    void main(){ float N=24.; float app=smoothstep(.1,.32,t); float u=vUv.x*N-time*.22;
      float m=chev(u,vUv.y);
      float trail=(1.-app)*( chev(u-.18,vUv.y)+chev(u-.36,vUv.y) )*.4;      // 出た直後の残像
      float edge=smoothstep(0.,.03,vUv.y)*(1.-smoothstep(.97,1.,vUv.y));
      vec3 col=hot(mix(acc,vec3(1.),.45),heat)*(m*1.25+trail)*edge*a*(.6+.9*smoothstep(.1,.2,t)*(1.+1.2*exp(-max(t-.2,0.)*6.)));
      gl_FragColor=vec4(col,1.); }`)), .84);
  // 腰の高さの文字の帯（裏からは鏡文字に見える）
  const tt = inkTex(2048, 128, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 8, w, 5); c.fillRect(0, h - 13, w, 5);
    c.font = `700 62px ${FE}`; c.textBaseline = 'middle'; let x = 20;
    const put = (s, f) => { c.font = f; c.fillText(s, x, h / 2 + 3); x += c.measureText(s).width + 34; };
    put('LINK ESTABLISHED', `700 62px ${FE}`); put('///', `600 44px ${FE}`); put('接続承認', `700 52px ${FJ}`); put('///', `600 44px ${FE}`); put('DECK C-07', `700 62px ${FE}`); put('▶▶▶', `600 34px ${FE}`); put('RING POS 212.4', `600 44px ${FE}`); put('AUTH 5-16 / TYPE 990', `500 30px ${FE}`);
    c.strokeStyle = '#fff'; c.lineWidth = 4; c.strokeRect(x, 30, 170, h - 60); c.font = `700 40px ${FE}`; c.fillText('ACTIVE', x + 22, h / 2 + 3);
  });
  const tg = new THREE.CylinderGeometry(2.32, 2.32, .25, 128, 1, true);
  pad.text = add(new THREE.Mesh(tg, mat(`uniform float time, a, t, heat; uniform vec3 acc; uniform sampler2D map; varying vec2 vUv; ${HOT} ${DOT_GLSL}
    void main(){ vec2 n=vec2(1100.,22.); vec2 q=vec2(vUv.x*2.+time*.008, vUv.y); vec2 c=dotCell(q,n); float m=texture2D(map,c).r; float d=dotMask(q,n);
      float app=smoothstep(.14,.42,t); float wipe=step(fract(vUv.x*2.), app*1.02);
      vec3 col=hot(acc,heat)*m*d*1.9*a*wipe*(.9+.1*sin(time*23.)); gl_FragColor=vec4(col,1.); }`, { map: { value: tt } })), 1.24);
  // 床の等高線の発火と、足元の輪
  const fg = new THREE.PlaneGeometry(9.6, 7.4); fg.rotateX(-Math.PI / 2);
  pad.floor = add(new THREE.Mesh(fg, mat(`uniform float time, a, t, heat; uniform vec3 acc; uniform sampler2D tHeight; uniform vec2 center, player; varying vec3 vW; ${HOT}
    void main(){ vec3 wp=vW; float h=texture2D(tHeight, ${H_UV}).r*${LEV.toFixed(1)};
      float fw=max(fwidth(h),1e-4); float d=abs(fract(h-.5)-.5)/fw; float ln=1.-smoothstep(.7,2.0,d); float halo=(1.-smoothstep(1.,7.,d))*.22;
      float r=distance(wp.xz,center); float front=t*5.2;
      float reveal=1.-smoothstep(front-1.1,front,r); float fall=1.-smoothstep(1.5,4.4,r);
      float wave=exp(-pow((r-front)/.4,2.))*step(0.,t);
      float shim=.62+.38*sin(h*6.2831853*3.-time*1.6);
      float pr=distance(wp.xz,player); float pw=fwidth(pr)*1.4; float ph=fract(pr*5.-time*.9); float foot=(1.-smoothstep(.2,1.25,pr))*(smoothstep(0.,pw*5.,ph)*(1.-smoothstep(.22,.22+pw*5.,ph)));
      float m=(ln+halo)*reveal*fall*shim*1.5+(ln*1.6+.12)*wave*2.2*fall+foot*.9;
      vec3 col=hot(mix(acc,vec3(1.,.55,.14),.55),heat*.8)*m*a; gl_FragColor=vec4(col,1.); }`, { tHeight: { value: heightTex }, center: { value: new THREE.Vector2(C.x, C.z) }, player: uPlayer }, { side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), .006);
  pad.floor.position.set(0, .006, 0);
  // 火の粉
  const N = 150, sd = new Float32Array(N * 4), ps = new Float32Array(N * 3); for (let i = 0; i < N; i++) { sd[i * 4] = rnd() * TAU; sd[i * 4 + 1] = .3 + Math.sqrt(rnd()) * 3.1; sd[i * 4 + 2] = rr(.12, .36); sd[i * 4 + 3] = rnd(); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ps, 3)); eg.setAttribute('sd', new THREE.BufferAttribute(sd, 4)); eg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 6);
  pad.embers = new THREE.Points(eg, new THREE.ShaderMaterial({ uniforms: { time: uTime, a: uPadA, vh: uVh, map: { value: softDot() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 sd; uniform float time, a, vh; varying float vA; void main(){ float k=fract(sd.w+time*sd.z*.33); float an=sd.x+sin(time*.4+sd.w*20.)*.25; vec3 p=vec3(cos(an)*sd.y,k*3.0+.02,sin(an)*sd.y); p.x+=sin(time*.9+sd.w*40.)*.06;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp((.0045+.006*fract(sd.w*7.))*vh/max(-mv.z,.05),1.5,vh*.011); vA=a*smoothstep(0.,.08,k)*(1.-smoothstep(.55,1.,k))*(.5+.5*sin(time*5.+sd.w*90.)); }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float m=texture2D(map,gl_PointCoord).r; gl_FragColor=vec4(vec3(1.9,.72,.18)*m*vA,1.); }` }));
  pad.embers.position.copy(C); holoGroup.add(pad.embers);
  pad.light = new THREE.PointLight(0xffb040, 0, 9, 1.4); pad.light.position.set(C.x, 1.0, C.z); scene.add(pad.light);
}
function updatePad(dt) {
  const d = Math.hypot(player.x - PAD.x, player.z - PAD.z);
  if (pad.force) { }
  else if (!pad.on && d < 1.2 && state === 'play') { pad.on = true; pad.t = 0; audio.activate(); toast('LINK ESTABLISHED'); }
  else if (pad.on && d > 1.95) { pad.on = false; audio.deactivate(); }
  if (!pad.force) pad.t += dt; pad.a += ((pad.on ? 1 : 0) - pad.a) * (1 - Math.exp(-dt * (pad.on ? 22 : 7)));
  uPadA.value = pad.a; uPadT.value = pad.on ? pad.t : 99; uHeat.value = pad.on ? Math.exp(-pad.t * 3.2) * .9 : 0; uPlayer.value.set(player.x, player.z);
  const vis = pad.a > .004; pad.chev.visible = pad.text.visible = pad.floor.visible = pad.embers.visible = vis; pad.col.visible = pad.on && pad.t < .7;
  const fl = pad.on ? Math.exp(-Math.max(pad.t - .02, 0) * 11) : 0;
  pad.light.intensity = pad.a * 5 + fl * 46; pad.light.color.setRGB(1, lerp(uAcc.value.g * .8, .5, uHeat.value), lerp(uAcc.value.b * .6, .1, uHeat.value));
}

// ---------------------------------------------------------------- 私室 C-08（寝台、ソファ、机、収納、シャワー）
// 管制デッキと同じ素材の言葉で作る。標準マテリアルは部屋ごとに分ける（映りこみの環境マップと箱が別なので）
const MB = {};
function buildMaterialsB() {
  for (const k in M) { const m = M[k]; if (m.isMeshStandardMaterial) { MB[k] = m.clone(); MB[k].userData = { room: 'B' }; MB[k].envMapIntensity = .7; } else MB[k] = m; }
  MB.strip = M.strip.clone(); MB.stripDim = M.stripDim.clone();
  MB.wall.map = T.wallB.map; MB.wall.roughnessMap = MB.wall.metalnessMap = T.wallB.orm;
  const std = o => { const m = new THREE.MeshStandardMaterial(o); m.userData = { room: 'B' }; m.envMapIntensity = .7; return m; };
  MB.fabric = std({ color: 0x868b94, roughness: .95 });
  MB.fabricDark = std({ color: 0x23252a, roughness: .92 });
  MB.sheet = std({ color: 0xb4b8bf, roughness: .9 });
  MB.pillow = std({ color: 0xcdd0d6, roughness: .88 });
  MB.accent = std({ color: 0xd8b40e, roughness: .6 });
  MB.warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.75, .92, .4) });      // 低い位置の暖色の間接光（照明モードで変えない）
}
const MODES = [{ n: 'WORK', jp: '作業', strip: [1.7, 1.74, 1.86], dim: [1.05, 1.08, 1.16], col: [.91, .93, 1], i: [7.5] }, { n: 'REST', jp: '休息', strip: [.95, .5, .2], dim: [.6, .32, .13], col: [1, .62, .34], i: [2.6] }];
const qr = { seats: [], shower: false, showerA: 0, steam: 0, mode: 0, modeCur: 0, envT: 0, inB: false, l1: null, sun: null, pod: {} };
function buildQuarters() {
  const S = MB, W = BX1 - BX0, D = BZ1 - BZ0;
  // 床（通路の分まで西へ伸ばす）
  T.floorB = canvasTex(1520, 1380, (c, w, h) => {
    const K = 200, X = x => (x - X1) * K, Z = z => (z - BZ0) * K;
    c.fillStyle = '#0a0b0d'; c.fillRect(0, 0, w, h);
    const path = (pts, ox, oz) => { c.beginPath(); pts.forEach(([x, z], i) => i ? c.lineTo(X(x + ox), Z(z + oz)) : c.moveTo(X(x + ox), Z(z + oz))); c.closePath(); };
    path(rrPts(3.15, 3.0, .7, 14), BCX, BCZ); c.fillStyle = '#0d0e11'; c.fill(); c.strokeStyle = '#3c4046'; c.lineWidth = 2.5; c.stroke();
    path(rrPts(3.03, 2.88, .6, 14), BCX, BCZ); c.strokeStyle = 'rgba(120,126,134,.35)'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#060708'; c.beginPath(); c.arc(X(12.55), Z(-1.35), 1.08 * K, 0, TAU); c.fill(); c.strokeStyle = '#3c4046'; c.lineWidth = 2.5; c.stroke();
    path(rrPts(1.55, .95, .3, 8), 9.1, 3.05); c.strokeStyle = '#34373c'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#34373c'; c.lineWidth = 2; for (const [x0, z0, x1, z1] of [[X1, DZC, 7.6, DZC], [10.9, BCZ - 3.0, 10.9, 1.6], [7.6, .3, 10.9, .3]]) { c.beginPath(); c.moveTo(X(x0), Z(z0)); c.lineTo(X(x1), Z(z1)); c.stroke(); }
    c.strokeStyle = 'rgba(200,204,210,.5)'; c.lineWidth = 2;
    for (const [x, z] of [[7.6, .3], [10.9, .3], [10.9, 1.6], [8.6, -1.0], [10.3, -1.0], [11.0, 1.0], [7.3, 3.6], [12.4, 1.6]]) { const px = X(x), pz = Z(z); c.beginPath(); c.moveTo(px - 9, pz); c.lineTo(px + 9, pz); c.moveTo(px, pz - 9); c.lineTo(px, pz + 9); c.stroke(); }
    c.fillStyle = '#d9bb14'; c.fillRect(X(BX0 + .12), Z(DZ0 + .1), 10, .28 * K); c.fillRect(X(BX0 + .12), Z(DZ1 - .38), 10, .28 * K); c.fillRect(X(10.2), Z(BCZ - 3.0) - 5, .4 * K, 10);
    c.fillStyle = 'rgba(200,204,210,.42)'; c.font = `600 20px ${FE}`; c.fillText('C-08  PRIVATE QUARTERS', X(6.75), Z(DZ1) + 34); c.fillText('WET AREA', X(11.2), Z(-.1)); c.font = `500 12px ${FE}`; c.fillText('OCCUPANT 01  ·  RING SEGMENT C', X(6.75), Z(DZ1) + 52);
  });
  T.floorB.anisotropy = 16;
  makeFloor(T.floorB, genHeight(X1, BZ0, 7.6, D, 9.1, 3.1), X1, BZ0, 7.6, D, 'floorB');
  // 天井と、吊り天井の縁の光
  const ceil = plane(scene, 7.6, D, X1 + 3.8, BH, BCZ, S.ceil); ceil.rotation.x = Math.PI / 2; ceil.castShadow = true;
  const rg = new THREE.ExtrudeGeometry(toShape(rrPts(2.5, 2.2, .8, 12)), { depth: .14, bevelEnabled: false }); rg.rotateX(-Math.PI / 2);
  mesh(rg, S.ceil, scene, BCX, 2.64, BCZ + .15);
  mesh(flatRing(2.5, 2.2, .8, .06), S.strip, scene, BCX, 2.637, BCZ + .15, false);
  // 壁
  const gn = wallGroup(BCX, BZ0, 0); wallBase(gn, W, { H: BH, base: 0, S, strips: false, cast: true });
  const ge = wallGroup(BX1, BCZ, -Math.PI / 2); wallBase(ge, D, { H: BH, base: 0, S, strips: false, cast: true });
  const lxC = BCZ - DZC, dw = DZ1 - DZ0;
  const gw = wallGroup(BX0, BCZ, Math.PI / 2); wallBase(gw, D, { H: BH, base: 0, S, cut: [lxC - dw / 2, lxC + dw / 2], strips: false });
  for (const s of [-1, 1]) { rbox(gw, .24, DOOR_H + .22, .3, lxC + s * (dw / 2 + .12), (DOOR_H + .22) / 2, .08, S.lightGloss, .06); box(gw, .02, DOOR_H - .2, .03, lxC + s * (dw / 2 - .012), DOOR_H / 2, .1, S.accent, false); }
  rbox(gw, dw + .48, .26, .3, lxC, DOOR_H + .13, .08, S.lightGloss, .06);
  buildWindow({ cx: BCX, wallW: W, WX: 2.5, Y0: .78, Y1: 2.42, H: BH, base: 0, S, envTex: cubeRTB.texture, boxGlsl: BOX_B, mull: null, clipX: BX0 + .02, strips: false, cast: true, hud: ['PRIVATE VIEW', '///', 'RING POS 212.4', '///', 'ORBIT ALT 412 KM', '///', 'CABIN 22.4°C', '▶▶▶', 'SHADE 00%', '///', 'C-08'] });
  addSeg(BX0, BZ0, BX1, BZ0); addSeg(BX1, BZ0, BX1, BZ1); addSeg(BX1, BZ1, BX0, BZ1); addSeg(BX0, BZ0, BX0, DZ0); addSeg(BX0, DZ1, BX0, BZ1);
  // 扉の脇の表示
  const info = inkTex(512, 288, (c, w, h) => { c.fillStyle = '#fff'; c.font = `700 84px ${FE}`; c.fillText('C-08', 24, 92); c.font = `700 34px ${FJ}`; c.fillText('私室', 250, 88); c.fillRect(24, 112, w - 48, 4);
    c.font = `600 28px ${FE}`; ['PRIVATE QUARTERS', 'OCCUPANT 01', 'O2 21.0%   22.4°C', 'PRESSURE  101.2 kPa'].forEach((t, i) => c.fillText(t, 24, 156 + i * 36)); });
  plane(holoGroup, .92, .52, 0, 0, 0, dotMat(info, 150, 84, { gain: 1.0, bg: .015 })).userData.wall = [gw, lxC - dw / 2 - .95, 1.62, .07];

  // ---- 寝台（東の壁に頭を付ける）
  const bed = new THREE.Group(); bed.position.set(12.42, 0, 3.15); scene.add(bed);
  rbox(bed, 2.0, .12, 1.4, 0, .06, 0, S.gloss, .02); rbox(bed, 2.24, .2, 1.64, 0, .22, 0, S.dark, .05);
  for (const s of [-1, 1]) box(bed, 2.1, .012, .012, 0, .112, s * .825, S.warm, false); box(bed, .012, .012, 1.5, -1.125, .112, 0, S.warm, false);
  rbox(bed, 2.12, .2, 1.52, 0, .42, 0, S.sheet, .07);
  rbox(bed, 1.36, .1, 1.56, -.38, .53, 0, S.fabricDark, .045); box(bed, .07, .104, 1.565, .2, .53, 0, S.accent, false);
  for (const s of [-1, 1]) rbox(bed, .42, .13, .6, .76, .56, s * .36, S.pillow, .06);
  rbox(bed, .14, 1.2, 1.9, 1.11, .85, 0, S.panel, .03); box(bed, .02, .014, 1.7, 1.035, 1.445, 0, S.warm, false);
  rbox(bed, .46, .48, .44, .93, .24, -1.08, S.light, .04); box(bed, .4, .012, .012, .93, .5, -.86, S.warm, false); rbox(bed, .16, .02, .1, .9, .49, -1.1, S.dark, .005);
  addRect(11.28, 2.3, BX1, 4.0); addRect(13.1, 1.82, BX1, 2.3);
  qr.seats.push({ x: 12.72, z: 3.15, eye: .88, ex: 10.95, ez: 3.15, yaw: Math.PI / 2 + .5, pitch: .12, toast: 'RESTING' });
  interactables.push({ pos: new THREE.Vector3(12.1, 0, 3.15), r: 1.75, label: () => 'ベッドに横になる', act: () => sit(qr.seats[0]) });

  // ---- ソファ（窓を向く）と低い卓
  const sf = new THREE.Group(); sf.position.set(9.1, 0, 2.45); scene.add(sf);
  rbox(sf, 2.4, .26, .96, 0, .19, 0, S.dark, .05); box(sf, 2.2, .012, .012, 0, .07, .472, S.warm, false); box(sf, 2.2, .012, .012, 0, .07, -.472, S.warm, false);
  for (const i of [-1, 0, 1]) { rbox(sf, .76, .16, .76, i * .78, .4, .08, S.fabric, .06); rbox(sf, .74, .36, .15, i * .78, .66, -.23, S.fabric, .06); }
  rbox(sf, 2.4, .52, .2, 0, .6, -.38, S.fabricDark, .07);
  for (const s of [-1, 1]) rbox(sf, .2, .46, .96, s * 1.3, .29, 0, S.light, .06);
  box(sf, .16, .012, .3, 1.3, .525, .2, S.accent, false);
  addRect(7.78, 1.95, 10.42, 2.95);
  qr.seats.push({ x: 9.1, z: 2.62, eye: 1.06, ex: 9.1, ez: 3.28, yaw: Math.PI, pitch: .06, toast: 'SEATED' });
  interactables.push({ pos: new THREE.Vector3(9.1, 0, 2.6), r: 1.5, label: () => 'ソファに座る', act: () => sit(qr.seats[1]) });
  const tb = new THREE.Group(); tb.position.set(9.1, 0, 4.02); scene.add(tb);
  cyl(tb, .14, .2, .34, 0, .17, 0, S.dark, 32); cyl(tb, .4, .4, .035, 0, .36, 0, S.gloss, 48); cyl(tb, .405, .405, .008, 0, .353, 0, S.warm, 48, false);
  cyl(tb, .036, .03, .085, .14, .42, .06, S.light, 20); { const t = rbox(tb, .24, .012, .16, -.1, .384, -.04, S.dark, .005); t.rotation.y = .5; }
  circles.push({ x: 9.1, z: 4.02, r: .4 });

  // ---- 机と端末（西の壁、扉の北側）
  const dx = 2.0;
  rbox(gw, 2.3, .05, .78, dx, .76, .41, S.gloss, .015);
  for (const s of [-1, 1]) rbox(gw, .06, .74, .7, dx + s * 1.1, .37, .39, S.dark, .02);
  rbox(gw, .6, .52, .56, dx + .72, .3, .36, S.light, .03); 
  box(gw, 2.2, .012, .012, dx, .728, .797, S.warm, false);
  rbox(gw, 2.5, 1.0, .05, dx, 1.45, .03, S.panel, .02); box(gw, 2.3, .02, .02, dx, 2.03, .07, S.stripDim, false);
  rbox(gw, .62, .014, .2, dx, .792, .52, S.dark, .005); rbox(gw, .22, .012, .28, dx - .62, .792, .5, S.light, .005); cyl(gw, .04, .034, .09, dx + .9, .83, .3, S.accent, 20);
  const term = inkTex(1024, 432, (c, w, h) => {
    c.fillStyle = '#fff'; c.font = `700 40px ${FE}`; c.fillText('PERSONAL TERMINAL', 28, 52); c.font = `600 24px ${FE}`; c.fillText('C-08 // OCCUPANT 01', 30, 84); c.fillRect(28, 100, w - 56, 4);
    c.font = `700 120px ${FE}`; c.fillText('14:22', 30, 230); c.font = `600 26px ${FE}`; c.fillText('LOCAL  ·  CYCLE 0412', 34, 268);
    for (let i = 0; i < 14; i++) { const bh = 30 + 110 * Math.abs(Math.sin(i * 1.37 + .6)); c.fillRect(430 + i * 40, 280 - bh, 26, bh); }
    c.fillRect(430, 290, 550, 3); c.font = `600 22px ${FE}`; c.fillText('POWER DRAW / 24H', 430, 322);
    ['MSG 03 UNREAD', 'SHIFT B  06:00', 'LINK PAD  STANDBY', 'WATER 84%'].forEach((t, i) => { c.fillRect(34, 312 + i * 28, 10, 10); c.fillText(t, 56, 324 + i * 28); });
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(700, 330, 280, 76); c.font = `700 30px ${FE}`; c.fillText('LIGHT : AUTO', 724, 378);
    for (const [x, y] of [[w - 40, 40], [w - 40, 96]]) { c.beginPath(); c.moveTo(x - 12, y - 12); c.lineTo(x + 12, y + 12); c.moveTo(x + 12, y - 12); c.lineTo(x - 12, y + 12); c.stroke(); }
  });
  plane(holoGroup, 1.5, .63, 0, 0, 0, dotMat(term, 256, 108, { gain: 1.25, bg: .02 })).userData.wall = [gw, dx, 1.34, .26];
  rbox(gw, .48, .07, .48, dx, .47, 1.36, S.fabricDark, .03); rbox(gw, .46, .5, .07, dx, .8, 1.62, S.fabricDark, .03); cyl(gw, .03, .03, .42, dx, .24, 1.38, S.dark, 12); cyl(gw, .24, .26, .04, dx, .03, 1.38, S.dark, 24);
  addRect(BX0, BCZ - dx - 1.17, BX0 + .82, BCZ - dx + 1.17); circles.push({ x: BX0 + 1.4, z: BCZ - dx, r: .3 });
  interactables.push({ pos: new THREE.Vector3(BX0 + .6, 0, BCZ - dx), r: 2.0, label: () => '照明を切り替える ― ' + MODES[(qr.mode + 1) % 2].jp, act: () => { setMode((qr.mode + 1) % 2); audio.click(); toast('LIGHT : ' + MODES[qr.mode].n); } });

  // ---- 収納（北の壁）と、縦の光
  for (let i = 0; i < 4; i++) { const lx = -2.1 + i * .8; rbox(gn, .78, 2.3, .5, lx, 1.17, .25, S.light, .04); box(gn, .03, .34, .025, lx + .27, 1.18, .512, S.accent, false); }
  box(gn, 3.24, .04, .46, -.9, .02, .25, S.dark); rbox(gn, 3.26, .05, .54, -.9, 2.345, .27, S.dark, .015);
  rbox(gn, .3, 2.3, .12, 1.25, 1.17, .06, S.dark, .03); box(gn, .04, 1.9, .02, 1.25, 1.2, .125, S.stripDim, false);
  addRect(BCX - 2.52, BZ0, BCX + .72, BZ0 + .52);

  // ---- 棚（東の壁）
  rbox(ge, 1.8, 1.5, .3, -.5, 1.45, .15, S.light, .05); rbox(ge, 1.62, 1.32, .04, -.5, 1.45, .305, S.dark, .02);
  for (const y of [1.08, 1.56]) { rbox(ge, 1.58, .03, .22, -.5, y, .43, S.light, .01); box(ge, 1.5, .01, .01, -.5, y - .022, .5, S.warm, false); }
  for (const [x, y, w, h, m] of [[-1.05, 1.19, .22, .18, 'dark'], [-.8, 1.17, .14, .14, 'accent'], [-.2, 1.2, .3, .2, 'fabricDark'], [.05, 1.15, .1, .1, 'light'], [-.95, 1.67, .12, .18, 'light'], [-.55, 1.66, .26, .16, 'dark'], [.0, 1.69, .18, .22, 'gloss']]) rbox(ge, w, h, .16, x, y, .43, S[m], .015);
  { const cg = new THREE.IcosahedronGeometry(.07, 0); cg.scale(.7, 1.5, .7); mesh(cg, S.crystal, ge, -.42, 1.2, .44, false); }
  box(ge, .06, 1.2, .012, .55, 1.45, .31, S.accent, false);
  addRect(BX1 - .56, BCZ - 1.42, BX1, BCZ + .42);

  // ---- シャワー（北東の角。円筒のガラスの中に、水と湯気）
  const P = qr.pod, px = 12.55, pz = -1.35; P.pos = new THREE.Vector3(px, 0, pz);
  const pg = new THREE.Group(); pg.position.copy(P.pos); scene.add(pg);
  cyl(pg, .86, .9, .1, 0, .05, 0, S.dark, 48); cyl(pg, .868, .868, .02, 0, .082, 0, S.strip, 48, false); cyl(pg, .76, .76, .012, 0, .106, 0, S.dark, 48);
  cyl(pg, .88, .88, .46, 0, 2.5, 0, S.dark, 48); cyl(pg, .885, .885, .02, 0, 2.3, 0, S.strip, 48, false);
  P.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, .34, .4) }); cyl(pg, .3, .3, .02, 0, 2.262, 0, P.head, 32, false);
  { const b = rbox(pg, .36, 2.2, .16, .52, 1.2, -.52, S.light, .04); b.rotation.y = Math.PI / 4; const c2 = box(pg, .04, .5, .02, .45, 1.3, -.45, S.accent, false); c2.rotation.y = Math.PI / 4; }
  P.glass = new THREE.ShaderMaterial({ uniforms: { time: uTime, fog: { value: 0 }, wet: { value: 0 }, c: { value: new THREE.Vector2(px, pz) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: HOLO_VS,
    fragmentShader: `uniform float time, fog, wet; uniform vec2 c; varying vec2 vUv; varying vec3 vW;
      float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec3 vd=vW-cameraPosition; vd/=max(length(vd),1e-4); vec2 nn=vW.xz-c; nn/=max(length(nn),1e-4); float rim=pow(1.-abs(dot(vd.xz,nn)),2.2);
        float mist=vn(vUv*vec2(22.,7.)+vec2(0.,time*.05))*.6+vn(vUv*vec2(70.,20.))*.4;
        float col1=h21(vec2(floor(vUv.x*150.),3.)); float run=step(.86,col1)*smoothstep(.0,.5,fract(vUv.y*(1.5+col1*2.)+time*(.25+col1*.5)+col1*9.))*wet;   // ガラスを伝う水の筋
        vec3 col=vec3(.5,.66,1.)*(rim*.14+.012)+vec3(.75,.84,1.)*fog*(.055+.07*mist)*(.4+.6*smoothstep(0.,.5,vUv.y))+vec3(.8,.9,1.)*run*.07;
        vec2 bg=vUv*vec2(150.,60.); vec2 bi=floor(bg); float bh=h21(bi+7.); float bead=step(.72,bh)*(1.-smoothstep(.08,.2+.15*bh,length(fract(bg)-.5-(vec2(h21(bi+1.),h21(bi+2.))-.5)*.5)))*wet; col+=vec3(.8,.9,1.)*bead*.1;   // ガラスに付いた水滴
        gl_FragColor=vec4(col,1.); }` });
  mesh(new THREE.CylinderGeometry(.8, .8, 2.16, 64, 1, true), P.glass, holoGroup, px, 1.2, pz, false);
  // 水と湯気。uW は水の出具合、uS は湯気の濃さ（どちらも 0〜1）
  const uW = { value: 0 }, uS = { value: 0 }, ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const H21 = `float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }`;
  { // 水：落ちる短い線。上の端ほど薄くして、筋に見せる
    const n = 460, sd = new Float32Array(n * 8), en = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const a = [rnd(), rnd(), rnd(), rnd()]; for (let k = 0; k < 2; k++) { sd.set(a, (i * 2 + k) * 4); en[i * 2 + k] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)); g.setAttribute('sd', new THREE.BufferAttribute(sd, 4)); g.setAttribute('en', new THREE.BufferAttribute(en, 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 2);
    P.water = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: { time: uTime, a: uW }, ...ADD,
      vertexShader: `attribute vec4 sd; attribute float en; uniform float time, a; varying float vA;
        void main(){ float k=fract(sd.w+time*(1.6+sd.z*.8)); float kk=k-en*.055; float an=sd.x*6.2831853; float r=sqrt(sd.y)*.27*(1.+.75*kk);
          vec3 p=vec3(cos(an)*r,2.24-kk*2.13,sin(an)*r); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); vA=a*(.35+.65*sd.z)*smoothstep(0.,.04,kk)*(1.-en*.75); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor=vec4(vec3(.75,.87,1.)*vA*.6,1.); }` }));
    P.water.position.set(px, 0, pz); P.water.visible = false; holoGroup.add(P.water);
    // 床：しぶきの輪と、外へ流れる水の膜
    const fg = new THREE.PlaneGeometry(1.5, 1.5); fg.rotateX(-Math.PI / 2);
    mesh(fg, new THREE.ShaderMaterial({ uniforms: { time: uTime, a: uW }, ...ADD, vertexShader: HOLO_VS,
      fragmentShader: `uniform float time, a; varying vec2 vUv; ${H21}
        void main(){ vec2 p=(vUv-.5)*1.5; float r=length(p); float m=0.;
          for(int L=0;L<2;L++){ float fl=float(L); vec2 g=p*(9.+fl*5.)+fl*3.7; vec2 id=floor(g); vec2 f=fract(g)-.5; float h=h21(id+fl*11.); float t=fract(time*(1.1+h*.9)+h*7.);
            vec2 o=(vec2(h21(id+3.1),h21(id+5.3))-.5)*.5; float d=length(f-o); float q=(d-t*.42)/.035; m+=exp(-q*q)*(1.-t); }
          float sheet=(.5+.5*sin(r*46.-time*7.))*(1.-smoothstep(0.,.62,r));
          gl_FragColor=vec4(vec3(.7,.85,1.)*(m*.55+sheet*.07)*(1.-smoothstep(.6,.74,r))*a,1.); }` }), P.water, 0, .118, 0, false);
    // 床で跳ねる粒
    const m = 110, s2 = new Float32Array(m * 4); for (let i = 0; i < m * 4; i++) s2[i] = rnd();
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 3), 3)); sg.setAttribute('sd', new THREE.BufferAttribute(s2, 4)); sg.boundingSphere = g.boundingSphere;
    P.water.add(new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: { time: uTime, a: uW, vh: uVh, map: { value: softDot() } }, ...ADD,
      vertexShader: `attribute vec4 sd; uniform float time, a, vh; varying float vA; void main(){ float k=fract(sd.w+time*(2.2+sd.z*1.6)); float an=sd.x*6.2831853; float r=sqrt(sd.y)*.5+k*.05;
        vec3 p=vec3(cos(an)*r,.125+4.*k*(1.-k)*(.05+.1*sd.z),sin(an)*r); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(.007*vh/max(-mv.z,.05),1.2,vh*.006); vA=a*(1.-k); }`,
      fragmentShader: `uniform sampler2D map; varying float vA; void main(){ gl_FragColor=vec4(vec3(.75,.87,1.)*texture2D(map,gl_PointCoord).r*vA*.55,1.); }` })));
  }
  { // 湯気：半径の違う筒を3枚重ね、上へ流れるむらで抜く（筒の継ぎ目が出ないよう、むらは横方向に周期を持たせる）
    P.mist = new THREE.Group(); P.mist.position.set(px, 0, pz); P.mist.visible = false; P.mist.material = { uniforms: { a: uS } }; holoGroup.add(P.mist);
    [.3, .5, .68].forEach((r, k) => mesh(new THREE.CylinderGeometry(r, r * 1.06, 2.0, 40, 1, true), new THREE.ShaderMaterial({ uniforms: { time: uTime, a: uS, seed: { value: k } }, ...ADD, side: THREE.DoubleSide, vertexShader: HOLO_VS,
      fragmentShader: `uniform float time, a, seed; varying vec2 vUv; ${H21}
        float pn(vec2 p,float per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); float x0=mod(i.x,per), x1=mod(i.x+1.,per); return mix(mix(h21(vec2(x0,i.y)),h21(vec2(x1,i.y)),f.x),mix(h21(vec2(x0,i.y+1.)),h21(vec2(x1,i.y+1.)),f.x),f.y); }
        float fb(vec2 p,float per){ float s=0., am=.5; for(int i=0;i<3;i++){ s+=am*pn(p,per); p*=2.; per*=2.; am*=.5; } return s*1.14; }
        void main(){ vec2 q=vec2(vUv.x*5., vUv.y*2.3-time*.1*(1.+seed*.35)+seed*4.7); q.y+=pn(q*vec2(1.,.6)+vec2(0.,time*.04),5.)*.9;
          float d=smoothstep(.4,.82,fb(q,5.)); float edge=smoothstep(0.,.25,vUv.y)*(1.-smoothstep(.68,1.,vUv.y));
          gl_FragColor=vec4(vec3(.72,.82,.96)*d*edge*a*.085,1.); }` }), P.mist, 0, 1.15, 0, false));
  }
  P.light = new THREE.PointLight(0xcfe4ff, 0, 3.6, 1.4); P.light.position.set(px, 1.9, pz); scene.add(P.light);
  circles.push({ x: px, z: pz, r: .9 });
  interactables.push({ pos: P.pos, r: 2.1, label: () => qr.shower ? 'シャワーを止める' : 'シャワーを出す', act: () => { setShower(!qr.shower); audio.click(); toast('SHOWER : ' + (qr.shower ? 'ON' : 'OFF')); } });

  // 照明（影なしの点光源2つ。色と強さは照明モードで変える）
  qr.l1 = new THREE.PointLight(0xe8eeff, 7.5, 9, 1.5); qr.l1.position.set(BCX - .4, 2.3, .9); scene.add(qr.l1);
  // 窓から差す光。影を落とすのはこれだけ（窓枠の形に切り取られて、敷物やソファや壁に落ちる）。影は起動時に1回だけ計算する
  const wc = new THREE.Vector3(BCX, 1.6, Z1); qr.sun = new THREE.SpotLight(0xdfe8ff, 4.2, 0, .44, .3, 0);
  qr.sun.position.copy(wc).addScaledVector(SUN, 9); qr.sun.target.position.copy(wc).addScaledVector(SUN, -3);
  qr.sun.castShadow = true; qr.sun.shadow.mapSize.setScalar(1024); qr.sun.shadow.camera.near = 3; qr.sun.shadow.camera.far = 24; qr.sun.shadow.bias = -.0012; qr.sun.shadow.normalBias = .02; scene.add(qr.sun, qr.sun.target);
  // 寝台の読書灯（暖色。照明モードで変えない）
  { const l = new THREE.PointLight(0xffb070, 2.6, 4.2, 1.4); l.position.set(12.9, 1.15, 3.15); scene.add(l); }
  detailQuarters(S, { gn, ge, gw, bed, sf, tb, pg, ceil });
}
// ---- 私室の作りこみ：パネルの絵（継ぎ目、通気口、表記）を面に貼る、置き影、敷物、小物
// 面に貼る絵を作る。bg は地の色、rough / metal は地の質感。U に、継ぎ目・通気口・ねじ・文字などの描き手を渡す
function decalTex(w, h, bg, rough, metal, draw) {
  return dualTex(w, h, (c, o) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h); o.fillStyle = orm(rough, metal); o.fillRect(0, 0, w, h);
    const rrp = (k, x, y, ww, hh, r) => { k.beginPath(); k.roundRect ? k.roundRect(x, y, ww, hh, r) : k.rect(x, y, ww, hh); };
    const U = {
      seam(x0, y0, x1, y1, lw = 3) { c.strokeStyle = 'rgba(0,0,0,.72)'; c.lineWidth = lw; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + 1.5, y0 + 1.5); c.lineTo(x1 + 1.5, y1 + 1.5); c.stroke(); o.strokeStyle = orm(.9, 0); o.lineWidth = lw + 1; o.beginPath(); o.moveTo(x0, y0); o.lineTo(x1, y1); o.stroke(); },
      frame(x, y, ww, hh, r = 8, lw = 3) { c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = lw; rrp(c, x, y, ww, hh, r); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1; rrp(c, x + 2, y + 2, ww, hh, r); c.stroke(); o.strokeStyle = orm(.9, 0); o.lineWidth = lw + 1; rrp(o, x, y, ww, hh, r); o.stroke(); },
      fill(x, y, ww, hh, col, r = 0, ro = null) { c.fillStyle = col; rrp(c, x, y, ww, hh, r); c.fill(); if (ro !== null) { o.fillStyle = orm(ro[0], ro[1]); rrp(o, x, y, ww, hh, r); o.fill(); } },
      slots(x, y, ww, hh, n, vertical = false) { for (let i = 0; i < n; i++) { const a = vertical ? [x + i * ww / n, y, ww / n * .5, hh] : [x, y + i * hh / n, ww, hh / n * .5]; U.fill(a[0], a[1], a[2], a[3], 'rgba(0,0,0,.82)', Math.min(a[2], a[3]) / 2, [.9, 0]); } },
      bolt(x, y, r = 4) { c.fillStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.arc(x, y - 1, r * .45, 0, TAU); c.fill(); },
      text(s, x, y, px, { wt = 600, col = 'rgba(18,20,24,.8)', font = FE, align = 'left' } = {}) { c.fillStyle = col; c.font = `${wt} ${px}px ${font}`; c.textAlign = align; c.fillText(s, x, y); c.textAlign = 'left'; },
      tag(x, y, ww, hh, s) { U.fill(x, y, ww, hh, '#d8b40e', 2, [.6, 0]); if (s) U.text(s, x + 6, y + hh - 5, hh - 7, { wt: 700, col: '#101010' }); },
      hazard(x, y, ww, hh) { c.save(); rrp(c, x, y, ww, hh, 0); c.clip(); c.fillStyle = '#d8b40e'; c.fillRect(x, y, ww, hh); c.fillStyle = '#101113'; for (let k = -hh; k < ww + hh; k += hh * 1.1) { c.beginPath(); c.moveTo(x + k, y + hh); c.lineTo(x + k + hh * .55, y + hh); c.lineTo(x + k + hh * 1.55, y); c.lineTo(x + k + hh, y); c.fill(); } c.restore(); },
      plus(x, y, s = 7, col = 'rgba(200,204,210,.5)') { c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke(); },
    };
    draw(c, U, w, h);
  });
}
const LIGHT_BG = '#7d8188', DARK_BG = '#15161a', PANEL_BG = '#08090b', INK_D = 'rgba(18,20,24,.8)', INK_L = 'rgba(206,210,216,.62)';
function decal(p, w, h, x, y, z, tex, ry = 0, room = 'B') {
  const m = new THREE.MeshStandardMaterial({ map: tex.map, roughnessMap: tex.orm, metalnessMap: tex.orm, roughness: 1, metalness: 1 }); if (room === 'B') { m.userData = { room: 'B' }; m.envMapIntensity = .7; }
  const d = plane(p, w, h, x, y, z, m); d.rotation.y = ry; d.receiveShadow = true; return d;
}
// 置き影：ぼかした黒の板。鏡の床では映りこみを暗くし、敷物では接地の陰になる
const blobTex = {};
function blob(kind, x, z, w, d, op = .6, ry = 0, y = .011) {
  const t = blobTex[kind] || (blobTex[kind] = canvasTex(128, 128, (c) => { c.clearRect(0, 0, 128, 128);
    if (kind === 'round') { const g = c.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
    else { for (let i = 0; i < 14; i++) { const k = 4 + i * 2.6; c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.roundRect ? c.roundRect(k, k, 128 - k * 2, 128 - k * 2, 16) : c.rect(k, k, 128 - k * 2, 128 - k * 2); c.fill(); } } }));   // canvas の filter は使えない端末があるので、重ね塗りでぼかす
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, color: 0x000000, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; scene.add(m); return m;
}
function detailQuarters(S, G) {
  const { gn, ge, gw, bed, sf, tb, pg } = G, std = o => { const m = new THREE.MeshStandardMaterial(o); m.userData = { room: 'B' }; m.envMapIntensity = .7; return m; };
  // 布：向きのない細かいむらの凹凸
  const weave = canvasTex(256, 256, (c) => { c.fillStyle = '#808080'; c.fillRect(0, 0, 256, 256); for (const [n, s, a] of [[9000, 2, .16], [2600, 4, .12], [300, 16, .07]]) for (let i = 0; i < n; i++) { const v = rnd() < .5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${a})`; c.fillRect(rnd() * 256, rnd() * 256, s, s); } }, { srgb: false, repeat: [5, 5] });
  for (const k of ['fabric', 'fabricDark', 'sheet', 'pillow']) { S[k].bumpMap = weave; S[k].bumpScale = k === 'sheet' || k === 'pillow' ? .5 : .9; }
  // 掛け布団の畝
  const quilt = canvasTex(256, 256, (c) => { c.fillStyle = '#909090'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 6; i++) { const g = c.createLinearGradient(0, i * 256 / 6, 0, (i + 1) * 256 / 6); g.addColorStop(0, '#303030'); g.addColorStop(.18, '#a0a0a0'); g.addColorStop(.82, '#a0a0a0'); g.addColorStop(1, '#303030'); c.fillStyle = g; c.fillRect(0, i * 256 / 6, 256, 256 / 6); } }, { srgb: false });
  S.duvet = std({ color: 0x23252a, roughness: .92, bumpMap: quilt, bumpScale: 2.2 });

  // ---- 敷物（ソファと卓のまわり。艶のない面なので、窓の光と影が乗る）
  const rugT = dualTex(256, 256, (c, o) => { c.fillStyle = '#4b4e55'; c.fillRect(0, 0, 256, 256); o.fillStyle = orm(.97, 0); o.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) { const v = rr(-9, 9); c.fillStyle = `rgba(${128 + v * 12 | 0},${128 + v * 12 | 0},${132 + v * 12 | 0},.07)`; c.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
    c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 1; for (let i = 0; i <= 256; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.moveTo(0, i); c.lineTo(256, i); c.stroke(); } }, { repeat: [2, 2] });
  const rugM = std({ map: rugT.map, roughnessMap: rugT.orm, roughness: 1, metalness: 0, bumpMap: weave, bumpScale: .6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const RX = 9.15, RZ = 3.0, rgeo = new THREE.ShapeGeometry(toShape(rrPts(1.85, 1.38, .22, 8))); rgeo.rotateX(-Math.PI / 2);
  const rug = mesh(rgeo, rugM, scene, RX, .006, RZ, false); rug.receiveShadow = true;
  mesh(flatRing(1.78, 1.31, .18, .02), std({ color: 0x70747b, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), scene, RX, .0075, RZ, false);

  // ---- 収納：扉ごとの絵（番号、通気口、継ぎ目、札）
  for (let i = 0; i < 4; i++) {
    const lx = -2.1 + i * .8, t = decalTex(288, 880, LIGHT_BG, .5, .12, (c, U, w, h) => {
      U.frame(8, 8, w - 16, h - 16, 10); U.seam(8, 250, w - 8, 250); U.seam(8, h - 96, w - 8, h - 96);
      U.slots(34, 36, w - 68, 70, 5); U.text('0' + (i + 1), 30, 214, 96, { wt: 700, col: 'rgba(18,20,24,.72)' }); U.text('STOWAGE', 152, 170, 22); U.text('PERSONAL / ' + ['A', 'B', 'C', 'D'][i], 152, 194, 15, { wt: 500 }); U.tag(152, 204, 54, 10);
      U.fill(w - 70, 410, 40, 150, 'rgba(0,0,0,.55)', 8, [.8, 0]); U.fill(30, 290, 46, 12, i === 1 ? '#d8b40e' : 'rgba(18,20,24,.6)', 2);
      U.text('C-08 / LK-' + (i + 1), 30, 330, 15, { wt: 500 }); U.text('MAX 40 KG', 30, 350, 13, { wt: 500, col: 'rgba(18,20,24,.55)' });
      for (const [x, y] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22], [22, 264], [w - 22, 264]]) U.bolt(x, y);
      U.slots(34, h - 74, w - 68, 40, 3); U.plus(w - 40, 300, 7, 'rgba(18,20,24,.55)');
    });
    decal(gn, .72, 2.2, lx, 1.17, .5035, t);
  }
  // ---- 寝台：頭側の板、台の側面、脇の台
  const head = decalTex(920, 560, PANEL_BG, .36, .5, (c, U, w, h) => {
    c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 1; for (let x = 0; x <= w; x += 46) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 46) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    U.seam(w / 2, 0, w / 2, h, 2); U.seam(0, 96, w, 96, 2); U.frame(40, 150, 320, 300, 14, 2); U.frame(w - 360, 150, 320, 300, 14, 2);
    U.text('REST UNIT 01', 44, 64, 40, { wt: 700, col: INK_L }); U.text('C-08-B  ·  SLEEP CYCLE 06:30', 290, 62, 20, { wt: 500, col: 'rgba(206,210,216,.4)' }); U.tag(w - 150, 40, 110, 22, 'OCCUPIED');
    for (let i = 0; i < 5; i++) U.fill(64, 190 + i * 22, 180 - (i % 3) * 40, 5, 'rgba(206,210,216,.22)'); U.slots(w - 330, 190, 110, 180, 9); U.slots(w - 190, 190, 110, 180, 9);
    for (const [x, y] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) U.plus(x, y, 7);
    U.fill(44, h - 60, 240, 4, '#d8b40e'); U.text('READING LIGHT  L / R', 44, h - 28, 18, { wt: 500, col: 'rgba(206,210,216,.42)' });
  });
  decal(bed, 1.84, 1.12, 1.037, .86, 0, head, -Math.PI / 2);
  const side = (n, label) => decalTex(Math.round(n * 400), 64, DARK_BG, .42, .45, (c, U, w, h) => { U.seam(0, 6, w, 6, 2); U.seam(0, h - 6, w, h - 6, 2); for (let x = w / 3; x < w - 10; x += w / 3) U.seam(x, 6, x, h - 6, 2);
    U.text(label, 18, 42, 24, { wt: 700, col: INK_L }); U.hazard(w - 150, 22, 120, 20); U.slots(w / 3 + 20, 18, 90, 28, 6, true); U.bolt(w / 3 - 12, 32, 3); U.bolt(2 * w / 3 - 12, 32, 3); });
  decal(bed, 2.16, .16, 0, .22, -.8225, side(2.16, 'BUNK 01'), Math.PI); decal(bed, 1.56, .16, -1.1225, .22, 0, side(1.56, 'C-08-B'), -Math.PI / 2);
  const drawers = (n, label) => decalTex(240, 220, LIGHT_BG, .5, .12, (c, U, w, h) => { U.frame(6, 6, w - 12, h - 12, 8); for (let i = 1; i < n; i++) U.seam(6, i * h / n, w - 6, i * h / n); for (let i = 0; i < n; i++) U.fill(w / 2 - 34, (i + .5) * h / n - 5, 68, 10, 'rgba(0,0,0,.6)', 5, [.8, 0]); U.text(label, 16, 28, 15, { wt: 500 }); U.tag(w - 44, 16, 28, 8); });
  decal(bed, .4, .42, .93 - .2315, .24, -1.08, drawers(2, 'SIDE UNIT'), -Math.PI / 2); decal(bed, .42, .42, .93, .24, -1.08 - .2215, drawers(2, 'SIDE UNIT'), Math.PI);
  // 掛け布団を畝のある布に替え、折り返しと、読書灯を足す
  bed.children.forEach(o => { if (o.material === S.fabricDark) o.material = S.duvet; });
  rbox(bed, .2, .115, 1.57, .3, .535, 0, S.sheet, .05);
  rbox(bed, 2.3, .06, 1.7, 0, .1, 0, S.gloss, .02);
  for (const s of [-1, 1]) { const a = cyl(bed, .012, .012, .34, .93, 1.3, s * .72, S.dark, 10); a.rotation.z = 1.05; rbox(bed, .12, .03, .07, .77, 1.21, s * .72, S.dark, .01); box(bed, .1, .006, .05, .77, 1.193, s * .72, S.warm, false); }
  // ---- 机：引き出しの絵、背板、投影の台、椅子の肘掛けと脚
  const dx = 2.0;
  decal(gw, .56, .48, dx + .72, .3, .6425, drawers(3, 'DESK UNIT'));
  const back = decalTex(1220, 470, PANEL_BG, .36, .5, (c, U, w, h) => {
    for (let y = 30; y < h; y += 26) for (let x = 30; x < w; x += 26) { c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(x, y, 3, 3); }
    U.seam(w * .68, 0, w * .68, h, 2); U.frame(w * .7, 40, w * .27, 150, 10, 2); U.frame(w * .7, 220, w * .27, 200, 10, 2);
    U.text('WORK SURFACE', w * .7 + 16, 74, 22, { wt: 700, col: INK_L }); U.slots(w * .7 + 16, 96, w * .2, 70, 5); U.text('C-08-D', w * .7 + 16, 258, 30, { wt: 700, col: INK_L });
    for (let i = 0; i < 6; i++) U.fill(w * .7 + 16, 282 + i * 20, (i % 2 ? .12 : .2) * w, 4, 'rgba(206,210,216,.2)'); U.hazard(w * .7 + 16, h - 46, 180, 14);
    U.fill(30, h - 30, 300, 4, '#d8b40e'); for (const [x, y] of [[20, 20], [w * .68 - 20, 20], [20, h - 20], [w * .68 - 20, h - 20]]) U.plus(x, y, 7);
  });
  decal(gw, 2.44, .94, dx, 1.45, .057, back);
  rbox(gw, 1.6, .035, .07, dx, 1.0, .26, S.dark, .01); for (const s of [-1, 1]) cyl(gw, .012, .012, .2, dx + s * .7, .89, .26, S.dark, 10); box(gw, 1.5, .006, .02, dx, 1.02, .26, S.warm, false);
  for (const s of [-1, 1]) { rbox(gw, .05, .03, .3, dx + s * .27, .66, 1.42, S.dark, .01); cyl(gw, .014, .014, .18, dx + s * .27, .57, 1.5, S.dark, 8); }
  for (const a of [0, Math.PI / 2]) { const b = rbox(gw, .56, .025, .06, dx, .045, 1.38, S.dark, .01); b.rotation.y = a + .4; }
  rbox(gw, .3, .16, .05, dx, 1.14, 1.63, S.fabricDark, .02);
  // ---- ソファ：肘掛けと台の絵、脚、置きクッション
  const arm = decalTex(380, 170, LIGHT_BG, .5, .12, (c, U, w, h) => { U.frame(8, 8, w - 16, h - 16, 10); U.seam(8, h * .62, w - 8, h * .62); U.text('SEAT UNIT / 3', 24, 44, 20); U.text('C-08-S', 24, 66, 14, { wt: 500 }); U.slots(w - 120, 26, 90, 54, 4); U.tag(24, h - 44, 60, 9); U.bolt(22, h - 20); U.bolt(w - 22, h - 20); });
  for (const s of [-1, 1]) decal(sf, .9, .4, s * 1.4015, .29, 0, arm, s * Math.PI / 2);
  const sbase = decalTex(940, 80, DARK_BG, .42, .45, (c, U, w, h) => { U.seam(0, 8, w, 8, 2); for (const x of [w / 3, 2 * w / 3]) U.seam(x, 8, x, h, 2); for (let k = 0; k < 3; k++) U.slots(k * w / 3 + 40, 26, 150, 30, 10, true); U.text('LOAD 320 KG', w - 200, 50, 18, { wt: 500, col: 'rgba(206,210,216,.4)' }); });
  decal(sf, 2.36, .2, 0, .19, .4815, sbase); decal(sf, 2.36, .2, 0, .19, -.4815, sbase, Math.PI);
  for (const [x, z] of [[-1.05, -.36], [1.05, -.36], [-1.05, .36], [1.05, .36]]) cyl(sf, .03, .024, .06, x, .03, z, S.gloss, 12);
  { const c1 = rbox(sf, .36, .36, .12, -.82, .64, .02, S.accent, .05); c1.rotation.x = -.42; c1.rotation.z = .08; const c2 = rbox(sf, .4, .3, .12, .86, .62, .03, S.fabricDark, .05); c2.rotation.x = -.4; c2.rotation.z = -.1; }
  for (const i of [-.39, .39]) box(sf, .012, .17, .76, i, .4, .08, S.dark, false);
  // ---- シャワー：柱、床の排水の溝、上の輪の表記
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; cyl(pg, .016, .016, 2.16, Math.cos(a) * .808, 1.2, Math.sin(a) * .808, S.gloss, 8); }
  const grate = canvasTex(256, 256, (c) => { c.fillStyle = '#16171b'; c.fillRect(0, 0, 256, 256); c.translate(128, 128); c.strokeStyle = '#050506'; c.lineWidth = 5; c.lineCap = 'round'; for (const r of [36, 58, 80, 102]) for (let k = 0; k < 12; k++) { const a0 = k * TAU / 12 + .06, a1 = (k + 1) * TAU / 12 - .06; c.beginPath(); c.arc(0, 0, r, a0, a1); c.stroke(); } c.fillStyle = '#050506'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); });
  { const g = new THREE.CircleGeometry(.75, 48); g.rotateX(-Math.PI / 2); mesh(g, std({ map: grate, roughness: .45, metalness: .5 }), pg, 0, .1135, 0, false); }
  const capT = canvasTex(1536, 96, (c, w, h) => { c.fillStyle = '#15161a'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(206,210,216,.6)'; c.font = `700 40px ${FE}`; c.textBaseline = 'middle'; let x = 20; for (const t of ['HYGIENE POD', '///', 'C-08-W', '///', 'WATER RECLAIM 84%', '///', '38°C', '///']) { c.fillText(t, x, h / 2 + 2); x += c.measureText(t).width + 36; } c.fillStyle = '#d8b40e'; c.fillRect(0, h - 10, w, 5); }, { repeat: [2, 1] });
  mesh(new THREE.CylinderGeometry(.884, .884, .18, 64, 1, true), std({ map: capT, roughness: .42, metalness: .45 }), pg, 0, 2.52, 0, false);
  // ---- 東の壁：区画の表示板
  const sign = decalTex(260, 800, PANEL_BG, .36, .5, (c, U, w, h) => { U.frame(8, 8, w - 16, h - 16, 10, 2); U.hazard(24, 28, w - 48, 22); c.save(); c.translate(w / 2 + 62, h - 60); c.rotate(-Math.PI / 2); U.text('C-08', 0, 0, 190, { wt: 700, col: 'rgba(206,210,216,.7)' }); c.restore();
    c.save(); c.translate(56, h - 60); c.rotate(-Math.PI / 2); U.text('PRIVATE QUARTERS  ·  RING SEGMENT C', 0, 0, 22, { wt: 500, col: 'rgba(206,210,216,.42)' }); c.restore(); U.fill(w - 40, 80, 8, 420, '#d8b40e'); U.plus(40, 90, 7); });
  rbox(ge, .56, 1.7, .03, 1.02, 1.45, .015, S.panel, .01); decal(ge, .5, 1.62, 1.02, 1.45, .032, sign);
  // ---- 天井：継ぎ目と通気口
  const ceilT = decalTex(1024, 928, '#0d0e11', .92, 0, (c, U, w, h) => { for (let x = 0; x <= w; x += 256) U.seam(x, 0, x, h, 2); for (let y = 0; y <= h; y += 232) U.seam(0, y, w, y, 2);
    for (const [x, y] of [[90, 60], [w - 290, h - 150], [90, h - 150]]) { U.frame(x, y, 200, 90, 8, 2); U.slots(x + 14, y + 14, 172, 62, 6); } U.text('C-08 / CLG 02', w - 300, 70, 20, { wt: 500, col: 'rgba(206,210,216,.3)' }); });
  G.ceil.material = std({ map: ceilT.map, roughnessMap: ceilT.orm, roughness: 1, metalness: 0 });

  // ---- 置き影
  blob('rect', 12.42, 3.15, 2.7, 2.1, .7); blob('rect', 9.1, 2.45, 2.9, 1.4, .75); blob('round', 9.1, 4.02, 1.0, 1.0, .6); blob('rect', BX0 + .45, BCZ - dx, 1.2, 2.7, .6); blob('round', BX0 + 1.38, BCZ - dx, .8, .8, .6);
  blob('rect', BCX - .9, BZ0 + .3, 3.7, 1.0, .65); blob('round', 12.55, -1.35, 2.3, 2.3, .6); blob('rect', 13.3, 2.07, .8, .8, .55); blob('rect', BX1 - .2, BCZ - .5, .9, 2.2, .45);
}
function setShower(v, instant) { qr.shower = v; audio.shower(v); if (instant) { qr.showerA = v ? 1 : 0; qr.steam = v ? 1 : 0; } }
function setMode(i, instant) { qr.mode = i; if (instant) { qr.modeCur = i; applyMode(); captureEnv('B'); captureEnv('B'); } }
function applyMode() {
  const k = qr.modeCur, a = MODES[0], b = MODES[1], L = (i, j) => lerp(a[i][j], b[i][j], k);
  MB.strip.color.setRGB(L('strip', 0), L('strip', 1), L('strip', 2)); MB.stripDim.color.setRGB(L('dim', 0), L('dim', 1), L('dim', 2));
  qr.l1.color.setRGB(L('col', 0), L('col', 1), L('col', 2)); qr.l1.intensity = L('i', 0);
}
function updateQuarters(dt) {
  const inB = player.x > X1 + .2; showRooms(!inB || door.open > .02, inB || door.open > .02);
  if (inB !== qr.inB) { qr.inB = inB; if (state === 'play') toast(inB ? 'C-08  PRIVATE QUARTERS' : 'C-07  CONTROL DECK'); }
  const P = qr.pod, on = qr.shower ? 1 : 0;
  qr.showerA += (on - qr.showerA) * (1 - Math.exp(-dt * 4)); qr.steam += (on - qr.steam) * (1 - Math.exp(-dt * (on ? .45 : .13)));
  P.water.material.uniforms.a.value = qr.showerA; P.water.visible = qr.showerA > .01; P.mist.material.uniforms.a.value = qr.steam; P.mist.visible = qr.steam > .01;
  P.glass.uniforms.fog.value = qr.steam; P.glass.uniforms.wet.value = Math.max(qr.showerA, qr.steam * .6);
  P.light.intensity = 4.2 * qr.showerA; P.head.color.setRGB(.3 + 1.5 * qr.showerA, .34 + 1.6 * qr.showerA, .4 + 1.8 * qr.showerA);
  // 照明モードの移り変わり。移る間は、私室の環境マップを撮り直す
  if (Math.abs(qr.mode - qr.modeCur) > 1e-4) {
    qr.modeCur += (qr.mode - qr.modeCur) * (1 - Math.exp(-dt * 3.5)); const done = Math.abs(qr.mode - qr.modeCur) < .012; if (done) qr.modeCur = qr.mode;
    applyMode(); qr.envT += dt; if (done) { captureEnv('B'); captureEnv('B'); } else if (qr.envT > .3) { qr.envT = 0; captureEnv('B'); }
  }
}

// ---------------------------------------------------------------- dust
let dust;
function buildDust() {
  const N = 260, p = new Float32Array(N * 3), s = new Float32Array(N); for (let i = 0; i < N; i++) { p[i * 3] = rr(X0 + .6, X1 - .6); p[i * 3 + 1] = rr(.2, 3.2); p[i * 3 + 2] = rr(Z0 + .6, Z1 - .6); s[i] = rnd(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('s', new THREE.BufferAttribute(s, 1));
  dust = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { time: uTime, vh: uVh, map: { value: softDot() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float s; uniform float time, vh; varying float vA; void main(){ vec3 p=position; p.x+=sin(time*.07+s*40.)*.3; p.y+=sin(time*.05+s*70.)*.2; p.z+=cos(time*.06+s*55.)*.3; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.3,.008*vh/max(-mv.z,.05)); vA=(.25+.75*s)*smoothstep(.25,1.2,-mv.z); }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ gl_FragColor=vec4(vec3(.8,.86,1.)*texture2D(map,gl_PointCoord).r*vA*.16,1.); }` }));
  scene.add(dust);
}

// ---------------------------------------------------------------- lights
let hemi, mainLight;
function buildLights() {
  hemi = new THREE.HemisphereLight(0x8f98ab, 0x1b1d22, .32); scene.add(hemi);
  mainLight = new THREE.PointLight(0xe8eeff, 12, 13, 1.5); mainLight.position.set(0, 2.72, .2); mainLight.castShadow = true; mainLight.shadow.bias = -.003; mainLight.shadow.camera.near = .2; mainLight.shadow.camera.far = 12; scene.add(mainLight);
  for (const [x, y, z, c, i] of [[-2.8, 2.6, 0, 0xe8eeff, 4.5], [2.8, 2.6, 0, 0xe8eeff, 4.5], [0, 2.3, -2.6, 0x8fa8ff, 6.5]]) { const l = new THREE.PointLight(c, i, 7.5, 1.5); l.position.set(x, y, z); scene.add(l); }
  const win = new THREE.SpotLight(0xc9d6ff, 17, 16, .75, 1, 1.2); win.position.set(SUN.x * 7, 1.9 + SUN.y * 7, Z1 + SUN.z * 7); win.target.position.set(-SUN.x * 3, 0, Z1 - 4.5); win.castShadow = true; win.shadow.mapSize.setScalar(1024); win.shadow.camera.near = 2; win.shadow.camera.far = 22; win.shadow.bias = -.0012; win.shadow.normalBias = .02; scene.add(win, win.target);   // 窓枠の形の光が、六角壁と段に落ちる
}

// ---------------------------------------------------------------- environment map（室内を撮って、壁や金属の映りこみに使う）
// 部屋ごとに1枚ずつ撮る（A：管制デッキ、B：私室）
const cubeRT = new THREE.WebGLCubeRenderTarget(COARSE ? 128 : 256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(.1, 600, cubeRT); cubeCam.position.set(0, 1.5, 0);
const cubeRTB = new THREE.WebGLCubeRenderTarget(COARSE ? 128 : 256, { type: THREE.HalfFloatType });
const cubeCamB = new THREE.CubeCamera(.1, 600, cubeRTB); cubeCamB.position.set(BCX, 1.4, BCZ);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, envRTB = null; const bMats = [], rooms = { A: [], B: [], a: true, b: true };
// いない側の部屋は、物も光源も描かない（光源を減らすと、もう一方の部屋のシェーダも軽くなる）。
// 光源の数が変わるとシェーダが別になるので、三通り（A だけ、B だけ、両方）を起動時に用意しておく
const roomLights = { A: [], B: [] };
function showRooms(a, b) { if (a !== rooms.a) { rooms.a = a; for (const o of rooms.A) o.visible = a; } if (b !== rooms.b) { rooms.b = b; for (const o of rooms.B) o.visible = b; } }
function captureEnv(which = 'AB') {
  const ra = rooms.a, rb = rooms.b; showRooms(true, true); const li = []; for (const k of 'AB') for (const l of roomLights[k]) { li.push([l, l.intensity]); if (l.userData.nom !== undefined) l.intensity = l.userData.nom; } if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
  holoGroup.visible = false; dust.visible = false; uMirOn.value = 0; skyMat.uniforms.gain.value = .3;
  const exp = renderer.toneMappingExposure;
  if (which.includes('A')) cubeCam.update(renderer, scene); if (which.includes('B')) cubeCamB.update(renderer, scene);
  renderer.toneMappingExposure = exp;
  holoGroup.visible = true; dust.visible = true; uMirOn.value = mirror.on ? 1 : 0; skyMat.uniforms.gain.value = 1; showRooms(ra, rb); for (const [l, v] of li) l.intensity = v;
  if (which.includes('A')) { const rt = pmrem.fromCubemap(cubeRT.texture); scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt; }
  if (which.includes('B')) { const rt = pmrem.fromCubemap(cubeRTB.texture); for (const m of bMats) { if (!m.envMap) m.needsUpdate = true; m.envMap = rt.texture; } if (envRTB) envRTB.dispose(); envRTB = rt; }
}
// 映りこみの箱補正：部屋の中央で撮った環境マップを、部屋の箱に当たった位置で引き直す
const boxGlsl = (mn, mx, pr) => `vec3 boxProject( vec3 dir, vec3 wp ) {
  vec3 bmin = vec3( ${mn.map(v => v.toFixed(2)).join(', ')} ), bmax = vec3( ${mx.map(v => v.toFixed(2)).join(', ')} ), probe = vec3( ${pr.map(v => v.toFixed(2)).join(', ')} );
  if ( any( lessThan( wp, bmin - 0.3 ) ) || any( greaterThan( wp, bmax + 0.3 ) ) ) return dir;
  vec3 d = dir + ( 1.0 - step( 1e-5, abs( dir ) ) ) * 1e-5;
  vec3 rb = max( ( bmax - wp ) / d, ( bmin - wp ) / d );
  float t = max( min( min( rb.x, rb.y ), rb.z ), 0.0 );
  return normalize( wp + dir * t - probe );
}
`;
const BOX_A = boxGlsl([X0, 0, Z0], [X1, WH, Z1], [0, 1.5, 0]), BOX_B = boxGlsl([BX0, 0, BZ0], [BX1, BH, BZ1], [BCX, 1.4, BCZ]);
const BOX_CHUNK = THREE.ShaderChunk.envmap_physical_pars_fragment.replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix ); reflectVec = boxProject( reflectVec, vBoxWP );');
const BOX_OK = BOX_CHUNK !== THREE.ShaderChunk.envmap_physical_pars_fragment;
function boxify(mat) {
  if (!BOX_OK || mat.userData.box || mat.userData.floor) return; mat.userData.box = true; const B = mat.userData.room === 'B';
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vBoxWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvec4 bwp = vec4( transformed, 1.0 );\n\t#ifdef USE_INSTANCING\n\tbwp = instanceMatrix * bwp;\n\t#endif\n\tvBoxWP = ( modelMatrix * bwp ).xyz;');
    sh.fragmentShader = 'varying vec3 vBoxWP;\n' + (B ? BOX_B : BOX_A) + sh.fragmentShader.replace('#include <envmap_physical_pars_fragment>', BOX_CHUNK);
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\t' + GUARD('gl_FragColor.rgb'));
  };
  mat.customProgramCacheKey = () => B ? 'boxB' : 'boxA';
}

// ---------------------------------------------------------------- post
let composer, bloom, finalPass, gtao = null, noAO = [], quality = COARSE ? 'low' : 'mid';
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, grain: { value: .02 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, grain; uniform vec2 res; varying vec2 vUv;
    float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    void main(){ vec2 c=vUv-.5; float r2=dot(c,c); vec2 off=c*r2*.013;       // 画面の端ほど強い色ずれ
      vec3 col=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
      col*=mix(1.,.5,smoothstep(.12,.66,r2));
      float l=dot(col,vec3(.2126,.7152,.0722));
      vec3 g=mix(col,col*col*(3.-2.*col),.14); g*=mix(vec3(.93,.99,1.1),vec3(1.03,1.0,.96),smoothstep(.03,.6,l));
      float l2=dot(g,vec3(.2126,.7152,.0722)); col=mix(vec3(l2),g,1.06);
      col+=(hash12(floor(vUv*res)+floor(time*61.)*vec2(17.,29.))-.5)*grain;
      ${GUARD('col', '1.0')} gl_FragColor=vec4(col,1.); }`
};
// 画質ごとの設定。maxPx は描画バッファの画素数の上限、ao は GTAO の解像度の倍率、mir は床の反射の解像度の倍率
const QUAL = {
  low: { jp: '軽量', dpr: 1.25, maxPx: 1.6e6, msaa: 0, fxaa: false, ao: 0, aoSamples: 0, pdSamples: 0, mir: .45 },
  mid: { jp: '標準', dpr: 1.5, maxPx: 2.1e6, msaa: 0, fxaa: true, ao: .5, aoSamples: 8, pdSamples: 8, mir: .6 },
  high: { jp: '高', dpr: 2, maxPx: 2.4e6, msaa: 4, fxaa: false, ao: .5, aoSamples: 8, pdSamples: 8, mir: .8 },
};
// 自動の解像度調整：fps が足りないとき、描く画素数を段階的に下げる。余裕が戻れば、一度だけ1段戻す
const auto = { scale: 1, acc: 0, n: 0, slow: 0, good: 0, last: 0, grace: 0, triedUp: false, locked: false };
function autoReset() { auto.scale = 1; auto.slow = auto.good = 0; auto.triedUp = auto.locked = false; }
function autoScale(now) {
  const d = now - auto.last; auto.last = now;
  if (now < auto.grace || d > 250 || d <= 0) { auto.acc = auto.n = 0; return; }
  auto.acc += d; auto.n++; if (auto.acc < 1000) return;
  const fps = auto.n * 1000 / auto.acc; auto.acc = auto.n = 0;
  auto.slow = fps < 50 ? auto.slow + 1 : 0; auto.good = fps >= 58 ? auto.good + 1 : 0;
  if (auto.slow >= 2 && auto.scale > .5) { if (auto.triedUp) auto.locked = true; auto.scale = Math.max(.5, auto.scale * .85); auto.slow = 0; buildComposer(); }
  else if (auto.good >= 15 && auto.scale < 1 && !auto.locked) { auto.scale = Math.min(1, auto.scale / .85); auto.triedUp = true; auto.good = 0; buildComposer(); }
}
let cfgOver = null, bufSize = new THREE.Vector2(), bloomGuard = false, frozen = null, shadowDirty = true;
function buildComposer() {
  const Q = { ...QUAL[quality], ...(cfgOver || {}) }; auto.grace = performance.now() + 2500;
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr, Math.sqrt(Q.maxPx / (w * h))) * auto.scale;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()); bufSize.copy(size);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.msaa });
  if (composer) composer.dispose();
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (gtao) { gtao.dispose(); gtao = null; }
  if (Q.ao > 0) {
    const aw = Math.max(2, Math.round(size.x * Q.ao)), ah = Math.max(2, Math.round(size.y * Q.ao));
    gtao = new GTAOPass(scene, camera, aw, ah, undefined, { radius: .45, distanceExponent: 1.2, thickness: 1.2, scale: 1.5, samples: Q.aoSamples, distanceFallOff: 1, screenSpaceRadius: false }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: Q.pdSamples });
    gtao.blendIntensity = 1;
    // 合成を差し替える：発光している面（光の帯、表示）は暗くしない
    gtao.blendMaterial.dispose();
    gtao.blendMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tColor: { value: null }, intensity: { value: 1 }, lim: { value: new THREE.Vector2(.8, 1.6) } }, depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D tDiffuse, tColor; uniform float intensity; uniform vec2 lim; varying vec2 vUv;
        void main(){ vec4 c=texture2D(tColor,vUv); ${GUARD('c.rgb')} float ao=texture2D(tDiffuse,vUv).r; float m=max(c.r,max(c.g,c.b));
          gl_FragColor=vec4(c.rgb*mix(1.,ao,intensity*(1.-smoothstep(lim.x,lim.y,m))),c.a); }` });
    const run = gtao.render.bind(gtao), setSize = gtao.setSize.bind(gtao);
    gtao.setSize = () => setSize(aw, ah);
    gtao.render = (...a) => { const u = gtao.blendMaterial.uniforms; if (u.tColor) u.tColor.value = a[2].texture; for (const o of noAO) { o.userData.v = o.visible; o.visible = false; } run(...a); for (const o of noAO) o.visible = o.userData.v; };
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), .3, .7, 1.0);
  bloomGuard = false;
  { const hp = bloom.materialHighPassFilter, a = 'vec4 texel = texture2D( tDiffuse, vUv );'; if (hp.fragmentShader.includes(a)) { hp.fragmentShader = hp.fragmentShader.replace(a, a + ' ' + GUARD('texel.rgb')); hp.needsUpdate = true; bloomGuard = true; } }
  composer.addPass(bloom); composer.addPass(new OutputPass());
  if (Q.fxaa) { const fx = new ShaderPass(FXAAShader); fx.uniforms.resolution.value.set(1 / size.x, 1 / size.y); composer.addPass(fx); }
  finalPass = new ShaderPass(FinalShader); finalPass.uniforms.res.value.set(size.x, size.y); composer.addPass(finalPass);
  camera.aspect = w / h; camera.fov = w < h ? 80 : 66; camera.updateProjectionMatrix();
  uVh.value = size.y;
  // 床の反射用の描画先（ミップマップつき。艶のむらは、粗いミップを読んでぼかす）
  if (mirror.rt) mirror.rt.dispose();
  mirror.rt = new THREE.WebGLRenderTarget(Math.max(2, Math.round(size.x * Q.mir)), Math.max(2, Math.round(size.y * Q.mir)), { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  uMir.value = mirror.rt.texture;
  mainLight.shadow.mapSize.setScalar(quality === 'low' ? 512 : 1024);
  if (mainLight.shadow.map) { mainLight.shadow.map.dispose(); mainLight.shadow.map = null; }
  shadowDirty = true;      // 影は、両方の部屋を見せた状態で1回だけ計算する（frame と captureEnv で処理）
}

// ---------------------------------------------------------------- player
const START = { x: 3.7, z: 2.75, yaw: .86, pitch: -.05 };
const player = { x: START.x, z: START.z, yaw: START.yaw, pitch: START.pitch, vx: 0, vz: 0, bob: 0, eye: 1.62, seat: null };
const keys = new Set(); const stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }; const lookT = { id: -1, x: 0, y: 0 };
let state = 'menu', hadLock = false, time = 0;
const PR = .3;
// 壁は線分、家具は線分の四角か円。半径 PR の円として押し出す
function collide(p) {
  for (let it = 0; it < 3; it++) {
    for (const s of segs) {
      if (!s.on) continue; const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / (dx * dx + dz * dz), 0, 1), cx = s.ax + dx * t, cz = s.az + dz * t;
      const ox = p.x - cx, oz = p.z - cz, d = Math.hypot(ox, oz); if (d < PR && d > 1e-6) { p.x = cx + ox / d * PR; p.z = cz + oz / d * PR; }
    }
    for (const c of circles) { const ox = p.x - c.x, oz = p.z - c.z, d = Math.hypot(ox, oz), m = c.r + PR; if (d < m && d > 1e-6) { p.x = c.x + ox / d * m; p.z = c.z + oz / d * m; } }
  }
  p.x = clamp(p.x, -IW + PR, BX1 - PR); p.z = clamp(p.z, -ID + PR, BZ1 - PR);
}
function sit(s) { player.seat = s; player.vx = player.vz = 0; player.yaw = s.yaw; player.pitch = s.pitch; audio.cloth(); toast(s.toast); }
function stand() { const s = player.seat; if (!s) return; player.seat = null; player.x = s.ex; player.z = s.ez; audio.cloth(); }
function updatePlayer(dt) {
  let fx = 0, fz = 0;
  if (state === 'play') {
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    fx += stick.x; fz -= stick.y;
  }
  const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
  const ke = 1 - Math.exp(-dt * 6);
  if (player.seat) {
    if (l > .6) stand();
    else { const s = player.seat; player.x += (s.x - player.x) * ke; player.z += (s.z - player.z) * ke; player.eye += (s.eye - player.eye) * ke; camera.position.set(player.x, player.eye + Math.sin(time * 1.1) * .004, player.z); camera.rotation.set(player.pitch, player.yaw, 0); return; }
  }
  player.eye += (1.62 - player.eye) * ke;
  const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') || l > 1.01) ? 3.6 : 2.2;
  const sn = Math.sin(player.yaw), cs = Math.cos(player.yaw);
  const tx = (-sn * fz + cs * fx) * sp, tz = (-cs * fz - sn * fx) * sp;
  const k = 1 - Math.exp(-dt * 11); player.vx += (tx - player.vx) * k; player.vz += (tz - player.vz) * k;
  player.x += player.vx * dt; player.z += player.vz * dt; collide(player);
  const v = Math.hypot(player.vx, player.vz), b0 = player.bob; player.bob += v * dt * 2.6;
  if (v > .8 && Math.floor(b0 / Math.PI + .25) !== Math.floor(player.bob / Math.PI + .25)) audio.step();
  camera.position.set(player.x, player.eye + Math.sin(player.bob * 2) * .012 * Math.min(v / 2.2, 1), player.z);
  camera.rotation.set(player.pitch, player.yaw, Math.sin(player.bob) * .0025 * Math.min(v / 2.2, 1));
}
function look(dx, dy, s) { player.yaw -= dx * s; player.pitch = clamp(player.pitch - dy * s, -1.35, 1.35); }

// ---------------------------------------------------------------- interaction
const interactables = [];
let focus = null, toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); toastTimer = 2.4; }
const standIt = { label: () => '立ち上がる', act: stand };
function updateFocus() {
  focus = null; let best = 1e9; const sn = Math.sin(player.yaw), cs = Math.cos(player.yaw);
  if (player.seat) focus = standIt;
  else for (const it of interactables) {
    const dx = it.pos.x - player.x, dz = it.pos.z - player.z, d = Math.hypot(dx, dz); if (d > it.r) continue;
    const facing = (dx * -sn + dz * -cs) / (d || 1); if (facing < .5 && d > .5) continue;
    const score = d - facing * .8; if (score < best) { best = score; focus = it; }
  }
  const p = $('prompt'), on = !!focus && state === 'play';
  if (on) p.innerHTML = (COARSE ? '' : '<kbd>E</kbd>') + focus.label();
  p.classList.toggle('on', on); $('actBtn').classList.toggle('on', on && COARSE);
}
function interact() { if (state === 'play' && focus) focus.act(); }
const accTarget = new THREE.Color(...ACCENTS[0].c);
function setAccent(i) { accent = i; accTarget.setRGB(...ACCENTS[i].c); }

// ---------------------------------------------------------------- build
// 読みこみの進み具合をメニューに出す。重い処理の前に1フレーム譲って、表示を先に描かせる
const prog = (pct, label) => { $('startSub').textContent = label; $('bar').style.width = pct + '%'; return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };
async function build() {
  await prog(5, '読みこみ中 ― 画像');
  // 文字のテクスチャを描く前に、Web フォントを待つ（読めなければ端末の書体で進む）
  try { await Promise.race([Promise.all([document.fonts.load(`700 40px "Saira Condensed"`), document.fonts.load(`600 40px "Saira Condensed"`), document.fonts.load(`700 40px "Zen Kaku Gothic New"`, '同期中接続承認私室')]), new Promise(r => setTimeout(r, 2500))]); } catch (e) { }
  const [tSurf, tCloud, tOre] = await Promise.all([loadTex('./assets/planet_surface.webp', true), loadTex('./assets/planet_clouds.webp', false), loadTex('./assets/ore_display.webp', true)]);
  await prog(20, '読みこみ中 ― 惑星');
  for (const t of [tSurf, tCloud]) if (t) t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;      // 見える範囲より画像が小さいので、鏡像で繰り返す
  bakeSky(tSurf, tCloud); T.ore = tOre;
  await prog(40, '読みこみ中 ― 管制デッキ');
  buildTextures(); buildMaterials(); buildMaterialsB(); buildShell(); buildLights();
  buildHexWall(); buildWest(); buildEast(); buildSouth(); buildPedestal(); buildPad(); buildDust();
  blob('round', PED.x, PED.z, 1.9, 1.9, .65); blob('rect', X0 + .42, 0, 1.0, 3.9, .55, 0, PH + .011); for (const z of [-3.9, 3.9]) blob('rect', X0 + .34, z, .8, .8, .5, 0, PH + .011);
  for (const [x, z] of [[X0 + .15, Z0 + .15], [X1 - .15, Z0 + .15], [X0 + .15, Z1 - .15], [X1 - .15, Z1 - .15]]) blob('round', x, z, 2.0, 2.0, .5, 0, PH + .011);
  for (const s of [-1, 1]) blob('rect', s * 4.95, Z0 + .3, .8, .9, .5, 0, PH + .011);
  await prog(60, '読みこみ中 ― 私室');
  const nA = scene.children.length; buildQuarters();
  // 扉が閉まっている間は、いない側の部屋を描かない
  const keep = o => o === holoGroup || o === door.group || o === hemi || o.material === skyMat;
  rooms.B = scene.children.slice(nA).filter(o => !keep(o)); rooms.A = scene.children.slice(0, nA).filter(o => !keep(o));
  roomLights.A = rooms.A.filter(o => o.isLight); roomLights.B = rooms.B.filter(o => o.isLight);   // 東の壁（扉と壁の芯）は常に描く。隠すと、私室から見た扉の開口が素通しになる
  // 壁のグループのローカル座標で置いたホログラムを、ワールドに直す
  holoGroup.updateMatrixWorld(true);
  for (const o of [...holoGroup.children]) { const w = o.userData.wall; if (!w) continue; const [g, x, y, z] = w; o.position.set(x, y, z).applyMatrix4(g.matrixWorld); o.quaternion.copy(g.quaternion); }
  interactables.push({ pos: consolePos, r: 2.3, label: () => 'アクセント色を切り替える ― ' + ACCENTS[(accent + 1) % ACCENTS.length].n, act: () => { setAccent((accent + 1) % ACCENTS.length); audio.click(); toast('ACCENT : ' + ACCENTS[accent].n); } });

  scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.material.isMeshStandardMaterial) { boxify(o.material); if (o.material.userData.room === 'B' && !bMats.includes(o.material)) bMats.push(o.material); } });
  bMats.push(floors[1].material);
  scene.traverse(o => { const m = o.material; if (o.isPoints || (o.isMesh && m && (m.transparent || m.alphaTest > 0 || m.isShaderMaterial))) { noAO.push(o); return; }
    if (o.isMesh && !o.isInstancedMesh) { o.geometry.computeBoundingBox(); const d = o.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(o.scale).toArray().sort((p, q) => p - q); if (d[1] < .035) noAO.push(o); } });
  await prog(75, '読みこみ中 ― 照明');
  updatePad(0); buildComposer(); captureEnv(); captureEnv();
  await prog(90, '読みこみ中 ― 仕上げ');
  for (const [a, b] of [[true, false], [false, true], [true, true]]) { showRooms(a, b); try { renderer.compile(scene, camera); } catch (e) { } }
  window.addEventListener('resize', () => { auto.slow = auto.good = 0; auto.triedUp = auto.locked = false; buildComposer(); });
  requestAnimationFrame(t => { last = t; tick(t); });
}

// ---------------------------------------------------------------- loop
let last = 0, fpsAcc = 0, fpsN = 0;
function frame(dt) {
  if (state === 'menu') { player.yaw = START.yaw + Math.sin(time * .13) * .22; player.pitch = START.pitch + Math.sin(time * .09) * .02; }
  for (const k of 'AB') for (const l of roomLights[k]) if (l.userData.nom !== undefined) l.intensity = l.userData.nom;
  updatePlayer(dt); updateFocus(); updatePad(dt); updateDoor(dt); updateQuarters(dt);
  // いない側の部屋の光は、扉の開き具合に合わせてゆっくり入れる（急に点くと、こちらの部屋の明るさが跳ねる）
  { const f = sstep(.02, .8, door.open), g = { A: qr.inB ? f : 1, B: qr.inB ? 1 : f }; for (const k of 'AB') for (const l of roomLights[k]) { l.userData.nom = l.intensity; l.intensity *= g[k]; } }
  uTime.value = time % 1000; finalPass.uniforms.time.value = time % 100;
  uAcc.value.lerp(accTarget, 1 - Math.exp(-dt * 5));
  ped.crystal.rotation.y = time * .25; ped.crystal.position.y = 1.25 + Math.sin(time * .8) * .04;
  ped.frags.rotation.y = -time * .16; ped.frags.position.y = 1.25 + Math.sin(time * .6 + 1.) * .03; for (const f of ped.frags.children) { f.rotation.x += dt * f.userData.w * .4; f.rotation.z += dt * f.userData.w * .25; }
  // 台座のドットの輪と、扉の幕：近づくと出る／明るくなる
  const dp = Math.hypot(player.x - PED.x, player.z - PED.z); ped.a += ((dp < 3.3 ? 1 : 0) - ped.a) * (1 - Math.exp(-dt * 7)); ped.ring.material.uniforms.op.value = ped.a; ped.ring.visible = ped.a > .004;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('on'); }
  if (shadowDirty) { showRooms(true, true); renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
  renderer.info.reset(); renderMirror(); composer.render(dt);
}
function tick(now) {
  requestAnimationFrame(tick);
  const raw = (now - last) / 1000, dt = Math.min(raw, .05); last = now; time = frozen === null ? time + dt : frozen; if (!document.hidden && !cfgOver) autoScale(now);
  frame(dt);
  if (DEBUG) { fpsAcc += raw; fpsN++; if (fpsAcc > .5) { $('dbg').textContent = `${(fpsN / fpsAcc).toFixed(0)} fps  ${QUAL[quality].jp} ${bufSize.x}x${bufSize.y} x${auto.scale.toFixed(2)}\nao ${gtao ? 'on' : 'off'}  mir ${mirror.on ? mirror.rt.width + 'x' + mirror.rt.height : 'off'}  calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\nx ${player.x.toFixed(2)} z ${player.z.toFixed(2)} yaw ${player.yaw.toFixed(2)}`; fpsAcc = fpsN = 0; } }
}

// ---------------------------------------------------------------- input / ui
function lock() { if (COARSE) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
function start() {
  if (!window.ROOM.ready) return;
  audio.init();
  state = 'play'; $('menu').classList.add('hide'); $('hud').classList.add('on'); if (!start.once) { start.once = true; player.yaw = START.yaw; player.pitch = START.pitch; } lock(); canvas.focus();
}
function pause() { state = 'menu'; keys.clear(); stick.x = stick.y = 0; stick.id = -1; lookT.id = -1; $('stick').style.display = 'none'; $('menu').classList.remove('hide'); $('hud').classList.remove('on'); $('startBtn').firstElementChild.textContent = 'RESUME'; $('startSub').textContent = '戻る'; START.yaw = player.yaw; START.pitch = player.pitch; if (document.pointerLockElement) document.exitPointerLock(); }
$('startBtn').addEventListener('click', start);
$('qualBtn').addEventListener('click', () => { quality = { low: 'mid', mid: 'high', high: 'low' }[quality]; $('qualSub').textContent = QUAL[quality].jp; autoReset(); buildComposer(); });
$('qualSub').textContent = QUAL[quality].jp;
function setMirror(v) { mirror.on = !!v; uMirOn.value = v ? 1 : 0; for (const f of floors) f.material.envMapIntensity = v ? 0 : 1; $('mirSub').textContent = v ? '入' : '切'; }
$('mirBtn').addEventListener('click', () => setMirror(!mirror.on));
$('pauseBtn').addEventListener('click', pause);
// fps などの表示（F3 でも切り替わる）。歩いている間、左上に出る
function setFps(v) { DEBUG = !!v; if (!DEBUG) $('dbg').textContent = ''; $('fpsSub').textContent = DEBUG ? '入' : '切'; $('dbg').style.display = DEBUG ? 'block' : 'none'; }
$('fpsBtn').addEventListener('click', () => setFps(!DEBUG)); setFps(DEBUG);
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function toggleFs() {
  const el = document.documentElement;
  try { const p = fsOn() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (p && p.catch) p.catch(() => { $('fsSub').textContent = '使えません'; }); }
  catch (e) { $('fsSub').textContent = '使えません'; }
}
$('fsBtn').addEventListener('click', toggleFs);
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { $('fsSub').textContent = fsOn() ? '入' : '切'; });
$('sndBtn').addEventListener('click', () => { $('sndSub').textContent = audio.toggle() ? '入' : '切'; });
for (const k of ['bgm', 'se']) {
  const el = $(k + 'Vol'), out = $(k + 'Val'); let v = k === 'bgm' ? 15 : 60;
  try { const sv = localStorage.getItem('deckc07.vol.' + k); if (sv !== null && isFinite(+sv)) v = clamp(+sv, 0, 100); } catch (e) { }
  const set = (n, save) => { el.value = n; out.textContent = n + '%'; el.style.setProperty('--p', n + '%'); audio.volume(k, n / 100); if (save) try { localStorage.setItem('deckc07.vol.' + k, n); } catch (e) { } };
  set(v, false); el.addEventListener('input', () => set(+el.value, true));
}
$('actBtn').addEventListener('pointerdown', e => { e.stopPropagation(); interact(); });
document.addEventListener('pointerlockchange', () => { const l = document.pointerLockElement === canvas; if (l) hadLock = true; else if (hadLock && state === 'play') pause(); });
addEventListener('keydown', e => {
  if (e.code === 'F3') { setFps(!DEBUG); e.preventDefault(); return; }
  if (e.code === 'Escape') { state === 'play' ? pause() : 0; return; }
  if (state !== 'play') return; keys.add(e.code);
  if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) interact();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  if (e.pointerType === 'touch') {
    e.preventDefault();
    if (e.clientX < innerWidth * .45 && stick.id < 0) { stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; const s = $('stick'); s.style.display = 'block'; s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; s.firstChild.style.transform = ''; }
    else if (lookT.id < 0) { lookT.id = e.pointerId; lookT.x = e.clientX; lookT.y = e.clientY; }
  } else if (document.pointerLockElement === canvas) { if (e.button === 0) interact(); } else lock();
});
addEventListener('pointermove', e => {
  if (state !== 'play') return;
  if (e.pointerType === 'touch') {
    if (e.pointerId === stick.id) { let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy), mx = 52; if (l > mx) { dx *= mx / l; dy *= mx / l; } stick.x = dx / mx; stick.y = dy / mx; $('stick').firstChild.style.transform = `translate(${dx}px,${dy}px)`; }
    else if (e.pointerId === lookT.id) { look(e.clientX - lookT.x, e.clientY - lookT.y, .0048); lookT.x = e.clientX; lookT.y = e.clientY; }
  } else if (document.pointerLockElement === canvas || (e.buttons & 1)) look(e.movementX || 0, e.movementY || 0, .0022);
});
const endTouch = e => { if (e.pointerId === stick.id) { stick.id = -1; stick.x = stick.y = 0; $('stick').style.display = 'none'; } if (e.pointerId === lookT.id) lookT.id = -1; };
addEventListener('pointerup', endTouch); addEventListener('pointercancel', endTouch);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// 確認用の窓口
window.ROOM = {
  pose(x, z, yaw, pitch = 0) { player.seat = null; player.x = x; player.z = z; player.yaw = yaw; player.pitch = pitch; player.vx = player.vz = 0; state = 'play'; $('menu').classList.add('hide'); $('hud').classList.add('on'); },
  menu() { pause(); }, mirror(v) { setMirror(v); }, accent(i) { setAccent(i); uAcc.value.copy(accTarget); }, freeze(t) { frozen = t; if (t !== null) time = t; },
  // 確認用：起動からの経過秒を指定して、パッドの演出のその瞬間を出す（null で通常に戻す）
  pad(t) { if (t === null) { pad.force = false; pad.on = false; pad.a = 0; return; } pad.force = true; pad.on = true; pad.t = t; pad.a = 1; },
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) { time += dt; frame(dt); } },
  env() { captureEnv(); captureEnv(); }, ao(mode) { if (gtao) gtao.output = mode; return !!gtao; }, grain(v) { finalPass.uniforms.grain.value = v; }, exposure(v) { renderer.toneMappingExposure = v; },
  cfg(o) { cfgOver = o; autoReset(); buildComposer(); return { w: bufSize.x, h: bufSize.y, noAO: noAO.length }; },
  quality(q) { quality = q; autoReset(); buildComposer(); $('qualSub').textContent = QUAL[q].jp; },
  bench(n = 20) { const gl = renderer.getContext(), px = new Uint8Array(4); const t = performance.now(); for (let i = 0; i < n; i++) { renderer.info.reset(); renderMirror(); composer.render(.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t) / n).toFixed(1); },
  get guard() { return [BOX_OK, bloomGuard]; },
  get state() { return { x: player.x, z: player.z, yaw: player.yaw, state, seated: !!player.seat, door: +door.open.toFixed(2), shower: qr.shower, mode: qr.mode, pad: pad.on, padT: pad.t, accent, audio: audio.ready, prompt: $('prompt').textContent, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, buf: [bufSize.x, bufSize.y] }; },
  walk(tx, tz, n = 400) { for (let i = 0; i < n; i++) { const dx = tx - player.x, dz = tz - player.z, d = Math.hypot(dx, dz); if (d < .03) break; player.x += dx / d * .05; player.z += dz / d * .05; collide(player); } return [+player.x.toFixed(2), +player.z.toFixed(2)]; },
  shower(v) { setShower(!!v, true); }, mode(i) { setMode(i, true); }, door(v) { door.open = v ? 1 : 0; }, sit(i) { const s = qr.seats[i]; player.seat = s; player.x = s.x; player.z = s.z; player.eye = s.eye; player.yaw = s.yaw; player.pitch = s.pitch; state = 'play'; $('menu').classList.add('hide'); $('hud').classList.add('on'); },
  get dev() { return { scene, renderer, composer, bloom, mirror, pad, ped, M, MB, qr, door, floors, THREE, hemi, mainLight, auto, audio }; },
  ready: false
};
build().then(() => { window.ROOM.ready = true; $('bar').style.width = '0'; $('startBtn').classList.remove('wait'); $('startSub').textContent = '入室する'; }).catch(e => { console.error(e); $('startSub').textContent = '起動に失敗しました'; });
