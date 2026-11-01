/**
 * Deterministic exporters. Each one takes a validated Blueprint and returns a real file:
 * OpenSCAD source, binary STL, GLB (with animation), Blueprint JSON, a web component and a product page.
 */
import {
  CURVE_SEGMENTS, cleanOutline, clipPhase, clipPose, designVolumeMm3, multiplyQuaternions, primitiveMesh, rotationQuaternion,
  strokeSegments, toRenderMesh, worldMesh,
} from './geometry';
import type { BlueprintComponent, DesignBlueprint } from './types';
import { WEB_VIEWER_RUNTIME } from './webRuntime';

export const EXPORT_FORMATS = {
  scad: { label: 'OpenSCAD (parametric CAD)', extension: 'scad', mime: 'text/plain; charset=utf-8' },
  stl: { label: 'STL (3D printing)', extension: 'stl', mime: 'model/stl' },
  glb: { label: 'GLB (3D model + animation)', extension: 'glb', mime: 'model/gltf-binary' },
  webComponent: { label: 'Web component (.js)', extension: 'js', mime: 'text/javascript; charset=utf-8' },
  webPage: { label: 'Product page (.html)', extension: 'html', mime: 'text/html; charset=utf-8' },
  blueprint: { label: 'Design Blueprint (.json)', extension: 'json', mime: 'application/json' },
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;

export function fileBaseName(bp: DesignBlueprint): string {
  return bp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'design';
}

// ------------------------------------------------------------------ OpenSCAD
const scadNumber = (v: number | null) => String(Math.round((v ?? 0) * 100) / 100);
const scadComment = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');

const SCAD_LIBRARY = `module vd_shape(points, thickness) { rotate([90, 0, 0]) linear_extrude(height = thickness, center = true) polygon(points); }
module vd_box(w, d, h) { translate([-w / 2, -d / 2, 0]) cube([w, d, h]); }
module vd_ellipsoid(w, d, h) { translate([0, 0, h / 2]) scale([w / 2, d / 2, h / 2]) sphere(r = 1); }
module vd_sphere(r) { translate([0, 0, r]) sphere(r = r); }
module vd_cone(r, r_top, h) { cylinder(r1 = r, r2 = r_top, h = h); }
module vd_hollow_box(w, d, h, t) {
  difference() {
    vd_box(w, d, h);
    translate([0, 0, t]) vd_box(w - 2 * t, d - 2 * t, h);
  }
}
module vd_hollow_cylinder(r, h, t, hole) {
  difference() {
    cylinder(r = r, h = h);
    translate([0, 0, t]) cylinder(r = r - t, h = h);
    if (hole > 0) translate([0, 0, -1]) cylinder(r = hole, h = t + 2);
  }
}`;

function scadParams(c: BlueprintComponent): { lines: string[]; call: string } {
  const v = (key: string) => `${c.id}_${key}`;
  const p = c.params;
  const assign = (key: string, value: number | null) => `${v(key)} = ${scadNumber(value)};`;
  switch (c.primitive) {
    case 'box':
      return { lines: [assign('width', p.width), assign('depth', p.depth), assign('height', p.height)], call: `vd_box(${v('width')}, ${v('depth')}, ${v('height')})` };
    case 'ellipsoid':
      return { lines: [assign('width', p.width), assign('depth', p.depth), assign('height', p.height)], call: `vd_ellipsoid(${v('width')}, ${v('depth')}, ${v('height')})` };
    case 'hollowBox':
      return { lines: [assign('width', p.width), assign('depth', p.depth), assign('height', p.height), assign('wall', p.wall)], call: `vd_hollow_box(${v('width')}, ${v('depth')}, ${v('height')}, ${v('wall')})` };
    case 'cylinder':
      return { lines: [assign('radius', p.radius), assign('height', p.height)], call: `cylinder(r = ${v('radius')}, h = ${v('height')})` };
    case 'cone':
      return { lines: [assign('radius', p.radius), assign('radius_top', p.radiusTop), assign('height', p.height)], call: `vd_cone(${v('radius')}, ${v('radius_top')}, ${v('height')})` };
    case 'sphere':
      return { lines: [assign('radius', p.radius)], call: `vd_sphere(${v('radius')})` };
    case 'outline': {
      const points = cleanOutline(p.points ?? []).map((q) => `[${scadNumber(q.x)}, ${scadNumber(q.z)}]`).join(', ');
      return { lines: [assign('depth', p.depth), `${v('points')} = [${points}];`], call: `vd_shape(${v('points')}, ${v('depth')})` };
    }
    case 'stroke': {
      const segments = strokeSegments(p.points ?? [], p.wall ?? 1).map((s) => `[${cleanOutline(s).map((q) => `[${scadNumber(q.x)}, ${scadNumber(q.z)}]`).join(', ')}]`).join(', ');
      return { lines: [assign('depth', p.depth), `${v('segments')} = [${segments}];`], call: `for (s = ${v('segments')}) vd_shape(s, ${v('depth')})` };
    }
    case 'hollowCylinder':
      return {
        lines: [assign('radius', p.radius), assign('height', p.height), assign('wall', p.wall), assign('drain_radius', p.holeRadius)],
        call: `vd_hollow_cylinder(${v('radius')}, ${v('height')}, ${v('wall')}, ${v('drain_radius')})`,
      };
  }
}

/** Editable source: each part's sizes are named variables, which also appear in OpenSCAD's Customizer. */
export function exportScad(bp: DesignBlueprint): string {
  const colors = new Map(bp.materials.map((m) => [m.id, m.color]));
  const parts = bp.components.map((c) => ({ c, ...scadParams(c) }));
  const variables = parts.map(({ c, lines }) => `/* [${scadComment(c.name).replace(/[[\]]/g, '')}] */\n${lines.join('\n')}`).join('\n\n');
  const body = parts.map(({ c, call }) => {
    const pos = `[${scadNumber(c.position.x)}, ${scadNumber(c.position.y)}, ${scadNumber(c.position.z)}]`;
    const rot = `[${scadNumber(c.rotation.x)}, ${scadNumber(c.rotation.y)}, ${scadNumber(c.rotation.z)}]`;
    return `  // ${scadComment(c.name)}\n  color("${colors.get(c.materialId)}") translate(${pos}) rotate(${rot}) ${call};`;
  }).join('\n');
  return `// ${scadComment(bp.name)}
// ${scadComment(bp.description)}
// Overall: ${bp.dimensions.width} x ${bp.dimensions.depth} x ${bp.dimensions.height} mm (width x depth x height)
// Generated from a VDraw Design Blueprint. Change the variables below, or use Window > Customizer.

${variables}

/* [Hidden] */
$fn = ${CURVE_SEGMENTS};

${SCAD_LIBRARY}

union() {
${body}
}
`;
}

// ------------------------------------------------------------------ STL
/** Binary STL in mm, Z up. Each part is a closed shell; slicers merge overlapping shells when printing. */
export function exportStl(bp: DesignBlueprint): Buffer {
  const meshes = bp.components.map(worldMesh);
  const triangles = meshes.reduce((sum, m) => sum + m.indices.length / 3, 0);
  const out = Buffer.alloc(84 + triangles * 50);
  out.write(`VDraw: ${bp.name}`.replace(/[^\x20-\x7e]/g, '?').replace(/^solid/i, 'part').slice(0, 79), 0, 'ascii');
  out.writeUInt32LE(triangles, 80);
  let at = 84;
  for (const m of meshes) {
    const p = m.positions;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      for (const value of [nx / len, ny / len, nz / len, p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]) {
        out.writeFloatLE(value, at);
        at += 4;
      }
      at += 2;
    }
  }
  return out;
}

// ------------------------------------------------------------------ GLB
const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const ANIMATION_SAMPLES = 33;

/** glTF 2.0 binary: one node per part, in metres and Y up as the spec requires. Written by hand so it runs without a DOM. */
export function exportGlb(bp: DesignBlueprint): Buffer {
  const chunks: Buffer[] = [];
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  let byteLength = 0;

  const addData = (data: Float32Array, type: string, count: number, target: number | null, bounds = false) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const view: Record<string, unknown> = { buffer: 0, byteOffset: byteLength, byteLength: bytes.length };
    if (target) view.target = target;
    bufferViews.push(view);
    chunks.push(bytes);
    byteLength += bytes.length;
    const accessor: Record<string, unknown> = { bufferView: bufferViews.length - 1, componentType: 5126, count, type };
    if (bounds) {
      const width = type === 'VEC3' ? 3 : 1;
      const min = new Array<number>(width).fill(Infinity);
      const max = new Array<number>(width).fill(-Infinity);
      for (let i = 0; i < data.length; i++) {
        min[i % width] = Math.min(min[i % width], data[i]);
        max[i % width] = Math.max(max[i % width], data[i]);
      }
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const materialIndex = new Map(bp.materials.map((m, i) => [m.id, i]));
  const materials = bp.materials.map((m) => {
    const [r, g, b] = hexToRgb(m.color);
    return {
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1],
        metallicFactor: m.metalness,
        roughnessFactor: m.roughness,
      },
      doubleSided: false,
    };
  });

  const restQuaternion = new Map(bp.components.map((c) => [c.id, rotationQuaternion(c.rotation)]));
  const meshes: unknown[] = [];
  const nodes: Record<string, unknown>[] = [];
  bp.components.forEach((c, i) => {
    const render = toRenderMesh(primitiveMesh(c));
    const count = render.positions.length / 3;
    const position = addData(render.positions, 'VEC3', count, 34962, true);
    const normal = addData(render.normals, 'VEC3', count, 34962);
    meshes.push({ name: c.name, primitives: [{ attributes: { POSITION: position, NORMAL: normal }, material: materialIndex.get(c.materialId) }] });
    nodes.push({
      name: c.name,
      mesh: i,
      translation: [c.position.x, c.position.y, c.position.z],
      rotation: restQuaternion.get(c.id),
    });
  });
  const rootIndex = nodes.length;
  nodes.push({
    name: bp.name,
    children: bp.components.map((_, i) => i),
    rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], // Z up -> Y up
    scale: [0.001, 0.001, 0.001], // mm -> m
  });

  const animations = bp.animations.map((clip) => {
    const times = new Float32Array(ANIMATION_SAMPLES);
    for (let k = 0; k < ANIMATION_SAMPLES; k++) times[k] = (k / (ANIMATION_SAMPLES - 1)) * clip.durationSeconds;
    const timeAccessor = addData(times, 'SCALAR', ANIMATION_SAMPLES, null, true);
    const samplers: unknown[] = [];
    const channels: unknown[] = [];
    bp.components.forEach((c, nodeIndex) => {
      const tracks = clip.tracks.filter((t) => t.componentId === c.id);
      const poses = Array.from({ length: ANIMATION_SAMPLES }, (_, k) => clipPose(clip, c.id, clipPhase(clip, (k / (ANIMATION_SAMPLES - 1)) * clip.durationSeconds * 0.9999)));
      if (tracks.some((t) => t.property === 'translate')) {
        const values = new Float32Array(ANIMATION_SAMPLES * 3);
        poses.forEach((pose, k) => values.set([c.position.x + pose.translate.x, c.position.y + pose.translate.y, c.position.z + pose.translate.z], k * 3));
        samplers.push({ input: timeAccessor, output: addData(values, 'VEC3', ANIMATION_SAMPLES, null), interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: 'translation' } });
      }
      if (tracks.some((t) => t.property === 'rotate')) {
        const values = new Float32Array(ANIMATION_SAMPLES * 4);
        const rest = restQuaternion.get(c.id) as [number, number, number, number];
        poses.forEach((pose, k) => values.set(multiplyQuaternions(rotationQuaternion(pose.rotate), rest), k * 4));
        samplers.push({ input: timeAccessor, output: addData(values, 'VEC4', ANIMATION_SAMPLES, null), interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex, path: 'rotation' } });
      }
    });
    return { name: clip.name, samplers, channels };
  });

  const gltf: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'VDraw Design Blueprint exporter' },
    scene: 0,
    scenes: [{ name: bp.name, nodes: [rootIndex] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  if (animations.length) gltf.animations = animations;

  const pad = (b: Buffer, fill: number) => {
    const extra = (4 - (b.length % 4)) % 4;
    return extra ? Buffer.concat([b, Buffer.alloc(extra, fill)]) : b;
  };
  const json = pad(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const bin = pad(Buffer.concat(chunks), 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunkHeader = (length: number, type: string) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(length, 0);
    h.write(type, 4, 'ascii');
    return h;
  };
  return Buffer.concat([header, chunkHeader(json.length, 'JSON'), json, chunkHeader(bin.length, 'BIN\0'), bin]);
}

// ------------------------------------------------------------------ Web
/** Safe inside a <script>: no sequence can close the tag or open a comment. */
const jsonForScript = (value: unknown) => JSON.stringify(value)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const toBase64 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

function viewerData(bp: DesignBlueprint) {
  const material = new Map(bp.materials.map((m) => [m.id, m]));
  return {
    name: bp.name,
    dimensions: bp.dimensions,
    interaction: bp.interaction,
    animations: bp.animations,
    parts: bp.components.map((c) => {
      const render = toRenderMesh(worldMesh(c));
      const m = material.get(c.materialId);
      return {
        id: c.id,
        name: c.name,
        color: hexToRgb(m?.color ?? '#999999'),
        metal: m?.metalness ?? 0,
        rough: m?.roughness ?? 0.7,
        rest: c.position,
        count: render.positions.length / 3,
        positions: toBase64(render.positions),
        normals: toBase64(render.normals),
      };
    }),
  };
}

/** Dependency-free custom element, used as `<vdraw-model></vdraw-model>` once the file is loaded. */
export function exportWebComponent(bp: DesignBlueprint): string {
  return `/* ${scadComment(bp.name).replace(/[<>]/g, ' ')}: interactive 3D preview generated from a VDraw Design Blueprint.
 * Usage: load this file with a script tag, then add <vdraw-model style="height:480px"></vdraw-model>
 * Works in plain HTML, React, Vue and anything else that renders custom elements. No dependencies. */
(function () {
var DESIGN = ${jsonForScript(viewerData(bp))};
${WEB_VIEWER_RUNTIME}
})();
`;
}

export function exportWebPage(bp: DesignBlueprint): string {
  const accent = bp.materials[0]?.color ?? '#1F8A84';
  const material = new Map(bp.materials.map((m) => [m.id, m]));
  const cm3 = designVolumeMm3(bp) / 1000;
  const counts = new Map<string, { name: string; purpose: string; material: string; quantity: number }>();
  for (const c of bp.components) {
    const key = `${c.name}|${c.materialId}`;
    const row = counts.get(key);
    if (row) row.quantity++;
    else counts.set(key, { name: c.name, purpose: c.purpose, material: material.get(c.materialId)?.name ?? '', quantity: 1 });
  }
  const parts = [...counts.values()].map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.quantity}</td><td>${escapeHtml(r.material)}</td><td>${escapeHtml(r.purpose)}</td></tr>`).join('\n');
  const swatches = bp.materials.map((m) => `<li><span class="swatch" style="background:${m.color}"></span>${escapeHtml(m.name)}</li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(bp.name)}</title>
<meta name="description" content="${escapeHtml(bp.description)}">
<style>
:root{--accent:${accent};--ink:#1f2430;--soft:#5a6170;--line:#e3ded3;--paper:#faf8f3}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--paper)}
main{max-width:1080px;margin:0 auto;padding:32px 20px 56px}
.hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:32px;align-items:center}
h1{font:700 clamp(2rem,5vw,3.2rem)/1.08 Georgia,'Times New Roman',serif;margin:0 0 12px}
.lead{font-size:1.15rem;color:var(--soft);margin:0 0 16px}
.use{border-left:4px solid var(--accent);padding:4px 12px;margin:0 0 16px}
vdraw-model{display:block;height:min(62vw,480px);min-height:300px;border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}
dl{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0}
dl div{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
dt{font-size:.8rem;color:var(--soft)}dd{margin:0;font-size:1.25rem;font-weight:700}
h2{font:700 1.5rem Georgia,'Times New Roman',serif;margin:36px 0 12px}
.table-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:10px}
table{width:100%;border-collapse:collapse;min-width:520px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}th{font-size:.85rem;color:var(--soft)}
.materials{list-style:none;display:flex;flex-wrap:wrap;gap:8px 18px;padding:0;margin:0}
.materials li{display:flex;align-items:center;gap:8px}
.swatch{width:18px;height:18px;border-radius:50%;border:1px solid rgba(0,0,0,.2)}
footer{margin-top:32px;font-size:.85rem;color:var(--soft)}
@media (max-width:800px){.hero{grid-template-columns:minmax(0,1fr)}dl{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<main>
<section class="hero">
<vdraw-model aria-label="Interactive 3D model of ${escapeHtml(bp.name)}"></vdraw-model>
<div>
<h1>${escapeHtml(bp.name)}</h1>
<p class="lead">${escapeHtml(bp.description)}</p>
<p class="use">${escapeHtml(bp.useCase)}</p>
<dl>
<div><dt>Width</dt><dd>${bp.dimensions.width} mm</dd></div>
<div><dt>Depth</dt><dd>${bp.dimensions.depth} mm</dd></div>
<div><dt>Height</dt><dd>${bp.dimensions.height} mm</dd></div>
<div><dt>Parts</dt><dd>${bp.components.length}</dd></div>
<div><dt>Material volume</dt><dd>up to ${cm3 < 100 ? cm3.toFixed(1) : Math.round(cm3)} cm³</dd></div>
</dl>
</div>
</section>
<h2>Materials</h2>
<ul class="materials">${swatches}</ul>
<h2>What's in it</h2>
<div class="table-wrap"><table>
<thead><tr><th>Part</th><th>Qty</th><th>Material</th><th>Purpose</th></tr></thead>
<tbody>
${parts}
</tbody>
</table></div>
<footer>Generated from a VDraw Design Blueprint. Drag the model to rotate it; scroll or pinch to zoom.</footer>
</main>
<script>
${exportWebComponent(bp).replace(/<\/script/gi, '<\\/script')}
</script>
</body>
</html>
`;
}

export interface ExportedFile {
  filename: string;
  mime: string;
  data: Buffer;
}

export function exportDesign(bp: DesignBlueprint, format: ExportFormat): ExportedFile {
  const { extension, mime } = EXPORT_FORMATS[format];
  const filename = `${fileBaseName(bp)}.${extension}`;
  switch (format) {
    case 'scad': return { filename, mime, data: Buffer.from(exportScad(bp), 'utf8') };
    case 'stl': return { filename, mime, data: exportStl(bp) };
    case 'glb': return { filename, mime, data: exportGlb(bp) };
    case 'webComponent': return { filename, mime, data: Buffer.from(exportWebComponent(bp), 'utf8') };
    case 'webPage': return { filename, mime, data: Buffer.from(exportWebPage(bp), 'utf8') };
    case 'blueprint': return { filename, mime, data: Buffer.from(`${JSON.stringify(bp, null, 2)}\n`, 'utf8') };
  }
}
