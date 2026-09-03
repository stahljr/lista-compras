/**
 * Gera os icones do PWA sem depender de biblioteca de imagem: rasteriza umas
 * poucas formas e escreve o PNG na mao.
 * Rodar: node tools/gerar-icones.mjs
 *
 * A marca do NaCesta: uma cesta branca sobre azul, e um ponto laranja caindo
 * dentro dela -- o item entrando na cesta, que e o gesto do app inteiro. Cesta
 * e nao carrinho porque o nome e esse, e porque a silhueta da cesta sobrevive
 * melhor aos 48px do atalho na tela de inicio.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const AZUL = [37, 99, 235];
const AZUL_FUNDO = [29, 64, 175];
const LARANJA = [249, 146, 36];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "none"
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Cobertura do pixel por supersampling 3x3, para as bordas nao serrarem. */
function coverage(x, y, inside) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
  return hits / 9;
}

function draw(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = (v) => v * size; // coordenadas em fracao do lado
  const pad = maskable ? 0 : s(0.06);
  const radius = maskable ? 0 : s(0.22);

  const inBackground = (x, y) => {
    if (maskable) return true;
    const l = pad;
    const r = size - pad;
    if (x < l || x > r || y < l || y > r) return false;
    // cantos arredondados
    const cx = Math.min(Math.max(x, l + radius), r - radius);
    const cy = Math.min(Math.max(y, l + radius), r - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 || (x >= l + radius && x <= r - radius) || (y >= l + radius && y <= r - radius);
  };

  // A cesta: trapezio de boca larga, so o contorno, com uma alca em arco.
  const topo = s(0.44);
  const base = s(0.74);
  const bocaEsq = s(0.22);
  const bocaDir = s(0.78);
  const inclinacao = s(0.09);
  const traco = s(0.062);

  const naCesta = (x, y) => {
    if (y < topo || y > base) return false;
    const t = (y - topo) / (base - topo);
    const esq = bocaEsq + t * inclinacao;
    const dir = bocaDir - t * inclinacao;
    if (x < esq || x > dir) return false;
    const dentro = y > topo + traco && y < base - traco && x > esq + traco && x < dir - traco;
    return !dentro;
  };

  // Duas ripas verticais, que e o que faz a silhueta parecer cesta.
  const ripa = (fracao) => (x, y) => {
    if (y < topo + traco * 1.6 || y > base - traco * 1.2) return false;
    const t = (y - topo) / (base - topo);
    const centro = bocaEsq + t * inclinacao + (bocaDir - bocaEsq - 2 * t * inclinacao) * fracao;
    return Math.abs(x - centro) <= s(0.026);
  };
  const ripas = [ripa(0.34), ripa(0.66)];

  const naAlca = (x, y) => {
    if (y > topo + traco / 2) return false;
    const cx = s(0.5);
    const cy = topo;
    const raio = s(0.17);
    const d = Math.hypot(x - cx, y - cy);
    return d >= raio - traco * 0.8 && d <= raio;
  };

  const pontoLaranja = (x, y) => (x - s(0.72)) ** 2 + (y - s(0.26)) ** 2 <= s(0.085) ** 2;

  const naMarca = (x, y) => naCesta(x, y) || naAlca(x, y) || ripas.some((r) => r(x, y));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const bg = coverage(x, y, inBackground);
      const fg = coverage(x, y, naMarca);
      const item = coverage(x, y, pontoLaranja);
      const alpha = Math.max(bg, 0);
      // Fundo em degrade (mais claro em cima), cesta branca, item laranja.
      const q = y / size;
      const mix = (canal) => {
        const fundo = AZUL[canal] * (1 - q) + AZUL_FUNDO[canal] * q;
        const comItem = fundo * (1 - item) + LARANJA[canal] * item;
        return comItem * (1 - fg) + WHITE[canal] * fg;
      };
      px[i] = Math.round(mix(0));
      px[i + 1] = Math.round(mix(1));
      px[i + 2] = Math.round(mix(2));
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, px);
}

const outDir = path.resolve(process.argv[2] || 'web/public');
fs.mkdirSync(outDir, { recursive: true });
for (const [file, size, opts] of [
  ['icone-192.png', 192, {}],
  ['icone-512.png', 512, {}],
  ['icone-apple.png', 180, { maskable: true }],
]) {
  const png = draw(size, opts);
  fs.writeFileSync(path.join(outDir, file), png);
  console.log(`${file} (${size}px, ${(png.length / 1024).toFixed(1)} kB)`);
}
