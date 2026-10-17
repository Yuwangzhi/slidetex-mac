import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeInput, renderFormula, makeSvg } from '../lib/render.mjs';

test('600 DPI PNG has alpha, physical resolution, retained source and consistent slide dimensions', async () => {
  const result = await renderFormula({ latex: String.raw`\frac{a}{b}+\sqrt{x^2+1}`, fontSize: 28, dpi: 600 });
  const meta = await sharp(result.png).metadata();
  assert.equal(meta.width, result.width);
  assert.equal(meta.height, result.height);
  assert.equal(meta.density, 600);
  assert.equal(meta.hasAlpha, true);
  assert.ok(result.png.includes(Buffer.from('SlideTeX\0')));
  const { data, info } = await sharp(result.png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0, 'top-left padding must be transparent');
  assert.ok(data.some((v, i) => i % info.channels === 3 && v > 0), 'formula must have visible ink');
  assert.ok(Math.abs(result.width * 72 / 600 - result.widthPt) < 0.13);
});

test('raising DPI quadruples pixels without increasing slide size', async () => {
  const low = makeSvg({ latex: 'E=mc^2', dpi: 300 });
  const high = makeSvg({ latex: 'E=mc^2', dpi: 1200 });
  assert.equal(low.widthPt, high.widthPt);
  assert.equal(low.heightPt, high.heightPt);
  assert.ok(Math.abs(high.width - low.width * 4) <= 3);
});

test('fraction, matrix, cases, multi-line and custom macro render', async () => {
  for (const latex of [String.raw`\frac{\partial\mathcal{L}}{\partial\theta}`, String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}`, String.raw`f(x)=\begin{cases}x^2&x\ge0\\-x&x<0\end{cases}`, String.raw`\begin{aligned}a&=b+c\\d&=e\end{aligned}`, String.raw`\newcommand{\testvec}[1]{\mathbf{#1}}\testvec{x}`]) {
    const result = await renderFormula({ latex, dpi: 300 });
    assert.ok(result.png.length > 500);
    assert.ok(result.width > 50 && result.height > 50);
  }
});

test('macros from one formula cannot affect the next formula', () => {
  makeSvg({ latex: String.raw`\newcommand{\privatemacro}{x}\privatemacro` });
  assert.throws(() => makeSvg({ latex: String.raw`\privatemacro` }), /LaTeX/);
});

test('invalid TeX and oversized requests fail instead of exporting an error image', () => {
  assert.throws(() => makeSvg({ latex: String.raw`\frac{a}{` }), /LaTeX/);
  assert.throws(() => makeSvg({ latex: String.raw`\notARealCommand{x}` }), /LaTeX/);
  assert.throws(() => normalizeInput({ latex: 'x', dpi: 0 }), /DPI/);
  assert.throws(() => normalizeInput({ latex: 'x', fontSize: Infinity }), /字号/);
  assert.throws(() => normalizeInput({ latex: 'x', color: 'url(evil)' }), /颜色/);
  assert.throws(() => normalizeInput({ latex: 'x'.repeat(16001) }), /过长/);
  assert.throws(() => makeSvg({ latex: 'x'.repeat(1000), dpi: 1200, fontSize: 96 }), /尺寸过大/);
});

test('white formula and solid backgrounds remain visible and correctly colored', async () => {
  const result = await renderFormula({ latex: 'x+y', color: '#ffffff', background: 'dark', dpi: 300 });
  const stats = await sharp(result.png).stats();
  assert.equal(stats.isOpaque, true);
  assert.ok(stats.channels[0].max > 240);
  assert.ok(stats.channels[0].min < 30);
});

test('common math delimiters normalize consistently', () => {
  for (const latex of ['$x$', '$$x$$', String.raw`\[x\]`, String.raw`\(x\)`]) assert.equal(normalizeInput({ latex }).latex, 'x');
});
