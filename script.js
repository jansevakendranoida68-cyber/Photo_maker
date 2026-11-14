/* Passport Photo Maker – all logic runs locally in the browser. */
(() => {
  'use strict';

  /* ===== Configuration ===== */
  const PHOTO_ASPECT = 4 / 5;            // width / height
  const OUTPUT_W = 720, OUTPUT_H = 900;  // 1.2 x 1.5 in at 600 dpi
  const FRAME_HEIGHT_RATIO = 0.88;       // crop frame height relative to stage
  const MAX_ZOOM = 6, MIN_ZOOM = 1;
  const MAX_SOURCE_PX = 4000;            // downscale huge photos for speed
  const MAX_FILE_MB = 40;
  const PHOTOS_PER_PAGE = 36;            // 6 columns x 6 rows
  const CSS_MM_PX = 96 / 25.4;

  /* ===== Element references ===== */
  const $ = (id) => document.getElementById(id);
  const el = {
    file: $('fileInput'), upload: $('uploadBtn'), replace: $('replaceBtn'),
    zoomIn: $('zoomInBtn'), zoomOut: $('zoomOutBtn'), slider: $('zoomSlider'),
    guides: $('guidesToggle'), resetCrop: $('resetCropBtn'), qty: $('quantityInput'),
    generate: $('generateBtn'), previewBtn: $('previewBtn'), print: $('printBtn'),
    resetAll: $('resetAllBtn'), msg: $('message'), stage: $('stage'),
    canvas: $('editorCanvas'), empty: $('emptyState'), live: $('previewCanvas'),
    modal: $('previewModal'), modalBody: document.querySelector('.modal-body'),
    modalPrint: $('modalPrintBtn'), modalClose: $('modalCloseBtn'),
    pages: $('sheetPages'), pageInfo: $('pageInfo'),
  };
  const ctx = el.canvas.getContext('2d');
  const liveCtx = el.live.getContext('2d');

  /* ===== State ===== */
  // cx, cy: the source-image point shown at the centre of the crop frame.
  const state = { source: null, w: 0, h: 0, zoom: 1, cx: 0, cy: 0, sheetReady: false };
  let cssW = 0, cssH = 0, sheetTimer = null;

  /* ===== Messages ===== */
  function showMessage(text, isError = false) {
    el.msg.textContent = text;
    el.msg.classList.toggle('error', isError);
  }

  /* ===== Geometry ===== */
  function frameRect() {
    const fh = cssH * FRAME_HEIGHT_RATIO, fw = fh * PHOTO_ASPECT;
    return { x: (cssW - fw) / 2, y: (cssH - fh) / 2, w: fw, h: fh };
  }
  // Pixels per source pixel; zoom 1 = image just covers the frame.
  function currentScale() {
    const f = frameRect();
    return Math.max(f.w / state.w, f.h / state.h) * state.zoom;
  }
  // Keep the frame fully covered by the image (never blank, never stretched).
  function clampCenter() {
    const f = frameRect(), s = currentScale();
    const halfW = f.w / 2 / s, halfH = f.h / 2 / s;
    state.cx = Math.min(Math.max(state.cx, halfW), state.w - halfW);
    state.cy = Math.min(Math.max(state.cy, halfH), state.h - halfH);
  }
  // Zoom while keeping the image point under (px, py) fixed.
  function zoomAt(newZoom, px, py) {
    if (!state.source) return;
    const f = frameRect(), old = currentScale();
    const ix = state.cx + (px - (f.x + f.w / 2)) / old;
    const iy = state.cy + (py - (f.y + f.h / 2)) / old;
    state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    const s = currentScale();
    state.cx = ix - (px - (f.x + f.w / 2)) / s;
    state.cy = iy - (py - (f.y + f.h / 2)) / s;
    clampCenter();
    el.slider.value = state.zoom;
    scheduleRender();
  }
  function zoomCentered(factor) {
    const f = frameRect();
    zoomAt(state.zoom * factor, f.x + f.w / 2, f.y + f.h / 2);
  }
  function resetCrop() {
    if (!state.source) return;
    state.zoom = 1; state.cx = state.w / 2; state.cy = state.h * 0.45;
    clampCenter();
    el.slider.value = 1;
    scheduleRender();
  }

  /* ===== Rendering ===== */
  let rafId = 0;
  function scheduleRender() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => { drawEditor(); drawLivePreview(); queueSheetRefresh(); });
  }

  function resizeCanvas() {
    const r = el.stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cssW = r.width; cssH = r.height;
    el.canvas.width = Math.round(cssW * dpr); el.canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.source) clampCenter();
    scheduleRender();
  }

  function drawEditor() {
    ctx.clearRect(0, 0, cssW, cssH);
    if (!state.source) return;
    const f = frameRect(), s = currentScale();
    const dx = f.x + f.w / 2 - state.cx * s, dy = f.y + f.h / 2 - state.cy * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.source, dx, dy, state.w * s, state.h * s);
    // Dim everything outside the crop frame.
    ctx.fillStyle = 'rgba(11,31,75,.62)';
    ctx.beginPath(); ctx.rect(0, 0, cssW, cssH); ctx.rect(f.x, f.y, f.w, f.h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(f.x, f.y, f.w, f.h);
    if (el.guides.checked) drawGuides(f);
  }

  function drawGuides(f) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(f.x + f.w / 2, f.y); ctx.lineTo(f.x + f.w / 2, f.y + f.h); ctx.stroke(); // centre line
    ctx.beginPath(); ctx.ellipse(f.x + f.w / 2, f.y + f.h * 0.4, f.w * 0.23, f.h * 0.27, 0, 0, Math.PI * 2); ctx.stroke(); // head
    ctx.beginPath(); ctx.moveTo(f.x, f.y + f.h * 0.8); ctx.lineTo(f.x + f.w, f.y + f.h * 0.8); ctx.stroke(); // shoulders
    ctx.restore();
  }

  // Draw exactly the area inside the crop frame onto any target canvas context.
  function drawCrop(target, outW, outH) {
    const f = frameRect(), s = currentScale();
    const sw = f.w / s, sh = f.h / s;
    target.imageSmoothingQuality = 'high';
    target.fillStyle = '#fff'; target.fillRect(0, 0, outW, outH);
    target.drawImage(state.source, state.cx - sw / 2, state.cy - sh / 2, sw, sh, 0, 0, outW, outH);
  }

  function drawLivePreview() {
    liveCtx.clearRect(0, 0, el.live.width, el.live.height);
    if (state.source) drawCrop(liveCtx, el.live.width, el.live.height);
  }

  /* ===== Photo loading ===== */
  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return showMessage('That file is not an image. Choose a JPG or PNG photo.', true);
    if (file.size > MAX_FILE_MB * 1048576) return showMessage(`The file is larger than ${MAX_FILE_MB} MB. Choose a smaller photo.`, true);
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Downscale very large photos; drawing to canvas also applies EXIF orientation in modern browsers.
      const k = Math.min(1, MAX_SOURCE_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      state.source = c; state.w = c.width; state.h = c.height;
      el.empty.hidden = true; setEnabled(true);
      resizeCanvas(); resetCrop();
      showMessage('Photo loaded. Drag and zoom to frame the head and shoulders.');
    };
    img.onerror = () => { URL.revokeObjectURL(url); showMessage('This image could not be read. Try a JPG or PNG file.', true); };
    img.src = url;
    el.file.value = '';
  }

  function setEnabled(on) {
    [el.replace, el.zoomIn, el.zoomOut, el.slider, el.resetCrop, el.generate].forEach((b) => { b.disabled = !on; });
    if (!on) { el.previewBtn.disabled = true; el.print.disabled = true; }
  }

  /* ===== Pointer interaction (mouse + touch + pinch) ===== */
  const pointers = new Map();
  let pinchDist = 0;
  const localPoint = (e) => { const r = el.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  el.canvas.addEventListener('pointerdown', (e) => {
    if (!state.source) return;
    el.canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPoint(e));
    el.canvas.classList.add('dragging');
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  el.canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId), now = localPoint(e);
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) {
      const s = currentScale();
      state.cx -= (now.x - prev.x) / s; state.cy -= (now.y - prev.y) / s;
      clampCenter(); scheduleRender();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) zoomAt(state.zoom * (d / pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist = d;
    }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); pinchDist = 0; if (!pointers.size) el.canvas.classList.remove('dragging'); };
  el.canvas.addEventListener('pointerup', endPointer);
  el.canvas.addEventListener('pointercancel', endPointer);
  el.canvas.addEventListener('wheel', (e) => {
    if (!state.source) return;
    e.preventDefault();
    const p = localPoint(e);
    zoomAt(state.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), p.x, p.y);
  }, { passive: false });

  /* ===== A4 sheet ===== */
  function getQuantity() {
    const n = Math.round(Number(el.qty.value));
    const q = Math.min(60, Math.max(1, Number.isFinite(n) ? n : 1));
    el.qty.value = q;
    return q;
  }

  function buildSheet() {
    if (!state.source) return;
    const out = document.createElement('canvas');
    out.width = OUTPUT_W; out.height = OUTPUT_H;
    drawCrop(out.getContext('2d'), OUTPUT_W, OUTPUT_H);
    const dataUrl = out.toDataURL('image/jpeg', 0.95); // one identical crop for every copy
    const qty = getQuantity(), pageCount = Math.ceil(qty / PHOTOS_PER_PAGE);
    el.pages.textContent = '';
    for (let p = 0; p < pageCount; p++) {
      const page = document.createElement('div');
      page.className = 'sheet-page';
      const count = Math.min(PHOTOS_PER_PAGE, qty - p * PHOTOS_PER_PAGE);
      for (let i = 0; i < count; i++) {
        const img = document.createElement('img');
        img.className = 'sheet-photo'; img.src = dataUrl; img.alt = 'Passport photo';
        page.appendChild(img);
      }
      el.pages.appendChild(page);
    }
    el.pageInfo.textContent = `A4 sheet · ${qty} photo${qty > 1 ? 's' : ''} · ${pageCount} page${pageCount > 1 ? 's' : ''}`;
    state.sheetReady = true;
    el.previewBtn.disabled = false; el.print.disabled = false;
  }

  // Keep generated copies in sync with later crop edits.
  function queueSheetRefresh() {
    if (!state.sheetReady) return;
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(buildSheet, 250);
  }

  function fitSheetZoom() {
    const avail = el.modalBody.clientWidth - 32, sheetPx = 210 * CSS_MM_PX;
    el.pages.style.setProperty('--sheet-zoom', Math.min(1, avail / sheetPx).toFixed(3));
  }
  function openPreview() {
    if (!state.source) return;
    buildSheet(); fitSheetZoom();
    el.modal.classList.add('open');
  }
  function closePreview() { el.modal.classList.remove('open'); }
  function printSheet() {
    openPreview();
    setTimeout(() => window.print(), 150); // let the sheet lay out first
  }

  /* ===== Reset ===== */
  function resetAll() {
    state.source = null; state.sheetReady = false; state.zoom = 1;
    clearTimeout(sheetTimer);
    el.pages.textContent = ''; el.qty.value = 6; el.slider.value = 1;
    el.empty.hidden = false; setEnabled(false); closePreview();
    scheduleRender(); showMessage('');
  }

  /* ===== Event wiring ===== */
  el.upload.addEventListener('click', () => el.file.click());
  el.replace.addEventListener('click', () => el.file.click());
  el.empty.addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', () => handleFile(el.file.files[0]));
  el.zoomIn.addEventListener('click', () => zoomCentered(1.15));
  el.zoomOut.addEventListener('click', () => zoomCentered(1 / 1.15));
  el.slider.addEventListener('input', () => { const f = frameRect(); zoomAt(Number(el.slider.value), f.x + f.w / 2, f.y + f.h / 2); });
  el.guides.addEventListener('change', scheduleRender);
  el.resetCrop.addEventListener('click', resetCrop);
  el.qty.addEventListener('change', () => { getQuantity(); queueSheetRefresh(); });
  el.generate.addEventListener('click', () => { buildSheet(); showMessage(`Sheet ready: ${el.pageInfo.textContent}. Use Print Preview or Print Sheet.`); });
  el.previewBtn.addEventListener('click', openPreview);
  el.print.addEventListener('click', printSheet);
  el.modalPrint.addEventListener('click', () => window.print());
  el.modalClose.addEventListener('click', closePreview);
  el.resetAll.addEventListener('click', resetAll);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });
  window.addEventListener('resize', () => { resizeCanvas(); if (el.modal.classList.contains('open')) fitSheetZoom(); });

  // Drag-and-drop upload
  ['dragenter', 'dragover'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.remove('drag-over'); }));
  el.stage.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

  resizeCanvas();
})();
