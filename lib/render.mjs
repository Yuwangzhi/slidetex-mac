import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import sharp from 'sharp';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const packages = AllPackages.filter(p => !['require', 'autoload', 'html', 'noerrors', 'noundefined'].includes(p));

export function normalizeInput(input) {
  if (!input || typeof input.latex !== 'string') throw new Error('请输入 LaTeX 公式。');
  let latex = input.latex.trim();
  for (const [left, right] of [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]) {
    if (latex.startsWith(left) && latex.endsWith(right) && latex.length > left.length + right.length) {
      latex = latex.slice(left.length, -right.length).trim();
      break;
    }
  }
  if (!latex) throw new Error('请输入 LaTeX 公式。');
  if (latex.length > 16000) throw new Error('公式过长，请控制在 16000 个字符以内。');
  if (/\\(?:documentclass|usepackage|begin\s*\{document\}|input|include|write18)\b/.test(latex)) {
    throw new Error('请输入数学公式片段；这里不编译完整的 .tex 文档。');
  }
  const fontSize = Number(input.fontSize ?? 28);
  const dpi = Number(input.dpi ?? 600);
  const color = input.color ?? '#111827';
  const background = input.background ?? 'transparent';
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 96) throw new Error('字号应在 8–96 pt 之间。');
  if (![300, 600, 1200].includes(dpi)) throw new Error('请选择 300、600 或 1200 DPI。');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('请选择有效的公式颜色。');
  if (!['transparent', 'white', 'dark'].includes(background)) throw new Error('背景设置无效。');
  return { latex, fontSize, dpi, color, background, display: input.display !== false };
}

export function makeSvg(input) {
  const settings = normalizeInput(input);
  const tex = new TeX({
    packages,
    maxBuffer: 32000,
    maxMacros: 1500,
    formatError: (_jax, error) => { throw new Error(error.message); },
  });
  // A fresh TeX instance isolates custom macros and equation counters between requests.
  const document = mathjax.document('', { InputJax: tex, OutputJax: new SVG({ fontCache: 'none' }) });
  let node;
  try {
    node = document.convert(settings.latex, { display: settings.display, em: 16, ex: 8, containerWidth: 1280 });
  } catch (error) {
    throw new Error(`LaTeX 无法解析：${error.message}`);
  }
  let svg = adaptor.outerHTML(adaptor.firstChild(node));
  if (svg.includes('data-mjx-error')) throw new Error('LaTeX 无法解析，请检查命令与括号。');
  const match = svg.match(/viewBox="([^"]+)"/);
  if (!match) throw new Error('公式没有可导出的内容。');
  const [x, y, w, h] = match[1].split(/\s+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error('公式没有可导出的内容。');
  const padPt = 3;
  const pad = padPt * 1000 / settings.fontSize;
  const widthPt = w / 1000 * settings.fontSize + padPt * 2;
  const heightPt = h / 1000 * settings.fontSize + padPt * 2;
  const width = Math.ceil(widthPt * settings.dpi / 72);
  const height = Math.ceil(heightPt * settings.dpi / 72);
  if (width > 30000 || height > 30000 || width * height > 40000000) {
    throw new Error('图片尺寸过大，请降低字号或 DPI，或拆成多个公式。');
  }
  // Only remove attributes on the outer svg, never on formula paths or nested elements.
  svg = svg.replace(/^<svg\b[^>]*>/, tag => tag.replace(/\s(?:width|height|style|role|focusable|aria-hidden)="[^"]*"/g, ''));
  svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"`)
    .replace('<svg ', `<svg width="${widthPt}pt" height="${heightPt}pt" color="${settings.color}" `);
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  return { svg, width, height, widthPt, heightPt, settings };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function embedSource(png, source) {
  // Uncompressed UTF-8 iTXt retains the editable formula inside the PNG itself.
  const type = Buffer.from('iTXt');
  const data = Buffer.concat([Buffer.from('SlideTeX\0\0\0\0\0'), Buffer.from(JSON.stringify(source), 'utf8')]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), data.length + 8);
  return Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]);
}

export async function renderFormula(input) {
  const result = makeSvg(input);
  // Rasterize directly at the requested pixel dimensions. SVG physical units plus
  // a density option are interpreted differently by librsvg versions.
  const rasterSvg = result.svg.replace(/^<svg\b[^>]*>/, tag => tag
    .replace(/width="[^"]*"/, `width="${result.width}"`)
    .replace(/height="[^"]*"/, `height="${result.height}"`));
  let image = sharp(Buffer.from(rasterSvg), { density: 72, limitInputPixels: 40000000 });
  if (result.settings.background !== 'transparent') {
    image = image.flatten({ background: result.settings.background === 'white' ? '#ffffff' : '#111827' });
  }
  const png = await image.png().withMetadata({ density: result.settings.dpi }).toBuffer();
  return { ...result, png: embedSource(png, { version: 1, ...result.settings }) };
}
