/**
 * Renders the 3 demo check-in photos into public/demo-photos/ as JPEGs.
 * They are original illustrations (no third-party images), so there are no license questions.
 * Swap in real team photos with the same file names any time; the saved Pl@ntNet/Gemini fixtures are keyed by name.
 *
 *   npm run demo-photos
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const W = 1200;
const H = 900;
const OUT = path.join(process.cwd(), "public", "demo-photos");

// Deterministic pseudo-random so re-running gives identical files.
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function leaf(x: number, y: number, len: number, wid: number, angle: number, fill: string, vein = "#00000033", extra = "") {
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
    <path d="M0 0 C ${len * 0.3} ${-wid}, ${len * 0.75} ${-wid}, ${len} 0 C ${len * 0.75} ${wid}, ${len * 0.3} ${wid}, 0 0 Z" fill="${fill}"/>
    <path d="M0 0 L ${len * 0.95} 0" stroke="${vein}" stroke-width="2"/>${extra}</g>`;
}

function background(r: () => number, hueA: string, hueB: string) {
  const blobs = Array.from({ length: 26 }, () =>
    `<circle cx="${r() * W}" cy="${r() * H}" r="${60 + r() * 160}" fill="${r() > 0.5 ? hueA : hueB}" opacity="${0.25 + r() * 0.35}"/>`).join("");
  return `<rect width="${W}" height="${H}" fill="#3d5a35"/>
    <g filter="url(#blur)">${blobs}</g>
    <rect y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="#6b5338" opacity=".55" filter="url(#blur)"/>`;
}

const defs = `<defs>
  <filter id="blur"><feGaussianBlur stdDeviation="28"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>
  <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/></radialGradient>
</defs>`;

/** Firebush: elliptic leaves in whorls, clusters of tubular red-orange flowers (or green buds). */
function firebush(spotted: boolean) {
  const r = rng(spotted ? 7 : 3);
  const parts: string[] = [background(r, "#7fa05a", "#2f4a2a")];
  // Stems
  for (let i = 0; i < 6; i++) {
    const x = 300 + i * 130 + r() * 40;
    parts.push(`<path d="M${x} ${H} Q ${x + (r() - 0.5) * 160} ${H * 0.55} ${x + (r() - 0.5) * 220} ${120 + r() * 160}" stroke="#7a3b2a" stroke-width="9" fill="none"/>`);
  }
  // Leaves
  for (let i = 0; i < 70; i++) {
    const x = 120 + r() * (W - 240);
    const y = 140 + r() * (H - 220);
    const len = 120 + r() * 90;
    const g = Math.floor(90 + r() * 50);
    const fill = `rgb(${Math.floor(g * 0.55)}, ${g + 30}, ${Math.floor(g * 0.45)})`;
    let spots = "";
    if (spotted && r() < 0.35) {
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const sx = len * (0.2 + r() * 0.6);
        const sy = (r() - 0.5) * 22;
        const sr = 5 + r() * 9;
        spots += `<circle cx="${sx}" cy="${sy}" r="${sr + 6}" fill="#d9c94a" opacity=".75"/><circle cx="${sx}" cy="${sy}" r="${sr}" fill="#5a3a1e"/><circle cx="${sx}" cy="${sy}" r="${sr * 0.4}" fill="#3a2410"/>`;
      }
    }
    parts.push(leaf(x, y, len, 34 + r() * 14, r() * 360, fill, "#ffffff22", spots));
  }
  // Flower or bud clusters
  for (let c = 0; c < (spotted ? 4 : 7); c++) {
    const cx = 220 + r() * (W - 440);
    const cy = 150 + r() * 380;
    for (let k = 0; k < 9; k++) {
      const a = -90 + (r() - 0.5) * 120;
      const len = spotted ? 30 + r() * 18 : 70 + r() * 30;
      const col = spotted ? "#8fae4f" : `hsl(${8 + r() * 10} 85% ${48 + r() * 8}%)`;
      parts.push(`<g transform="translate(${cx + (r() - 0.5) * 60} ${cy + (r() - 0.5) * 40}) rotate(${a})">
        <rect x="0" y="-${spotted ? 6 : 8}" width="${len}" height="${spotted ? 12 : 16}" rx="${spotted ? 6 : 8}" fill="${col}"/>
        ${spotted ? "" : `<circle cx="${len}" cy="0" r="9" fill="hsl(25 90% 58%)"/>`}</g>`);
    }
  }
  return parts.join("");
}

/** Mexican petunia: tall dark stems, narrow lance leaves, purple trumpet flowers. */
function petunia() {
  const r = rng(11);
  const parts: string[] = [background(r, "#6f8f52", "#33452d")];
  for (let i = 0; i < 14; i++) {
    const x = 80 + i * 80 + r() * 30;
    const top = 80 + r() * 200;
    parts.push(`<path d="M${x} ${H} L ${x + (r() - 0.5) * 60} ${top}" stroke="#4a2f45" stroke-width="7"/>`);
    for (let k = 0; k < 6; k++) {
      const y = top + 60 + k * ((H - top) / 7);
      parts.push(leaf(x, y, 150 + r() * 60, 13, (k % 2 ? 1 : -1) * (25 + r() * 30) + (k % 2 ? 0 : 180), `rgb(${50 + r() * 20}, ${100 + r() * 30}, ${55 + r() * 15})`, "#ffffff22"));
    }
  }
  for (let f = 0; f < 16; f++) {
    const x = 120 + r() * (W - 240);
    const y = 120 + r() * 420;
    const s = 46 + r() * 22;
    const petals = Array.from({ length: 5 }, (_, i) => `<ellipse cx="0" cy="${-s * 0.55}" rx="${s * 0.42}" ry="${s * 0.55}" transform="rotate(${i * 72})" fill="hsl(${272 + r() * 10} 55% ${52 + r() * 8}%)"/>`).join("");
    parts.push(`<g transform="translate(${x} ${y}) rotate(${r() * 72})">${petals}<circle r="${s * 0.22}" fill="#3a1f52"/><circle r="${s * 0.1}" fill="#f2f0e6"/></g>`);
  }
  return parts.join("");
}

async function render(name: string, body: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}<g filter="url(#soft)">${body}</g><rect width="${W}" height="${H}" fill="url(#vig)"/></svg>`;
  const file = path.join(OUT, `${name}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
  console.log("wrote", path.relative(process.cwd(), file), `${Math.round(fs.statSync(file).size / 1024)} KB`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await render("healthy_firebush", firebush(false));
  await render("spotted_firebush", firebush(true));
  await render("mexican_petunia", petunia());
}

main();
