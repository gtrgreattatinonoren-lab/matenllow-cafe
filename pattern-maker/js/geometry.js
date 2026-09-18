/**
 * geometry.js
 * 型紙作成に使う最低限のベクトル演算・曲線サンプリング・輪郭オフセット(縫い代)処理。
 * 単位はすべて mm(ミリメートル)で統一する。
 */

const Geo = (() => {
  function pt(x, y) {
    return { x, y };
  }

  function add(a, b) {
    return pt(a.x + b.x, a.y + b.y);
  }

  function sub(a, b) {
    return pt(a.x - b.x, a.y - b.y);
  }

  function scale(a, s) {
    return pt(a.x * s, a.y * s);
  }

  function lerp(a, b, t) {
    return pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }

  function length(a) {
    return Math.hypot(a.x, a.y);
  }

  function dist(a, b) {
    return length(sub(a, b));
  }

  function normalize(a) {
    const l = length(a);
    if (l < 1e-9) return pt(0, 0);
    return pt(a.x / l, a.y / l);
  }

  // 90度回転(法線ベクトル用)
  function perp(a) {
    return pt(-a.y, a.x);
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  // 3次ベジェ曲線を steps 個の点にサンプリングする(両端点を含む)
  function sampleCubic(p0, p1, p2, p3, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x =
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x;
      const y =
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y;
      pts.push(pt(x, y));
    }
    return pts;
  }

  // 2次ベジェ曲線を steps 個の点にサンプリングする(両端点を含む)
  function sampleQuad(p0, p1, p2, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
      const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
      pts.push(pt(x, y));
    }
    return pts;
  }

  function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
    return total;
  }

  // 点列(閉じた輪郭)を法線方向に distance だけオフセットする簡易実装。
  // 縫い代(SA)付与のための近似処理で、極端な凹み角では多少歪む場合がある。
  function offsetClosedPolyline(points, distance) {
    const n = points.length;
    if (n < 3 || distance === 0) return points.map((p) => pt(p.x, p.y));

    const edgeNormals = [];
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const dir = normalize(sub(b, a));
      // 輪郭は時計回りを想定し、外向き法線 = 進行方向を右回りに90度回転
      edgeNormals.push(pt(dir.y, -dir.x));
    }

    const out = [];
    for (let i = 0; i < n; i++) {
      const prevN = edgeNormals[(i - 1 + n) % n];
      const curN = edgeNormals[i];
      let avg = pt(prevN.x + curN.x, prevN.y + curN.y);
      const avgLen = length(avg);
      if (avgLen < 1e-6) {
        avg = curN;
      } else {
        // 鋭角部分で伸びすぎないよう補正(マイター長を制限)
        const cos = Math.max(-0.98, Math.min(0.98, (prevN.x * curN.x + prevN.y * curN.y)));
        const miter = 1 / Math.sqrt((1 + cos) / 2);
        avg = scale(normalize(avg), Math.min(miter, 2.2));
      }
      out.push(add(points[i], scale(normalize(avg), distance)));
    }
    return out;
  }

  function pointsToPath(points, close) {
    if (!points.length) return '';
    let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)} `;
    for (let i = 1; i < points.length; i++) {
      d += `L ${points[i].x.toFixed(2)},${points[i].y.toFixed(2)} `;
    }
    if (close) d += 'Z';
    return d;
  }

  function boundingBox(pointsList) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    pointsList.forEach((points) => {
      points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  // 与えられた「切れ目(ダーツ/ノッチ)なし」の直線区間 A→B の途中に
  // 幅 width のダーツ(またはフレア)を差し込んだ点列を返す。
  // reductionAtPoint: 0〜1 (A→Bの間でどの位置に頂点を置くか)
  function insertWedge(a, b, wedgeStartT, wedgeEndT, apex) {
    const start = lerp(a, b, wedgeStartT);
    const end = lerp(a, b, wedgeEndT);
    return [start, apex, end];
  }

  return {
    pt,
    add,
    sub,
    scale,
    lerp,
    length,
    dist,
    normalize,
    perp,
    toRad,
    sampleCubic,
    sampleQuad,
    polylineLength,
    offsetClosedPolyline,
    pointsToPath,
    boundingBox,
    insertWedge,
  };
})();
