"""教科書の Markdown（src/*.md）を印刷用 HTML（build/*.html）に変換する。

使い方:
    pip install markdown pypdf
    python3 build.py        # HTML を作る
    node build_pdf.js       # HTML から PDF を作る（Playwright + Chromium）
"""
import html
import pathlib
import re

import markdown

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "build"

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
:root { --accent: %(color)s; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "IPAPGothic", "IPAGothic", "Noto Sans JP", sans-serif;
  font-size: 10.5pt; line-height: 1.75; color: #222; background: #fff; margin: 0;
}
.cover {
  height: 257mm; display: flex; flex-direction: column; justify-content: center;
  align-items: flex-start; padding: 0 12mm; border-left: 14mm solid var(--accent);
  page-break-after: always;
}
.cover .label { font-size: 12pt; letter-spacing: .3em; color: var(--accent); margin-bottom: 8mm; }
.cover h1 { font-size: 30pt; line-height: 1.35; margin: 0 0 6mm; border: none; padding: 0; color: #222; }
.cover .sub { font-size: 14pt; color: #555; margin-bottom: 30mm; }
.cover .note { font-size: 9.5pt; color: #666; line-height: 1.8; }
.toc { page-break-after: always; }
.toc h1 { margin-top: 0; }
.toc ol { list-style: none; padding: 0; font-size: 12pt; }
.toc li { padding: 2.2mm 0; border-bottom: 1px dotted #bbb; }
h1 {
  font-size: 18pt; color: var(--accent); border-bottom: 2.5px solid var(--accent);
  padding-bottom: 2mm; margin: 0 0 6mm; page-break-after: avoid;
}
h2 {
  font-size: 13pt; margin: 7mm 0 3mm; padding: 1mm 0 1mm 3mm;
  border-left: 5px solid var(--accent); background: #f6f4f1; page-break-after: avoid;
}
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; page-break-after: avoid; }
p { margin: 2mm 0; }
ul, ol { margin: 2mm 0; padding-left: 6mm; }
li { margin: .8mm 0; }
table {
  width: 100%%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 9.5pt; line-height: 1.55;
  page-break-inside: auto;
}
tr { page-break-inside: avoid; }
th { background: var(--accent); color: #fff; font-weight: bold; text-align: left; }
th, td { border: 1px solid #c9c4bd; padding: 1.2mm 2.2mm; vertical-align: top; }
tbody tr:nth-child(even) td { background: #faf8f6; }
blockquote {
  margin: 4mm 0; padding: 3mm 4mm; border: 1.5px solid var(--accent);
  border-radius: 2mm; background: #fffdf8; page-break-inside: avoid;
}
blockquote p { margin: 1mm 0; }
blockquote ul { margin: 1mm 0; }
strong { color: #111; background: linear-gradient(transparent 62%%, #ffe8a3 62%%); }
th strong { background: none; color: #fff; }
.pagebreak { display: none; }
h1 { break-before: page; }
.cover h1 { break-before: auto; }
"""

COVER_NOTE = (
    "本書は日本安全食料料理協会（JSFCA）の資格試験の出題範囲として紹介されている項目をもとに"
    "作成した独自の学習テキストであり、協会の公式教材ではありません。"
    "試験の日程・受験料・出題形式などは変わることがあるため、受験前に必ず公式サイトで最新情報を確認してください。"
    "<br>作成日：2026年10月1日"
)


def parse(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    meta = dict(line.split(": ", 1) for line in m.group(1).splitlines())
    return meta, text[m.end():]


def build(path):
    meta, body = parse(path)
    body_html = markdown.markdown(body, extensions=["tables", "sane_lists"])
    chapters = re.findall(r"<h1>(.*?)</h1>", body_html)
    toc = "".join(f"<li>{c}</li>" for c in chapters)
    title = html.escape(meta["title"])
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>{title}</title>
<style>{CSS % {"color": meta["color"]}}</style></head>
<body>
<section class="cover">
  <div class="label">STUDY TEXTBOOK</div>
  <h1>{title.replace(" ", "<br>", 1)}</h1>
  <div class="sub">{html.escape(meta["subtitle"])}</div>
  <div class="note">{COVER_NOTE}</div>
</section>
<section class="toc"><h1>目次</h1><ol>{toc}</ol></section>
{body_html}
</body></html>"""


def main():
    OUT.mkdir(exist_ok=True)
    for path in sorted(SRC.glob("*.md")):
        out = OUT / (path.stem + ".html")
        out.write_text(build(path), encoding="utf-8")
        print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
