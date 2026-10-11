/* app.js — 界面 / 交互 / 框选 / 导出 */
(function () {
  const WB = window.WB;
  const { $, el, clamp, deepClone } = WB;
  const K_STORE = 'shotstudio.v1';

  /* ================= 状态 ================= */
  let st = WB.defaultState();
  let history = [];
  let hIdx = -1;
  let dirty = false, rafId = 0;
  let zoom = 0.42, zoomMode = 'fit';
  let lastScene = null;
  let drag = null;
  let hover = null;
  const marquees = [];
  const ctl = [];          // 已注册控件 {node, sync}
  let panelBuiltFor = null;

  const cvsMain = $('#canvas-main');
  const cvsOv = $('#canvas-overlay');
  let ctxMain = cvsMain.getContext('2d');
  let ctxOv = cvsOv.getContext('2d');

  const activeCallout = () => st.callouts[st.active.callout] || null;
  const activeSticker = () => st.stickers[st.active.sticker] || null;
  const activeNote = () => (st.notes || [])[st.active.note] || null;
  const measureCtx = document.createElement('canvas').getContext('2d');
  const mainMeta = () => st.images.main;
  const curExportPreset = () => WB.EXPORT_PRESETS.find((p) => p.id === st.exportCfg.preset) || WB.EXPORT_PRESETS[0];
  const epScale = () => { const ep = curExportPreset(); return ep.pxMul ? ep.pxMul : ep.pxW / st.canvas.w; };

  /* ================= 历史 ================= */
  function pushHistory() {
    const s = deepClone(st);
    s.images = null;
    s.ui = null; // 视图状态（当前面板 / 缩放）不进历史，否则撤销时面板会跟着乱跳
    history = history.slice(0, hIdx + 1);
    history.push(s);
    if (history.length > 80) history.shift();
    hIdx = history.length - 1;
    updateHistoryUI();
    autosave();
  }
  const commit = () => pushHistory();

  /* 兼容旧存档 / 旧工程：补齐后加的字段 */
  function ensureState(s) {
    if (!s.text) s.text = {};
    if (s.text.pos == null) s.text.pos = 'auto';
    if (!Array.isArray(s.notes)) s.notes = [];
    if (!s.device) s.device = WB.defaultState().device;
    return s;
  }
  function restore(snap) {
    const images = st.images;
    const ui = st.ui;                 // 保留当前视图状态，撤销不应改变正在看的面板
    st = deepClone(snap);
    st.images = images;
    st.ui = ui || WB.defaultState().ui;
    if (st.active.callout >= st.callouts.length) st.active.callout = st.callouts.length - 1;
    if (st.active.sticker >= st.stickers.length) st.active.sticker = st.stickers.length - 1;
    refreshAll();
    autosave();
  }
  function undo() { if (hIdx > 0) { hIdx--; restore(history[hIdx]); } }
  function redo() { if (hIdx < history.length - 1) { hIdx++; restore(history[hIdx]); } }
  function updateHistoryUI() {
    $('#btnUndo').disabled = hIdx <= 0;
    $('#btnRedo').disabled = hIdx >= history.length - 1;
  }

  /* ================= 渲染 ================= */
  function requestRender() {
    if (dirty) return;
    dirty = true;
    rafId = requestAnimationFrame(() => { dirty = false; drawAll(); });
  }

  function syncCanvasSize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = st.canvas.w, H = st.canvas.h;
    const cssW = Math.max(2, Math.round(W * zoom));
    const cssH = Math.max(2, Math.round(H * zoom));
    [cvsMain, cvsOv].forEach((c) => {
      c.style.width = cssW + 'px';
      c.style.height = cssH + 'px';
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    });
    ctxMain = cvsMain.getContext('2d');
    ctxOv = cvsOv.getContext('2d');
    $('#frame').classList.toggle('transparent', st.background.type === 'transparent');
    return dpr;
  }

  function drawAll() {
    const dpr = syncCanvasSize();
    try {
      lastScene = WB.renderScene(ctxMain, st, zoom * dpr);
      drawOverlay(dpr);
      painterExtras();
    } catch (e) {
      if (!drawAll.errShown) { drawAll.errShown = true; console.error('渲染出错', e); WB.toast('渲染出错：' + e.message, 'error'); }
    }
    $('#zoomVal').textContent = Math.round(zoom * 100) + '%';
  }

  function drawOverlay(dpr) {
    const W = st.canvas.w, H = st.canvas.h;
    const z = zoom;
    ctxOv.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxOv.clearRect(0, 0, W * z, H * z);
    if (!mainMeta()) return;

    const accent = WB.resolveAccent(st);
    ctxOv.lineJoin = 'round';

    st.callouts.forEach((c, i) => {
      const on = i === st.active.callout;
      const x = c.dest.x * W * z, y = c.dest.y * H * z, w = c.dest.w * W * z, h = c.dest.h * H * z;
      ctxOv.save();
      ctxOv.translate(x + w / 2, y + h / 2);
      ctxOv.rotate(WB.deg(c.dest.rotate || 0));
      ctxOv.strokeStyle = on ? '#2f6bff' : 'rgba(47,107,255,.42)';
      ctxOv.lineWidth = on ? 1.5 : 1;
      ctxOv.setLineDash(on ? [6, 4] : [3, 3]);
      ctxOv.strokeRect(-w / 2, -h / 2, w, h);
      ctxOv.setLineDash([]);
      if (on) {
        const hs = 8;
        [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].forEach(([cx, cy]) => {
          ctxOv.fillStyle = '#fff';
          ctxOv.strokeStyle = '#2f6bff';
          ctxOv.lineWidth = 1.5;
          ctxOv.beginPath();
          ctxOv.rect(cx - hs / 2, cy - hs / 2, hs, hs);
          ctxOv.fill();
          ctxOv.stroke();
        });
      }
      ctxOv.restore();
    });

    st.notes.forEach((n, i) => {
      const L = noteBox(n);
      const on = i === st.active.note;
      const x = (L.cx - L.bw / 2) * z, y = (L.cy - L.bh / 2) * z, w = L.bw * z, h = L.bh * z;
      ctxOv.save();
      ctxOv.strokeStyle = on ? '#2f6bff' : 'rgba(47,107,255,.35)';
      ctxOv.lineWidth = on ? 1.5 : 1;
      ctxOv.setLineDash(on ? [6, 4] : [3, 3]);
      if (n.arrow) {
        ctxOv.beginPath();
        ctxOv.moveTo(L.cx * z, L.cy * z);
        ctxOv.lineTo(n.tx * W * z, n.ty * H * z);
        ctxOv.stroke();
        if (on) {
          ctxOv.setLineDash([]);
          ctxOv.fillStyle = '#fff';
          ctxOv.lineWidth = 1.5;
          ctxOv.beginPath();
          ctxOv.arc(n.tx * W * z, n.ty * H * z, 6, 0, Math.PI * 2);
          ctxOv.fill();
          ctxOv.stroke();
        }
      }
      ctxOv.setLineDash(on ? [6, 4] : [3, 3]);
      ctxOv.strokeRect(x, y, w, h);
      ctxOv.restore();
    });

    st.stickers.forEach((s, i) => {
      if (i !== st.active.sticker) return;
      const x = s.x * W * z, y = s.y * H * z;
      const r = (s.size * W / 430 * z) / 2 + 8;
      ctxOv.save();
      ctxOv.strokeStyle = '#2f6bff';
      ctxOv.setLineDash([5, 4]);
      ctxOv.lineWidth = 1.4;
      ctxOv.beginPath();
      ctxOv.arc(x, y, r, 0, Math.PI * 2);
      ctxOv.stroke();
      ctxOv.restore();
    });

    if (hover && hover.type === 'callout' && hover.index !== st.active.callout) {
      const c = st.callouts[hover.index];
      if (c) {
        ctxOv.save();
        ctxOv.translate((c.dest.x + c.dest.w / 2) * W * z, (c.dest.y + c.dest.h / 2) * H * z);
        ctxOv.rotate(WB.deg(c.dest.rotate || 0));
        ctxOv.strokeStyle = accent;
        ctxOv.lineWidth = 1.5;
        ctxOv.strokeRect(-c.dest.w * W * z / 2, -c.dest.h * H * z / 2, c.dest.w * W * z, c.dest.h * H * z);
        ctxOv.restore();
      }
    }
  }

  /* 面板里的缩略图 / 预览（每次渲染后刷新） */
  function painterExtras() {
    WB.$$('.co-thumb').forEach((cv) => {
      const i = +cv.dataset.i;
      const c = st.callouts[i];
      if (c) paintCalloutPreview(cv, c);
    });
    painterModalPreview();
  }

  function paintCalloutPreview(cv, c) {
    const W = st.canvas.w, H = st.canvas.h;
    const dw = c.dest.w * W, dh = c.dest.h * H;
    if (dw < 1 || dh < 1) return;
    const pad = 8;
    const boxW = 128;
    const k = boxW / dw;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = boxW + pad * 2, cssH = dh * k + pad * 2;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(k, k);
    ctx.translate(-c.dest.x * W, -c.dest.y * H);
    WB.drawCallout(ctx, st, c, W, H);
    ctx.restore();
  }

  function painterModalPreview() {
    const box = $('#modalPreview');
    if (!box || !$('#modal').classList.contains('on')) return;
    const c = activeCallout();
    if (!c) return;
    let cv = box.querySelector('canvas');
    if (!cv) { cv = el('canvas'); box.appendChild(cv); }
    const W = st.canvas.w, H = st.canvas.h;
    const dw = c.dest.w * W, dh = c.dest.h * H;
    const avail = Math.min(box.clientWidth - 24, 320);
    const k = Math.min(avail / dw, 300 / dh, 2.2);
    const pad = 14;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = dw * k + pad * 2, cssH = dh * k + pad * 2;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(k, k);
    ctx.translate(-c.dest.x * W, -c.dest.y * H);
    WB.drawCallout(ctx, st, c, W, H);
    ctx.restore();
    const info = { w: Math.round(dw), h: Math.round(dh) };
    $('#modalSrcInfo').textContent = `画布上实际尺寸 ${info.w}×${info.h} pt`;
  }

  function refreshAll() {
    renderPanel();
    syncAll();
    requestRender();
    updateDropzone();
    updateStatus();
  }

  /* ================= 缩放 ================= */
  function fitZoom() {
    const stage = $('#stage');
    const availW = Math.max(120, stage.clientWidth - 96);
    const availH = Math.max(120, stage.clientHeight - 118);
    zoom = clamp(Math.min(availW / st.canvas.w, availH / st.canvas.h), 0.04, 2);
    zoomMode = 'fit';
    requestRender();
    $('#zoomVal').textContent = Math.round(zoom * 100) + '%';
  }
  function setZoom(z) {
    zoom = clamp(z, 0.04, 4);
    zoomMode = 'manual';
    requestRender();
    $('#zoomVal').textContent = Math.round(zoom * 100) + '%';
  }

  /* ================= 画布交互 ================= */
  const HS = 11; // 手柄命中尺寸（css px）
  function toDesign(ev) {
    const r = cvsOv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / zoom, y: (ev.clientY - r.top) / zoom };
  }
  function calloutCorners(c) {
    const W = st.canvas.w, H = st.canvas.h;
    const x = c.dest.x * W, y = c.dest.y * H, w = c.dest.w * W, h = c.dest.h * H;
    return {
      rect: { x, y, w, h },
      cx: x + w / 2, cy: y + h / 2,
      rot: c.dest.rotate || 0,
    };
  }
  function toLocal(p, cx, cy, rot) {
    const a = -WB.deg(rot), dx = p.x - cx, dy = p.y - cy;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function fromLocal(l, cx, cy, rot) {
    const a = WB.deg(rot);
    return { x: cx + l.x * Math.cos(a) - l.y * Math.sin(a), y: cy + l.x * Math.sin(a) + l.y * Math.cos(a) };
  }
  function hitCalloutHandle(p, c) {
    const g = calloutCorners(c);
    if (Math.abs(g.rot) > 0.01) {
      const l = toLocal(p, g.cx, g.cy, g.rot);
      const hw = g.rect.w / 2, hh = g.rect.h / 2;
      const tol = (HS + 4) / zoom;
      const corners = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]];
      const names = ['tl', 'tr', 'bl', 'br'];
      for (let i = 0; i < 4; i++) {
        if (Math.abs(l.x - corners[i][0]) < tol && Math.abs(l.y - corners[i][1]) < tol) return names[i];
      }
      return null;
    }
    const tol = (HS + 4) / zoom;
    const corners = [[g.rect.x, g.rect.y, 'tl'], [g.rect.x + g.rect.w, g.rect.y, 'tr'], [g.rect.x, g.rect.y + g.rect.h, 'bl'], [g.rect.x + g.rect.w, g.rect.y + g.rect.h, 'br']];
    for (const [x, y, n] of corners) {
      if (Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol) return n;
    }
    return null;
  }
  function insideCallout(p, c) {
    const g = calloutCorners(c);
    const l = toLocal(p, g.cx, g.cy, g.rot);
    return Math.abs(l.x) <= g.rect.w / 2 && Math.abs(l.y) <= g.rect.h / 2;
  }
  function hitTest(p) {
    const c = activeCallout();
    if (c) {
      const h = hitCalloutHandle(p, c);
      if (h) return { type: 'handle', corner: h, index: st.active.callout };
    }
    const an = activeNote();
    if (an && an.arrow) {
      const dx = p.x - an.tx * st.canvas.w, dy = p.y - an.ty * st.canvas.h;
      const r = 15 / zoom;
      if (dx * dx + dy * dy < r * r) return { type: 'noteArrow', index: st.active.note };
    }
    for (let i = st.callouts.length - 1; i >= 0; i--) {
      if (st.callouts[i].enabled !== false && insideCallout(p, st.callouts[i])) return { type: 'callout', index: i };
    }
    for (let i = st.notes.length - 1; i >= 0; i--) {
      const L = noteBox(st.notes[i]);
      if (Math.abs(p.x - L.cx) <= L.bw / 2 + 2 && Math.abs(p.y - L.cy) <= L.bh / 2 + 2) return { type: 'note', index: i };
    }
    for (let i = st.stickers.length - 1; i >= 0; i--) {
      const s = st.stickers[i];
      const r = (s.size * st.canvas.w / 430) / 2 + 6;
      const dx = p.x - s.x * st.canvas.w, dy = p.y - s.y * st.canvas.h;
      if (dx * dx + dy * dy < r * r) return { type: 'sticker', index: i };
    }
    if (lastScene) {
      for (let i = lastScene.devices.length - 1; i >= 0; i--) {
        const d = lastScene.devices[i];
        if (p.x > d.cx - d.w / 2 - 6 && p.x < d.cx + d.w / 2 + 6 && p.y > d.cy - d.h / 2 - 6 && p.y < d.cy + d.h / 2 + 6) {
          return { type: 'device', index: i };
        }
      }
    }
    return null;
  }

  cvsOv.addEventListener('pointerdown', (ev) => {
    if (!mainMeta()) return;
    const p = toDesign(ev);
    const hit = hitTest(p);
    cvsOv.setPointerCapture(ev.pointerId);
    if (!hit) {
      if (st.active.callout >= 0 || st.active.sticker >= 0 || st.active.note >= 0) {
        st.active.callout = -1; st.active.sticker = -1; st.active.note = -1;
        renderPanel(); requestRender();
      }
      return;
    }
    if (hit.type === 'callout') {
      st.active.callout = hit.index; st.active.sticker = -1; st.active.note = -1;
      if (st.ui.tab !== 'callout') { st.ui.tab = 'callout'; }
      renderPanel();
    } else if (hit.type === 'sticker') {
      st.active.sticker = hit.index; st.active.callout = -1; st.active.note = -1;
      if (st.ui.tab !== 'sticker') st.ui.tab = 'sticker';
      renderPanel();
    } else if (hit.type === 'note' || hit.type === 'noteArrow') {
      st.active.note = hit.index; st.active.callout = -1; st.active.sticker = -1;
      if (st.ui.tab !== 'note') st.ui.tab = 'note';
      renderPanel();
    }
    const c = hit.type === 'callout' || hit.type === 'handle' ? st.callouts[hit.index] : null;
    drag = {
      hit, p0: p, moved: false,
      origCallout: c ? deepClone(c.dest) : null,
      origSticker: hit.type === 'sticker' ? deepClone(st.stickers[hit.index]) : null,
      origNote: (hit.type === 'note' || hit.type === 'noteArrow') ? deepClone(st.notes[hit.index]) : null,
      origLayout: { x: st.layout.deviceX, y: st.layout.deviceY },
    };
    requestRender();
  });

  cvsOv.addEventListener('pointermove', (ev) => {
    if (!mainMeta()) return;
    const p = toDesign(ev);
    if (!drag) {
      const hit = hitTest(p);
      const prev = hover;
      hover = hit;
      let cur = 'default';
      if (hit) {
        if (hit.type === 'handle') cur = (hit.corner === 'tl' || hit.corner === 'br') ? 'nwse-resize' : 'nesw-resize';
        else cur = 'move';
      }
      cvsOv.style.cursor = cur;
      if (JSON.stringify(prev) !== JSON.stringify(hover)) requestRender();
      return;
    }
    const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
    const W = st.canvas.w, H = st.canvas.h;

    if (drag.hit.type === 'callout' && drag.origCallout) {
      const c = st.callouts[drag.hit.index];
      c.dest.x = drag.origCallout.x + dx / W;
      c.dest.y = drag.origCallout.y + dy / H;
    } else if (drag.hit.type === 'handle' && drag.origCallout) {
      const c = st.callouts[drag.hit.index];
      const o = drag.origCallout;
      const g = calloutCorners({ dest: o });
      const l0 = toLocal(drag.p0, g.cx, g.cy, o.rotate || 0);
      const l1 = toLocal(p, g.cx, g.cy, o.rotate || 0);
      const ddx = l1.x - l0.x, ddy = l1.y - l0.y;
      const right = drag.hit.corner === 'tr' || drag.hit.corner === 'br';
      const bottom = drag.hit.corner === 'bl' || drag.hit.corner === 'br';
      const ox = o.x * W, oy = o.y * H, ow = o.w * W, oh = o.h * H;
      let nx = ox, ny = oy, nw = ow, nh = oh;
      if (right) { nw = ow + ddx; } else { nx = ox + ddx; nw = ow - ddx; }
      if (bottom) { nh = oh + ddy; } else { ny = oy + ddy; nh = oh - ddy; }
      if (nw < 24) { if (right) nw = 24; else { nx = ox + ow - 24; nw = 24; } }
      if (nh < 24) { if (bottom) nh = 24; else { ny = oy + oh - 24; nh = 24; } }
      // 锁定比例（同时按住 shift 也可）
      const lock = c.dest.lock !== false || ev.shiftKey;
      if (lock && ow > 0 && oh > 0) {
        const ratio = ow / oh;
        if (Math.abs(nw / ratio - nh) > 0.5) {
          if (Math.abs(ddx) > Math.abs(ddy)) nh = nw / ratio; else nw = nh * ratio;
          if (!bottom) ny = oy + oh - nh;
          if (!right) nx = ox + ow - nw;
        }
      }
      c.dest.x = nx / W; c.dest.y = ny / H; c.dest.w = nw / W; c.dest.h = nh / H;
    } else if (drag.hit.type === 'sticker' && drag.origSticker) {
      const s = st.stickers[drag.hit.index];
      s.x = drag.origSticker.x + dx / W;
      s.y = drag.origSticker.y + dy / H;
    } else if (drag.hit.type === 'note' && drag.origNote) {
      const nn = st.notes[drag.hit.index];
      nn.x = clamp(drag.origNote.x + dx / W, -0.1, 1.1);
      nn.y = clamp(drag.origNote.y + dy / H, -0.1, 1.1);
    } else if (drag.hit.type === 'noteArrow' && drag.origNote) {
      const nn = st.notes[drag.hit.index];
      nn.tx = clamp(drag.origNote.tx + dx / W, -0.1, 1.1);
      nn.ty = clamp(drag.origNote.ty + dy / H, -0.1, 1.1);
    } else if (drag.hit.type === 'device') {
      st.layout.deviceX = drag.origLayout.x + dx;
      st.layout.deviceY = drag.origLayout.y + dy;
    }
    requestRender();
    syncSoft();
  });

  function endDrag(ev) {
    if (!drag) return;
    if (drag.moved) commit();
    drag = null;
    if (ev && ev.target && ev.target.releasePointerCapture) {
      try { ev.target.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    syncAll();
  }
  cvsOv.addEventListener('pointerup', endDrag);
  cvsOv.addEventListener('pointercancel', endDrag);

  /* ================= 控件工厂 ================= */
  function reg(node, sync) { ctl.push({ node, sync }); return node; }
  function syncSoft() { ctl.forEach((c) => c.sync()); }
  function syncAll() { syncSoft(); updateHistoryUI(); updateStatus(); }
  function P(path) {
    return { get: () => WB.getPath(st, path), set: (v) => WB.setPath(st, path, v) };
  }
  function PC(field) {
    return {
      get: () => { const c = activeCallout(); return c ? WB.getPath(c.dest, field) : 0; },
      set: (v) => { const c = activeCallout(); if (c) WB.setPath(c.dest, field, v); },
    };
  }
  const fmtNum = (fn) => (v) => { const n = fn ? fn(v) : v; return (Math.round(n * 10) / 10).toString(); };

  function slider(label, acc, min, max, step, fmt, onCommit) {
    const input = el('input', { type: 'range', min, max, step });
    const val = el('span', { class: 'ctl-val' });
    const show = () => { val.textContent = fmt ? fmt(acc.get()) : fmtNum()(acc.get()); };
    const sync = () => { input.value = acc.get(); show(); };
    input.addEventListener('input', () => { acc.set(parseFloat(input.value)); show(); requestRender(); });
    input.addEventListener('change', () => { if (onCommit) onCommit(); commit(); });
    sync();
    const node = el('div', { class: 'ctl' }, [el('label', { text: label }), el('div', { class: 'row' }, [input, val])]);
    return reg(node, sync);
  }

  function colorField(label, acc, onInput) {
    const swatch = el('input', { type: 'color' });
    const hex = el('input', { type: 'text', class: 'hex' });
    const sync = () => {
      const v = acc.get() || '#ffffff';
      swatch.value = v; hex.value = v.toUpperCase();
    };
    const apply = (v, doCommit) => {
      acc.set(v); sync(); requestRender(); if (onInput) onInput();
      if (doCommit) commit();
    };
    swatch.addEventListener('input', () => apply(swatch.value, false));
    swatch.addEventListener('change', () => apply(swatch.value, true));
    hex.addEventListener('change', () => { if (/^#?[0-9a-f]{6}$/i.test(hex.value.trim())) apply(hex.value.trim().startsWith('#') ? hex.value.trim() : '#' + hex.value.trim(), true); else sync(); });
    const node = el('div', { class: 'ctl' }, [el('label', { text: label }), el('div', { class: 'color-field' }, [swatch, hex])]);
    return reg(node, sync);
  }

  function selectField(label, acc, options, onChange) {
    const sel = el('select');
    options.forEach((o) => sel.appendChild(el('option', { value: o.value, text: o.label })));
    const sync = () => { sel.value = acc.get(); };
    sel.addEventListener('change', () => { acc.set(sel.value); if (onChange) onChange(sel.value); commit(); requestRender(); syncSoft(); });
    sync();
    const node = el('div', { class: 'ctl' }, [el('label', { text: label }), sel]);
    return reg(node, sync);
  }

  function segField(label, acc, options, onChange, mini) {
    const wrap = el('div', { class: 'seg' + (mini ? ' mini' : '') });
    const btns = options.map((o) => {
      const b = el('button', { text: o.label, title: o.title || '' });
      b.addEventListener('click', () => { acc.set(o.value); if (onChange) onChange(o.value); else commit(); sync(); requestRender(); syncSoft(); });
      wrap.appendChild(b);
      return { b, o };
    });
    const sync = () => { const v = acc.get(); btns.forEach(({ b, o }) => b.classList.toggle('on', String(o.value) === String(v))); };
    sync();
    const node = label ? el('div', { class: 'ctl' }, [el('label', { text: label }), wrap]) : el('div', { class: 'ctl wide' }, [wrap]);
    return reg(node, sync);
  }

  function textField(label, acc, opts) {
    opts = opts || {};
    const input = opts.multiline ? el('textarea', { rows: opts.rows || 2 }) : el('input', { type: 'text' });
    const sync = () => { if (document.activeElement !== input) input.value = acc.get() == null ? '' : acc.get(); };
    let t = 0;
    input.addEventListener('input', () => {
      acc.set(input.value);
      requestRender();
      clearTimeout(t);
      t = setTimeout(() => { /* 结构不变，仅同步状态 */ }, 200);
    });
    input.addEventListener('change', () => commit());
    input.addEventListener('blur', () => commit());
    sync();
    const node = el('div', { class: 'ctl wide' }, [label ? el('label', { text: label }) : null, input]);
    return reg(node, sync);
  }

  function toggleField(label, acc, onChange) {
    const inp = el('input', { type: 'checkbox' });
    const sync = () => { inp.checked = !!acc.get(); };
    inp.addEventListener('change', () => { acc.set(inp.checked); requestRender(); if (onChange) onChange(inp.checked); commit(); });
    sync();
    const node = el('label', { class: 'switch' }, [inp, el('span', { text: label })]);
    return reg(node, sync);
  }

  const sec = (title, extras) => el('div', { class: 'sec' }, [el('div', { class: 'sec-title' }, [el('span', { text: title }), el('span', { class: 'spacer' })].concat(extras || []))]);
  const hint = (t) => el('div', { class: 'hint-row', text: t });
  const note = (t) => el('div', { class: 'empty-note', text: t });

  /* ================= 面板 ================= */
  const TABS = [
    { id: 'media', name: '素材', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 4.5-4.5 3.5 3.5 3-3L20 17"/></svg>' },
    { id: 'template', name: '模板', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="18" rx="2"/><rect x="13.5" y="3" width="7.5" height="8" rx="2"/><rect x="13.5" y="13" width="7.5" height="8" rx="2"/></svg>' },
    { id: 'device', name: '设备', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 5h3"/><path d="M12 18.2h.01"/></svg>' },
    { id: 'background', name: '背景', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18 9 9 0 0 1 0-18z" fill="currentColor" opacity=".14"/></svg>' },
    { id: 'text', name: '文字', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V4.5h14V6M12 4.5V20M9 20h6"/></svg>' },
    { id: 'callout', name: '放大镜', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="12" height="9" rx="2.5"/><path d="M17 12.5h4.5v9H10v-2"/><path d="M14.5 15.5 20 21"/></svg>' },
    { id: 'note', name: '标注', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 13.5a7 7 0 0 1-7 7H9l-5 3.5 1-4.2A7 7 0 0 1 3.5 14v-.5a7 7 0 0 1 7-7h3a7 7 0 0 1 7 7z"/></svg>' },
    { id: 'sticker', name: '贴纸', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 0-9 9c4.5 0 9-4.5 9-9z"/><path d="M12 21v-5a4 4 0 0 0-4-4H3"/></svg>' },
    { id: 'export', name: '导出', icon: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4 19h16"/></svg>' },
  ];

  function buildRail() {
    const rail = $('#rail');
    rail.innerHTML = '';
    TABS.forEach((t) => {
      const b = el('button', { class: 'rail-item' + (st.ui.tab === t.id ? ' on' : ''), title: t.name, html: t.icon + '<span>' + t.name + '</span>' });
      b.addEventListener('click', () => { st.ui.tab = t.id; buildRail(); renderPanel(); });
      rail.appendChild(b);
    });
  }

  function renderPanel() {
    const panel = $('#panel');
    ctl.length = 0;
    panel.innerHTML = '';
    const tab = st.ui.tab;
    const map = { media: panelMedia, template: panelTemplate, device: panelDevice, background: panelBackground, text: panelText, callout: panelCallout, note: panelNote, sticker: panelSticker, export: panelExport };
    (map[tab] || panelMedia)(panel);
    panelBuiltFor = tab;
  }

  /* ---------- 素材 ---------- */
  function panelMedia(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '素材' }),
      el('p', { text: '上传或粘贴其他应用的截图作为底图，可再补一张副图用于双机模板。' }),
    ]));

    const sec1 = sec('主图');
    const m = st.images.main;
    if (m) {
      const card = el('div', { class: 'thumb-card' }, [
        el('div', { class: 'tc-head' }, [el('span', { class: 'tc-dot' }), el('span', { text: '主图 · ' + (m.name || '截图') })]),
        el('div', { class: 'tc-body' }, [
          el('img', { src: m.src, alt: '主图' }),
          el('div', { class: 'tc-meta', html: `尺寸 <b>${m.w}×${m.h}</b><br>比例 <b>${(m.w / m.h).toFixed(3)}</b><br>${m.w < 1170 ? '<span style="color:#b4232a">建议宽度 ≥ 1170px，否则放大区域会偏糊</span>' : '分辨率充足 ✓'}` }),
        ]),
        el('div', { class: 'thumb-actions' }, [
          el('button', { class: 'btn mini wide', text: '替换', onclick: () => pickFiles('main') }),
          el('button', { class: 'btn mini wide', text: '用作副图', onclick: () => swapMainAlt() }),
          el('button', { class: 'btn mini wide danger', text: '移除', onclick: () => { st.images.main = null; st.callouts = []; st.palette = null; commit(); refreshAll(); } }),
        ]),
      ]);
      sec1.appendChild(card);
    } else {
      sec1.appendChild(note('还没有主图。点下面的按钮选择图片，或直接在页面里按 ⌘V 粘贴。'));
      sec1.appendChild(el('div', { class: 'row mt10' }, [
        el('button', { class: 'btn primary wide', text: '选择图片', onclick: () => pickFiles('main') }),
        el('button', { class: 'btn wide', text: '从剪贴板', onclick: pasteFromClipboard }),
      ]));
    }
    panel.appendChild(sec1);

    if (m) {
      const sec1b = sec('副图（双机模板用）');
      const a = st.images.alt;
      if (a) {
        sec1b.appendChild(el('div', { class: 'thumb-card' }, [
          el('div', { class: 'tc-head' }, [el('span', { class: 'tc-dot', style: { background: '#f2a33c' } }), el('span', { text: '副图 · ' + (a.name || '截图') })]),
          el('div', { class: 'tc-body' }, [
            el('img', { src: a.src, alt: '副图' }),
            el('div', { class: 'tc-meta', html: `尺寸 <b>${a.w}×${a.h}</b>` }),
          ]),
          el('div', { class: 'thumb-actions' }, [
            el('button', { class: 'btn mini wide', text: '替换', onclick: () => pickFiles('alt') }),
            el('button', { class: 'btn mini wide', text: '设为主图', onclick: () => swapMainAlt() }),
            el('button', { class: 'btn mini wide danger', text: '移除', onclick: () => { st.images.alt = null; commit(); refreshAll(); } }),
          ]),
        ]));
      } else {
        sec1b.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn wide', text: '添加副图', onclick: () => pickFiles('alt') })]));
      }
      panel.appendChild(sec1b);
    } else {
      panel.appendChild(sec('副图（双机模板用）').appendChild(note('导入主图后可用。')).parentNode);
    }

    const sec2 = sec('画布规格', [el('button', { class: 'link', text: '恢复默认', onclick: () => { st.canvas = { preset: 'p67', w: 430, h: 932 }; commit(); fitZoom(); refreshAll(); } })]);
    const cur = WB.CANVAS_PRESETS.find((p) => p.id === st.canvas.preset);
    sec2.appendChild(el('div', { class: 'ctl wide' }, [el('select', {
      onchange: (e) => setCanvasPreset(e.target.value),
      html: WB.CANVAS_PRESETS.map((p) => `<option value="${p.id}"${p.id === st.canvas.preset ? ' selected' : ''}>${p.name}</option>`).join('') + `<option value="custom"${cur ? '' : ' selected'}>自定义尺寸</option>`,
    })]));
    const wIn = el('input', { type: 'number', value: st.canvas.w, min: 120, max: 4000 });
    const hIn = el('input', { type: 'number', value: st.canvas.h, min: 120, max: 4000 });
    const applyCustom = () => {
      const w = clamp(parseInt(wIn.value, 10) || 430, 120, 4000);
      const h = clamp(parseInt(hIn.value, 10) || 932, 120, 4000);
      applyCanvasSize(w, h);
    };
    wIn.addEventListener('change', applyCustom);
    hIn.addEventListener('change', applyCustom);
    sec2.appendChild(el('div', { class: 'num-grid mt10' }, [
      el('div', { class: 'num-cell' }, [el('label', { text: '宽 pt' }), wIn]),
      el('div', { class: 'num-cell' }, [el('label', { text: '高 pt' }), hIn]),
    ]));
    sec2.appendChild(hint('pt 为设计坐标单位；App Store 6.7" = 430×932 pt → 导出 1290×2796 px。'));
    panel.appendChild(sec2);

    const sec3 = sec('快速操作');
    sec3.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn wide', text: '粘贴截图 ⌘V', onclick: pasteFromClipboard }),
      el('button', { class: 'btn wide', text: '打开工程', onclick: () => $('#projectInput').click() }),
    ]));
    if (m) sec3.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn wide', text: '把这张图存为工程', onclick: saveProject })]));
    panel.appendChild(sec3);
  }

  function swapMainAlt() {
    const t = st.images.main;
    st.images.main = st.images.alt;
    st.images.alt = t;
    commit();
    refreshAll();
  }

  function setCanvasPreset(id) {
    if (id === 'custom') return;
    const p = WB.CANVAS_PRESETS.find((x) => x.id === id);
    if (!p) return;
    applyCanvasSize(p.w, p.h, id);
  }
  function applyCanvasSize(w, h, presetId) {
    const ratio = w / st.canvas.w;
    st.canvas = { preset: presetId || 'custom', w, h };
    WB.rescaleDesign(st, ratio);
    commit();
    fitZoom();
    refreshAll();
  }

  /* ---------- 模板 ---------- */
  function tplThumbSVG(tpl) {
    const W = 100, H = Math.round(100 * st.canvas.h / st.canvas.w);
    const tmp = deepClone(st);
    tmp.canvas = { w: W, h: H };
    tmp.callouts = []; tmp.stickers = [];
    const k = W / st.canvas.w;
    tmp.text.titleSize *= k; tmp.text.subtitleSize *= k; tmp.text.underlineW *= k;
    const meta = st.images.main;
    const asp = meta ? meta.h / meta.w : 932 / 430;
    const asp2 = st.images.alt ? st.images.alt.h / st.images.alt.w : asp;
    const c = document.createElement('canvas').getContext('2d');
    let lay;
    try { lay = tpl.layout(c, tmp, W, H, asp, asp2); } catch (e) { return '<svg viewBox="0 0 100 220"></svg>'; }
    const parts = [];
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#f7f9fa"/>`);
    (lay.devices || []).forEach((d) => {
      const dh = d.w * (d.role === 'alt' ? asp2 : asp);
      parts.push(`<rect x="${d.cx - d.w / 2}" y="${d.cy - dh / 2}" width="${d.w}" height="${dh}" rx="${d.radius * 0.5}" fill="#cfd6de" stroke="#aab3bd" stroke-width="0.8"/>`);
    });
    const t = lay.text;
    if (t.title.show) {
      let y = t.title.y + 1;
      t.title.lines.forEach((ln) => {
        const w = Math.min(t.maxW * 0.6, 22 + ln.length * 3.2);
        const x = t.title.align === 'center' ? t.title.x - w / 2 : t.title.align === 'right' ? t.title.x - w : t.title.x;
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${Math.max(2, t.title.size * 0.62)}" rx="1" fill="#3d444d"/>`);
        y += t.title.lh;
      });
    }
    if (t.subtitle.show) {
      const w = Math.min(t.maxW * 0.7, 26);
      const x = t.subtitle.align === 'center' ? t.subtitle.x - w / 2 : t.subtitle.align === 'right' ? t.subtitle.x - w : t.subtitle.x;
      parts.push(`<rect x="${x}" y="${t.subtitle.y}" width="${w}" height="2.4" rx="1" fill="#8d959f"/>`);
    }
    const cd = lay.calloutDefault;
    if (cd && tpl.id !== 'duo') {
      parts.push(`<rect x="${cd.cx - cd.w / 2}" y="${cd.cy - cd.h / 2}" width="${cd.w}" height="${cd.h}" rx="3" fill="#ffffff" stroke="#12b76a" stroke-width="1.2"/>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
  }

  function panelTemplate(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '排版模板' }),
      el('p', { text: '切换模板会重排设备与文字位置；首次切换时也会套用模板推荐的文字样式。' }),
    ]));

    const s1 = sec('模板');
    const list = el('div', { class: 'tpl-list' });
    WB.TEMPLATES.forEach((t) => {
      const thumb = el('div', { class: 'tpl-thumb', html: tplThumbSVG(t) });
      thumb.style.width = Math.round(62 * st.canvas.w / st.canvas.h) + 'px';
      thumb.style.height = '62px';
      const item = el('button', { class: 'tpl' + (st.template === t.id ? ' on' : '') }, [
        thumb,
        el('div', { class: 'tpl-info' }, [
          el('div', {}, [el('b', { text: t.name }), t.tag ? el('span', { class: 'tpl-tag', text: t.tag }) : null]),
          el('span', { text: t.desc }),
        ]),
      ]);
      item.addEventListener('click', () => applyTemplate(t.id));
      list.appendChild(item);
    });
    s1.appendChild(list);
    panel.appendChild(s1);

    const s2 = sec('设备与布局');
    s2.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn mini wide', text: '打开「设备」面板', onclick: () => { st.ui.tab = 'device'; buildRail(); renderPanel(); } }),
    ]));
    s2.appendChild(hint('手机边框、圆角、投影，以及设备缩放与位移微调，都在「设备」面板里。切换模板会按模板重新排布，微调数值保留。'));
    panel.appendChild(s2);
  }

  /* ---------- 设备（手机边框 / 布局微调） ---------- */
  function panelDevice(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '设备' }),
      el('p', { text: '控制截图的手机外框与摆放：边框样式、圆角、厚度、颜色、投影，以及缩放和位移微调。' }),
    ]));

    const s1 = sec('手机边框');
    s1.appendChild(segField('样式', P('device.style'), WB.DEVICE_STYLES.map((d) => ({ label: d.name, value: d.id }))));
    s1.appendChild(el('div', { class: 'row wrap mt6' }, [
      el('button', { class: 'btn mini', text: '细边框', onclick: () => { Object.assign(st.device, { style: 'device', radius: 38, bezel: 6, borderW: 0, bezelColor: '#ffffff' }); commit(); renderPanel(); syncAll(); requestRender(); } }),
      el('button', { class: 'btn mini', text: '粗边框', onclick: () => { Object.assign(st.device, { style: 'device', radius: 56, bezel: 16, borderW: 0, bezelColor: '#14171c' }); commit(); renderPanel(); syncAll(); requestRender(); } }),
      el('button', { class: 'btn mini', text: '白框 + 描边', onclick: () => { Object.assign(st.device, { style: 'flat', radius: 34, bezel: 10, borderW: 2, bezelColor: '#ffffff', borderColor: '#dfe4ea' }); commit(); renderPanel(); syncAll(); requestRender(); } }),
      el('button', { class: 'btn mini', text: '无边框', onclick: () => { Object.assign(st.device, { style: 'none', radius: 24 }); commit(); renderPanel(); syncAll(); requestRender(); } }),
    ]));
    s1.appendChild(slider('圆角', P('device.radius'), 0, 90, 0.5, (v) => Math.round(v) + ''));
    s1.appendChild(slider('边框厚度', P('device.bezel'), 0, 24, 0.5, (v) => Math.round(v * 10) / 10 + ''));
    s1.appendChild(colorField('边框颜色', P('device.bezelColor')));
    s1.appendChild(colorField('描边颜色', P('device.borderColor')));
    s1.appendChild(slider('描边粗细', P('device.borderW'), 0, 12, 0.5, (v) => Math.round(v * 10) / 10 + ''));
    s1.appendChild(hint('「描边」只在「圆角卡片」样式下生效，用于给截图加一圈细线。'));
    panel.appendChild(s1);

    const s2 = sec('投影');
    s2.appendChild(slider('强度', P('device.shadow'), 0, 0.7, 0.01, (v) => Math.round(v * 100) + '%'));
    s2.appendChild(slider('高度', P('device.shadowY'), 0, 90, 1, (v) => Math.round(v) + ''));
    s2.appendChild(slider('模糊', P('device.shadowBlur'), 0, 160, 1, (v) => Math.round(v) + ''));
    panel.appendChild(s2);

    const s3 = sec('布局微调');
    s3.appendChild(slider('设备缩放', P('layout.deviceScale'), 0.4, 1.6, 0.005, (v) => v.toFixed(2) + '×'));
    s3.appendChild(slider('设备横向', P('layout.deviceX'), -140, 140, 1, (v) => Math.round(v) + ''));
    s3.appendChild(slider('设备纵向', P('layout.deviceY'), -180, 180, 1, (v) => Math.round(v) + ''));
    s3.appendChild(slider('文字纵向', P('layout.textY'), -120, 120, 1, (v) => Math.round(v) + ''));
    s3.appendChild(el('div', { class: 'row mt6' }, [
      el('button', { class: 'btn mini wide', text: '重置布局微调', onclick: () => { st.layout = { deviceScale: 1, deviceX: 0, deviceY: 0, textY: 0 }; commit(); refreshAll(); } }),
      el('button', { class: 'btn mini wide', text: '套用模板文字样式', onclick: () => { applyTemplateStyle(true); } }),
    ]));
    panel.appendChild(s3);
  }

  function applyTemplate(id) {
    st.template = id;
    const tpl = WB.getTemplate(id);
    if (st.text.autoStyle !== false) applyTemplateStyle(false);
    else { WB.setPath(st, 'text.titleAlign', (tpl.suggest || {}).titleAlign || st.text.titleAlign); }
    commit();
    renderPanel();
    syncAll();
    requestRender();
  }
  function applyTemplateStyle(force) {
    const tpl = WB.getTemplate(st.template);
    const patch = WB.templateTextPatch(tpl, st.canvas.w);
    Object.assign(st.text, patch);
    if (force) st.text.autoStyle = true;
    if (!force) return;
    commit(); renderPanel(); syncAll(); requestRender();
  }

  /* ---------- 背景 ---------- */
  function panelBackground(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '背景' }),
      el('p', { text: '渐变底色是最常见的 App Store 首图风格；也可以跟随截图自动取色。' }),
    ]));

    const s1 = sec('配色预设', [el('button', { class: 'link', text: '跟随截图配色', onclick: paletteFromImage })]);
    const grid = el('div', { class: 'bg-grid' });
    WB.BG_PRESETS.forEach((b) => {
      const sw = el('button', { class: 'bg-swatch', style: { background: `linear-gradient(${b.angle}deg, ${b.c1}, ${b.c2} 60%, ${b.c3})` } }, [el('span', { text: b.name })]);
      const isOn = st.background.c1 && st.background.c1.toLowerCase() === b.c1.toLowerCase() && st.background.c2.toLowerCase() === b.c2.toLowerCase();
      if (isOn) sw.classList.add('on');
      sw.addEventListener('click', () => {
        Object.assign(st.background, { type: 'gradient', c1: b.c1, c2: b.c2, c3: b.c3, angle: b.angle, mesh: b.mesh });
        st.accentFromImage = false;
        commit(); renderPanel(); syncAll(); requestRender();
      });
      grid.appendChild(sw);
    });
    s1.appendChild(grid);
    panel.appendChild(s1);

    const s2 = sec('类型');
    s2.appendChild(segField('', P('background.type'), [
      { label: '渐变', value: 'gradient' }, { label: '纯色', value: 'solid' },
      { label: '图片', value: 'image' }, { label: '透明', value: 'transparent' },
    ], (v) => { commit(); renderPanel(); syncAll(); requestRender(); }));
    panel.appendChild(s2);

    const bg = st.background;
    if (bg.type === 'gradient' || bg.type === 'solid') {
      const s3 = sec('颜色与方向');
      s3.appendChild(colorField(bg.type === 'solid' ? '底色' : '主色（起点）', P('background.c1')));
      if (bg.type === 'gradient') {
        s3.appendChild(colorField('副色（终点）', P('background.c2')));
        s3.appendChild(colorField('点缀色', P('background.c3')));
        s3.appendChild(slider('角度', P('background.angle'), 0, 360, 1, (v) => Math.round(v) + '°'));
        s3.appendChild(el('div', { class: 'row mt6' }, [toggleField('柔和光斑（mesh）', P('background.mesh'))]));
      }
      panel.appendChild(s3);
    }
    if (bg.type === 'image') {
      const s4 = sec('背景图片');
      if (bg.image) s4.appendChild(el('img', { src: bg.image, style: { width: '100%', borderRadius: '10px', border: '1px solid var(--line)', display: 'block' } }));
      s4.appendChild(el('div', { class: 'row mt10' }, [
        el('button', { class: 'btn wide', text: bg.image ? '更换图片' : '选择图片', onclick: () => pickFiles('bg') }),
        bg.image ? el('button', { class: 'btn wide danger', text: '移除', onclick: () => { st.background.image = null; commit(); renderPanel(); requestRender(); } }) : null,
      ]));
      s4.appendChild(slider('模糊', P('background.imageBlur'), 0, 40, 0.5, (v) => Math.round(v) + ''));
      s4.appendChild(slider('压暗', P('background.scrim'), 0, 0.8, 0.01, (v) => Math.round(v * 100) + '%'));
      panel.appendChild(s4);
    }
    if (bg.type === 'transparent') {
      const s5 = sec('透明背景');
      s5.appendChild(note('导出 PNG 时保留透明通道，可直接叠到其他设计中。'));
      panel.appendChild(s5);
    }

    const s6 = sec('内容投影');
    s6.appendChild(slider('设备投影强度', P('device.shadow'), 0, 0.7, 0.01, (v) => Math.round(v * 100) + '%'));
    panel.appendChild(s6);
  }

  function paletteFromImage() {
    const m = st.images.main;
    const img = m && WB.imageSync(m.src);
    if (!img) { WB.toast('先导入主图', 'error'); return; }
    const pal = st.palette || WB.extractPalette(img);
    if (!pal) { WB.toast('无法读取图片像素（可能是跨域图片）', 'error'); return; }
    st.palette = pal;
    const v = pal.vivid;
    st.background.c1 = WB.mix(v, '#ffffff', 0.82);
    st.background.c2 = WB.mix(v, '#ffffff', 0.96);
    st.background.c3 = WB.mix(v, '#ffffff', 0.7);
    st.background.type = 'gradient';
    st.background.mesh = true;
    st.accentFromImage = true;
    commit();
    renderPanel(); syncAll(); requestRender();
    WB.toast('已按截图配色生成背景', 'ok');
  }

  /* ---------- 文字 ---------- */
  function panelText(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '文字' }),
      el('p', { text: '标题用回车换行。手动改过任意样式后，切换模板不会再覆盖你的设置。' }),
    ]));

    const s1 = sec('文案');
    s1.appendChild(textField('主标题', P('text.title'), { multiline: true, rows: 2 }));
    s1.appendChild(textField('副标题', P('text.subtitle'), {}));
    s1.appendChild(el('div', { class: 'row wrap mt6' }, [
      toggleField('显示主标题', P('text.show.title')),
      toggleField('显示副标题', P('text.show.subtitle')),
    ]));
    s1.appendChild(segField('文案位置', P('text.pos'), [
      { label: '跟随模板', value: 'auto' },
      { label: '朝上', value: 'top' },
      { label: '朝下', value: 'bottom' },
    ]));
    s1.appendChild(hint('「朝上/朝下」会把整段文案搬到画布上方或下方，设备自动让位到另一侧（错落构图保持不变）。'));
    panel.appendChild(s1);

    const s2 = sec('主标题样式');
    s2.appendChild(selectField('字体', P('text.font'), Object.keys(WB.FONTS).map((k) => ({ value: k, label: WB.FONTS[k].name })), markManual));
    s2.appendChild(slider('字号', P('text.titleSize'), 14, 120, 0.5, (v) => Math.round(v) + '', markManual));
    s2.appendChild(segField('字重', P('text.titleWeight'), [
      { label: '常规', value: 400 }, { label: '中粗', value: 600 }, { label: '粗', value: 700 }, { label: '特粗', value: 800 }, { label: '极粗', value: 900 },
    ], markManual));
    s2.appendChild(slider('行高', P('text.titleLineHeight'), 0.85, 1.8, 0.01, (v) => v.toFixed(2) + '×', markManual));
    s2.appendChild(segField('对齐', P('text.titleAlign'), [
      { label: '左', value: 'left' }, { label: '中', value: 'center' }, { label: '右', value: 'right' },
    ], markManual));
    s2.appendChild(colorField('颜色', P('text.titleColor'), markManual));
    s2.appendChild(slider('文本区宽度', P('text.widthMul'), 0.4, 1, 0.01, (v) => Math.round(v * 100) + '%', markManual));
    panel.appendChild(s2);

    const s3 = sec('副标题样式');
    s3.appendChild(slider('字号', P('text.subtitleSize'), 8, 60, 0.5, (v) => Math.round(v) + '', markManual));
    s3.appendChild(segField('字重', P('text.subtitleWeight'), [
      { label: '常规', value: 400 }, { label: '中粗', value: 600 }, { label: '粗', value: 700 },
    ], markManual));
    s3.appendChild(slider('字间距', P('text.subtitleSpacing'), 0, 12, 0.1, (v) => v.toFixed(1), markManual));
    s3.appendChild(colorField('颜色', P('text.subtitleColor'), markManual));
    s3.appendChild(el('div', { class: 'row wrap mt6' }, [toggleField('转大写', P('text.subtitleUpper'))]));
    s3.appendChild(el('div', { class: 'row wrap mt6' }, [
      toggleField('下划线', P('text.underline')),
      toggleField('下划线用强调色', P('text.underlineAuto')),
    ]));
    const n2 = colorField('下划线颜色', P('text.underlineColor'), markManual);
    if (st.text.underlineAuto !== false) n2.style.opacity = '.45';
    s3.appendChild(n2);
    s3.appendChild(slider('下划线粗细', P('text.underlineW'), 0.5, 14, 0.1, (v) => v.toFixed(1) + ''));
    s3.appendChild(hint('强调色（放大框描边、下划线）默认由背景色推导，或点“跟随截图配色”后跟随截取到的主色。'));
    panel.appendChild(s3);
  }
  function markManual() { st.text.autoStyle = false; }

  /* ---------- 放大镜 ---------- */
  function panelCallout(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '局部放大' }),
      el('p', { text: '框选截图里的任意区域并放大展示，用来突出关键细节。可在画布上直接拖动、缩放。' }),
    ]));

    if (!mainMeta()) {
      panel.appendChild(sec('放大框').appendChild(note('先导入一张截图。')).parentNode);
      return;
    }

    const s1 = sec('放大框列表', [
      el('button', { class: 'link', text: '+ 新建', onclick: addCallout }),
    ]);
    if (!st.callouts.length) s1.appendChild(note('还没有放大框。点右上角「+ 新建」，或在截图里框选后自动生成。'));
    st.callouts.forEach((c, i) => {
      const cv = el('canvas', { class: 'co-thumb', 'data-i': i });
      const item = el('div', { class: 'co-item' + (i === st.active.callout ? ' on' : '') + (c.enabled === false ? ' off' : '') }, [
        cv,
        el('div', { class: 'co-meta' }, [
          el('b', { text: '放大框 ' + (i + 1) + (c.target === 'alt' ? ' · 副图' : '') }),
          el('span', { text: `选区 ${Math.round(c.src.w * 100)}% × ${Math.round(c.src.h * 100)}%` }),
        ]),
        el('button', {
          class: 'co-x', html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
          onclick: (e) => { e.stopPropagation(); st.callouts.splice(i, 1); st.active.callout = Math.min(st.active.callout, st.callouts.length - 1); commit(); renderPanel(); syncAll(); requestRender(); },
        }),
      ]);
      item.addEventListener('click', () => { st.active.callout = i; renderPanel(); requestRender(); });
      s1.appendChild(item);
    });
    panel.appendChild(s1);

    const c = activeCallout();
    if (!c) return;

    const s2 = sec('选区（框选要放大的位置）', [el('button', { class: 'link', text: '精细框选', onclick: openModal })]);
    const wrap = el('div', { class: 'marquee-wrap' });
    const mv = el('canvas');
    wrap.appendChild(mv);
    s2.appendChild(wrap);
    panel.appendChild(s2);
    // 挂载后再测量尺寸
    requestAnimationFrame(() => {
      const w = wrap.clientWidth;
      const meta = c.target === 'alt' && st.images.alt ? st.images.alt : st.images.main;
      const h = clamp(w * (meta.h / meta.w), 120, 380);
      mv.width = 1; mv.height = 1;
      marquees.length = 0;
      const mq = new Marquee(mv, {
        get: () => c.src,
        set: (r, doCommit) => setSrcRect(c, r, doCommit),
        img: () => (c.target === 'alt' && st.images.alt ? st.images.alt : st.images.main),
        lock: () => (c.dest.lock !== false ? (c.dest.w * st.canvas.w) / (c.dest.h * st.canvas.h) : 0),
      });
      mq.setSize(w, h);
      marquees.push(mq);
      mq.paint();
    });

    const nums = ['x', 'y', 'w', 'h'].map((k) => {
      const inp = el('input', { type: 'number', step: '1', value: Math.round(c.src[k] * 100) });
      inp.addEventListener('change', () => {
        c.src[k] = clamp((parseFloat(inp.value) || 0) / 100, 0, 1);
        fixSrc(c);
        commit(); marquees.forEach((m) => m.paint()); requestRender(); syncAll();
      });
      return { k, inp };
    });
    s2.appendChild(el('div', { class: 'num-grid mt10' }, [
      el('div', { class: 'num-cell' }, [el('label', { text: 'X %' }), nums[0].inp]),
      el('div', { class: 'num-cell' }, [el('label', { text: 'Y %' }), nums[1].inp]),
      el('div', { class: 'num-cell' }, [el('label', { text: '宽 %' }), nums[2].inp]),
      el('div', { class: 'num-cell' }, [el('label', { text: '高 %' }), nums[3].inp]),
    ]));
    reg(el('span'), () => { nums.forEach(({ k, inp }) => { if (document.activeElement !== inp) inp.value = Math.round(c.src[k] * 100); }); });
    s2.appendChild(el('div', { class: 'row mt10' }, [
      toggleField('锁定比例', P('calloutLockProxy'), (v) => { c.dest.lock = v; marquees.forEach((m) => m.paint()); }),
      el('button', { class: 'btn mini', text: '适应选区比例', onclick: () => { fitDestToSrc(c); commit(); syncAll(); requestRender(); } }),
    ]));
    s2.appendChild(el('div', { class: 'row mt6' }, [
      el('button', { class: 'btn mini wide', text: '全选整图', onclick: () => { c.src = { x: 0, y: 0, w: 1, h: 1 }; if (c.dest.lock !== false) fitDestToSrc(c); commit(); marquees.forEach((m) => m.paint()); requestRender(); syncAll(); } }),
      el('button', { class: 'btn mini wide', text: '居中 60%', onclick: () => { c.src = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }; fixSrc(c); if (c.dest.lock !== false) fitDestToSrc(c); commit(); marquees.forEach((m) => m.paint()); requestRender(); syncAll(); } }),
    ]));
    // 代理开关的真实读写
    const lockToggle = s2.querySelector('.switch input');
    if (lockToggle) { lockToggle.checked = c.dest.lock !== false; }

    const s3 = sec('放大框外观');
    s3.appendChild(slider('位置 X', PC('x'), -0.2, 1.1, 0.002, (v) => Math.round(v * 100) + '%'));
    s3.appendChild(slider('位置 Y', PC('y'), -0.2, 1.1, 0.002, (v) => Math.round(v * 100) + '%'));
    s3.appendChild(slider('宽度', PC('w'), 0.1, 1.4, 0.002, (v) => Math.round(v * 100) + '%'));
    s3.appendChild(slider('高度', PC('h'), 0.05, 1.4, 0.002, (v) => Math.round(v * 100) + '%'));
    s3.appendChild(slider('旋转', PC('rotate'), -20, 20, 0.1, (v) => v.toFixed(1) + '°'));
    s3.appendChild(slider('圆角', PC('radius'), 0, 60, 0.5, (v) => Math.round(v) + ''));
    s3.appendChild(slider('内边距', PC('pad'), 0, 30, 0.5, (v) => Math.round(v) + ''));
    s3.appendChild(slider('描边粗细', PC('borderW'), 0, 14, 0.25, (v) => (Math.round(v * 100) / 100).toString()));
    s3.appendChild(colorField('描边颜色', PC('borderColor')));
    s3.appendChild(slider('投影强度', PC('shadow'), 0, 0.7, 0.01, (v) => Math.round(v * 100) + '%'));
    s3.appendChild(slider('额外放大', PC('zoom'), 1, 4, 0.05, (v) => v.toFixed(2) + '×'));
    s3.appendChild(segField('填充方式', PC('mode'), [
      { label: '裁切铺满', value: 'cover' }, { label: '完整显示', value: 'contain' }, { label: '拉伸', value: 'stretch' },
    ]));
    s3.appendChild(segField('取图来源', P('calloutTargetProxy'), [
      { label: '主图', value: 'main' }, { label: '副图', value: 'alt' },
    ], () => { c.target = st.calloutTargetProxy; commit(); requestRender(); syncAll(); }));
    s3.appendChild(el('div', { class: 'row mt6' }, [
      el('button', { class: 'btn mini wide', text: '复制一份', onclick: () => { const cc = deepClone(c); cc.id = WB.uid(); cc.dest.x += 0.06; cc.dest.y += 0.06; st.callouts.push(cc); st.active.callout = st.callouts.length - 1; commit(); renderPanel(); syncAll(); requestRender(); } }),
      el('button', { class: 'btn mini wide danger', text: '删除', onclick: () => { st.callouts.splice(st.active.callout, 1); st.active.callout = Math.min(st.active.callout, st.callouts.length - 1); commit(); renderPanel(); syncAll(); requestRender(); } }),
    ]));
    panel.appendChild(s3);

    st.calloutTargetProxy = c.target;
    st.calloutLockProxy = c.dest.lock !== false;
    const tip = sec('提示');
    tip.appendChild(hint('描边颜色留空时自动使用强调色；画布上可拖动放大框移动、拖角缩放；按住 Shift 可自由变形（忽略比例锁）。'));
    panel.appendChild(tip);
  }

  function addCallout() {
    const scene = lastScene || { calloutDefault: { w: st.canvas.w * 0.7, h: st.canvas.w * 0.5, rotate: -1.5, cx: st.canvas.w / 2, cy: st.canvas.h * 0.45 } };
    const c = WB.newCallout(st, scene.calloutDefault);
    st.callouts.push(c);
    st.active.callout = st.callouts.length - 1;
    st.active.sticker = -1;
    st.ui.tab = 'callout';
    commit();
    buildRail(); renderPanel(); syncAll(); requestRender();
  }

  function setSrcRect(c, r, doCommit) {
    c.src = { x: r.x, y: r.y, w: r.w, h: r.h };
    if (doCommit) commit();
    marquees.forEach((m) => m.paint());
    if (modalMarquee) modalMarquee.paint();
    requestRender();
    syncSoft();
  }
  function fixSrc(c) {
    c.src.w = clamp(c.src.w, 0.01, 1);
    c.src.h = clamp(c.src.h, 0.01, 1);
    c.src.x = clamp(c.src.x, 0, 1 - c.src.w);
    c.src.y = clamp(c.src.y, 0, 1 - c.src.h);
  }
  function fitDestToSrc(c) {
    const meta = c.target === 'alt' && st.images.alt ? st.images.alt : st.images.main;
    if (!meta) return;
    const srcAsp = (c.src.w * meta.w) / (c.src.h * meta.h);
    const W = st.canvas.w, H = st.canvas.h;
    const dw = c.dest.w * W;
    const dh = dw / srcAsp;
    c.dest.h = clamp(dh / H, 0.03, 2);
  }

  /* ---------- 标注 ---------- */
  function noteBox(n) {
    const L = WB.noteLayout(measureCtx, st, n, st.canvas.w, st.canvas.h);
    return L;
  }
  function panelNote(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '标注' }),
      el('p', { text: '随手加的气泡文字与小箭头，用来指名道姓地强调某个功能点。可直接在画布上拖动。' }),
    ]));

    const s1 = sec('标注列表', [el('button', { class: 'link', text: '+ 新建', onclick: addNote })]);
    if (!st.notes.length) s1.appendChild(note('还没有标注。点「+ 新建」加一条，例如「① 一键导入」。'));
    st.notes.forEach((n, i) => {
      const item = el('div', { class: 'co-item' + (i === st.active.note ? ' on' : '') }, [
        el('div', { class: 'co-meta', style: { paddingLeft: '4px' } }, [
          el('b', { text: n.text || '（空标注）' }),
          el('span', { text: n.arrow ? '带引线' : '无引线' }),
        ]),
        el('button', {
          class: 'co-x', html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
          onclick: (e) => { e.stopPropagation(); st.notes.splice(i, 1); st.active.note = -1; commit(); renderPanel(); syncAll(); requestRender(); },
        }),
      ]);
      item.addEventListener('click', () => { st.active.note = i; st.active.callout = -1; st.active.sticker = -1; renderPanel(); requestRender(); });
      s1.appendChild(item);
    });
    panel.appendChild(s1);

    const n = activeNote();
    if (!n) return;

    const s2 = sec('内容与样式');
    s2.appendChild(textField('文字', { get: () => n.text, set: (v) => { n.text = v; } }));
    s2.appendChild(slider('字号', { get: () => n.size, set: (v) => { n.size = v; } }, 8, 80, 0.5, (v) => Math.round(v) + ''));
    s2.appendChild(segField('字重', { get: () => n.weight, set: (v) => { n.weight = v; } }, [
      { label: '中粗', value: 600 }, { label: '粗', value: 700 }, { label: '特粗', value: 800 }, { label: '极粗', value: 900 },
    ]));
    s2.appendChild(slider('旋转', { get: () => n.rotate || 0, set: (v) => { n.rotate = v; } }, -45, 45, 0.5, (v) => v.toFixed(1) + '°'));
    s2.appendChild(colorField('文字颜色', { get: () => n.color, set: (v) => { n.color = v; } }));
    s2.appendChild(el('div', { class: 'row wrap mt6' }, [
      toggleField('气泡底色', { get: () => !!n.pill, set: (v) => { n.pill = v; } }, () => { renderPanel(); syncAll(); }),
      toggleField('描边', { get: () => !!n.stroke, set: (v) => { n.stroke = v; } }),
      toggleField('引线', { get: () => !!n.arrow, set: (v) => { n.arrow = v; if (v && n.tx == null) { n.tx = 0.5; n.ty = 0.6; } renderPanel(); syncAll(); } }),
    ]));
    if (n.pill) s2.appendChild(colorField('气泡颜色', { get: () => n.pillColor, set: (v) => { n.pillColor = v; } }));
    if (n.stroke) s2.appendChild(colorField('描边颜色', { get: () => n.strokeColor, set: (v) => { n.strokeColor = v; } }));
    if (n.arrow) s2.appendChild(colorField('引线颜色', { get: () => n.arrowColor, set: (v) => { n.arrowColor = v; } }));
    panel.appendChild(s2);

    const s3 = sec('预设');
    s3.appendChild(el('div', { class: 'row wrap' }, [
      el('button', { class: 'btn mini', text: '强调色气泡 · 白字', onclick: () => { Object.assign(n, { pill: true, pillColor: '', color: '#ffffff', stroke: false }); commit(); renderPanel(); syncAll(); requestRender(); } }),
      el('button', { class: 'btn mini', text: '白底黑字', onclick: () => { Object.assign(n, { pill: true, pillColor: '#ffffff', color: '#14171c', stroke: false }); commit(); renderPanel(); syncAll(); requestRender(); } }),
      el('button', { class: 'btn mini', text: '纯文字', onclick: () => { Object.assign(n, { pill: false, stroke: false, color: '#14171c' }); commit(); renderPanel(); syncAll(); requestRender(); } }),
      el('button', { class: 'btn mini', text: '移入画布内', onclick: () => { clampNoteInside(n); commit(); syncAll(); requestRender(); } }),
    ]));
    s3.appendChild(hint(n.arrow ? '画布上的小圆点就是引线指向的位置，直接拖它。' : '开启「引线」后，可以拖动画布上的小圆点决定指向哪里。'));
    panel.appendChild(s3);
  }

  /* 让气泡整体落在画布内 */
  function clampNoteInside(n) {
    const W = st.canvas.w, H = st.canvas.h;
    const L = WB.noteLayout(measureCtx, st, n, W, H);
    const hw = L.bw / 2 / W + 0.012;
    const hh = L.bh / 2 / H + 0.008;
    n.x = clamp(n.x, hw, 1 - hw);
    n.y = clamp(n.y, hh, 1 - hh);
  }

  function addNote() {
    const W = st.canvas.w, H = st.canvas.h;
    const n = {
      id: WB.uid(), text: '一键搞定', x: 0.3, y: 0.3, size: 26, weight: 800,
      color: '#ffffff', pill: true, pillColor: '', stroke: false, rotate: -3,
      arrow: true, tx: 0.42, ty: 0.44, arrowColor: '',
    };
    const c = activeCallout();
    if (c) { n.x = clamp(c.dest.x - 0.06, 0.14, 0.86); n.y = clamp(c.dest.y - 0.02, 0.08, 0.9); n.tx = c.dest.x + c.dest.w * 0.25; n.ty = c.dest.y + c.dest.h * 0.3; }
    clampNoteInside(n);
    void W; void H;
    st.notes.push(n);
    st.active.note = st.notes.length - 1;
    st.active.callout = -1; st.active.sticker = -1;
    st.ui.tab = 'note';
    commit(); buildRail(); renderPanel(); syncAll(); requestRender();
  }

  /* ---------- 贴纸 ---------- */
  function panelSticker(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '贴纸' }),
      el('p', { text: '加一点表情或图形点缀，直接拖动画布上的贴纸即可移动。' }),
    ]));
    const s1 = sec('选择');
    const grid = el('div', { class: 'sticker-grid' });
    WB.STICKER_PRESETS.forEach((e) => {
      const b = el('button', { text: e });
      b.addEventListener('click', () => addSticker(e));
      grid.appendChild(b);
    });
    s1.appendChild(grid);
    const custom = el('input', { type: 'text', placeholder: '也可以粘贴任意 emoji', maxlength: 4 });
    custom.addEventListener('change', () => { if (custom.value.trim()) { addSticker(custom.value.trim()); custom.value = ''; } });
    s1.appendChild(el('div', { class: 'mt10' }, [custom]));
    panel.appendChild(s1);

    const s2 = sec('当前贴纸');
    const s = activeSticker();
    if (!s) { s2.appendChild(note('还没有贴纸，点上面任意表情即可添加。')); panel.appendChild(s2); return; }
    s2.appendChild(textField('内容', { get: () => s.emoji, set: (v) => { s.emoji = v; } }));
    s2.appendChild(slider('大小', { get: () => s.size, set: (v) => { s.size = v; } }, 8, 200, 1, (v) => Math.round(v) + ''));
    s2.appendChild(slider('旋转', { get: () => s.rotate, set: (v) => { s.rotate = v; } }, -180, 180, 1, (v) => Math.round(v) + '°'));
    s2.appendChild(slider('透明度', { get: () => s.opacity == null ? 1 : s.opacity, set: (v) => { s.opacity = v; } }, 0.1, 1, 0.01, (v) => Math.round(v * 100) + '%'));
    s2.appendChild(el('div', { class: 'row mt6' }, [
      el('button', { class: 'btn mini wide', text: '居中', onclick: () => { s.x = 0.5; s.y = 0.5; commit(); requestRender(); } }),
      el('button', { class: 'btn mini wide danger', text: '删除', onclick: () => { st.stickers.splice(st.active.sticker, 1); st.active.sticker = -1; commit(); renderPanel(); syncAll(); requestRender(); } }),
    ]));
    panel.appendChild(s2);
  }

  function addSticker(emoji) {
    const c = activeCallout();
    const px = c ? c.dest.x + c.dest.w * 0.86 : 0.66;
    const py = c ? c.dest.y + c.dest.h * 0.06 : 0.3;
    const s = {
      id: WB.uid(), emoji,
      x: clamp(px, 0.08, 0.92),
      y: clamp(py, 0.06, 0.94),
      size: 54, rotate: 8, opacity: 1,
    };
    st.stickers.push(s);
    st.active.sticker = st.stickers.length - 1;
    st.active.callout = -1;
    st.ui.tab = 'sticker';
    commit(); buildRail(); renderPanel(); syncAll(); requestRender();
  }

  /* ---------- 导出 ---------- */
  function panelExport(panel) {
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: '导出' }),
      el('p', { text: '渲染按设计坐标重新光栅化，文字与描边在任何倍数下都保持清晰。' }),
    ]));

    const s1 = sec('输出尺寸');
    const ep = curExportPreset();
    const scale = epScale();
    const pxW = Math.round(st.canvas.w * scale);
    const pxH = Math.round(st.canvas.h * scale);
    s1.appendChild(el('div', { class: 'ctl wide' }, [el('select', {
      onchange: (e) => { st.exportCfg.preset = e.target.value; commit(); renderPanel(); syncAll(); },
      html: WB.EXPORT_PRESETS.map((p) => `<option value="${p.id}"${p.id === st.exportCfg.preset ? ' selected' : ''}>${p.name}</option>`).join(''),
    })]));
    s1.appendChild(el('div', { class: 'chip mt10', style: { fontSize: '12px', padding: '6px 10px' }, text: `导出像素：${pxW} × ${pxH}` }));
    if (ep.pxH && Math.abs(pxW / pxH - st.canvas.w / st.canvas.h) > 0.01) {
      s1.appendChild(el('div', { class: 'row mt10' }, [
        el('button', { class: 'btn mini wide', text: `切换画布到 ${ep.name} 比例`, onclick: () => { const cp = WB.CANVAS_PRESETS.find((x) => x.id === ep.canvas); if (cp) setCanvasPreset(cp.id); else WB.toast('该规格需手动设置画布尺寸', 'error'); } }),
      ]));
      s1.appendChild(hint('当前画布比例与目标规格不一致，导出图不会被 App Store 接受。'));
    }
    panel.appendChild(s1);

    const s2 = sec('格式');
    s2.appendChild(segField('', P('exportCfg.format'), [
      { label: 'PNG', value: 'png' }, { label: 'JPEG', value: 'jpeg' }, { label: 'WebP', value: 'webp' },
    ], () => { commit(); renderPanel(); }));
    if (st.exportCfg.format !== 'png') {
      s2.appendChild(slider('画质', P('exportCfg.quality'), 0.5, 1, 0.01, (v) => Math.round(v * 100) + '%'));
      s2.appendChild(hint('JPEG 不支持透明背景，透明区域会被填白。'));
    }
    s2.appendChild(el('div', { class: 'ctl wide' }, [el('label', { text: '文件名前缀' }), el('input', {
      type: 'text', value: st.exportCfg.prefix || 'screenshot',
      oninput: (e) => { st.exportCfg.prefix = e.target.value; },
      onblur: () => commit(),
    })]));
    panel.appendChild(s2);

    const s3 = sec('导出');
    s3.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn primary wide', text: '导出 6.7"', onclick: () => quickExport('appstore67') }),
      el('button', { class: 'btn primary wide', text: '导出 6.5"', onclick: () => quickExport('appstore65') }),
    ]));
    s3.appendChild(hint('快捷导出按 6.7" / 6.5" 规格直接出图，不会改动你正在编辑的画布。'));
    s3.appendChild(el('div', { class: 'mt10' }, [
      el('button', { class: 'btn full', text: '导出当前规格图（' + curExportPreset().name + '）', onclick: exportCurrent }),
    ]));
    s3.appendChild(el('div', { class: 'mt10' }, [
      el('button', { class: 'btn full', text: '批量导出全部模板（ZIP）', onclick: exportAllTemplates }),
    ]));
    s3.appendChild(hint('批量导出会按 8 套模板各出一张图，命名为「序号-模板名」打包下载。'));
    panel.appendChild(s3);

    const s4 = sec('工程');
    s4.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn wide', text: '保存工程', onclick: saveProject }),
      el('button', { class: 'btn wide', text: '打开工程', onclick: () => $('#projectInput').click() }),
    ]));
    s4.appendChild(hint('工程文件（.shot.json）包含截图与全部设置，可下次继续编辑。'));
    panel.appendChild(s4);
  }

  /* 快捷导出：按目标规格临时重排后出图，不改动当前画布与撤销栈 */
  async function quickExport(presetId) {
    if (!mainMeta()) { WB.toast('先导入一张截图', 'error'); return; }
    const ep = WB.EXPORT_PRESETS.find((p) => p.id === presetId);
    if (!ep) return;
    const tmp = deepClone(st);
    const cp = ep.canvas ? WB.CANVAS_PRESETS.find((x) => x.id === ep.canvas) : null;
    // 注意：6.5"/6.7"/6.9" 宽高比极接近，必须按规格 id 判断而不是比例，
    // 否则画布留在原尺寸会导出 1242×2692 这类非标准像素，App Store 会拒。
    if (cp && st.canvas.preset !== cp.id) {
      WB.rescaleDesign(tmp, cp.w / tmp.canvas.w);
      tmp.canvas = { preset: cp.id, w: cp.w, h: cp.h };
    }
    const scale = ep.pxMul ? ep.pxMul : ep.pxW / tmp.canvas.w;
    const fmt = st.exportCfg.format;
    WB.toast('正在导出 ' + ep.name + '…');
    const blob = await WB.exportBlob(tmp, scale, fmt, st.exportCfg.quality);
    if (!blob) { WB.toast('导出失败', 'error'); return; }
    const name = `${st.exportCfg.prefix || 'screenshot'}-${st.template}-${Math.round(tmp.canvas.w * scale)}x${Math.round(tmp.canvas.h * scale)}.${ext(fmt)}`;
    WB.downloadBlob(blob, name);
    WB.toast('已导出 ' + name, 'ok');
  }

  async function exportCurrent() {
    if (!mainMeta()) { WB.toast('先导入一张截图', 'error'); return; }
    const scale = epScale();
    const fmt = st.exportCfg.format;
    const blob = await WB.exportBlob(st, scale, fmt, st.exportCfg.quality);
    if (!blob) { WB.toast('导出失败', 'error'); return; }
    const name = `${st.exportCfg.prefix || 'screenshot'}-${st.template}-${Math.round(st.canvas.w * scale)}x${Math.round(st.canvas.h * scale)}.${ext(fmt)}`;
    WB.downloadBlob(blob, name);
    WB.toast('已导出 ' + name, 'ok');
  }
  const ext = (f) => (f === 'jpeg' ? 'jpg' : f);

  async function exportAllTemplates() {
    if (!mainMeta()) { WB.toast('先导入一张截图', 'error'); return; }
    WB.toast('正在渲染 ' + WB.TEMPLATES.length + ' 套模板…');
    const scale = epScale();
    const fmt = st.exportCfg.format;
    const files = [];
    let failed = 0;
    for (let i = 0; i < WB.TEMPLATES.length; i++) {
      const t = WB.TEMPLATES[i];
      try {
        const tmp = deepClone(st);
        tmp.template = t.id;
        if (tmp.text.autoStyle !== false) Object.assign(tmp.text, WB.templateTextPatch(t, tmp.canvas.w));
        const blob = await WB.exportBlob(tmp, scale, fmt, st.exportCfg.quality);
        if (!blob) { failed++; continue; }
        const buf = new Uint8Array(await blob.arrayBuffer());
        files.push({ name: `${String(i + 1).padStart(2, '0')}-${t.id}.${ext(fmt)}`, data: buf });
      } catch (e) {
        failed++;
        console.warn('模板导出失败', t.id, e);
      }
    }
    if (!files.length) { WB.toast('导出失败，请检查控制台', 'error'); return; }
    const zip = WB.makeZip(files);
    WB.downloadBlob(zip, `${st.exportCfg.prefix || 'screenshot'}-templates.zip`);
    WB.toast('已打包 ' + files.length + ' 张截图' + (failed ? `（${failed} 张失败）` : ''), failed ? 'error' : 'ok');
  }

  /* ---------- 工程 ---------- */
  function saveProject() {
    const blob = new Blob([JSON.stringify(st)], { type: 'application/json' });
    WB.downloadBlob(blob, `${st.exportCfg.prefix || 'screenshot'}.shot.json`);
    WB.toast('工程已保存', 'ok');
  }
  function loadProject(file) {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const obj = JSON.parse(r.result);
        if (!obj || !obj.canvas) throw new Error('bad');
        obj.images = obj.images || { main: null, alt: null };
        for (const k of ['main', 'alt']) {
          const m = obj.images[k];
          if (m && m.src) { await WB.loadImage(m.src); }
        }
        if (obj.background && obj.background.image) await WB.loadImage(obj.background.image);
        st = Object.assign(WB.defaultState(), obj);
        st.ui = Object.assign({ tab: 'media', zoom: 0 }, obj.ui || {});
        st.active = Object.assign({ callout: -1, sticker: -1, note: -1 }, obj.active || {});
        ensureState(st);
        history = []; hIdx = -1;
        pushHistory();
        buildRail(); renderPanel(); syncAll(); updateDropzone(); fitZoom(); requestRender();
        WB.toast('工程已载入', 'ok');
      } catch (e) {
        WB.toast('工程文件解析失败', 'error');
      }
    };
    r.readAsText(file);
  }
  function autosave() {
    try {
      localStorage.setItem(K_STORE, JSON.stringify(st));
    } catch (e) {
      try {
        const c = deepClone(st);
        c.images = { main: null, alt: null };
        c.background.image = null;
        localStorage.setItem(K_STORE, JSON.stringify(c));
      } catch (e2) { /* ignore */ }
    }
  }

  /* ---------- 图片导入 ---------- */
  function pickFiles(role) {
    pendingRole = role;
    const fi = $('#fileInput');
    fi.value = '';
    fi.click();
  }
  let pendingRole = 'main';

  async function addImageFile(file, role) {
    if (!file || !/^image\//.test(file.type)) return;
    role = role || 'main';
    const src = await WB.fileToDataURL(file);
    const img = await WB.loadImage(src);
    if (!img) { WB.toast('图片读取失败', 'error'); return; }
    if (role === 'bg') {
      st.background.image = src;
      st.background.type = 'image';
      commit(); renderPanel(); syncAll(); requestRender();
      return;
    }
    const meta = { src, name: file.name || '粘贴的截图', w: img.naturalWidth, h: img.naturalHeight };
    st.images[role] = meta;
    if (role === 'main') {
      const pal = WB.extractPalette(img);
      if (pal) st.palette = pal;
      if (meta.w < 1170) WB.toast('这张截图宽度 ' + meta.w + 'px，放大区域可能偏糊，建议用原始截图', 'error');
    }
    if (role === 'main' && !st.callouts.length) {
      // 首次导入：按当前模板自动生成一个放大框，方便直接看到效果
      const scene = WB.computeScene(document.createElement('canvas').getContext('2d'), st);
      st.callouts.push(WB.newCallout(st, scene.calloutDefault));
      st.active.callout = 0;
      st.ui.tab = 'callout';
    }
    commit();
    buildRail(); renderPanel(); syncAll(); updateDropzone(); updateStatus(); requestRender();
    WB.toast('已导入截图 ' + meta.w + '×' + meta.h, 'ok');
  }

  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await it.getType(type);
          const f = new File([blob], '剪贴板截图.png', { type });
          await addImageFile(f, st.images.main ? 'alt' : 'main');
          return;
        }
      }
      WB.toast('剪贴板里没有图片', 'error');
    } catch (e) {
      WB.toast('浏览器未授权读取剪贴板，请直接按 ⌘V 粘贴', 'error');
    }
  }

  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          addImageFile(f, st.images.main ? 'alt' : 'main');
          return;
        }
      }
    }
  });

  /* ---------- 拖放 ---------- */
  const stage = $('#stage');
  ['dragenter', 'dragover'].forEach((t) => {
    document.addEventListener(t, (e) => { e.preventDefault(); stage.classList.add('dragging'); if (!mainMeta()) updateDropzone(true); });
  });
  ['dragleave', 'drop'].forEach((t) => {
    document.addEventListener(t, (e) => {
      if (t === 'drop') e.preventDefault();
      if (e.relatedTarget) return;
      stage.classList.remove('dragging');
      updateDropzone();
    });
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) addImageFile(f, mainMeta() ? 'alt' : 'main');
  });

  /* ---------- 框选编辑器 ---------- */
  function Marquee(canvas, o) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = o;
    this.fit = { dw: 1, dh: 1, ox: 0, oy: 0 };
    this.drag = null;
    const self = this;
    canvas.addEventListener('pointerdown', (e) => self.down(e));
    canvas.addEventListener('pointermove', (e) => self.move(e));
    canvas.addEventListener('pointerup', (e) => self.up(e));
    canvas.addEventListener('pointercancel', (e) => self.up(e));
  }
  Marquee.prototype.setSize = function (cssW, cssH) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
    this.cv.width = Math.round(cssW * dpr);
    this.cv.height = Math.round(cssH * dpr);
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    const meta = this.o.img();
    const iw = meta ? meta.w : 1, ih = meta ? meta.h : 1;
    const s = Math.min(cssW / iw, cssH / ih);
    this.fit.dw = iw * s; this.fit.dh = ih * s;
    this.fit.ox = (cssW - this.fit.dw) / 2;
    this.fit.oy = (cssH - this.fit.dh) / 2;
  };
  Marquee.prototype.toPx = function (r) {
    const f = this.fit;
    return { x: f.ox + r.x * f.dw, y: f.oy + r.y * f.dh, w: r.w * f.dw, h: r.h * f.dh };
  };
  Marquee.prototype.toNorm = function (p) {
    const f = this.fit;
    return { x: (p.x - f.ox) / f.dw, y: (p.y - f.oy) / f.dh };
  };
  Marquee.prototype.pt = function (e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  Marquee.prototype.paint = function () {
    const ctx = this.ctx, c = this.cv;
    const meta = this.o.img();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = '#eef0f3';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    const img = meta && WB.imageSync(meta.src);
    const f = this.fit;
    if (img) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, f.ox, f.oy, f.dw, f.dh);
    } else {
      ctx.fillStyle = '#dfe3e8';
      ctx.fillRect(f.ox, f.oy, f.dw, f.dh);
    }
    const r = this.toPx(this.o.get());
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,24,.5)';
    ctx.beginPath();
    ctx.rect(f.ox, f.oy, f.dw, f.dh);
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill('evenodd');
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#12b76a';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#fff';
    [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(([x, y]) => {
      ctx.fillRect(x - 4.5, y - 4.5, 9, 9);
      ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
    });
    ctx.restore();
    // 尺寸提示
    const px = Math.round(this.o.get().w * (meta ? meta.w : 0));
    const py = Math.round(this.o.get().h * (meta ? meta.h : 0));
    ctx.save();
    ctx.fillStyle = 'rgba(20,24,31,.82)';
    ctx.font = '11px -apple-system, sans-serif';
    const label = `${px}×${py}px`;
    const tw = ctx.measureText(label).width + 10;
    ctx.fillRect(f.ox + 6, f.oy + 6, tw, 18);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, f.ox + 11, f.oy + 15.5);
    ctx.restore();
  };
  Marquee.prototype.hit = function (p) {
    const r = this.toPx(this.o.get());
    const tol = 10;
    const cs = [[r.x, r.y, 'tl'], [r.x + r.w, r.y, 'tr'], [r.x, r.y + r.h, 'bl'], [r.x + r.w, r.y + r.h, 'br']];
    for (const [x, y, n] of cs) if (Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol) return n;
    if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return 'move';
    return null;
  };
  Marquee.prototype.down = function (e) {
    const p = this.pt(e);
    this.cv.setPointerCapture(e.pointerId);
    const h = this.hit(p);
    const before = deepClone(this.o.get());
    this.drag = { mode: h || 'new', p0: p, before, orig: before };
    if (this.drag.mode === 'new') {
      const n = this.toNorm(p);
      this.drag.anchor = { x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1) };
      this.drag.orig = { x: this.drag.anchor.x, y: this.drag.anchor.y, w: 0.001, h: 0.001 };
      this.o.set(this.drag.orig, false);
      this.paint();
    }
  };
  Marquee.prototype.move = function (e) {
    const p = this.pt(e);
    if (!this.drag) {
      const h = this.hit(p);
      this.cv.style.cursor = h === 'move' ? 'move' : h ? 'nwse-resize' : 'crosshair';
      return;
    }
    const f = this.fit;
    const dx = (p.x - this.drag.p0.x) / f.dw;
    const dy = (p.y - this.drag.p0.y) / f.dh;
    const o = this.drag.orig;
    const ratio = this.o.lock();
    const meta = this.o.img();
    const normRatio = ratio ? ratio * ((meta ? meta.h : 1) / (meta ? meta.w : 1)) : 0;
    let r;
    if (this.drag.mode === 'move') {
      r = { x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h), w: o.w, h: o.h };
    } else if (this.drag.mode === 'new') {
      const n1 = this.toNorm(p);
      const a = this.drag.anchor;
      let x = Math.min(a.x, n1.x), y = Math.min(a.y, n1.y);
      let w = Math.abs(n1.x - a.x), h = Math.abs(n1.y - a.y);
      if (normRatio && !e.shiftKey && w > 0.001 && h > 0.001) {
        if (w / normRatio > h) h = w / normRatio; else w = h * normRatio;
        if (n1.x < a.x) x = a.x - w;
        if (n1.y < a.y) y = a.y - h;
      }
      r = { x, y, w, h };
    } else {
      const m = this.drag.mode;
      let x = o.x, y = o.y, w = o.w, h = o.h;
      const right = m === 'tr' || m === 'br';
      const bottom = m === 'bl' || m === 'br';
      if (right) w = o.w + dx; else { x = o.x + dx; w = o.w - dx; }
      if (bottom) h = o.h + dy; else { y = o.y + dy; h = o.h - dy; }
      if (w < 0.02) { if (right) w = 0.02; else { x = o.x + o.w - 0.02; w = 0.02; } }
      if (h < 0.02) { if (bottom) h = 0.02; else { y = o.y + o.h - 0.02; h = 0.02; } }
      if (normRatio && !e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) h = w / normRatio; else w = h * normRatio;
        if (!bottom) y = o.y + o.h - h;
        if (!right) x = o.x + o.w - w;
      }
      r = { x, y, w, h };
    }
    r.w = clamp(r.w, 0.02, 1);
    r.h = clamp(r.h, 0.02, 1);
    r.x = clamp(r.x, 0, 1 - r.w);
    r.y = clamp(r.y, 0, 1 - r.h);
    this.o.set(r, false);
    this.paint();
  };
  Marquee.prototype.up = function () {
    if (!this.drag) return;
    const d = this.drag;
    let doCommit = true;
    if (d.mode === 'new') {
      const r = this.o.get();
      if (r.w < 0.03 || r.h < 0.03) { doCommit = false; }
    }
    this.drag = null;
    if (doCommit) this.o.set(this.o.get(), true);
    else this.o.set(d.before, false);
    this.paint();
  };

  /* ---------- 弹窗 ---------- */
  let modalMarquee = null;
  function openModal() {
    const c = activeCallout();
    if (!c) { WB.toast('先新建一个放大框', 'error'); return; }
    $('#modal').classList.add('on');
    $('#modalLock').checked = c.dest.lock !== false;
    const wrap = $('#modalCanvasWrap');
    wrap.innerHTML = '';
    const cv = el('canvas');
    wrap.appendChild(cv);
    const meta = c.target === 'alt' && st.images.alt ? st.images.alt : st.images.main;
    const aspect = meta.h / meta.w;
    const wrapW = Math.min(820, Math.max(260, wrap.clientWidth - 24));
    let cw = wrapW, chh = cw * aspect;
    const maxH = Math.max(300, window.innerHeight * 0.56);
    if (chh > maxH) { chh = maxH; cw = chh / aspect; }
    modalMarquee = new Marquee(cv, {
      get: () => activeCallout().src,
      set: (r, dc) => setSrcRect(activeCallout(), r, dc),
      img: () => meta,
      lock: () => (activeCallout().dest.lock !== false ? (activeCallout().dest.w * st.canvas.w) / (activeCallout().dest.h * st.canvas.h) : 0),
    });
    modalMarquee.setSize(cw, chh);
    modalMarquee.paint();
    painterModalPreview();
  }
  function closeModal() {
    $('#modal').classList.remove('on');
    modalMarquee = null;
    renderPanel();
    syncAll();
    requestRender();
  }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalDone').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#modalLock').addEventListener('change', (e) => {
    const c = activeCallout();
    if (!c) return;
    c.dest.lock = e.target.checked;
    if (c.dest.lock) fitDestToSrc(c);
    commit(); marquees.forEach((m) => m.paint()); requestRender();
  });
  $('#modalSelectAll').addEventListener('click', () => {
    const c = activeCallout();
    if (!c) return;
    c.src = { x: 0, y: 0, w: 1, h: 1 };
    if (c.dest.lock !== false) fitDestToSrc(c);
    commit();
    if (modalMarquee) modalMarquee.paint();
    marquees.forEach((m) => m.paint());
    requestRender();
  });

  /* ---------- 状态 / 空态 ---------- */
  function updateStatus() {
    const W = st.canvas.w, H = st.canvas.h;
    const scale = epScale();
    $('#statusSize').textContent = `${W}×${H} pt · 导出 ${Math.round(W * scale)}×${Math.round(H * scale)} px`;
    const m = st.images.main;
    $('#statusImg').textContent = m ? `主图 ${m.w}×${m.h}` + (st.images.alt ? ' · 副图已就绪' : '') : '未导入截图';
  }
  function updateDropzone(forceOn) {
    $('#dropzone').classList.toggle('on', forceOn === true || !mainMeta());
  }

  /* ---------- 顶栏 / 快捷键 ---------- */
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('清空当前内容并重新开始？')) return;
    const keep = st.canvas;
    st = WB.defaultState();
    st.canvas = keep;
    history = []; hIdx = -1;
    pushHistory();
    buildRail(); renderPanel(); syncAll(); fitZoom(); updateDropzone(); requestRender();
  });
  $('#btnExport').addEventListener('click', () => { st.ui.tab = 'export'; buildRail(); renderPanel(); syncAll(); WB.toast('在左侧面板里选择规格后导出'); });
  $('#btnSaveProject').addEventListener('click', saveProject);
  $('#btnOpenProject').addEventListener('click', () => { $('#projectInput').value = ''; $('#projectInput').click(); });
  $('#zoomIn').addEventListener('click', () => setZoom(zoom * 1.15));
  $('#zoomOut').addEventListener('click', () => setZoom(zoom / 1.15));
  $('#zoomFit').addEventListener('click', fitZoom);
  $('#zoom100').addEventListener('click', () => setZoom(1));
  $('#dzPick').addEventListener('click', () => pickFiles(mainMeta() ? 'alt' : 'main'));
  $('#fileInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f, i) => addImageFile(f, i === 0 ? pendingRole : 'alt'));
    e.target.value = '';
  });
  $('#projectInput').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) loadProject(e.target.files[0]);
    e.target.value = '';
  });

  window.addEventListener('resize', () => { if (zoomMode === 'fit') fitZoom(); else requestRender(); });
  document.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '') + '');
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); exportCurrent(); return; }
    if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) closeModal(); return; }
    if (inField) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (st.active.note >= 0) { st.notes.splice(st.active.note, 1); st.active.note = -1; commit(); renderPanel(); syncAll(); requestRender(); }
      else if (st.active.sticker >= 0) { st.stickers.splice(st.active.sticker, 1); st.active.sticker = -1; commit(); renderPanel(); syncAll(); requestRender(); }
      else if (st.active.callout >= 0) { st.callouts.splice(st.active.callout, 1); st.active.callout = -1; commit(); renderPanel(); syncAll(); requestRender(); }
    }
    const step = e.shiftKey ? 10 : 1;
    if (e.key.startsWith('Arrow')) {
      const c = activeCallout(), s = activeSticker();
      if (!c && !s) return;
      e.preventDefault();
      if (s) {
        if (e.key === 'ArrowLeft') s.x -= step / st.canvas.w;
        if (e.key === 'ArrowRight') s.x += step / st.canvas.w;
        if (e.key === 'ArrowUp') s.y -= step / st.canvas.h;
        if (e.key === 'ArrowDown') s.y += step / st.canvas.h;
      } else {
        if (e.key === 'ArrowLeft') c.dest.x -= step / st.canvas.w;
        if (e.key === 'ArrowRight') c.dest.x += step / st.canvas.w;
        if (e.key === 'ArrowUp') c.dest.y -= step / st.canvas.h;
        if (e.key === 'ArrowDown') c.dest.y += step / st.canvas.h;
      }
      requestRender(); syncSoft();
    }
  });

  /* ---------- 启动 ---------- */
  async function boot() {
    try {
      const raw = localStorage.getItem(K_STORE);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.canvas) {
          st = Object.assign(WB.defaultState(), obj);
          st.ui = Object.assign({ tab: 'media', zoom: 0 }, obj.ui || {});
          st.active = Object.assign({ callout: -1, sticker: -1, note: -1 }, obj.active || {});
          ensureState(st);
          if (st.images.main) await WB.loadImage(st.images.main.src);
          if (st.images.alt) await WB.loadImage(st.images.alt.src);
          if (st.background.image) await WB.loadImage(st.background.image);
        }
      }
    } catch (e) { /* ignore */ }

    history = []; hIdx = -1;
    pushHistory();
    buildRail();
    renderPanel();
    syncAll();
    updateDropzone();
    fitZoom();
    requestRender();

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestRender());
    window.addEventListener('load', () => requestRender());
  }
  boot();
})();
