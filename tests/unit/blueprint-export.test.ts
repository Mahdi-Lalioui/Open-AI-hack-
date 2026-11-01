/**
 * Exports are checked by tools other than the code that wrote them: Khronos's glTF validator,
 * three.js's own STL and glTF parsers, and the real OpenSCAD compiler.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error gltf-validator ships no types
import { validateBytes } from 'gltf-validator';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { DEFAULT_PET } from '../../shared/creations';
import { circuitToBlueprint, petToBlueprint } from '../../shared/blueprint/fromCreation';
import { EXPORT_FORMATS, exportDesign, exportGlb, exportScad, exportStl, exportWebComponent, exportWebPage } from '../../shared/blueprint/export';
import { part } from '../../shared/blueprint/build';
import { designBounds } from '../../shared/blueprint/geometry';
import { DESIGN_TEMPLATES } from '../../shared/blueprint/templates';
import type { DesignBlueprint } from '../../shared/blueprint/types';
import { validateBlueprint } from '../../shared/blueprint/validate';
import { exampleCircuit } from '../../shared/blueprint/examples';

function valid(bp: DesignBlueprint): DesignBlueprint {
  const r = validateBlueprint(bp);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.blueprint;
}

const traced: DesignBlueprint = valid({
  ...DESIGN_TEMPLATES[0].build(),
  name: 'Traced',
  materials: [{ id: 'm', name: 'M', color: '#336699', roughness: 0.5, metalness: 0 }],
  components: [
    part('body', 'Body', 'Traced body', 'outline', { depth: 30, points: [{ x: -30, z: 0 }, { x: 30, z: 0 }, { x: 34, z: 60 }, { x: 0, z: 50 }, { x: -34, z: 60 }] }, [0, 0, 0], 'm'),
    part('mouth', 'Mouth', 'W shaped mouth', 'stroke', { depth: 4, wall: 2, points: [{ x: -12, z: 6 }, { x: -6, z: 0 }, { x: 0, z: 5 }, { x: 6, z: 0 }, { x: 12, z: 6 }] }, [0, -15, 20], 'm'),
  ],
  relationships: [],
  animations: [],
});

const scenarios: [string, DesignBlueprint][] = [
  ['traced', traced],
  ...DESIGN_TEMPLATES.map((t) => [t.id, valid(t.build())] as [string, DesignBlueprint]),
  ['pet', valid(petToBlueprint(DEFAULT_PET))],
  ['circuit', valid(circuitToBlueprint(exampleCircuit()))],
];

const organiser = scenarios[1][1];

describe('STL', () => {
  it.each(scenarios)('%s parses and matches the Blueprint size', (_name, bp) => {
    const file = exportStl(bp);
    expect(file.readUInt32LE(80)).toBe((file.length - 84) / 50);
    expect(file.subarray(0, 5).toString()).not.toBe('solid');
    const geometry = new STLLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.length) as ArrayBuffer);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(bp.dimensions.width, 1);
    expect(box.max.y - box.min.y).toBeCloseTo(bp.dimensions.depth, 1);
    expect(box.max.z - box.min.z).toBeCloseTo(bp.dimensions.height, 1);
  });
});

describe('GLB', () => {
  it.each(scenarios)('%s has no errors in the Khronos validator', async (_name, bp) => {
    const report = await validateBytes(new Uint8Array(exportGlb(bp)));
    expect(report.issues.messages.filter((m: { severity: number }) => m.severity === 0)).toEqual([]);
    expect(report.issues.numErrors).toBe(0);
    expect(report.info.animationCount).toBe(bp.animations.length);
    expect(report.info.drawCallCount).toBe(bp.components.length);
  });
  it('is sized in metres', () => {
    const glb = exportGlb(organiser);
    const length = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + length).toString('utf8'));
    expect(json.nodes[json.scenes[0].nodes[0]].scale).toEqual([0.001, 0.001, 0.001]);
    expect(glb.toString('ascii', 0, 4)).toBe('glTF');
    expect(glb.readUInt32LE(8)).toBe(glb.length);
  });
});

describe('OpenSCAD', () => {
  it('exposes named, editable parameters', () => {
    const scad = exportScad(organiser);
    expect(scad).toContain('pen_bin_width = 70;');
    expect(scad).toContain('pen_bin_wall = 2.4;');
    expect(scad).toContain('vd_hollow_box(pen_bin_width, pen_bin_depth, pen_bin_height, pen_bin_wall)');
  });

  it('keeps hostile names inside comments', () => {
    const bp = { ...organiser, name: 'x\n}; import("evil.stl"); /* */' };
    const scad = exportScad(bp);
    expect(scad.split('\n').filter((l) => l.includes('evil')).every((l) => l.startsWith('//'))).toBe(true);
  });

  // The real compiler proves the source is usable, and that it builds the same shape we render.
  it.each(scenarios)('%s compiles in OpenSCAD to the same size', async (_name, bp) => {
    const { createOpenSCAD } = await import('openscad-wasm');
    const openscad = await createOpenSCAD();
    const stl: string = await openscad.renderToStl(exportScad(bp));
    const geometry = new STLLoader().parse(stl);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const b = designBounds(bp.components);
    expect(box.max.x - box.min.x).toBeCloseTo(b.max.x - b.min.x, 0);
    expect(box.max.y - box.min.y).toBeCloseTo(b.max.y - b.min.y, 0);
    expect(box.max.z - box.min.z).toBeCloseTo(b.max.z - b.min.z, 0);
  }, 120_000);
});

describe('web', () => {
  const hostile = { ...organiser, name: '</script><img src=x onerror=alert(1)>', description: '<b>bold</b> & "quotes"' };

  it('escapes model-written text in the page', () => {
    const page = exportWebPage(hostile);
    expect(page).not.toContain('<img src=x');
    expect(page).not.toContain('<b>bold</b>');
    expect(page).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect((page.match(/<\/script>/g) ?? []).length).toBe(1);
  });
  it('escapes model-written text in the component', () => {
    const js = exportWebComponent(hostile);
    expect(js).not.toMatch(/<\/script/i);
    expect(() => new Function(`var customElements={get(){return true}};${js}`)).not.toThrow();
  });
  it('includes the design facts', () => {
    const page = exportWebPage(organiser);
    expect(page).toContain('Modular Desk Organiser');
    expect(page).toContain('240 mm');
    expect(page).toContain('<vdraw-model');
  });
});

describe('exportDesign', () => {
  it.each(Object.keys(EXPORT_FORMATS) as (keyof typeof EXPORT_FORMATS)[])('%s returns a named, non-empty file', (format) => {
    const f = exportDesign(organiser, format);
    expect(f.data.length).toBeGreaterThan(100);
    expect(f.filename).toBe(`modular-desk-organiser.${EXPORT_FORMATS[format].extension}`);
  });
  it('blueprint export round-trips through validation', () => {
    const f = exportDesign(organiser, 'blueprint');
    expect(validateBlueprint(JSON.parse(f.data.toString('utf8'))).ok).toBe(true);
  });
});
