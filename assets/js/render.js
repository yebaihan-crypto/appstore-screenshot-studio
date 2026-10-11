/* render.js — 统一渲染管线：预览与导出共用同一函数，保证所见即所得 */
(function () {
  const WB = window.WB;

  const SHADOW_RGB = '12,20,28';

  /* 主色（强调色）：未指定时由背景色推导 */
  WB.resolveAccent = function (st) {
    if (st.text && st.text.underlineColor) return st.text.underlineColor;
    if (st.palette && st.palette.vivid && st.accentFromImage) return st.palette.vivid;
    const bg = st.background;
    return WB.vivid(bg.c1 || '#e6f7ec');
  };

  function pt(st, v) { return v * (st.canvas.w / 430); }

  /* ---------------- 背景 ---------------- */
  function drawBackground(ctx, st, W, H) {
    const bg = st.background;
    ctx.save();
    if (bg.type === 'transparent') { ctx.restore(); return; }

    if (bg.type === 'solid') {
      ctx.fillStyle = bg.c1;
      ctx.fillRect(0, 0, W, H);
    } else if (bg.type === 'image' && bg.image) {
      const img = WB.imageSync(bg.image);
      if (img) {
        ctx.fillStyle = bg.c2 || '#ffffff';
        ctx.fillRect(0, 0, W, H);
        if (bg.imageBlur) ctx.filter = 'blur(' + bg.imageBlur + 'px)';
        WB.drawImageFit(ctx, img, 0, 0, img.naturalWidth, img.naturalHeight, -4, -4, W + 8, H + 8, 'cover', 1);
        ctx.filter = 'none';
        if (bg.scrim) {
          ctx.fillStyle = 'rgba(8,12,18,' + bg.scrim + ')';
          ctx.fillRect(0, 0, W, H);
        }
      } else {
        ctx.fillStyle = bg.c1 || '#eef1f5';
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      // 线性渐变
      const a = WB.deg(bg.angle || 180);
      const dx = Math.sin(a), dy = -Math.cos(a);
      const cx = W / 2, cy = H / 2;
      const len = Math.abs(W * dx) + Math.abs(H * dy);
      const g = ctx.createLinearGradient(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2);
      g.addColorStop(0, bg.c1);
      g.addColorStop(1, bg.c2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      if (bg.mesh) {
        const blobs = [
          { x: 0.12, y: 0.08, r: 0.85, c: bg.c3 || bg.c1, a: 0.9 },
          { x: 0.92, y: 0.30, r: 0.75, c: bg.c1, a: 0.85 },
          { x: 0.78, y: 0.62, r: 0.8, c: bg.c3 || bg.c2, a: 0.6 },
          { x: 0.18, y: 0.95, r: 0.9, c: bg.c2, a: 0.9 },
        ];
        blobs.forEach((b) => {
          const rg = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * W);
          rg.addColorStop(0, WB.rgba(b.c, b.a));
          rg.addColorStop(1, WB.rgba(b.c, 0));
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, W, H);
        });
      }
    }
    ctx.restore();
  }

  /* ---------------- 设备 ---------------- */
  function drawDevice(ctx, st, d, img, W) {
    if (!img) return;
    const h = d.w * (img.naturalHeight / img.naturalWidth);
    const dev = st.device;
    const style = d.style || dev.style;
    const radius = d.radius == null ? pt(st, dev.radius) : d.radius;
    const bez = d.bezel == null ? pt(st, dev.bezel) : d.bezel;
    const alpha = dev.shadow, blur = d.shadowBlur != null ? pt(st, dev.shadowBlur) : pt(st, dev.shadowBlur || 60);
    const oy = d.shadowY != null ? pt(st, d.shadowY) : pt(st, dev.shadowY || 24);

    ctx.save();
    ctx.translate(d.cx, d.cy);
    ctx.rotate(WB.deg(d.rotate || 0));
    const x = -d.w / 2, y = -h / 2;

    // 白色托板
    if (d.card) {
      const cp = d.card.pad;
      ctx.save();
      ctx.shadowColor = `rgba(${SHADOW_RGB},${d.card.shadow})`;
      ctx.shadowBlur = pt(st, 46);
      ctx.shadowOffsetY = d.card.shadowY;
      WB.roundRectPath(ctx, x - cp, y - cp, d.w + cp * 2, h + cp * 2, d.card.radius);
      ctx.fillStyle = d.card.color || '#fff';
      ctx.fill();
      ctx.restore();
    }

    if (style === 'none') {
      if (alpha > 0) {
        ctx.save();
        ctx.shadowColor = `rgba(${SHADOW_RGB},${alpha * 0.8})`;
        ctx.shadowBlur = blur; ctx.shadowOffsetY = oy;
        ctx.fillStyle = '#fff';
        WB.roundRectPath(ctx, x, y, d.w, h, radius);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      WB.roundRectPath(ctx, x, y, d.w, h, radius);
      ctx.clip();
      ctx.drawImage(img, x, y, d.w, h);
      ctx.restore();
    } else {
      // 带投影的底色块（机身 / 圆角卡片）
      ctx.save();
      ctx.shadowColor = `rgba(${SHADOW_RGB},${alpha})`;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = oy;
      WB.roundRectPath(ctx, x - bez, y - bez, d.w + bez * 2, h + bez * 2, radius + bez);
      ctx.fillStyle = style === 'flat' ? (dev.bezelColor === '#f6fbf8' ? '#ffffff' : dev.bezelColor) : dev.bezelColor;
      ctx.fill();
      ctx.restore();

      if (style === 'device') {
        // 机身内沿渐变，模拟金属高光
        ctx.save();
        WB.roundRectPath(ctx, x - bez, y - bez, d.w + bez * 2, h + bez * 2, radius + bez);
        ctx.clip();
        const g = ctx.createLinearGradient(x - bez, y - bez, x + d.w + bez, y + h + bez);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.45, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(20,30,40,0.06)');
        ctx.fillStyle = g;
        ctx.fillRect(x - bez, y - bez, d.w + bez * 2, h + bez * 2);
        ctx.restore();
        ctx.save();
        WB.roundRectPath(ctx, x - bez, y - bez, d.w + bez * 2, h + bez * 2, radius + bez);
        ctx.lineWidth = Math.max(0.5, pt(st, 0.8));
        ctx.strokeStyle = 'rgba(15,25,35,0.10)';
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      WB.roundRectPath(ctx, x, y, d.w, h, radius);
      ctx.clip();
      ctx.drawImage(img, x, y, d.w, h);
      ctx.restore();

      if (dev.borderW > 0 && style === 'flat') {
        ctx.save();
        WB.roundRectPath(ctx, x, y, d.w, h, radius);
        ctx.lineWidth = pt(st, dev.borderW);
        ctx.strokeStyle = dev.borderColor;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------------- 放大框 ---------------- */
  function drawCallout(ctx, st, c, W, H) {
    if (!c.enabled) return;
    const meta = st.images[c.target === 'alt' ? 'alt' : 'main'] || st.images.main;
    const img = meta ? WB.imageSync(meta.src) : null;
    if (!img) return;
    const X = c.dest.x * W, Y = c.dest.y * H, DW = c.dest.w * W, DH = c.dest.h * H;
    if (DW <= 1 || DH <= 1) return;
    const accent = WB.resolveAccent(st);
    const bc = c.dest.borderColor || accent;
    const r = c.dest.radius, pad = c.dest.pad, bw = c.dest.borderW;

    const sx = c.src.x * img.naturalWidth, sy = c.src.y * img.naturalHeight;
    const sw = c.src.w * img.naturalWidth, sh = c.src.h * img.naturalHeight;

    ctx.save();
    ctx.translate(X + DW / 2, Y + DH / 2);
    ctx.rotate(WB.deg(c.dest.rotate || 0));
    const x = -DW / 2, y = -DH / 2;

    // 外框 + 投影
    ctx.save();
    ctx.shadowColor = `rgba(${SHADOW_RGB},${c.dest.shadow})`;
    ctx.shadowBlur = pt(st, c.dest.shadowBlur);
    ctx.shadowOffsetY = pt(st, c.dest.shadowY);
    WB.roundRectPath(ctx, x, y, DW, DH, r);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // 内部放大内容
    ctx.save();
    WB.roundRectPath(ctx, x + pad, y + pad, DW - pad * 2, DH - pad * 2, Math.max(2, r - pad * 0.7));
    ctx.clip();
    WB.drawImageFit(ctx, img, sx, sy, sw, sh, x + pad, y + pad, DW - pad * 2, DH - pad * 2, c.dest.mode || 'cover', c.dest.zoom || 1);
    ctx.restore();

    // 边框
    if (bw > 0) {
      ctx.save();
      WB.roundRectPath(ctx, x + bw / 2, y + bw / 2, DW - bw, DH - bw, Math.max(1, r - bw / 2));
      ctx.lineWidth = bw;
      ctx.strokeStyle = bc;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------- 标注（气泡 + 引线） ---------------- */
  function noteLayout(ctx, st, n, W, H) {
    const size = n.size * (W / 430);
    WB.setFont(ctx, size, n.weight || 800, st.text.font);
    const tw = WB.measure(ctx, String(n.text || ''));
    const bw = tw + size * 1.1;
    const bh = size * 1.66;
    return { size, bw, bh, cx: n.x * W, cy: n.y * H };
  }
  WB.noteLayout = noteLayout;

  function drawNote(ctx, st, n, W, H) {
    const L = noteLayout(ctx, st, n, W, H);
    const accent = WB.resolveAccent(st);
    const col = n.color || '#ffffff';
    const x = L.cx, y = L.cy;
    ctx.save();
    if (n.arrow) {
      ctx.save();
      ctx.strokeStyle = n.arrowColor || accent;
      ctx.fillStyle = n.arrowColor || accent;
      ctx.lineWidth = Math.max(1.5, L.size * 0.13);
      ctx.lineCap = 'round';
      const tx = n.tx * W, ty = n.ty * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(2.5, L.size * 0.26), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.translate(x, y);
    ctx.rotate(WB.deg(n.rotate || 0));
    const x0 = -L.bw / 2, y0 = -L.bh / 2;
    const fill = n.pill ? (n.pillColor || accent) : 'rgba(0,0,0,0)';
    if (n.pill) {
      ctx.save();
      ctx.shadowColor = `rgba(${SHADOW_RGB},0.22)`;
      ctx.shadowBlur = pt(st, 22);
      ctx.shadowOffsetY = pt(st, 6);
      WB.roundRectPath(ctx, x0, y0, L.bw, L.bh, L.bh / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }
    if (n.stroke) {
      WB.roundRectPath(ctx, x0, y0, L.bw, L.bh, L.bh / 2);
      ctx.lineWidth = Math.max(1, pt(st, 2));
      ctx.strokeStyle = n.strokeColor || col;
      ctx.stroke();
    }
    WB.setFont(ctx, L.size, n.weight || 800, st.text.font);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(String(n.text || ''), 0, L.size * 0.05);
    ctx.restore();
  }

  /* ---------------- 贴纸 ---------------- */  function drawSticker(ctx, st, s, W, H) {
    const size = s.size * (W / 430);
    ctx.save();
    ctx.translate(s.x * W, s.y * H);
    ctx.rotate(WB.deg(s.rotate || 0));
    ctx.globalAlpha = s.opacity == null ? 1 : s.opacity;
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.emoji, 0, 0);
    ctx.restore();
  }

  /* ---------------- 文本 ---------------- */
  function drawTexts(ctx, st, scene, W, H) {
    const ts = st.text;
    const accent = WB.resolveAccent(st);
    const t = scene.text;
    ctx.save();
    ctx.textAlign = 'left';

    if (t.title.show) {
      WB.setFont(ctx, t.title.size, t.title.weight, ts.font);
      ctx.fillStyle = ts.titleColor;
      ctx.textBaseline = 'top';
      let y = t.title.y;
      for (const line of t.title.lines) {
        const lw = WB.measure(ctx, line);
        const x = t.title.align === 'center' ? t.title.x - lw / 2 : t.title.align === 'right' ? t.title.x - lw : t.title.x;
        WB.drawLine(ctx, line, x, y, ts.titleSpacing || 0, 'left');
        y += t.title.lh;
      }
    }

    if (t.subtitle.show) {
      WB.setFont(ctx, t.subtitle.size, ts.subtitleWeight, ts.font);
      ctx.fillStyle = ts.subtitleColor;
      ctx.textBaseline = 'top';
      let txt = String(ts.subtitle).replace(/\s+/g, ' ').trim();
      if (ts.subtitleUpper !== false) txt = txt.toUpperCase();
      const sp = ts.subtitleSpacing || 0;
      const lw = WB.lineWidth(ctx, txt, sp);
      const x = t.subtitle.align === 'center' ? t.subtitle.x - lw / 2 : t.subtitle.align === 'right' ? t.subtitle.x - lw : t.subtitle.x;
      WB.drawLine(ctx, txt, x, t.subtitle.y, sp, 'left');
      if (ts.underline) {
        ctx.save();
        ctx.fillStyle = ts.underlineColorAuto === false ? ts.underlineColor : (ts.underlineColor || accent);
        const th = Math.max(1, ts.underlineW * (W / 430));
        const uy = t.subtitle.y + t.subtitle.size * 1.22;
        ctx.fillRect(x, uy, lw, th);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------------- 文案位置重排（朝上 / 朝下） ---------------- */
  /* 模板各自把文字放在上或下；这里允许整体翻转，并让设备顺势让位。
     文字块整体平移，设备保持彼此的错落关系、整体平移到另一侧的空白带。 */
  WB.reflowTextPos = function (st, scene, W, H) {
    const pos = st.text.pos || 'auto';
    if (pos !== 'top' && pos !== 'bottom') return;
    const t = scene.text;
    if (!t || !t.height) return;
    if (t.anchor === pos) return;              // 模板本来就在这一侧

    const PAD_TOP = H * 0.072, PAD_BOT = H * 0.055;
    const tweak = st.layout.textY || 0;
    const newTop = pos === 'top'
      ? PAD_TOP + tweak
      : H - PAD_BOT - t.height + tweak;
    const dy = newTop - t.blockTop;

    t.title.y += dy;
    t.subtitle.y += dy;
    t.blockTop = newTop;
    t.blockBottom = newTop + t.height;
    t.anchor = pos;

    // 底部蒙层跟着文字走
    if (scene.scrim) scene.scrim = pos;

    // 设备让位到另一侧的可用区间
    const devs = scene.devices || [];
    if (!devs.length) return;
    const gap = H * 0.045;
    const zoneTop = pos === 'top' ? t.blockBottom + gap : H * 0.055;
    const zoneBot = pos === 'top' ? H * 0.965 : t.blockTop - gap;
    if (zoneBot <= zoneTop) return;
    const zoneH = zoneBot - zoneTop;
    const box = (arr) => {
      const top = Math.min.apply(null, arr.map((d) => d.cy - d.h / 2));
      const bot = Math.max.apply(null, arr.map((d) => d.cy + d.h / 2));
      const l = Math.min.apply(null, arr.map((d) => d.cx - d.w / 2));
      const r = Math.max.apply(null, arr.map((d) => d.cx + d.w / 2));
      return { top, bot, midX: (l + r) / 2, midY: (top + bot) / 2, h: bot - top };
    };

    // 1) 放不下就整体等比收缩（与模板「设备完整可见」的规则保持一致）
    let b = box(devs);
    if (b.h > zoneH) {
      const k = zoneH / b.h;
      devs.forEach((d) => {
        d.w *= k; d.h *= k;
        d.cx = b.midX + (d.cx - b.midX) * k;
        d.cy = b.midY + (d.cy - b.midY) * k;
      });
      b = box(devs);
    }
    // 2) 整体垂直居中到可用区（保留双机等模板的错落关系）
    const dyDev = (zoneTop + zoneH / 2) - b.midY;
    devs.forEach((d) => { d.cy += dyDev; });
  };

  /* ---------------- 计算场景 ---------------- */
  WB.computeScene = function (ctx, st) {
    const W = st.canvas.w, H = st.canvas.h;
    const main = st.images.main, alt = st.images.alt;
    const asp = main ? main.h / main.w : 932 / 430;
    const asp2 = alt ? alt.h / alt.w : asp;
    const tpl = WB.getTemplate(st.template);
    const base = tpl.layout(ctx, st, W, H, asp, asp2);
    const o = st.layout;
    const devices = base.devices.map((d) => {
      const key = d.role === 'alt' ? 'alt' : 'main';
      const meta = st.images[key] || st.images.main;
      const a = meta ? meta.h / meta.w : asp;
      const w = d.w * o.deviceScale;
      return { ...d, w, h: w * a, cx: d.cx + o.deviceX, cy: d.cy + o.deviceY };
    });
    const scene = { W, H, devices, text: base.text, scrim: base.scrim, calloutDefault: base.calloutDefault, tpl };
    WB.reflowTextPos(st, scene, W, H);
    return scene;
  };

  /* ---------------- 总渲染 ---------------- */
  WB.renderScene = function (ctx, st, scale, opts) {
    opts = opts || {};
    const W = st.canvas.w, H = st.canvas.h;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.textAlign = 'left';

    const scene = WB.computeScene(ctx, st);

    drawBackground(ctx, st, W, H);

    scene.devices.forEach((d) => {
      const key = d.role === 'alt' ? 'alt' : 'main';
      const meta = st.images[key];
      const img = meta ? WB.imageSync(meta.src) : null;
      if (!img && key === 'alt') {
        // 副图缺失时回退到主图
        const m2 = st.images.main;
        if (m2) drawDevice(ctx, st, d, WB.imageSync(m2.src), W);
        return;
      }
      drawDevice(ctx, st, d, img, W);
    });

    if (scene.scrim) {
      const up = scene.scrim === 'top';
      const g = up
        ? ctx.createLinearGradient(0, H * 0.65, 0, 0)
        : ctx.createLinearGradient(0, H * 0.35, 0, H);
      g.addColorStop(0, 'rgba(6,10,16,0)');
      g.addColorStop(1, 'rgba(6,10,16,0.68)');
      ctx.fillStyle = g;
      ctx.fillRect(0, up ? 0 : H * 0.35, W, H * 0.65);
    }

    (st.callouts || []).forEach((c) => drawCallout(ctx, st, c, W, H));
    (st.notes || []).forEach((n) => drawNote(ctx, st, n, W, H));
    (st.stickers || []).forEach((s) => drawSticker(ctx, st, s, W, H));
    drawTexts(ctx, st, scene, W, H);

    ctx.restore();
    return scene;
  };

  /* ---------------- 导出 ---------------- */
  WB.renderToCanvas = function (st, scale) {
    const W = st.canvas.w, H = st.canvas.h;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(W * scale));
    cv.height = Math.max(1, Math.round(H * scale));
    const ctx = cv.getContext('2d');
    WB.renderScene(ctx, st, scale, { export: true });
    return cv;
  };

  WB.exportBlob = function (st, scale, format, quality) {
    const cv = WB.renderToCanvas(st, scale);
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    return new Promise((res) => {
      if (cv.toBlob) cv.toBlob((b) => res(b), mime, quality);
      else {
        const data = cv.toDataURL(mime, quality);
        res(dataURLtoBlob(data));
      }
    });
  };

  function dataURLtoBlob(dataURL) {
    const [head, body] = dataURL.split(',');
    const mime = head.match(/:(.*?);/)[1];
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* 供面板复用（放大框预览缩略图） */
  WB.drawCallout = drawCallout;
  WB.drawSticker = drawSticker;

  /* 画布规格切换时按比例缩放所有 pt 尺寸 */
  WB.rescaleDesign = function (st, ratio) {
    const r = ratio;
    if (Math.abs(r - 1) < 0.001) return;
    const d = st.device;
    d.radius *= r; d.bezel *= r; d.shadowY *= r; d.shadowBlur *= r; d.borderW *= r;
    st.layout.deviceX *= r; st.layout.deviceY *= r; st.layout.textY *= r;
    const ts = st.text;
    ts.titleSize *= r; ts.subtitleSize *= r; ts.underlineW *= r; ts.subtitleSpacing *= r;
    st.callouts.forEach((c) => {
      c.dest.radius *= r; c.dest.pad *= r; c.dest.borderW *= r;
      c.dest.shadowY *= r; c.dest.shadowBlur *= r;
    });
    st.stickers.forEach((s) => { s.size *= r; });
    (st.notes || []).forEach((n) => { n.size *= r; });
  };
})();
