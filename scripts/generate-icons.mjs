import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/** PNG minimal sans dépendance (icônes générées au build). */
function writePng(path, size, rgbaFn) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgbaFn(x, y, size);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tag, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const type = Buffer.from(tag);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
    return Buffer.concat([len, type, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

function color(x, y, s) {
  const nx = (x + 0.5) / s;
  const ny = (y + 0.5) / s;
  const pad = 0.08;
  if (nx < pad || ny < pad || nx > 1 - pad || ny > 1 - pad) {
    const cx = Math.min(Math.max(nx, pad), 1 - pad);
    const cy = Math.min(Math.max(ny, pad), 1 - pad);
    if ((nx - cx) ** 2 + (ny - cy) ** 2 > pad * pad) return [0, 0, 0, 0];
  }
  if (ny > 0.32 && ny < 0.42 && nx > 0.22 && nx < 0.72) return [255, 255, 255, 255];
  if (ny > 0.58 && ny < 0.68 && nx > 0.28 && nx < 0.78) return [255, 255, 255, 255];
  return [31, 107, 74, 255];
}

/** @param {string} outDir */
export function generateIcons(outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const s of [16, 32, 48, 128]) {
    writePng(join(outDir, `icon-${s}.png`), s, color);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateIcons(join(process.cwd(), 'icons'));
  console.log('icons OK');
}
