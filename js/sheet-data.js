// 抹天狼 -MATENRO- Tea & Sweets Cafe
// Googleスプレッドシートの内容をサイトに反映する。
// シートが未共有/読み込み失敗の場合は、index.html に書かれた既定の内容がそのまま表示される
// (フェイルセーフ: このスクリプトは「上書きできたら上書きする」だけ)。

(() => {
  const SHEETS = {
    // 店舗情報シート: key,value 形式
    storeInfo: '1PNuc2e-PoYrmZ3a3JEbBDPVqXBBGOOY7Ibj0-UIiCHQ',
    // サイト文言シート: key,value 形式(見出し・本文・お客様の声など)
    siteText: '1XKFs5faHGa-t2X3AhGIUbDHfvvT-FqiwDziS42yDO2Q',
    // メニューシート: category,name,price,unit,note 形式
    menu: '11cEjHiagWheVKINwyapnzW0RxTal7Pv-LyiU5ozSPZ8',
  };

  const csvUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;

  // シンプルなRFC4180準拠CSVパーサー(引用符内のカンマ・改行に対応)
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        // skip
      } else {
        field += c;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => !(r.length === 1 && r[0] === ''));
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    return rows
      .slice(1)
      .filter((r) => r.some((v) => (v || '').trim() !== ''))
      .map((r) => {
        const obj = {};
        header.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
        return obj;
      });
  }

  async function fetchCSV(id) {
    const res = await fetch(csvUrl(id), { cache: 'no-store' });
    if (!res.ok) throw new Error('sheet fetch failed: ' + res.status);
    const text = await res.text();
    // 共有設定が無効だとGoogleのログインHTMLが返るので、その場合は破棄する
    if (/^\s*<(!DOCTYPE|html)/i.test(text)) throw new Error('sheet not public');
    return rowsToObjects(parseCSV(text));
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // key,value 形式のシート(店舗情報・サイト文言 共通)を data-field 要素へ適用する
  function applyKeyValue(rows) {
    if (!rows.length) return;
    const map = {};
    rows.forEach((r) => { if (r.key) map[r.key] = r.value || ''; });

    document.querySelectorAll('[data-field]').forEach((el) => {
      const key = el.dataset.field;
      if (!(key in map)) return;
      const val = map[key];
      const format = el.dataset.format;

      if (format === 'postal') {
        el.textContent = val ? `〒${val} ` : '';
      } else if (format === 'tel-href') {
        if (val) el.setAttribute('href', 'tel:' + val.replace(/[^0-9+]/g, ''));
      } else if (format === 'href') {
        const wrap = el.tagName === 'A' ? el : el.closest('a');
        if (wrap) {
          if (val) {
            wrap.setAttribute('href', val);
            wrap.style.display = '';
          } else {
            wrap.style.display = 'none';
          }
        }
      } else if (val) {
        // セル内で改行(Shift+Enter)している場合はそのまま<br>として反映する
        el.innerHTML = escapeHtml(val).replace(/\n/g, '<br>');
      }
    });

    // シートが読み込めた時点で「実際の住所に差し替えてください」の注記は不要になる
    const note = document.querySelector('[data-field="address-note"]');
    if (note) note.style.display = 'none';
  }

  function formatPrice(item) {
    let text = '';
    const num = Number(String(item.price || '').replace(/[^\d.]/g, ''));
    if (item.price && !Number.isNaN(num)) {
      text = '¥' + num.toLocaleString('ja-JP');
    } else if (item.price) {
      text = item.price;
    }
    if (item.unit) text += (text ? ' ' : '') + item.unit;
    return text;
  }

  // 写真付きカードにしたいメニュー名 -> 画像情報(既存の生成写真を流用)
  const PHOTO_CARDS = {
    'Matenro アフタヌーンティーセット': {
      src: 'assets/menu-afternoon-tea.jpg',
      alt: '薔薇と月夜の窓辺に並ぶ、3段スタンドのアフタヌーンティーセット',
    },
  };

  function buildMenuCard(item) {
    const photo = PHOTO_CARDS[item.name];
    const card = document.createElement('div');
    card.className = 'menu-card' + (photo ? ' menu-card--wide menu-card--photo' : '');

    if (photo) {
      const img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.alt;
      img.className = 'menu-card-photo';
      img.loading = 'lazy';
      const body = document.createElement('div');
      body.className = 'menu-card-body';
      body.innerHTML = '<h3></h3><p class="menu-desc"></p><p class="menu-price"></p>';
      body.querySelector('h3').textContent = item.name;
      body.querySelector('.menu-desc').textContent = item.note || '';
      body.querySelector('.menu-price').textContent = formatPrice(item);
      card.append(img, body);
    } else {
      const h3 = document.createElement('h3');
      h3.textContent = item.name;
      const desc = document.createElement('p');
      desc.className = 'menu-desc';
      desc.textContent = item.note || '';
      const price = document.createElement('p');
      price.className = 'menu-price';
      price.textContent = formatPrice(item);
      card.append(h3, desc, price);
    }
    return card;
  }

  function applyMenu(rows) {
    const items = rows.filter((r) => r.category && r.name);
    if (!items.length) return;

    const tabsEl = document.querySelector('.menu-tabs');
    const sectionInner = document.querySelector('#menu .section-inner');
    if (!tabsEl || !sectionInner) return;

    const categories = [];
    const byCategory = {};
    items.forEach((item) => {
      if (!byCategory[item.category]) {
        byCategory[item.category] = [];
        categories.push(item.category);
      }
      byCategory[item.category].push(item);
    });

    // 既存(静的)のタブ・パネルを撤去して、シートの内容で作り直す
    sectionInner.querySelectorAll('.menu-panel').forEach((p) => p.remove());
    tabsEl.innerHTML = '';

    const note = sectionInner.querySelector('.menu-note');

    categories.forEach((cat, i) => {
      const slug = 'sheet-cat-' + i;

      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (i === 0 ? ' is-active' : '');
      btn.dataset.tab = slug;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      btn.textContent = cat;
      tabsEl.appendChild(btn);

      const panel = document.createElement('div');
      panel.className = 'menu-panel' + (i === 0 ? ' is-active' : '');
      panel.dataset.panel = slug;
      panel.setAttribute('role', 'tabpanel');
      if (i !== 0) panel.hidden = true;

      const grid = document.createElement('div');
      grid.className = 'menu-grid';
      byCategory[cat].forEach((item) => grid.appendChild(buildMenuCard(item)));
      panel.appendChild(grid);

      sectionInner.insertBefore(panel, note || null);
    });

    // 新しく作られたタブの開閉(main.js は旧ボタンにしか紐づいていないため、ここで束ねる)
    tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const target = btn.dataset.tab;

      tabsEl.querySelectorAll('.tab-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      sectionInner.querySelectorAll('.menu-panel').forEach((p) => {
        const active = p.dataset.panel === target;
        p.classList.toggle('is-active', active);
        p.hidden = !active;
      });
    });
  }

  async function init() {
    const tasks = [
      fetchCSV(SHEETS.storeInfo).then(applyKeyValue).catch((err) => {
        console.warn('店舗情報シートを読み込めませんでした(既定の表示を維持します):', err.message);
      }),
      fetchCSV(SHEETS.siteText).then(applyKeyValue).catch((err) => {
        console.warn('サイト文言シートを読み込めませんでした(既定の表示を維持します):', err.message);
      }),
      fetchCSV(SHEETS.menu).then(applyMenu).catch((err) => {
        console.warn('メニューシートを読み込めませんでした(既定の表示を維持します):', err.message);
      }),
    ];
    await Promise.all(tasks);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
