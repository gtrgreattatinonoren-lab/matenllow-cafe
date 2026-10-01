// build/*.html を A4 の PDF（pdf/*.pdf）に変換する。
// 使い方: python3 build.py && node build_pdf.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const NAMES = {
  '01_nihoncha': '01_日本茶セレクター_教科書',
  '02_pan': '02_手作りパンソムリエ_教科書',
  '03_seika': '03_製菓アドバイザー_教科書',
  '04_cupcake': '04_カップケーキソムリエ_教科書',
  '05_coffee': '05_コーヒーソムリエ_教科書',
};

(async () => {
  const buildDir = path.join(__dirname, 'build');
  const pdfDir = path.join(__dirname, 'pdf');
  fs.mkdirSync(pdfDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const file of fs.readdirSync(buildDir).filter(f => f.endsWith('.html')).sort()) {
    const stem = path.basename(file, '.html');
    await page.goto('file://' + path.join(buildDir, file));
    const out = path.join(pdfDir, (NAMES[stem] || stem) + '.pdf');
    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;text-align:center;font-size:8pt;color:#888;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    console.log('wrote', path.relative(__dirname, out));
  }
  await browser.close();
})();
