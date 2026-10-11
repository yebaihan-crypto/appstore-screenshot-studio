/* util.js — 基础工具：DOM / 颜色 / 图像 / 画布绘制辅助 */
(function () {
  const WB = (window.WB = window.WB || {});

  /* ---------- 基础 ---------- */
  WB.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  WB.uid = () => Math.random().toString(36).slice(2, 9);
  WB.lerp = (a, b, t) => a + (b - a) * t;
  WB.deg = (d) => (d * Math.PI) / 180;
  WB.deepClone = (o) => JSON.parse(JSON.stringify(o));
  WB.round2 = (v) => Math.round(v * 100) / 100;

  WB.$ = (s, r) => (r || document).querySelector(s);
  WB.$$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  WB.el = function (tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' && 'value' in n) n.value = v;
        else n.setAttribute(k, v);
      }
    }
    if (kids != null) {
      (Array.isArray(kids) ? kids : [kids]).forEach((c) => {
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return n;
  };

  /* ---------- 深路径读写 ---------- */
  WB.getPath = function (obj, path) {
    return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  };
  WB.setPath = function (obj, path, val) {
    const ks = String(path).split('.');
    const last = ks.pop();
    const t = ks.reduce((o, k) => (o[k] = o[k] || {}), obj);
    t[last] = val;
  };

  /* ---------- 颜色 ---------- */
  function hexToRgb(hex) {
    let h = String(hex || '#000').replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(c) {
    return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  WB.hexToRgb = hexToRgb;
  WB.rgbToHex = rgbToHex;
  WB.mix = function (a, b, t) {
    const A = Array.isArray(a) ? a : hexToRgb(a);
    const B = Array.isArray(b) ? b : hexToRgb(b);
    return rgbToHex([WB.lerp(A[0], B[0], t), WB.lerp(A[1], B[1], t), WB.lerp(A[2], B[2], t)]);
  };
  WB.lighten = (hex, t) => WB.mix(hex, '#ffffff', t);
  WB.darken = (hex, t) => WB.mix(hex, '#000000', t);
  WB.rgba = function (hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  };
  WB.luminance = function (hex) {
    const c = hexToRgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  WB.isLight = (hex) => WB.luminance(hex) > 0.55;
  WB.saturation = function (hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  WB.onColor = (hex) => (WB.isLight(hex) ? '#14171c' : '#ffffff');

  /* 由某个颜色推出一条「鲜亮同色系」的强调色（用于描边 / 下划线） */
  function rgbToHsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgbToHex(rgb.map((v) => (v + m) * 255));
  }
  WB.vivid = function (hex) {
    const hsl = rgbToHsl(hexToRgb(hex));
    if (hsl.s < 0.08) return hsl.l > 0.5 ? '#14181f' : '#ffffff';
    const dark = hsl.l < 0.34;
    return hslToHex(hsl.h, WB.clamp(hsl.s * 1.1 + 0.18, 0.34, 0.82), dark ? 0.64 : 0.42);
  };

  /* ---------- 图像 ---------- */
  const imgCache = new Map();
  WB.loadImage = function (src) {
    if (!src) return Promise.resolve(null);
    if (imgCache.has(src)) {
      const im = imgCache.get(src);
      if (im.complete && im.naturalWidth) return Promise.resolve(im);
    }
    return new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => { imgCache.set(src, im); res(im); };
      im.onerror = () => res(null);
      im.src = src;
    });
  };
  WB.imageSync = (src) => {
    const im = src && imgCache.get(src);
    return im && im.complete && im.naturalWidth ? im : null;
  };

  WB.fileToDataURL = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  WB.downloadBlob = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = WB.el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  };

  /* ---------- 画布辅助 ---------- */
  WB.roundRectPath = function (ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  };

  /* 按 cover / contain / stretch 绘制图像子区域 */
  WB.drawImageFit = function (ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, mode, zoom) {
    zoom = zoom || 1;
    if (zoom !== 1 && zoom > 0) {
      const nw = sw / zoom, nh = sh / zoom;
      sx += (sw - nw) / 2; sy += (sh - nh) / 2; sw = nw; sh = nh;
    }
    if (mode === 'stretch') { ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    const s = mode === 'contain' ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
    const cw = sw * s, ch = sh * s;
    ctx.drawImage(img, sx, sy, sw, sh, dx + (dw - cw) / 2, dy + (dh - ch) / 2, cw, ch);
  };

  /* ---------- 文本换行（中英混排） ---------- */
  const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
  WB.tokenize = function (s) {
    const out = [];
    let buf = '';
    for (const ch of String(s)) {
      if (CJK.test(ch) || ch === ' ') {
        if (buf) { out.push(buf); buf = ''; }
        out.push(ch);
      } else {
        buf += ch;
      }
    }
    if (buf) out.push(buf);
    return out;
  };
  WB.measure = function (ctx, s) { return ctx.measureText(s).width; };
  WB.wrapText = function (ctx, text, maxW) {
    const lines = [];
    String(text == null ? '' : text).split('\n').forEach((para) => {
      if (!para) { lines.push(''); return; }
      const tokens = WB.tokenize(para);
      let line = '';
      for (const t of tokens) {
        const test = line + t;
        if (line && WB.measure(ctx, test) > maxW) {
          lines.push(line.replace(/\s+$/, ''));
          line = t === ' ' ? '' : t;
        } else {
          line = test;
        }
      }
      lines.push(line.replace(/\s+$/, ''));
    });
    return lines.length ? lines : [''];
  };

  /* 带字距的整行绘制；不支持 ctx.letterSpacing 时逐字绘制 */
  const hasLetterSpacing = (() => {
    const c = document.createElement('canvas').getContext('2d');
    return 'letterSpacing' in c;
  })();
  WB.lineWidth = function (ctx, s, spacing) {
    if (!spacing || hasLetterSpacing) return ctx.measureText(s).width;
    let w = 0;
    for (const ch of s) w += ctx.measureText(ch).width + spacing;
    return Math.max(0, w - spacing);
  };
  WB.drawLine = function (ctx, s, x, y, spacing, align) {
    if (!spacing || hasLetterSpacing) {
      ctx.letterSpacing = (spacing || 0) + 'px';
      ctx.fillText(s, x, y);
      if (hasLetterSpacing) ctx.letterSpacing = '0px';
      return;
    }
    let total = 0;
    const ws = [];
    for (const ch of s) { const w = ctx.measureText(ch).width; ws.push(w); total += w + spacing; }
    total -= spacing;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (let i = 0; i < s.length; i++) { ctx.fillText(s[i], cx, y); cx += ws[i] + spacing; }
  };

  /* ---------- 从截图提取主色 ---------- */
  WB.dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  WB.extractPalette = function (img) {
    const n = 80;
    const cv = document.createElement('canvas');
    cv.width = n; cv.height = n;
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, n, n);
    let data;
    try { data = x.getImageData(0, 0, n, n).data; } catch (e) { return null; }
    const map = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = map.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      map.set(key, e);
    }
    const arr = Array.from(map.values())
      .map((e) => ({ n: e.n, c: [e.r / e.n, e.g / e.n, e.b / e.n] }))
      .sort((a, b) => b.n - a.n);
    const picked = [];
    for (const e of arr) {
      if (picked.length >= 6) break;
      if (picked.some((p) => WB.dist(p.c, e.c) < 55)) continue;
      picked.push(e);
    }
    const hexes = picked.map((p) => rgbToHex(p.c));
    let vivid = null, best = -1;
    hexes.forEach((h) => {
      const l = WB.luminance(h), s = WB.saturation(h);
      if (l > 0.9 || l < 0.06) return;
      const score = s * (1 - Math.abs(l - 0.5));
      if (score > best) { best = score; vivid = h; }
    });
    return { colors: hexes, vivid: vivid || hexes[1] || '#3f6ad8', dominant: hexes[0] || '#3f6ad8' };
  };

  /* ---------- 提示 ---------- */
  WB.toast = function (msg, kind) {
    const box = WB.$('#toasts');
    if (!box) return;
    const t = WB.el('div', { class: 'toast' + (kind ? ' is-' + kind : ''), text: msg });
    box.appendChild(t);
    setTimeout(() => { t.classList.add('in'); }, 10);
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 260);
    }, kind === 'error' ? 4200 : 2400);
  };
})();
