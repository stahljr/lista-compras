/**
 * Gera os icones do PWA sem depender de biblioteca de imagem: rasteriza umas
 * poucas formas (fundo arredondado + carrinho) e escreve o PNG na mao.
 * Rodar: node tools/gerar-icones.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const TEAL = [15, 118, 110];
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

  // Carrinho: cesta trapezoidal, cabo e duas rodas.
  const basketTop = s(0.4);
  const basketBottom = s(0.66);
  const basketLeft = s(0.28);
  const basketRight = s(0.78);
  const stroke = s(0.055);

  const inBasket = (x, y) => {
    if (y < basketTop || y > basketBottom) return false;
    const t = (y - basketTop) / (basketBottom - basketTop);
    const left = basketLeft + t * s(0.06);
    const right = basketRight - t * s(0.06);
    if (x < left || x > right) return false;
    // so a borda (contorno), nao preenchido
    const inner = y > basketTop + stroke && y < basketBottom - stroke && x > left + stroke && x < right - stroke;
    return !inner;
  };

  const inHandle = (x, y) => {
    // cabo diagonal do canto superior esquerdo ate a cesta
    const x1 = s(0.16);
    const y1 = s(0.3);
    const x2 = basketLeft + s(0.02);
    const y2 = basketTop + stroke / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    const px2 = x1 + t * dx;
    const py2 = y1 + t * dy;
    return (x - px2) ** 2 + (y - py2) ** 2 <= (stroke / 2) ** 2;
  };

  const wheel = (cx, cy) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= s(0.045) ** 2;
  const wheelA = wheel(s(0.4), s(0.76));
  const wheelB = wheel(s(0.66), s(0.76));

  // Tres "produtos" saindo da cesta, para o icone nao ficar so um contorno.
  const bar = (cx, top) => (x, y) => x >= cx - s(0.035) && x <= cx + s(0.035) && y >= top && y <= basketTop;
  const bars = [bar(s(0.4), s(0.3)), bar(s(0.52), s(0.24)), bar(s(0.64), s(0.32))];

  const isCart = (x, y) => inBasket(x, y) || inHandle(x, y) || wheelA(x, y) || wheelB(x, y) || bars.some((b) => b(x, y));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const bg = coverage(x, y, inBackground);
      const fg = coverage(x, y, isCart);
      const alpha = Math.max(bg, 0);
      // carrinho branco sobre o fundo teal
      const mix = (channel) => TEAL[channel] * (1 - fg) + WHITE[channel] * fg;
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
