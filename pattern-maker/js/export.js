/**
 * export.js
 * 現在表示中の型紙パーツを実寸(mm)の SVG ファイルとしてダウンロードする。
 */

const Exporter = (() => {
  function downloadSvg(piecesWithOffset, opts, filename) {
    const { svg, viewBox } = Render.buildSvg(piecesWithOffset, opts);
    svg.setAttribute('width', `${viewBox.w}mm`);
    svg.setAttribute('height', `${viewBox.h}mm`);
    svg.setAttribute('xmlns', Render.SVG_NS);

    const serializer = new XMLSerializer();
    const svgText = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(svg);
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadMeasurementsJson(measurements, filename) {
    const blob = new Blob([JSON.stringify(measurements, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { downloadSvg, downloadMeasurementsJson };
})();
