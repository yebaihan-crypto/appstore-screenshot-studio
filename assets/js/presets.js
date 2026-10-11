/* presets.js — 画布尺寸 / 模板排版 / 背景配色 / 导出规格 / 默认状态 */
(function () {
  const WB = (window.WB = window.WB || {});
  const { clamp } = WB;

  /* ============ 画布规格（预览与导出的设计坐标系，单位 pt） ============ */
  WB.CANVAS_PRESETS = [
    { id: 'p67', name: '手机 6.7" · 1290×2796', w: 430, h: 932 },
    { id: 'p65', name: '手机 6.5" · 1242×2688', w: 414, h: 896 },
    { id: 'p69', name: '手机 6.9" · 1320×2868', w: 440, h: 956 },
    { id: 'p916', name: '手机 9:16 · 1080×1920', w: 450, h: 800 },
    { id: 'ipad129', name: 'iPad 12.9" · 2048×2732', w: 1024, h: 1366 },
    { id: 'ipad13', name: 'iPad 13" · 2064×2752', w: 1032, h: 1376 },
    { id: 's34', name: '竖版 3:4 · 1080×1440', w: 540, h: 720 },
    { id: 'sq', name: '方形 · 1080×1080', w: 540, h: 540 },
    { id: 'wide', name: '横版 16:9 · 1920×1080', w: 960, h: 540 },
  ];

  /* ============ 导出规格（scale = 目标像素宽 / 设计宽） ============ */
  WB.EXPORT_PRESETS = [
    { id: 'appstore67', name: 'App Store 6.7" 竖屏', pxW: 1290, pxH: 2796, canvas: 'p67' },
    { id: 'appstore65', name: 'App Store 6.5" 竖屏', pxW: 1242, pxH: 2688, canvas: 'p65' },
    { id: 'appstore69', name: 'App Store 6.9" 竖屏', pxW: 1320, pxH: 2868, canvas: 'p69' },
    { id: 'ipad129', name: 'App Store iPad 12.9"', pxW: 2048, pxH: 2732, canvas: 'ipad129' },
    { id: 'ipad13', name: 'App Store iPad 13"', pxW: 2064, pxH: 2752, canvas: 'ipad13' },
    { id: 'social1080', name: '通用 1080 宽', pxW: 1080 },
    { id: 'social1440', name: '通用 1440 宽', pxW: 1440 },
    { id: 'hd', name: 'HD · 2 倍', pxMul: 2 },
    { id: 'uhd', name: 'UHD · 3 倍', pxMul: 3 },
  ];

  /* ============ 背景配色 ============ */
  WB.BG_PRESETS = [
    { name: '薄荷白', c1: '#e6f7ec', c2: '#ffffff', c3: '#d3f0e0', angle: 160, mesh: true },
    { name: '松林绿', c1: '#d7f0dc', c2: '#f4fbf5', c3: '#bde7cd', angle: 200, mesh: true },
    { name: '晨曦橙', c1: '#ffe6cf', c2: '#fff8f2', c3: '#ffd6b3', angle: 160, mesh: true },
    { name: '蜜桃粉', c1: '#ffdbe4', c2: '#fff5f8', c3: '#ffc9d8', angle: 175, mesh: true },
    { name: '海盐蓝', c1: '#d8ebff', c2: '#f6fbff', c3: '#c2e0ff', angle: 160, mesh: true },
    { name: '薰衣草', c1: '#e6e1ff', c2: '#faf8ff', c3: '#d6cfff', angle: 190, mesh: true },
    { name: '柠檬', c1: '#fbf3c9', c2: '#fffdf3', c3: '#f6ecae', angle: 155, mesh: false },
    { name: '冰川', c1: '#cfe9ff', c2: '#eef8ff', c3: '#b9dcff', angle: 180, mesh: true },
    { name: '落日', c1: '#ff9f6e', c2: '#ffd4a6', c3: '#ff7a59', angle: 165, mesh: true },
    { name: '灰白', c1: '#eff1f5', c2: '#ffffff', c3: '#e4e7ee', angle: 180, mesh: false },
    { name: '石墨黑', c1: '#191d22', c2: '#2b323b', c3: '#101317', angle: 165, mesh: true },
    { name: '午夜蓝', c1: '#0b1020', c2: '#1c2a5c', c3: '#070a14', angle: 175, mesh: true },
  ];

  /* ============ 贴纸 ============ */
  WB.STICKER_PRESETS = ['💰', '💸', '🔥', '✨', '⭐️', '🎯', '🚀', '💡', '📈', '🏆', '❤️', '👉', '✅', '⚡️', '🛡️', '🕒'];

  /* ============ 字体 ============ */
  WB.FONTS = {
    system: { name: '系统默认', css: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif' },
    inter: { name: 'Inter（现代黑体）', css: '"Inter", "PingFang SC", -apple-system, sans-serif' },
    poppins: { name: 'Poppins（几何圆体）', css: '"Poppins", "PingFang SC", -apple-system, sans-serif' },
    noto: { name: 'Noto Sans SC（中文黑体）', css: '"Noto Sans SC", "PingFang SC", sans-serif' },
    playfair: { name: 'Playfair（优雅衬线）', css: '"Playfair Display", "Songti SC", "Times New Roman", serif' },
    mono: { name: '等宽 Mono', css: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace' },
  };

  /* ============ 设备框样式 ============ */
  WB.DEVICE_STYLES = [
    { id: 'device', name: '机身（带边框）' },
    { id: 'flat', name: '圆角卡片' },
    { id: 'none', name: '无边框（直角）' },
  ];

  /* ============ 文本块测量与排布 ============ */
  function setFont(ctx, size, weight, fontKey) {
    const f = (WB.FONTS[fontKey] || WB.FONTS.system).css;
    ctx.font = `${weight} ${size}px ${f}`;
  }
  WB.setFont = setFont;

  function mkText(ctx, st, o) {
    const W = st.canvas.w, H = st.canvas.h, ts = st.text;
    const maxW = o.maxW * (ts.widthMul == null ? 1 : ts.widthMul);
    let lines = [''];
    if (ts.show.title !== false && ts.title) {
      setFont(ctx, ts.titleSize, ts.titleWeight, ts.font);
      lines = WB.wrapText(ctx, ts.title, maxW);
    } else lines = [];
    const lh = ts.titleSize * ts.titleLineHeight;
    const titleH = lines.length * lh;
    const hasSub = ts.show.subtitle !== false && !!(ts.subtitle && String(ts.subtitle).trim());
    const subH = hasSub ? ts.subtitleSize * 1.55 : 0;
    const gap = lines.length && hasSub ? Math.max(10, ts.titleSize * 0.36 + ts.subtitleGap) : 0;
    const total = titleH + gap + subH;

    let top, anchor;
    if (o.centerY != null) { top = o.centerY - total / 2; anchor = 'center'; }
    else if (o.bottom != null) { top = H - o.bottom - total; anchor = 'bottom'; }
    else { top = o.top; anchor = 'top'; }
    top += st.layout.textY || 0;

    const align = ts.titleAlign || o.align || 'left';
    const pad = o.pad == null ? W * 0.085 : o.pad;
    const x = align === 'center' ? W / 2 : align === 'right' ? W - pad : pad;

    return {
      align, maxW, anchor, pad,
      title: { show: lines.length > 0, x, y: top, lines, size: ts.titleSize, lh, align, maxW, weight: ts.titleWeight },
      subtitle: { show: hasSub, x, y: top + titleH + gap, size: ts.subtitleSize, align, maxW, spacing: ts.subtitleSpacing },
      blockTop: top, blockBottom: top + total, height: total,
    };
  }
  WB.mkText = mkText;

  /* ============ 排版模板 ============ */
  /* 每个 layout(ctx, st, W, H, asp, asp2) 返回
     { devices:[{role,cx,cy,w,rotate,radius,style,bezel,card}], text, scrim, calloutDefault } */
  const T = [];

  T.push({
    id: 'classic', name: '经典 · 设备 + 底部标题', tag: '参考图同款',
    desc: '设备居中偏上，标题在下方；放大框压在设备上突出细节。',
    suggest: { titleSize: 46, titleWeight: 800, titleAlign: 'left', titleColor: '#14171c', subtitleColor: '#14171c', scrim: false },
    layout(ctx, st, W, H, asp) {
      const pad = W * 0.085;
      const text = mkText(ctx, st, { pad, maxW: W * 0.83, bottom: H * 0.055, align: 'left' });
      const topBand = H * 0.072;
      const botBand = Math.max(topBand + H * 0.28, text.blockTop - H * 0.045);
      const bandH = botBand - topBand;
      let w = W * 0.80;
      if (w * asp > bandH) w = bandH / asp;
      const cy = topBand + bandH / 2;
      const dh = w * asp;
      return {
        devices: [{ role: 'main', cx: W / 2, cy, w, rotate: 0, radius: W * 0.088, style: 'device', bezel: W * 0.019 }],
        text,
        calloutDefault: { w: Math.min(W * 0.78, w * 1.04), h: Math.min(W * 0.62, w * 0.64), rotate: -1.6, cx: W / 2 + W * 0.02, cy: cy + dh * 0.15 },
      };
    },
  });

  T.push({
    id: 'hero', name: '首图 · 标题在上，设备出血',
    tag: '首图推荐',
    desc: '文案占据顶部黄金位，设备从底部出血，视觉冲击更强。',
    suggest: { titleSize: 44, titleWeight: 800, titleAlign: 'left', titleColor: '#14171c', subtitleColor: '#14171c', scrim: false },
    layout(ctx, st, W, H, asp) {
      const pad = W * 0.085;
      const text = mkText(ctx, st, { pad, maxW: W * 0.84, top: H * 0.072, align: 'left' });
      const availTop = text.blockBottom + H * 0.055;
      const availH = H * 1.0 - availTop;
      let w = W * 0.88;
      if (w * asp > availH * 1.04) w = (availH * 1.04) / asp;
      const dh = w * asp;
      let top = H * 0.99 - dh;
      if (top < availTop) top = availTop;
      return {
        devices: [{ role: 'main', cx: W / 2, cy: top + dh / 2, w, rotate: 0, radius: W * 0.088, style: 'device', bezel: W * 0.019 }],
        text,
        calloutDefault: { w: Math.min(W * 0.76, w * 1.02), h: Math.min(W * 0.58, w * 0.6), rotate: 1.6, cx: W / 2 - W * 0.02, cy: top + dh * 0.30 },
      };
    },
  });

  T.push({
    id: 'bleed', name: '满屏 · 截图出血 + 蒙层文案',
    tag: '沉浸',
    desc: '截图铺满整张卡片，底部渐隐蒙层承载文字；适合强调界面本身。',
    suggest: { titleSize: 50, titleWeight: 800, titleAlign: 'left', titleColor: '#ffffff', subtitleColor: '#e9edf2', scrim: true },
    layout(ctx, st, W, H, asp) {
      const pad = W * 0.085;
      const text = mkText(ctx, st, { pad, maxW: W * 0.82, bottom: H * 0.075, align: 'left' });
      let w = W * 1.04;
      if (w * asp < H * 1.06) w = (H * 1.06) / asp;
      const dh = w * asp;
      const half = dh / 2;
      let cy = H * 0.42;
      // 保证截图完全覆盖画布，不漏底
      if (H - half <= half) cy = clamp(cy, H - half, half); else cy = H / 2;
      return {
        devices: [{ role: 'main', cx: W / 2, cy, w, rotate: 0, radius: 0, style: 'none', bezel: 0 }],
        text, scrim: 'bottom',
        calloutDefault: { w: W * 0.72, h: W * 0.5, rotate: -1.2, cx: W / 2, cy: H * 0.30 },
      };
    },
  });

  T.push({
    id: 'spotlight', name: '聚焦 · 设备放大 + 左上文案',
    tag: '细节',
    desc: '设备放大占满视野，配合放大框强调某个功能点。',
    suggest: { titleSize: 42, titleWeight: 800, titleAlign: 'left', titleColor: '#14171c', subtitleColor: '#3b424c', scrim: false },
    layout(ctx, st, W, H, asp) {
      const pad = W * 0.075;
      const text = mkText(ctx, st, { pad, maxW: W * 0.86, bottom: H * 0.05, align: 'left' });
      const top = H * 0.05;
      const availH = text.blockTop - H * 0.04 - top;
      let w = W * 0.98;
      if (w * asp > availH) w = availH / asp;
      const dh = w * asp;
      const cy = top + availH / 2;
      return {
        devices: [{ role: 'main', cx: W / 2, cy, w, rotate: 0, radius: W * 0.075, style: 'device', bezel: W * 0.016 }],
        text,
        calloutDefault: { w: w * 0.92, h: w * 0.56, rotate: -1.4, cx: W / 2 + W * 0.04, cy: cy + dh * 0.06 },
      };
    },
  });

  T.push({
    id: 'minimal', name: '极简 · 居中留白',
    tag: '高级感',
    desc: '小尺寸设备 + 居中细标题，大面积留白，适合品牌向截图。',
    suggest: { titleSize: 36, titleWeight: 700, titleAlign: 'center', titleColor: '#14171c', subtitleColor: '#6b7280', scrim: false },
    layout(ctx, st, W, H, asp) {
      const text = mkText(ctx, st, { pad: W * 0.12, maxW: W * 0.7, bottom: H * 0.07, align: 'center' });
      const topBand = H * 0.10;
      const botBand = text.blockTop - H * 0.06;
      const bandH = botBand - topBand;
      let w = W * 0.60;
      if (w * asp > bandH) w = bandH / asp;
      const cy = topBand + bandH / 2;
      return {
        devices: [{ role: 'main', cx: W / 2, cy, w, rotate: 0, radius: W * 0.07, style: 'device', bezel: W * 0.015 }],
        text,
        calloutDefault: { w: w * 0.95, h: w * 0.6, rotate: -1.2, cx: W / 2, cy: cy + w * asp * 0.1 },
      };
    },
  });

  T.push({
    id: 'card', name: '卡片 · 白托板 + 投影',
    tag: '质感',
    desc: '设备坐落在一张白色圆角托板上，层次清晰、质感更强。',
    suggest: { titleSize: 40, titleWeight: 800, titleAlign: 'center', titleColor: '#14171c', subtitleColor: '#5b6472', scrim: false },
    layout(ctx, st, W, H, asp) {
      const text = mkText(ctx, st, { pad: W * 0.1, maxW: W * 0.8, bottom: H * 0.065, align: 'center' });
      const topBand = H * 0.09;
      const botBand = text.blockTop - H * 0.06;
      const bandH = botBand - topBand;
      const cardPad = W * 0.055;
      let w = W * 0.66;
      if ((w * asp + cardPad * 2) > bandH) w = (bandH - cardPad * 2) / asp;
      const cy = topBand + bandH / 2;
      return {
        devices: [{
          role: 'main', cx: W / 2, cy, w, rotate: 0, radius: W * 0.062, style: 'device', bezel: W * 0.014,
          card: { pad: cardPad, radius: W * 0.085, color: '#ffffff', shadow: 0.16, shadowY: W * 0.03 },
        }],
        text,
        calloutDefault: { w: w * 1.08, h: w * 0.66, rotate: -1.4, cx: W / 2 + W * 0.03, cy: cy + w * asp * 0.04 },
      };
    },
  });

  T.push({
    id: 'tilt', name: '倾斜 · 动感构图',
    tag: '活泼',
    desc: '设备略带倾斜角，适合年轻、活泼的产品调性。',
    suggest: { titleSize: 44, titleWeight: 900, titleAlign: 'center', titleColor: '#14171c', subtitleColor: '#14171c', scrim: false },
    layout(ctx, st, W, H, asp) {
      const text = mkText(ctx, st, { pad: W * 0.1, maxW: W * 0.8, bottom: H * 0.06, align: 'center' });
      const topBand = H * 0.075;
      const botBand = text.blockTop - H * 0.05;
      const bandH = botBand - topBand;
      let w = W * 0.90;
      if (w * asp > bandH) w = bandH / asp;
      const cy = topBand + bandH / 2;
      return {
        devices: [{ role: 'main', cx: W / 2, cy, w, rotate: -6, radius: W * 0.08, style: 'device', bezel: W * 0.017 }],
        text,
        calloutDefault: { w: w * 0.8, h: w * 0.5, rotate: 3.5, cx: W / 2 + W * 0.05, cy: cy + w * asp * 0.14 },
      };
    },
  });

  T.push({
    id: 'duo', name: '双机 · 主副图错落',
    tag: '流程/对比',
    desc: '主图与副图错落摆放，适合展示操作流程或前后对比。',
    suggest: { titleSize: 40, titleWeight: 800, titleAlign: 'left', titleColor: '#14171c', subtitleColor: '#3b424c', scrim: false },
    layout(ctx, st, W, H, asp, asp2) {
      const pad = W * 0.085;
      const text = mkText(ctx, st, { pad, maxW: W * 0.83, bottom: H * 0.05, align: 'left' });
      const topBand = H * 0.07;
      const botBand = text.blockTop - H * 0.04;
      const bandH = botBand - topBand;
      const w2 = Math.min(W * 0.50, bandH / asp2 * 0.9);
      const w1 = Math.min(W * 0.62, bandH / asp * 0.98);
      const devices = [
        { role: 'alt', cx: W * 0.72, cy: topBand + bandH * 0.62, w: w2, rotate: 4.5, radius: W * 0.07, style: 'device', bezel: W * 0.015, dim: 1 },
        { role: 'main', cx: W * 0.34, cy: topBand + bandH * 0.42, w: w1, rotate: -4, radius: W * 0.075, style: 'device', bezel: W * 0.016 },
      ];
      return {
        devices, text,
        calloutDefault: { w: W * 0.62, h: W * 0.44, rotate: -2, cx: W * 0.35, cy: topBand + bandH * 0.42 },
      };
    },
  });

  WB.TEMPLATES = T;
  WB.getTemplate = (id) => T.find((t) => t.id === id) || T[0];

  /* ============ 默认状态 ============ */
  WB.defaultState = function () {
    const W = 430, H = 932;
    return {
      v: 1,
      template: 'classic',
      canvas: { preset: 'p67', w: W, h: H },
      images: { main: null, alt: null }, // {src,name,w,h}
      device: { style: 'device', radius: 38, bezel: 8, bezelColor: '#f6fbf8', borderW: 0, borderColor: '#e2e6eb', shadow: 0.30, shadowY: 24, shadowBlur: 60, rotate: 0 },
      layout: { deviceScale: 1, deviceX: 0, deviceY: 0, textY: 0 },
      background: { type: 'gradient', c1: '#e6f7ec', c2: '#ffffff', c3: '#d3f0e0', angle: 160, mesh: true, image: null, imageBlur: 0, scrim: 0 },
      text: {
        title: '给你看得见的\n核心卖点',
        subtitle: 'UP TO $750 · MULTIPLE OFFERS',
        show: { title: true, subtitle: true },
        titleSize: 46, titleWeight: 800, titleLineHeight: 1.08, titleAlign: 'left', titleColor: '#14171c',
        subtitleSize: 15, subtitleWeight: 600, subtitleSpacing: 1.6, subtitleColor: '#14171c',
        underline: true, underlineColor: '', underlineW: 3, subtitleGap: 0,
        font: 'system', widthMul: 1, autoStyle: true,
        pos: 'auto', // auto 跟随模板 / top 文案朝上 / bottom 文案朝下
      },
      callouts: [],
      stickers: [],
      notes: [],
      exportCfg: { preset: 'appstore67', format: 'png', quality: 0.92, zipAll: true },
      ui: { zoom: 0, tab: 'media' },
      active: { callout: -1, sticker: -1, note: -1, target: 'callout' },
    };
  };

  /* 从模板建议样式构造文本样式补丁 */
  WB.templateTextPatch = function (tpl, W) {
    const k = W / 430;
    const s = tpl.suggest || {};
    const p = {};
    if (s.titleSize) p.titleSize = Math.round(s.titleSize * k);
    if (s.titleWeight) p.titleWeight = s.titleWeight;
    if (s.titleAlign) p.titleAlign = s.titleAlign;
    if (s.titleColor) p.titleColor = s.titleColor;
    if (s.subtitleColor) p.subtitleColor = s.subtitleColor;
    return p;
  };

  /* 默认放大框：按目标框比例在截图中央取一块 */
  WB.defaultSrcRect = function (aspect) {
    let w = 0.7, h = w / aspect;
    if (h > 0.8) { h = 0.8; w = h * aspect; }
    return { x: WB.round2((1 - w) / 2), y: WB.round2(Math.max(0.05, (1 - h) / 2 - 0.05)), w: WB.round2(w), h: WB.round2(h) };
  };

  WB.newCallout = function (st, def) {
    const W = st.canvas.w, H = st.canvas.h;
    const img = st.images.main;
    const dw = def.w / W, dh = def.h / H;
    const aspect = dw * W / (dh * H);
    const c = {
      id: WB.uid(),
      target: 'main',
      src: WB.defaultSrcRect(aspect),
      dest: {
        x: clamp((def.cx - def.w / 2) / W, -0.2, 1.1),
        y: clamp((def.cy - def.h / 2) / H, -0.2, 1.1),
        w: clamp(dw, 0.1, 1.6),
        h: clamp(dh, 0.05, 1.6),
        rotate: def.rotate || 0,
        radius: Math.round(W * 0.030),
        pad: Math.round(W * 0.014),
        borderW: Math.max(2, Math.round(W * 0.0075)),
        borderColor: '',
        shadow: 0.28,
        shadowY: Math.round(W * 0.022),
        shadowBlur: Math.round(W * 0.08),
        mode: 'cover',
        zoom: 1,
        lock: true,
      },
      enabled: true,
    };
    void img;
    return c;
  };
})();
