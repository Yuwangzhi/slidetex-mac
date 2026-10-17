import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderFormula } from '../lib/render.mjs';
import { fileURLToPath } from 'node:url';
const icons = new URL('../web/assets/', import.meta.url);
await mkdir(icons, { recursive: true });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="38" fill="#425bd1"/><path d="M112 39H49v7l34 34-34 35v7h65v-13H69l30-29-29-28h42z" fill="#fff"/></svg>';
for (const size of [16, 32, 80]) await sharp(Buffer.from(svg)).resize(size, size).png().toFile(fileURLToPath(new URL(`icon-${size}.png`, icons)));
const examples = new URL('../validation/samples/', import.meta.url);
await mkdir(examples, { recursive: true });
for (const [name, latex] of Object.entries({
  einstein: 'E=mc^2',
  fraction: String.raw`\frac{\partial\mathcal{L}}{\partial\theta}=\frac1N\sum_{i=1}^N\nabla_\theta\ell_i`,
  matrix: String.raw`\mathbf{A}=\begin{bmatrix}a_{11}&a_{12}\\a_{21}&a_{22}\end{bmatrix}`,
  aligned: String.raw`\begin{aligned}\mathcal{L}&=\mathcal{L}_{\mathrm{pred}}+\lambda\mathcal{L}_{\mathrm{reg}}\\\theta_{t+1}&=\theta_t-\eta\nabla_\theta\mathcal{L}\end{aligned}`,
})) {
  const result = await renderFormula({ latex, fontSize: 28, dpi: 600 });
  await writeFile(new URL(`${name}-600dpi.png`, examples), result.png);
  await writeFile(new URL(`${name}.svg`, examples), result.svg);
}
