/**
 * trace.js
 * PDF型紙をブラウザ内(pdf.js)で読み込み、ページを画像として配置し、
 * その上をなぞって型紙の輪郭(ベクターデータ)を作成する。
 * PDFファイルは一切サーバーへ送信しない。書き出すSVGには元のPDF画像は含まれず、
 * ユーザーがなぞった線(座標データ)のみが含まれる。
 */

(() => {
  const PT_TO_MM = 25.4 / 72;
  const RENDER_SCALE = 2.5; // PDFページをラスタライズする際の解像度倍率

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

  let pages = []; // {id, widthMM, heightMM, offset:{x,y}, dataUrl, visible}
  let paths = []; // {id, label, points:[{x,y}], color}
  let currentPath = null; // {points:[{x,y}]}
  let mode = 'place';
  let viewBox = { x: -20, y: -20, w: 420, h: 300 };
  let opacity = 0.85;
  let dragState = null;
  let calibrating = false;
  let calibPoints = [];
  let nextColorIdx = 0;
  const PATH_COLORS = ['#1f6f5c', '#b3413a', '#2b4c7e', '#8a5a1f', '#6b3e8e', '#2c2420'];

  const svg = document.getElementById('workspace-svg');
  const emptyHint = document.getElementById('workspace-empty-hint');

  function clientToMM(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    return Geo.pt(viewBox.x + relX * viewBox.w, viewBox.y + relY * viewBox.h);
  }

  function mmPerPixel() {
    const rect = svg.getBoundingClientRect();
    return { x: viewBox.w / rect.width, y: viewBox.h / rect.height };
  }

  // ---------------- PDF読み込み ----------------
  async function loadPdf(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const loaded = [];
    let cursorX = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const widthMM = vp1.width * PT_TO_MM;
      const heightMM = vp1.height * PT_TO_MM;
      const vpRender = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vpRender.width);
      canvas.height = Math.round(vpRender.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vpRender }).promise;
      loaded.push({
        id: `page-${i}`,
        pageNum: i,
        widthMM,
        heightMM,
        dataUrl: canvas.toDataURL('image/png'),
        offset: Geo.pt(cursorX, 0),
        visible: true,
      });
      cursorX += widthMM + 10;
    }
    return loaded;
  }

  function fitViewToContent() {
    if (!pages.length) return;
    const box = Geo.boundingBox(
      pages.map((p) => [
        Geo.pt(p.offset.x, p.offset.y),
        Geo.pt(p.offset.x + p.widthMM, p.offset.y + p.heightMM),
      ])
    );
    const pad = Math.max(20, box.width * 0.05);
    viewBox = { x: box.minX - pad, y: box.minY - pad, w: box.width + pad * 2, h: box.height + pad * 2 };
  }

  // ---------------- 描画 ----------------
  function renderWorkspace() {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    svg.classList.toggle('mode-place', mode === 'place');
    svg.classList.toggle('mode-pan', mode === 'pan');

    Render.drawGrid(svg, { minX: viewBox.x, minY: viewBox.y, maxX: viewBox.x + viewBox.w, maxY: viewBox.y + viewBox.h });

    pages.forEach((p) => {
      if (!p.visible) return;
      const img = Render.el('image', {
        x: p.offset.x,
        y: p.offset.y,
        width: p.widthMM,
        height: p.heightMM,
        href: p.dataUrl,
        opacity: opacity,
        'data-page-id': p.id,
        style: 'image-rendering: auto;',
      });
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', p.dataUrl);
      svg.appendChild(img);
      svg.appendChild(
        Render.el('rect', {
          x: p.offset.x,
          y: p.offset.y,
          width: p.widthMM,
          height: p.heightMM,
          fill: 'none',
          stroke: '#999',
          'stroke-width': 0.4,
          'stroke-dasharray': '3,2',
          'pointer-events': 'none',
        })
      );
      svg.appendChild(
        Render.el(
          'text',
          { x: p.offset.x + 2, y: p.offset.y - 2, 'font-size': Math.max(3, viewBox.w * 0.012), fill: '#7a6a5c' },
          `p.${p.pageNum}`
        )
      );
    });

    paths.forEach((path) => {
      svg.appendChild(
        Render.el('path', {
          d: Geo.pointsToPath(path.points, true),
          fill: `${path.color}22`,
          stroke: path.color,
          'stroke-width': Math.max(0.5, viewBox.w * 0.0015),
        })
      );
      if (path.points[0]) {
        svg.appendChild(
          Render.el(
            'text',
            { x: path.points[0].x + 2, y: path.points[0].y - 2, 'font-size': Math.max(3, viewBox.w * 0.012), fill: path.color, 'font-weight': 'bold' },
            path.label
          )
        );
      }
    });

    if (currentPath && currentPath.points.length) {
      svg.appendChild(
        Render.el('path', {
          d: Geo.pointsToPath(currentPath.points, false),
          fill: 'none',
          stroke: '#b3413a',
          'stroke-width': Math.max(0.6, viewBox.w * 0.002),
          'stroke-dasharray': '3,2',
        })
      );
      currentPath.points.forEach((pt, i) => {
        svg.appendChild(
          Render.el('circle', {
            cx: pt.x,
            cy: pt.y,
            r: Math.max(0.8, viewBox.w * 0.003),
            fill: i === 0 ? '#1f6f5c' : '#b3413a',
          })
        );
      });
    }

    if (calibrating && calibPoints.length) {
      calibPoints.forEach((pt) => {
        svg.appendChild(Render.el('circle', { cx: pt.x, cy: pt.y, r: Math.max(1, viewBox.w * 0.004), fill: '#2b4c7e' }));
      });
      if (calibPoints.length === 2) {
        svg.appendChild(
          Render.el('line', {
            x1: calibPoints[0].x,
            y1: calibPoints[0].y,
            x2: calibPoints[1].x,
            y2: calibPoints[1].y,
            stroke: '#2b4c7e',
            'stroke-width': Math.max(0.6, viewBox.w * 0.002),
          })
        );
      }
    }

    emptyHint.classList.toggle('hidden', pages.length > 0);
  }

  function renderPageList() {
    const el = document.getElementById('page-list');
    el.innerHTML = '';
    pages.forEach((p) => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = p.visible;
      cb.addEventListener('change', () => {
        p.visible = cb.checked;
        renderWorkspace();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(`ページ ${p.pageNum} (${p.widthMM.toFixed(0)}×${p.heightMM.toFixed(0)}mm)`));
      el.appendChild(label);
    });
    document.getElementById('pdf-status').textContent = pages.length
      ? `${pages.length}ページ読み込み済み。ドラッグして位置を合わせてください。`
      : 'まだ読み込まれていません。';
  }

  function renderPathList() {
    const el = document.getElementById('path-list');
    el.innerHTML = '';
    if (!paths.length) {
      el.innerHTML = '<p class="hint">まだパーツがありません。</p>';
      return;
    }
    paths.forEach((path, idx) => {
      const row = document.createElement('div');
      row.className = 'path-item';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = path.color;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = path.label;
      input.addEventListener('input', () => {
        path.label = input.value;
        renderWorkspace();
      });
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = '削除';
      del.addEventListener('click', () => {
        paths.splice(idx, 1);
        renderPathList();
        renderWorkspace();
      });
      row.appendChild(swatch);
      row.appendChild(input);
      row.appendChild(del);
      el.appendChild(row);
    });
  }

  // ---------------- パーツ操作 ----------------
  function finalizeCurrentPath() {
    if (!currentPath || currentPath.points.length < 3) {
      currentPath = null;
      renderWorkspace();
      return;
    }
    const color = PATH_COLORS[nextColorIdx % PATH_COLORS.length];
    nextColorIdx++;
    paths.push({
      id: `path-${Date.now()}`,
      label: `パーツ${paths.length + 1}`,
      points: currentPath.points,
      color,
    });
    currentPath = null;
    renderPathList();
    renderWorkspace();
  }

  function scaleAll(ratio) {
    pages.forEach((p) => {
      p.offset = Geo.scale(p.offset, ratio);
      p.widthMM *= ratio;
      p.heightMM *= ratio;
    });
    paths.forEach((p) => {
      p.points = p.points.map((pt) => Geo.scale(pt, ratio));
    });
    if (currentPath) currentPath.points = currentPath.points.map((pt) => Geo.scale(pt, ratio));
    viewBox = { x: viewBox.x * ratio, y: viewBox.y * ratio, w: viewBox.w * ratio, h: viewBox.h * ratio };
  }

  // ---------------- イベント ----------------
  document.getElementById('pdf-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('pdf-status').textContent = '読み込み中...';
    try {
      pages = await loadPdf(file);
      fitViewToContent();
      renderPageList();
      renderWorkspace();
    } catch (err) {
      console.error(err);
      alert('PDFの読み込みに失敗しました。ファイルが破損していないか確認してください。\n' + err.message);
      document.getElementById('pdf-status').textContent = '読み込みに失敗しました。';
    }
    e.target.value = '';
  });

  document.getElementById('opacity-range').addEventListener('input', (e) => {
    opacity = parseFloat(e.target.value);
    renderWorkspace();
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.mode;
      calibrating = false;
      calibPoints = [];
      renderWorkspace();
    });
  });

  document.getElementById('zoom-in').addEventListener('click', () => {
    const cx = viewBox.x + viewBox.w / 2;
    const cy = viewBox.y + viewBox.h / 2;
    viewBox.w *= 0.8;
    viewBox.h *= 0.8;
    viewBox.x = cx - viewBox.w / 2;
    viewBox.y = cy - viewBox.h / 2;
    renderWorkspace();
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    const cx = viewBox.x + viewBox.w / 2;
    const cy = viewBox.y + viewBox.h / 2;
    viewBox.w *= 1.25;
    viewBox.h *= 1.25;
    viewBox.x = cx - viewBox.w / 2;
    viewBox.y = cy - viewBox.h / 2;
    renderWorkspace();
  });
  document.getElementById('zoom-fit').addEventListener('click', () => {
    fitViewToContent();
    renderWorkspace();
  });

  document.getElementById('btn-undo-point').addEventListener('click', () => {
    if (currentPath && currentPath.points.length) currentPath.points.pop();
    updateCurrentPathStatus();
    renderWorkspace();
  });
  document.getElementById('btn-finish-path').addEventListener('click', () => {
    finalizeCurrentPath();
    updateCurrentPathStatus();
  });
  document.getElementById('btn-cancel-path').addEventListener('click', () => {
    currentPath = null;
    updateCurrentPathStatus();
    renderWorkspace();
  });

  document.getElementById('btn-calibrate').addEventListener('click', () => {
    calibrating = true;
    calibPoints = [];
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.mode-btn[data-mode="trace"]').classList.add('active');
    mode = 'trace';
    alert('校正: 実際の長さが分かっている線の両端を、ワークスペース上で2回クリックしてください。');
    renderWorkspace();
  });

  document.getElementById('btn-print').addEventListener('click', () => {
    if (!paths.length) {
      alert('印刷できるパーツがありません。まずトレースしてパーツを確定してください。');
      return;
    }
    const opts = { showSA: document.getElementById('opt-showSA').checked, saMM: parseFloat(document.getElementById('opt-saCm').value || '0') * 10 };
    const piecesWithOffset = paths.map((p) => ({ piece: { id: p.id, label: p.label, outline: p.points }, offset: Geo.pt(0, 0) }));
    PrintTiles.printPieces(piecesWithOffset, opts);
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    if (!paths.length) {
      alert('書き出せるパーツがありません。まずトレースしてパーツを確定してください。');
      return;
    }
    const opts = { showSA: document.getElementById('opt-showSA').checked, saMM: parseFloat(document.getElementById('opt-saCm').value || '0') * 10 };
    const piecesWithOffset = paths.map((p) => ({ piece: { id: p.id, label: p.label, outline: p.points }, offset: Geo.pt(0, 0) }));
    Exporter.downloadSvg(piecesWithOffset, opts, 'traced-pattern.svg');
  });

  function updateCurrentPathStatus() {
    document.getElementById('current-path-status').textContent = `現在なぞっている点: ${
      currentPath ? currentPath.points.length : 0
    }`;
  }

  // ---------------- ワークスペース操作(ドラッグ・ズーム・トレース) ----------------
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = clientToMM(e.clientX, e.clientY);
    const rect = svg.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    viewBox.w *= factor;
    viewBox.h *= factor;
    viewBox.x = before.x - relX * viewBox.w;
    viewBox.y = before.y - relY * viewBox.h;
    renderWorkspace();
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    if (mode === 'trace') {
      const p = clientToMM(e.clientX, e.clientY);
      if (calibrating) {
        calibPoints.push(p);
        if (calibPoints.length === 2) {
          const rawMM = Geo.dist(calibPoints[0], calibPoints[1]);
          const suggestedCm = (rawMM / 10).toFixed(1);
          const input = prompt(`この線の実際の長さ(cm)を入力してください(PDF上の測定値: ${suggestedCm}cm)`, suggestedCm);
          calibrating = false;
          if (input && !isNaN(parseFloat(input)) && parseFloat(input) > 0) {
            const ratio = (parseFloat(input) * 10) / rawMM;
            if (Math.abs(ratio - 1) > 0.001) scaleAll(ratio);
          }
          calibPoints = [];
        }
        renderWorkspace();
        return;
      }
      if (!currentPath) currentPath = { points: [] };
      if (currentPath.points.length > 2) {
        const first = currentPath.points[0];
        const threshold = viewBox.w * 0.012;
        if (Geo.dist(p, first) < threshold) {
          finalizeCurrentPath();
          updateCurrentPathStatus();
          return;
        }
      }
      currentPath.points.push(p);
      updateCurrentPathStatus();
      renderWorkspace();
      return;
    }

    if (mode === 'place') {
      const target = e.target.closest('[data-page-id]');
      if (!target) return;
      const page = pages.find((pg) => pg.id === target.dataset.pageId);
      if (!page) return;
      const mpp = mmPerPixel();
      dragState = {
        type: 'page',
        page,
        startX: e.clientX,
        startY: e.clientY,
        startOffset: { ...page.offset },
        mpp,
      };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    if (mode === 'pan') {
      const mpp = mmPerPixel();
      dragState = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startViewBox: { ...viewBox },
        mpp,
      };
      svg.setPointerCapture(e.pointerId);
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (dragState.type === 'page') {
      dragState.page.offset.x = dragState.startOffset.x + dx * dragState.mpp.x;
      dragState.page.offset.y = dragState.startOffset.y + dy * dragState.mpp.y;
      renderWorkspace();
    } else if (dragState.type === 'pan') {
      viewBox.x = dragState.startViewBox.x - dx * dragState.mpp.x;
      viewBox.y = dragState.startViewBox.y - dy * dragState.mpp.y;
      renderWorkspace();
    }
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
    svg.addEventListener(ev, () => {
      dragState = null;
    })
  );

  renderWorkspace();
})();
