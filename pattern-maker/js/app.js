/**
 * app.js
 * 画面のフォーム値を読み取り、drafts.js で製図し、render.js で描画する UI 制御。
 */

(() => {
  let activeGarment = 'bodice';
  let skirtStyle = 'straight';
  let dressStyle = 'straight';
  let currentLayout = [];
  let currentOpts = {};

  const AUTO_FORMULAS = {
    backWaistLength: () => num('m-height') * 0.25,
    shoulder: () => num('m-bust') * 0.25 + 17,
    neck: () => num('m-bust') * 0.38 + 2,
    sleeveLength: () => num('m-height') * 0.335,
    upperArm: () => num('m-bust') * 0.34,
  };

  const EASE_PRESETS = {
    fit: { bustEase: 2, waistEase: 0, sleeveEase: 3, wristEase: 2, skirtWaistEase: 0, skirtHipEase: 2 },
    regular: { bustEase: 6, waistEase: 2, sleeveEase: 5, wristEase: 3, skirtWaistEase: 1, skirtHipEase: 4 },
    loose: { bustEase: 12, waistEase: 6, sleeveEase: 8, wristEase: 5, skirtWaistEase: 3, skirtHipEase: 8 },
  };

  function num(id) {
    const el = document.getElementById(id);
    const v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
  }

  function collectMeasurements() {
    return {
      height: num('m-height'),
      bust: num('m-bust'),
      waist: num('m-waist'),
      hip: num('m-hip'),
      backWaistLength: num('m-backWaistLength'),
      shoulder: num('m-shoulder'),
      neck: num('m-neck'),
      hipDepth: num('m-hipDepth'),
      sleeveLength: num('m-sleeveLength'),
      upperArm: num('m-upperArm'),
      wrist: num('m-wrist'),
      skirtLength: num('m-skirtLength'),
      dressSkirtLength: num('m-dressSkirtLength'),
      bustEase: num('e-bustEase'),
      waistEase: num('e-waistEase'),
      sleeveEase: num('e-sleeveEase'),
      wristEase: num('e-wristEase'),
      skirtWaistEase: num('e-skirtWaistEase'),
      skirtHipEase: num('e-skirtHipEase'),
    };
  }

  function collectOpts() {
    return {
      showSA: document.getElementById('opt-showSA').checked,
      saMM: num('opt-saCm') * 10,
      showGrid: document.getElementById('opt-showGrid').checked,
    };
  }

  function layoutPieces(pieces) {
    let cursorX = 0;
    const gap = 40;
    return pieces.map((piece) => {
      const box = Geo.boundingBox([piece.outline]);
      const offset = Geo.pt(cursorX - box.minX, -box.minY);
      cursorX += box.width + gap;
      return { piece, offset };
    });
  }

  function renderPreview() {
    const raw = collectMeasurements();
    const opts = collectOpts();
    const bodice = Drafts.buildBodice(raw);

    let pieces;
    if (activeGarment === 'bodice') {
      pieces = [bodice.back, bodice.front];
    } else if (activeGarment === 'sleeve') {
      const armholeLen = bodice.back.armholeLength + bodice.front.armholeLength;
      const { sleeve } = Drafts.buildSleeve(raw, armholeLen);
      pieces = [sleeve];
    } else if (activeGarment === 'skirt') {
      const skirt = Drafts.buildSkirt(raw, skirtStyle);
      pieces = [skirt.back, skirt.front];
    } else {
      const dress = Drafts.buildDress(raw, dressStyle);
      pieces = [dress.back, dress.front];
    }

    currentLayout = layoutPieces(pieces);
    currentOpts = opts;

    const { svg } = Render.buildSvg(currentLayout, opts);
    svg.setAttribute('style', 'width:100%; height:auto; max-height:72vh; background:#fffdf9;');

    const previewEl = document.getElementById('preview');
    previewEl.innerHTML = '';
    previewEl.appendChild(svg);
  }

  function bindInputs() {
    document
      .querySelectorAll('.sidebar input')
      .forEach((input) => input.addEventListener('input', renderPreview));

    document.querySelectorAll('.auto-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.auto;
        const formula = AUTO_FORMULAS[key];
        if (!formula) return;
        const fieldId = `m-${key}`;
        document.getElementById(fieldId).value = formula().toFixed(1);
        renderPreview();
      });
    });

    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = EASE_PRESETS[btn.dataset.preset];
        Object.entries(preset).forEach(([key, val]) => {
          document.getElementById(`e-${key}`).value = val;
        });
        renderPreview();
      });
    });

    document.querySelectorAll('.tab-btn[data-garment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn[data-garment]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeGarment = btn.dataset.garment;
        document.getElementById('skirt-style-row').hidden = activeGarment !== 'skirt';
        document.getElementById('dress-style-row').hidden = activeGarment !== 'dress';
        renderPreview();
      });
    });

    document.querySelectorAll('input[name="skirtStyle"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        skirtStyle = e.target.value;
        renderPreview();
      });
    });

    document.querySelectorAll('input[name="dressStyle"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        dressStyle = e.target.value;
        renderPreview();
      });
    });

    document.getElementById('btn-print').addEventListener('click', () => {
      PrintTiles.printPieces(currentLayout, currentOpts);
    });

    document.getElementById('btn-export-svg').addEventListener('click', () => {
      Exporter.downloadSvg(currentLayout, currentOpts, `pattern-${activeGarment}.svg`);
    });

    document.getElementById('btn-export-json').addEventListener('click', () => {
      Exporter.downloadMeasurementsJson(collectMeasurements(), 'measurements.json');
    });

    document.getElementById('input-import-json').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          Object.entries(data).forEach(([key, val]) => {
            const isEase = key.endsWith('Ease');
            const fieldId = isEase ? `e-${key}` : `m-${key}`;
            const field = document.getElementById(fieldId);
            if (field && typeof val === 'number') field.value = val;
          });
          renderPreview();
        } catch (err) {
          alert('採寸ファイルの読み込みに失敗しました。JSON形式を確認してください。');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindInputs();
    renderPreview();
  });
})();
