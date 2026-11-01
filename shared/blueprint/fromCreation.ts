/**
 * Builds the 3D Blueprint for a circuit or a character from its spec. The spec stays on the Blueprint,
 * so the 3D model, every export and the live test all describe the same design.
 */
import type { CircuitSpec, ComponentType, PetSpec } from '../creations';
import { draft, material, part } from './build';
import type { BlueprintComponent, DesignBlueprint } from './types';

/** Half-sizes in mm, in the same proportions as the stage's pet. */
const BODY_MM: Record<PetSpec['bodyShape'], [number, number, number]> = {
  round: [34, 34, 34],
  oval: [42, 34, 30],
  bean: [32, 28, 39],
  blob: [42, 38, 28],
  tall: [26, 26, 48],
};

export function petToBlueprint(pet: PetSpec): DesignBlueprint {
  const [rx, ry, rz] = BODY_MM[pet.bodyShape] ?? BODY_MM.round;
  const legH = pet.legs ? 14 : 0;
  const bodyBase = legH;
  const cz = bodyBase + rz;
  const parts: BlueprintComponent[] = [
    part('body', 'Body', 'Main body', 'ellipsoid', { width: rx * 2, depth: ry * 2, height: rz * 2 }, [0, 0, bodyBase], 'body'),
  ];
  const legXs = pet.legs === 4 ? [-15, 15] : pet.legs === 2 ? [-12, 12] : [];
  const legYs = pet.legs === 4 ? [-11, 11] : [0];
  legXs.forEach((x) => legYs.forEach((y) => {
    parts.push(part(`leg_${parts.length}`, 'Leg', 'Stands the toy up', 'cone', { radius: 5.5, radiusTop: 4.5, height: legH + 4 }, [x, y, 0], 'body'));
  }));
  const eyeXs = pet.eyeCount === 1 ? [0] : pet.eyeCount === 2 ? [-11, 11] : [-13, 0, 13];
  const eye = pet.eyeStyle === 'big' ? 7 : 5;
  const frontAt = (x: number, z: number) => -ry * Math.sqrt(Math.max(0.05, 1 - (x / rx) ** 2 - ((z - cz) / rz) ** 2));
  eyeXs.forEach((x, i) => {
    const z = cz + rz * 0.25;
    parts.push(part(`eye_${i + 1}`, 'Eye', 'Face detail', 'sphere', { radius: eye }, [x, frontAt(x, z), z - eye], 'eye'));
    parts.push(part(`pupil_${i + 1}`, 'Pupil', 'Face detail', 'sphere', { radius: eye * 0.5 }, [x, frontAt(x, z) - eye * 0.8, z - eye * 0.5], 'ink'));
  });
  if (pet.mouth !== 'none') {
    const z = cz - rz * 0.2;
    parts.push(part('mouth', 'Mouth', 'Face detail', 'ellipsoid', { width: 14, depth: 3, height: pet.mouth === 'open' ? 9 : 3.5 }, [0, frontAt(0, z), z], 'ink'));
  }
  if (pet.ears !== 'none') {
    [-1, 1].forEach((sx, i) => {
      const x = sx * rx * 0.5;
      const z = cz + rz * 0.72;
      if (pet.ears === 'pointy') parts.push(part(`ear_${i + 1}`, 'Ear', 'Pointy ear', 'cone', { radius: 8, radiusTop: 0, height: 20 }, [x, 0, z], 'body', [0, sx * 18, 0]));
      if (pet.ears === 'round') parts.push(part(`ear_${i + 1}`, 'Ear', 'Round ear', 'ellipsoid', { width: 18, depth: 8, height: 18 }, [x, 0, z - 2], 'accent'));
      if (pet.ears === 'floppy') parts.push(part(`ear_${i + 1}`, 'Ear', 'Floppy ear', 'ellipsoid', { width: 13, depth: 7, height: 28 }, [sx * rx * 0.85, 0, cz - 8], 'accent', [0, sx * -18, 0]));
      if (pet.ears === 'antenna') {
        parts.push(part(`ear_${i + 1}`, 'Antenna', 'Antenna stalk', 'cylinder', { radius: 1.6, height: 22 }, [x, 0, z], 'ink'));
        parts.push(part(`ear_tip_${i + 1}`, 'Antenna tip', 'Antenna tip', 'sphere', { radius: 4 }, [x, 0, z + 20], 'accent'));
      }
    });
  }
  if (pet.tail !== 'none') {
    const length = pet.tail === 'short' ? 16 : 34;
    parts.push(part('tail', 'Tail', 'Tail', 'cone', { radius: 4, radiusTop: 2.2, height: length }, [0, ry * 0.75, cz - rz * 0.2], 'accent', [-55, 0, 0]));
  }
  if (pet.extras.includes('horn')) parts.push(part('horn', 'Horn', 'Horn', 'cone', { radius: 5, radiusTop: 0, height: 18 }, [0, -6, bodyBase + rz * 2 - 3], 'accent'));
  if (pet.extras.includes('hat')) {
    parts.push(part('hat_brim', 'Hat brim', 'Hat', 'cylinder', { radius: 18, height: 2.5 }, [0, 0, bodyBase + rz * 2 - 2], 'ink'));
    parts.push(part('hat_crown', 'Hat crown', 'Hat', 'cone', { radius: 11, radiusTop: 10, height: 16 }, [0, 0, bodyBase + rz * 2], 'ink'));
  }
  if (pet.extras.includes('wings')) {
    [-1, 1].forEach((sx, i) => parts.push(part(`wing_${i + 1}`, 'Wing', 'Wing', 'ellipsoid', { width: 34, depth: 5, height: 24 }, [sx * (rx + 10), ry * 0.25, cz - 4], 'accent', [0, sx * -22, 0])));
  }
  if (pet.extras.includes('spots')) {
    [[0.55, 0.45], [-0.6, 0.2], [0.35, -0.35]].forEach(([u, w], i) => {
      const x = u * rx;
      const z = cz + w * rz;
      const y = ry * Math.sqrt(Math.max(0.05, 1 - u * u - w * w)) * -0.92;
      parts.push(part(`spot_${i + 1}`, 'Spot', 'Marking', 'ellipsoid', { width: 11, depth: 5, height: 11 }, [x, y, z - 5.5], 'accent'));
    });
  }
  return draft({
    name: pet.name,
    description: `A printable desk toy of ${pet.name}. Open the live test to feed it, pet it and play with it.`,
    useCase: 'A fun keepsake: print a character someone drew and keep it on your desk.',
    style: 'Hand-drawn character, simplified for printing',
    materials: [
      material('body', 'Body colour', pet.bodyColor, 0.6),
      material('accent', 'Accent colour', pet.accentColor, 0.6),
      material('eye', 'Eye white', '#FFFFFF', 0.4),
      material('ink', 'Ink', '#1F2430', 0.5),
    ],
    pet,
    components: parts,
    relationships: parts.filter((c) => c.id !== 'body').slice(0, 40).map((c) => ({ from: c.id, to: 'body', type: 'attached_to' as const })),
    animations: [{
      name: 'Hop',
      durationSeconds: 1.6,
      tracks: parts.map((c) => ({ componentId: c.id, property: 'translate' as const, axis: 'z' as const, from: 0, to: 18 })),
    }],
    assumptions: [
      'Simplified for printing: the curved tail in the live view becomes a tapered cone here.',
      ...(pet.extras.includes('whiskers') ? ['Whiskers were left out: they are too thin to print.'] : []),
    ],
  });
}

const BOARD_MM = { width: 200, depth: 140 };

const CIRCUIT_MATERIAL: Record<ComponentType, string> = { battery: 'battery', resistor: 'resistor', led: 'led', bulb: 'bulb', switch: 'switch' };

export function circuitToBlueprint(circuit: CircuitSpec): DesignBlueprint {
  const BOARD_H = 6;
  const top = BOARD_H;
  const at = (c: { x: number; y: number }): [number, number] => [(c.x - 0.5) * (BOARD_MM.width - 40), (0.5 - c.y) * (BOARD_MM.depth - 40)];
  const slug = (id: string) => `c_${id.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24)}`;
  const parts: BlueprintComponent[] = [
    part('board', 'Base board', 'Holds the components in the drawn layout', 'box', { ...BOARD_MM, height: BOARD_H }, [0, 0, 0], 'board'),
  ];
  for (const c of circuit.components) {
    const [x, y] = at(c);
    const id = slug(c.id);
    const name = c.label.trim().slice(0, 48) || c.type;
    if (c.type === 'battery') parts.push(part(id, name, 'Power source', 'box', { width: 26, depth: 46, height: 18 }, [x, y, top], 'battery'));
    if (c.type === 'switch') parts.push(part(id, name, 'Opens and closes the loop', 'box', { width: 24, depth: 14, height: 10 }, [x, y, top], 'switch'));
    if (c.type === 'resistor') parts.push(part(id, name, 'Limits the current', 'cylinder', { radius: 4, height: 22 }, [x - 11, y, top + 5], 'resistor', [0, 90, 0]));
    if (c.type === 'led') parts.push(part(id, name, 'Lights when current flows', 'cone', { radius: 6, radiusTop: 4, height: 12 }, [x, y, top], 'led'));
    if (c.type === 'bulb') parts.push(part(id, name, 'Lights when current flows', 'sphere', { radius: 10 }, [x, y, top], 'bulb'));
  }
  const byId = new Map(circuit.components.map((c) => [c.id, c]));
  circuit.wires.forEach((w, i) => {
    const a = byId.get(w.from);
    const b = byId.get(w.to);
    if (!a || !b) return;
    const [ax, ay] = at(a);
    const [bx, by] = at(b);
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1) return;
    const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    parts.push(part(`wire_${i + 1}`, 'Copper trace', `Connects ${a.label.slice(0, 40)} to ${b.label.slice(0, 40)}`, 'box', { width: length, depth: 3, height: 1 }, [(ax + bx) / 2, (ay + by) / 2, top], 'copper', [0, 0, angle]));
  });
  return draft({
    name: 'LED Circuit Teaching Board',
    description: `A printable layout board for a series circuit with ${circuit.components.length} components, placed as drawn. Open the live test to flip the switch and see the real current.`,
    useCase: 'A classroom aid: students see where each part goes, then build the real circuit on it.',
    style: 'Classroom kit: green board with colour-coded parts',
    materials: [
      material('board', 'Green board', '#2F7D4F', 0.7),
      material('copper', 'Copper', '#B87333', 0.35, 0.9),
      ...Object.values(CIRCUIT_MATERIAL).map((id) => material(id, `${id[0].toUpperCase()}${id.slice(1)}`, {
        battery: '#2E3440', resistor: '#C89B6B', led: '#E8735A', bulb: '#F2D16B', switch: '#4A5160',
      }[id] as string, 0.5)),
    ],
    circuit,
    components: parts,
    relationships: parts.filter((c) => c.id !== 'board').slice(0, 40).map((c) => ({ from: c.id, to: 'board', type: 'attached_to' as const })),
    animations: [],
    assumptions: ['The parts are placeholder blocks at the drawn positions. They are for layout, not electrically working 3D models.'],
  });
}
