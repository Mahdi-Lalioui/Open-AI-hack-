/**
 * Draws a Blueprint from the front (looking along +Y, X right, Z up) as a PNG, with no GPU or browser.
 * The AI compares this picture with the user's sketch, so it sees what it actually built.
 */
import { deflateSync } from 'node:zlib';
import { designBounds, worldMesh } from '../../shared/blueprint/geometry';
import { hexToRgb } from '../../shared/blueprint/export';
import type { DesignBlueprint } from '../../shared/blueprint/types';

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

export function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    rows[row] = 0;
    rows.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), row + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function renderFrontView(bp: DesignBlueprint, size = 512): Buffer {
  const rgb = new Uint8Array(size * size * 3).fill(255);
  const depth = new Float64Array(size * size).fill(Infinity);
  const bounds = designBounds(bp.components);
  const spanX = bounds.max.x - bounds.min.x || 1;
  const spanZ = bounds.max.z - bounds.min.z || 1;
  const margin = size * 0.08;
  const scale = (size - margin * 2) / Math.max(spanX, spanZ);
  const midX = (bounds.min.x + bounds.max.x) / 2;
  const midZ = (bounds.min.z + bounds.max.z) / 2;
  const colors = new Map(bp.materials.map((m) => [m.id, hexToRgb(m.color)]));

  for (const c of bp.components) {
    const m = worldMesh(c);
    const color = colors.get(c.materialId) ?? [0.6, 0.6, 0.6];
    const p = m.positions;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, d] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
      const sx = (i: number) => size / 2 + (p[i] - midX) * scale;
      const sy = (i: number) => size / 2 - (p[i + 2] - midZ) * scale;
      const [ax, ay, bx, by, dx, dy] = [sx(a), sy(a), sx(b), sy(b), sx(d), sy(d)];
      const area = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      if (Math.abs(area) < 1e-6) continue;
      // Light from the front and a little above, so form still reads in a flat view.
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const shade = 0.55 + 0.45 * Math.max(0, (-ny * 0.8 + nz * 0.5 + nx * 0.2) / len);
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, dx)));
      const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx, dx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, dy)));
      const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by, dy)));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const w0 = ((bx - x) * (dy - y) - (by - y) * (dx - x)) / area;
          const w1 = ((dx - x) * (ay - y) - (dy - y) * (ax - x)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * p[a + 1] + w1 * p[b + 1] + w2 * p[d + 1];
          const at = y * size + x;
          if (z >= depth[at]) continue;
          depth[at] = z;
          rgb[at * 3] = Math.round(color[0] * shade * 255);
          rgb[at * 3 + 1] = Math.round(color[1] * shade * 255);
          rgb[at * 3 + 2] = Math.round(color[2] * shade * 255);
        }
      }
    }
  }
  return encodePng(rgb, size, size);
}
