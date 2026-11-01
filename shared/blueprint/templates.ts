/**
 * Real-world demo scenarios, built as ordinary Blueprints. They use no AI and the UI labels them as examples.
 * Sizes come from the objects they serve (a Raspberry Pi 4 board is 85 x 56 mm, for instance).
 */
import { draft, material, part } from './build';
import { exampleCircuit, examplePet } from './examples';
import { circuitToBlueprint, petToBlueprint } from './fromCreation';
import type { DesignBlueprint } from './types';

function deskOrganiser(): DesignBlueprint {
  const pegs = ([[-80, 'pen'], [0, 'cups'], [80, 'tray']] as const).map(([x, name]) =>
    part(`peg_${name}`, 'Locating peg', 'Keeps a module in place on the base while letting it lift off', 'cylinder', { radius: 4, height: 6 }, [x, 0, 6], 'steel'));
  return draft({
    name: 'Modular Desk Organiser',
    description: 'A three-module organiser: pens and tools in a tall bin, small items in two cups, and a phone or cards in a low tray. Modules lift off a shared base.',
    useCase: 'Clears a home-office desk and prints on a hobby 3D printer, one module at a time.',
    style: 'Rounded workshop: matte teal modules on a warm oak-coloured base',
    materials: [
      material('teal', 'Teal PLA', '#1F8A84', 0.55),
      material('oak', 'Oak-tone base', '#C89B6B', 0.75),
      material('coral', 'Coral PLA', '#E8735A', 0.55),
      material('steel', 'Steel peg', '#B8BEC6', 0.35, 0.8),
    ],
    components: [
      part('base', 'Base plate', 'Holds all the modules and sits on the desk', 'box', { width: 240, depth: 100, height: 6 }, [0, 0, 0], 'oak'),
      ...pegs,
      part('pen_bin', 'Pen bin', 'Tall bin for pens, scissors and rulers', 'hollowBox', { width: 70, depth: 90, height: 110, wall: 2.4 }, [-80, 0, 6], 'teal'),
      part('cup_front', 'Small-parts cup', 'Clips, pins and USB sticks', 'hollowCylinder', { radius: 26, height: 60, wall: 2 }, [0, -22, 6], 'coral'),
      part('cup_back', 'Small-parts cup', 'Clips, pins and USB sticks', 'hollowCylinder', { radius: 22, height: 78, wall: 2 }, [0, 24, 6], 'coral'),
      part('tray', 'Phone tray', 'Low tray for a phone, keys and cards', 'hollowBox', { width: 70, depth: 90, height: 28, wall: 2.4 }, [80, 0, 6], 'teal'),
    ],
    relationships: [
      { from: 'pen_bin', to: 'base', type: 'rests_on' },
      { from: 'cup_front', to: 'base', type: 'rests_on' },
      { from: 'cup_back', to: 'base', type: 'rests_on' },
      { from: 'tray', to: 'base', type: 'rests_on' },
    ],
    animations: [{
      name: 'Lift modules',
      durationSeconds: 4,
      tracks: [
        { componentId: 'pen_bin', property: 'translate', axis: 'z', from: 0, to: 40 },
        { componentId: 'cup_front', property: 'translate', axis: 'z', from: 0, to: 55 },
        { componentId: 'cup_back', property: 'translate', axis: 'z', from: 0, to: 55 },
        { componentId: 'tray', property: 'translate', axis: 'z', from: 0, to: 70 },
      ],
    }],
  });
}

/** Case for an 85 x 56 mm single-board computer. Walls are separate parts so the port side stays open. */
function electronicsEnclosure(): DesignBlueprint {
  const W = 92;
  const D = 63;
  const H = 28;
  const T = 2;
  const standoffs = [[-29, -24.5], [29, -24.5], [-29, 24.5], [29, 24.5]].map(([x, y], i) =>
    part(`standoff_${i + 1}`, 'Board standoff', 'Raises the board for airflow; matches the 58 x 49 mm hole pattern', 'cylinder', { radius: 3, height: 4 }, [x, y, T], 'body'));
  return draft({
    name: 'Single-Board Computer Case',
    description: 'A two-part case for an 85 x 56 mm board, such as a Raspberry Pi 4, with standoffs, an open port side and a lift-off vented lid.',
    useCase: 'Protects a home-server or sensor board from dust and shorts. Prints without supports.',
    style: 'Functional matte charcoal with an accent lid',
    materials: [
      material('body', 'Charcoal PETG', '#2E3440', 0.6),
      material('lid', 'Teal PETG', '#1F8A84', 0.55),
      material('pcb', 'Board (for fit only)', '#2F7D4F', 0.5),
    ],
    components: [
      part('floor', 'Case floor', 'Bottom of the case', 'box', { width: W, depth: D, height: T }, [0, 0, 0], 'body'),
      part('wall_back', 'Back wall', 'Solid rear wall', 'box', { width: W, depth: T, height: H }, [0, D / 2 - T / 2, 0], 'body'),
      part('wall_left', 'Left wall', 'Solid side wall', 'box', { width: T, depth: D, height: H }, [-W / 2 + T / 2, 0, 0], 'body'),
      part('wall_right_rear', 'Right wall (rear)', 'Leaves the Ethernet and USB side open', 'box', { width: T, depth: 14, height: H }, [W / 2 - T / 2, D / 2 - 7, 0], 'body'),
      part('wall_front_left', 'Front wall (left)', 'Front wall beside the USB-C and HDMI opening', 'box', { width: 16, depth: T, height: H }, [-W / 2 + 8, -D / 2 + T / 2, 0], 'body'),
      part('wall_front_right', 'Front wall (right)', 'Front wall beside the audio opening', 'box', { width: 10, depth: T, height: H }, [W / 2 - 5, -D / 2 + T / 2, 0], 'body'),
      part('sill_front', 'Front sill', 'Stiffens the case under the port opening', 'box', { width: W, depth: T, height: 6 }, [0, -D / 2 + T / 2, 0], 'body'),
      ...standoffs,
      part('board', 'Board (fit check)', 'Shows how an 85 x 56 mm board fits. Leave it out when printing', 'box', { width: 85, depth: 56, height: 1.6 }, [0, 0, T + 4], 'pcb'),
      part('lid', 'Vented lid', 'Lifts off for access', 'box', { width: W, depth: D, height: T }, [0, 0, H], 'lid'),
    ],
    relationships: [
      { from: 'board', to: 'standoff_1', type: 'rests_on' },
      { from: 'lid', to: 'wall_back', type: 'rests_on' },
    ],
    animations: [{
      name: 'Open lid',
      durationSeconds: 4,
      tracks: [{ componentId: 'lid', property: 'translate', axis: 'z', from: 0, to: 45 }],
    }],
    assumptions: ['The lid is plain; the "vented" slots are not modelled yet because the Blueprint has no cut-out primitive.'],
  });
}

function bedsideTable(): DesignBlueprint {
  const W = 450;
  const D = 400;
  const LEG = 260;
  const CASE = 180;
  const T = 18;
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) =>
    part(`leg_${i + 1}`, 'Tapered leg', 'Solid wood leg', 'cone', { radius: 18, radiusTop: 24, height: LEG }, [sx * (W / 2 - 40), sy * (D / 2 - 40), 0], 'walnut'));
  return draft({
    name: 'Bedside Table with Drawer',
    description: 'A compact mid-century bedside table with tapered legs and one full-width drawer that slides out.',
    useCase: 'Standard bed-height furniture (about 460 mm) for a small bedroom, ready to take to a woodworker.',
    style: 'Mid-century: oiled walnut with a brushed brass knob',
    materials: [
      material('walnut', 'Oiled walnut', '#6B4630', 0.6),
      material('oak', 'Light oak drawer', '#D2B48C', 0.7),
      material('brass', 'Brushed brass', '#B08D45', 0.35, 0.9),
    ],
    components: [
      ...legs,
      part('bottom', 'Bottom panel', 'Carries the drawer', 'box', { width: W, depth: D, height: T }, [0, 0, LEG], 'walnut'),
      part('side_left', 'Left side', 'Carcass side', 'box', { width: T, depth: D, height: CASE }, [-W / 2 + T / 2, 0, LEG + T], 'walnut'),
      part('side_right', 'Right side', 'Carcass side', 'box', { width: T, depth: D, height: CASE }, [W / 2 - T / 2, 0, LEG + T], 'walnut'),
      part('back', 'Back panel', 'Stops the drawer and stiffens the carcass', 'box', { width: W - 2 * T, depth: 8, height: CASE }, [0, D / 2 - 4, LEG + T], 'walnut'),
      part('top', 'Table top', 'Holds a lamp and books', 'box', { width: W + 20, depth: D + 20, height: 22 }, [0, 0, LEG + T + CASE], 'walnut'),
      part('drawer', 'Drawer box', 'Slides out on runners', 'hollowBox', { width: W - 2 * T - 4, depth: D - 30, height: CASE - 16, wall: 10 }, [0, -6, LEG + T], 'oak'),
      part('drawer_front', 'Drawer front', 'Visible front of the drawer', 'box', { width: W - 2 * T - 2, depth: T, height: CASE - 4 }, [0, -D / 2 + T / 2 - 2, LEG + T + 2], 'walnut'),
      part('knob', 'Drawer knob', 'Pull for the drawer', 'sphere', { radius: 13 }, [0, -D / 2 - 13, LEG + T + CASE / 2 - 13], 'brass'),
    ],
    relationships: [
      { from: 'drawer', to: 'bottom', type: 'slides_in' },
      { from: 'drawer_front', to: 'drawer', type: 'attached_to' },
      { from: 'knob', to: 'drawer_front', type: 'attached_to' },
      { from: 'top', to: 'side_left', type: 'rests_on' },
    ],
    animations: [{
      name: 'Open drawer',
      durationSeconds: 4,
      tracks: ['drawer', 'drawer_front', 'knob'].map((componentId) => ({ componentId, property: 'translate' as const, axis: 'y' as const, from: 0, to: -220 })),
    }],
  });
}

function planter(): DesignBlueprint {
  return draft({
    name: 'Planter with Drainage Saucer',
    description: 'A 150 mm indoor planter with a real floor drain and a removable saucer that catches run-off water.',
    useCase: 'Keeps a windowsill herb or houseplant from sitting in water. Prints in one piece per part.',
    style: 'Scandinavian: soft terracotta with a sage saucer',
    materials: [
      material('terracotta', 'Terracotta PLA', '#C8704E', 0.8),
      material('sage', 'Sage PLA', '#8FAE8B', 0.7),
      material('soil', 'Potting soil (for scale)', '#3D2C20', 1),
      material('leaf', 'Foliage (for scale)', '#3E8E5A', 0.8),
    ],
    components: [
      part('saucer', 'Drip saucer', 'Catches water from the drain', 'hollowCylinder', { radius: 82, height: 18, wall: 3 }, [0, 0, 0], 'sage'),
      part('pot', 'Pot', 'Main body, with a 10 mm radius drain in the floor', 'hollowCylinder', { radius: 75, height: 130, wall: 3, holeRadius: 10 }, [0, 0, 3], 'terracotta'),
      part('soil', 'Soil (scale reference)', 'Shows the fill line. Leave it out when printing', 'cylinder', { radius: 71, height: 108 }, [0, 0, 7], 'soil'),
      part('foliage', 'Foliage (scale reference)', 'Shows the plant size. Leave it out when printing', 'ellipsoid', { width: 150, depth: 150, height: 110 }, [0, 0, 112], 'leaf'),
    ],
    relationships: [
      { from: 'pot', to: 'saucer', type: 'rests_on' },
      { from: 'soil', to: 'pot', type: 'inside' },
      { from: 'foliage', to: 'soil', type: 'attached_to' },
    ],
    animations: [{
      name: 'Lift pot',
      durationSeconds: 4,
      tracks: ['pot', 'soil', 'foliage'].map((componentId) => ({ componentId, property: 'translate' as const, axis: 'z' as const, from: 0, to: 60 })),
    }],
  });
}

export interface DesignTemplate {
  id: string;
  title: string;
  scenario: string;
  /** Words the rule-based interpreter uses to pick this template when no AI is available. */
  keywords: string[];
  build: () => DesignBlueprint;
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  { id: 'desk_organiser', title: 'Desk organiser', scenario: 'Home office, 3D printed', keywords: ['organiser', 'organizer', 'desk', 'pen', 'stationery', 'caddy'], build: deskOrganiser },
  { id: 'electronics_case', title: 'Electronics case', scenario: 'Maker project, 3D printed', keywords: ['enclosure', 'case', 'raspberry', 'pcb', 'housing'], build: electronicsEnclosure },
  { id: 'bedside_table', title: 'Bedside table', scenario: 'Furniture, woodworking', keywords: ['table', 'bedside', 'nightstand', 'drawer', 'furniture'], build: bedsideTable },
  { id: 'planter', title: 'Planter', scenario: 'Home and garden', keywords: ['planter', 'plant', 'pot', 'flower', 'herb', 'saucer'], build: planter },
  { id: 'led_circuit', title: 'LED circuit', scenario: 'Classroom electronics, with a live test', keywords: ['circuit', 'led', 'resistor', 'battery', 'switch', 'bulb', 'electronics'], build: () => circuitToBlueprint(exampleCircuit()) },
  { id: 'pixel_pet', title: 'Pixel the pet', scenario: 'Just for fun: a desk toy that plays back', keywords: ['pet', 'creature', 'mascot', 'character', 'toy', 'pixel'], build: () => petToBlueprint(examplePet()) },
];
