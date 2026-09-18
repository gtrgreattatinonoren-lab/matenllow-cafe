/**
 * render.js
 * パーツ(輪郭・ダーツ・ノッチ・地の目線などを含む)を SVG に描画する。
 * 単位はすべて mm。<svg> の viewBox を mm と同じ数値にしておくことで、
 * 印刷時に width/height を "mm" 指定すれば実寸で出力できる。
 */

const Render = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, text) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function pathD(points, close = true) {
    return Geo.pointsToPath(points, close);
  }

  function drawGrid(group, box, step = 10, majorEvery = 5) {
    const startX = Math.floor(box.minX / step) * step - step * 2;
    const endX = Math.ceil(box.maxX / step) * step + step * 2;
    const startY = Math.floor(box.minY / step) * step - step * 2;
    const endY = Math.ceil(box.maxY / step) * step + step * 2;
    let i = 0;
    for (let x = startX; x <= endX; x += step, i++) {
      const major = i % majorEvery === 0;
      group.appendChild(
        el('line', {
          x1: x,
          y1: startY,
          x2: x,
          y2: endY,
          stroke: major ? '#d9c7b8' : '#efe4da',
          'stroke-width': major ? 0.4 : 0.2,
        })
      );
    }
    i = 0;
    for (let y = startY; y <= endY; y += step, i++) {
      const major = i % majorEvery === 0;
      group.appendChild(
        el('line', {
          x1: startX,
          y1: y,
          x2: endX,
          y2: y,
          stroke: major ? '#d9c7b8' : '#efe4da',
          'stroke-width': major ? 0.4 : 0.2,
        })
      );
    }
  }

  function drawArrowHead(group, tip, dir) {
    const back = Geo.scale(dir, -5);
    const perp = Geo.scale(Geo.perp(dir), 2.2);
    const p1 = Geo.add(Geo.add(tip, back), perp);
    const p2 = Geo.add(Geo.add(tip, back), Geo.scale(perp, -1));
    group.appendChild(
      el('polyline', {
        points: `${p1.x},${p1.y} ${tip.x},${tip.y} ${p2.x},${p2.y}`,
        fill: 'none',
        stroke: '#1f6f5c',
        'stroke-width': 0.7,
      })
    );
  }

  function drawArrowLine(group, from, to, label) {
    const g = el('g', {});
    g.appendChild(el('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: '#1f6f5c', 'stroke-width': 0.7 }));
    drawArrowHead(g, to, Geo.normalize(Geo.sub(to, from)));
    drawArrowHead(g, from, Geo.normalize(Geo.sub(from, to)));
    if (label) {
      const mid = Geo.lerp(from, to, 0.5);
      g.appendChild(
        el('text', { x: mid.x + 3, y: mid.y, 'font-size': 5.5, fill: '#1f6f5c' }, label)
      );
    }
    group.appendChild(g);
  }

  function piecePaths(piece, opts) {
    const g = el('g', { 'data-piece': piece.id });

    if (opts.showGrid) {
      const box = Geo.boundingBox([piece.outline]);
      drawGrid(g, box);
    }

    if (opts.showSA && opts.saMM > 0) {
      const saPts = Geo.offsetClosedPolyline(piece.outline, opts.saMM);
      g.appendChild(
        el('path', {
          d: pathD(saPts, true),
          fill: 'none',
          stroke: '#b3413a',
          'stroke-width': 0.6,
          'stroke-dasharray': '4,2',
        })
      );
    }

    g.appendChild(
      el('path', {
        d: pathD(piece.outline, true),
        fill: 'rgba(255,255,255,0.6)',
        stroke: '#2c2420',
        'stroke-width': 0.9,
      })
    );

    if (piece.centerLine) {
      g.appendChild(
        el('line', {
          x1: piece.centerLine[0].x,
          y1: piece.centerLine[0].y,
          x2: piece.centerLine[1].x,
          y2: piece.centerLine[1].y,
          stroke: '#7a6a5c',
          'stroke-width': 0.5,
          'stroke-dasharray': '6,2,1,2',
        })
      );
    }

    if (piece.grainline) {
      drawArrowLine(g, piece.grainline[0], piece.grainline[1], '布目線');
    }

    if (piece.notches) {
      piece.notches.forEach((n) => {
        g.appendChild(el('circle', { cx: n.x, cy: n.y, r: 1.6, fill: '#b3413a' }));
      });
    }

    if (piece.internalDarts) {
      piece.internalDarts.forEach((dartPts) => {
        g.appendChild(
          el('path', {
            d: pathD(dartPts, true),
            fill: 'rgba(179,65,58,0.06)',
            stroke: '#2c2420',
            'stroke-width': 0.6,
          })
        );
      });
    }

    if (piece.bustPoint) {
      const bp = piece.bustPoint;
      g.appendChild(el('line', { x1: bp.x - 3, y1: bp.y, x2: bp.x + 3, y2: bp.y, stroke: '#1f6f5c', 'stroke-width': 0.6 }));
      g.appendChild(el('line', { x1: bp.x, y1: bp.y - 3, x2: bp.x, y2: bp.y + 3, stroke: '#1f6f5c', 'stroke-width': 0.6 }));
      g.appendChild(el('text', { x: bp.x + 4, y: bp.y - 2, 'font-size': 5, fill: '#1f6f5c' }, 'BP'));
    }

    const box = Geo.boundingBox([piece.outline]);
    g.appendChild(
      el(
        'text',
        {
          x: (box.minX + box.maxX) / 2,
          y: box.minY - 4,
          'font-size': 7,
          'text-anchor': 'middle',
          fill: '#2c2420',
          'font-weight': 'bold',
        },
        piece.label
      )
    );

    return g;
  }

  // pieces: [{piece, offset:{x,y}}]  offset は mm 単位でレイアウト位置
  function buildSvg(piecesWithOffset, opts, viewBoxOverride) {
    const svg = el('svg', { xmlns: SVG_NS });
    const boxes = piecesWithOffset.map(({ piece, offset }) =>
      Geo.boundingBox([piece.outline.map((p) => Geo.add(p, offset))])
    );
    const box = boxes.reduce(
      (acc, b) => ({
        minX: Math.min(acc.minX, b.minX),
        minY: Math.min(acc.minY, b.minY),
        maxX: Math.max(acc.maxX, b.maxX),
        maxY: Math.max(acc.maxY, b.maxY),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    const pad = 15;
    const vb = viewBoxOverride || {
      x: box.minX - pad,
      y: box.minY - pad - 8,
      w: box.maxX - box.minX + pad * 2,
      h: box.maxY - box.minY + pad * 2 + 8,
    };
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

    piecesWithOffset.forEach(({ piece, offset }) => {
      const shifted = {
        ...piece,
        outline: piece.outline.map((p) => Geo.add(p, offset)),
        centerLine: piece.centerLine && piece.centerLine.map((p) => Geo.add(p, offset)),
        grainline: piece.grainline && piece.grainline.map((p) => Geo.add(p, offset)),
        notches: piece.notches && piece.notches.map((p) => Geo.add(p, offset)),
        bustPoint: piece.bustPoint && Geo.add(piece.bustPoint, offset),
        internalDarts:
          piece.internalDarts && piece.internalDarts.map((pts) => pts.map((p) => Geo.add(p, offset))),
      };
      svg.appendChild(piecePaths(shifted, opts));
    });

    return { svg, viewBox: vb };
  }

  return { buildSvg, piecePaths, el, SVG_NS };
})();
