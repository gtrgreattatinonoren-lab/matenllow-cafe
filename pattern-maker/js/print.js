/**
 * print.js
 * 型紙を実物大でA4用紙に分割印刷するためのタイル分割処理。
 * 各ページを貼り合わせて使う「ポスター印刷」方式。
 * 印刷時は必ずブラウザの印刷設定で「拡大縮小: なし / 100%」にしてください。
 */

const PrintTiles = (() => {
  // A4 (210x297mm) から余白を引いた印刷可能領域の目安
  const PAGE_W = 190; // mm
  const PAGE_H = 270; // mm
  const OVERLAP = 15; // mm タイル間の重なり(のりしろ)

  function computeTiles(box) {
    const stepX = PAGE_W - OVERLAP;
    const stepY = PAGE_H - OVERLAP;
    const cols = Math.max(1, Math.ceil((box.width - OVERLAP) / stepX) || 1);
    const rows = Math.max(1, Math.ceil((box.height - OVERLAP) / stepY) || 1);
    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tiles.push({
          row: r,
          col: c,
          x: box.minX + c * stepX,
          y: box.minY + r * stepY,
          w: PAGE_W,
          h: PAGE_H,
        });
      }
    }
    return { tiles, rows, cols };
  }

  function addCalibrationRuler(svgEl, tile) {
    const y = tile.y + tile.h - 12;
    const x0 = tile.x + 8;
    const g = Render.el('g', {});
    g.appendChild(Render.el('line', { x1: x0, y1: y, x2: x0 + 100, y2: y, stroke: '#000', 'stroke-width': 0.6 }));
    [0, 50, 100].forEach((mmv) => {
      g.appendChild(
        Render.el('line', { x1: x0 + mmv, y1: y - 2, x2: x0 + mmv, y2: y + 2, stroke: '#000', 'stroke-width': 0.6 })
      );
    });
    g.appendChild(
      Render.el('text', { x: x0, y: y - 4, 'font-size': 4.2, fill: '#000' }, '100mm定規(実測して100%印刷か確認)')
    );
    svgEl.appendChild(g);
  }

  function buildPages(masterGroupChildren, box) {
    const { tiles, rows, cols } = computeTiles(box);
    const pages = [];
    tiles.forEach((tile) => {
      const svg = Render.el('svg', {
        xmlns: Render.SVG_NS,
        width: `${tile.w}mm`,
        height: `${tile.h}mm`,
        viewBox: `${tile.x} ${tile.y} ${tile.w} ${tile.h}`,
      });
      masterGroupChildren.forEach((child) => {
        svg.appendChild(child.cloneNode(true));
      });
      // ページ番号ラベルと裁ち合わせ用のふちどり
      svg.appendChild(
        Render.el('rect', {
          x: tile.x + 2,
          y: tile.y + 2,
          width: tile.w - 4,
          height: tile.h - 4,
          fill: 'none',
          stroke: '#999',
          'stroke-width': 0.3,
          'stroke-dasharray': '2,2',
        })
      );
      svg.appendChild(
        Render.el(
          'text',
          { x: tile.x + 6, y: tile.y + 8, 'font-size': 5, fill: '#000', 'font-weight': 'bold' },
          `${tile.row + 1}-${tile.col + 1} / ${rows}x${cols}`
        )
      );
      if (tile.row === 0 && tile.col === 0) addCalibrationRuler(svg, tile);
      pages.push(svg);
    });
    return pages;
  }

  function printPieces(piecesWithOffset, opts) {
    const { svg: masterSvg } = Render.buildSvg(piecesWithOffset, { ...opts, showGrid: false });
    const box = Geo.boundingBox(
      piecesWithOffset.map(({ piece, offset }) => piece.outline.map((p) => Geo.add(p, offset)))
    );
    const padded = {
      minX: box.minX - 10,
      minY: box.minY - 14,
      maxX: box.maxX + 10,
      maxY: box.maxY + 10,
      width: box.width + 20,
      height: box.height + 24,
    };
    const pages = buildPages(Array.from(masterSvg.children), padded);

    const container = document.getElementById('print-area');
    container.innerHTML = '';
    pages.forEach((svg) => {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'print-page';
      pageDiv.appendChild(svg);
      container.appendChild(pageDiv);
    });

    document.body.classList.add('printing');
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => document.body.classList.remove('printing'), 300);
    }, 50);
  }

  return { printPieces, computeTiles, PAGE_W, PAGE_H, OVERLAP };
})();
