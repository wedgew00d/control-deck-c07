// CONTROL DECK C-07 — 音（Web Audio の合成。音声ファイルなし）
export function createAudio() {
  const vol = { bgm: .15, se: .6 };
  let ctx = null, master, mus, se, noise, on = true, timer = 0, nextBell = 0;
  const env = (g, t, a, d, peak) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function tone(type, f, t, a, d, peak, dest, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d * .6);
    env(g, t, a, d, peak); o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + .05); return o;
  }
  function burst(t, dur, freq, q, peak, dest, f2) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; s.loop = true;
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); f.Q.value = q;
    env(g, t, dur * .15, dur * .85, peak); s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
  }
  const api = {
    get ready() { return !!ctx; }, get on() { return on; }, get vol() { return vol; },
    init() {
      if (ctx) { if (ctx.state === 'suspended' && on) ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      master.gain.linearRampToValueAtTime(on ? 1 : 0, ctx.currentTime + 2);
      mus = ctx.createGain(); mus.gain.value = vol.bgm; mus.connect(master);
      se = ctx.createGain(); se.gain.value = vol.se; se.connect(master);
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = nb;
      // 低い持続音：鋸波2つと正弦波を、ゆっくり開閉するローパスに通す
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = .7;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .05; lg.gain.value = 110; lfo.connect(lg).connect(lp.frequency); lfo.start();
      const dg = ctx.createGain(); dg.gain.value = .5; lp.connect(dg).connect(mus);
      for (const [type, f, g] of [['sawtooth', 55, .22], ['sawtooth', 82.6, .14], ['sine', 110.3, .3], ['sine', 164.6, .12]]) { const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = type; o.frequency.value = f; gg.gain.value = g; o.connect(gg).connect(lp); o.start(); }
      // 空調のような薄いノイズ
      const air = ctx.createBufferSource(), af = ctx.createBiquadFilter(), ag = ctx.createGain(); air.buffer = noise; air.loop = true; af.type = 'lowpass'; af.frequency.value = 420; ag.gain.value = .05; air.connect(af).connect(ag).connect(mus); air.start();
      // 残響の代わりの短い遅延
      const dl = ctx.createDelay(1), fb = ctx.createGain(), dw = ctx.createGain(); dl.delayTime.value = .37; fb.gain.value = .42; dw.gain.value = .5; dl.connect(fb).connect(dl); dl.connect(dw).connect(mus); api._bell = dl;
      nextBell = ctx.currentTime + 4;
      timer = setInterval(() => {
        if (!ctx || ctx.state !== 'running') return; const now = ctx.currentTime;
        if (now > nextBell) { const fs = [440, 523.25, 659.25, 783.99, 987.77], f = fs[Math.floor(Math.random() * fs.length)] * (Math.random() < .3 ? .5 : 1); tone('sine', f, now + .05, .4, 3.2, .09, api._bell); tone('sine', f, now + .05, .4, 3.2, .06, mus); nextBell = now + 6 + Math.random() * 9; }
      }, 300);
      document.addEventListener('visibilitychange', () => { if (!ctx) return; document.hidden ? ctx.suspend() : (on && ctx.resume()); });
    },
    volume(kind, v) { vol[kind] = v; if (!ctx) return; (kind === 'bgm' ? mus : se).gain.setTargetAtTime(v, ctx.currentTime, .05); },
    toggle() { on = !on; if (ctx) { if (on) ctx.resume(); master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .12); } return on; },
    step() { if (!ctx || !on) return; const t = ctx.currentTime; burst(t, .07, 700 + Math.random() * 300, 1.2, .16, se); tone('sine', 95, t, .004, .07, .12, se, 60); },
    click() { if (!ctx || !on) return; const t = ctx.currentTime; tone('square', 1320, t, .003, .05, .05, se); tone('square', 1980, t + .06, .003, .07, .04, se); },
    activate() {
      if (!ctx || !on) return; const t = ctx.currentTime;
      burst(t, .5, 300, .8, .34, se, 5200);                         // 立ち上がる風切り
      tone('sawtooth', 90, t, .02, .4, .1, se, 720);
      tone('sine', 1318.5, t + .3, .01, 1.6, .16, se); tone('sine', 1975.5, t + .36, .01, 1.9, .1, se); tone('sine', 2637, t + .42, .01, 1.4, .05, se);
      tone('sine', 52, t + .05, .03, .7, .3, se, 38);
    },
    deactivate() { if (!ctx || !on) return; const t = ctx.currentTime; tone('sine', 880, t, .01, .5, .08, se, 330); burst(t, .3, 2400, .9, .1, se, 400); },
    // 引き戸：空気の抜ける音と、低い当たり
    door(open) { if (!ctx || !on) return; const t = ctx.currentTime; burst(t, .45, open ? 900 : 2600, .7, .2, se, open ? 2600 : 700); tone('sine', open ? 70 : 58, t + (open ? 0 : .3), .01, .25, .22, se, 44); },
    cloth() { if (!ctx || !on) return; const t = ctx.currentTime; burst(t, .22, 420, .6, .16, se, 260); },
    // シャワー：帯域を分けたノイズを、ゆっくり出し入れする
    shower(v) {
      if (!ctx) return;
      if (!api._sh) { const g = ctx.createGain(); g.gain.value = 0; g.connect(se); for (const [f, q, gn] of [[5200, .6, .5], [2100, .8, .32], [700, .7, .16]]) { const s = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), gg = ctx.createGain(); s.buffer = noise; s.loop = true; bf.type = 'bandpass'; bf.frequency.value = f; bf.Q.value = q; gg.gain.value = gn; s.connect(bf).connect(gg).connect(g); s.start(0, Math.random()); } api._sh = g; }
      api._sh.gain.setTargetAtTime(v ? .2 : 0, ctx.currentTime, v ? .25 : .5);
    },
    // ブリーフィング：文字送りの粒、図の切り替え、開く、決定
    uiTick(k) { if (!ctx || !on) return; const t = ctx.currentTime; tone('square', k ? 1760 : 2400 + Math.random() * 500, t, .001, k ? .05 : .018, k ? .035 : .012, se); },
    uiSlide() { if (!ctx || !on) return; const t = ctx.currentTime; burst(t, .22, 1800, .8, .1, se, 5200); tone('sine', 660, t + .12, .005, .35, .05, se); },
    uiOpen() { if (!ctx || !on) return; const t = ctx.currentTime; burst(t, .5, 500, .7, .12, se, 3600); tone('sine', 220, t, .02, .6, .1, se, 440); tone('sine', 1320, t + .35, .01, .8, .05, se); },
    uiSelect() { if (!ctx || !on) return; const t = ctx.currentTime; tone('square', 990, t, .003, .06, .05, se); tone('square', 1485, t + .07, .003, .12, .05, se); },
    listener() { },
  };
  return api;
}
