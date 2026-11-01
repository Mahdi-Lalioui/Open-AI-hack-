/**
 * Rule-based interpret and refine for when no AI is available. Always labelled "no AI" in the UI.
 * It understands a small, documented vocabulary and says so instead of guessing.
 */
import { removeComponents, scaleBlueprint } from '../../shared/blueprint/edit';
import { circuitToBlueprint, petToBlueprint } from '../../shared/blueprint/fromCreation';
import { designBounds } from '../../shared/blueprint/geometry';
import { DESIGN_TEMPLATES } from '../../shared/blueprint/templates';
import type { BlueprintComponent, DesignBlueprint } from '../../shared/blueprint/types';

const COLOURS: Record<string, { name: string; color: string; roughness?: number; metalness?: number }> = {
  black: { name: 'Black', color: '#1F2430' },
  white: { name: 'White', color: '#F2F0EB' },
  grey: { name: 'Grey', color: '#8A8F99' },
  gray: { name: 'Grey', color: '#8A8F99' },
  red: { name: 'Red', color: '#C8402F' },
  orange: { name: 'Orange', color: '#E08A2E' },
  yellow: { name: 'Yellow', color: '#E8C547' },
  green: { name: 'Green', color: '#3E8E5A' },
  teal: { name: 'Teal', color: '#1F8A84' },
  blue: { name: 'Blue', color: '#2F6DB5' },
  navy: { name: 'Navy', color: '#22375E' },
  purple: { name: 'Purple', color: '#7A4FA3' },
  pink: { name: 'Pink', color: '#E58BA8' },
  walnut: { name: 'Walnut', color: '#6B4630', roughness: 0.6 },
  oak: { name: 'Oak', color: '#C89B6B', roughness: 0.7 },
  brass: { name: 'Brass', color: '#B08D45', roughness: 0.35, metalness: 0.9 },
  steel: { name: 'Steel', color: '#B8BEC6', roughness: 0.35, metalness: 0.8 },
};

export const RULE_HELP = 'Without AI, try: "20% wider", "make it 300 mm wide", "taller", "walls 3 mm", "make the tray blue", "in walnut", "remove the lid", "add another cup" or, for a circuit, "470 ohm resistor".';

export class RuleError extends Error {}

function toMm(value: string, unit: string): number {
  const v = Number(value);
  return unit === 'cm' ? v * 10 : unit === 'm' ? v * 1000 : v;
}

const AXIS_WORDS: { axis: 'width' | 'depth' | 'height'; grow: string[]; shrink: string[]; dimension: string[] }[] = [
  { axis: 'width', grow: ['wider'], shrink: ['narrower', 'thinner'], dimension: ['wide', 'width'] },
  { axis: 'depth', grow: ['deeper'], shrink: ['shallower'], dimension: ['deep', 'depth'] },
  { axis: 'height', grow: ['taller', 'higher'], shrink: ['shorter', 'lower'], dimension: ['tall', 'high', 'height'] },
];

/** Applies size wording. Returns per-axis factors, or null if the text has no size request. */
function sizeFactors(text: string, bp: DesignBlueprint, notes: string[]) {
  const factors = { width: 1, depth: 1, height: 1 };
  let found = false;
  const MM = '(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b';
  for (const { axis, grow, shrink, dimension } of AXIS_WORDS) {
    const word = dimension.join('|');
    const exact = text.match(new RegExp(`${MM}\\s*(?:${word})\\b`)) ?? text.match(new RegExp(`\\b(?:${word})\\s*(?:of|to|=|:|is)?\\s*${MM}`));
    if (exact && bp.dimensions[axis] > 0) {
      const target = toMm(exact[1], exact[2]);
      factors[axis] = target / bp.dimensions[axis];
      notes.push(`Set ${axis} to ${target} mm.`);
      found = true;
      continue;
    }
    for (const [words, sign] of [[grow, 1], [shrink, -1]] as const) {
      const w = words.join('|');
      const m = text.match(new RegExp(`\\b(${w})\\b`));
      if (!m) continue;
      const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
      const abs = text.match(new RegExp(`(?:by\\s*)?${MM}\\s*(?:${w})|(?:${w})\\s*by\\s*${MM}`));
      if (abs) {
        const delta = toMm(abs[1] ?? abs[3], abs[2] ?? abs[4]);
        factors[axis] = (bp.dimensions[axis] + sign * delta) / bp.dimensions[axis];
        notes.push(`${sign > 0 ? 'Added' : 'Removed'} ${delta} mm of ${axis}.`);
      } else {
        const p = (pct ? Number(pct[1]) : 20) / 100;
        factors[axis] = 1 + sign * p;
        notes.push(`${sign > 0 ? 'Increased' : 'Reduced'} ${axis} by ${Math.round(p * 100)}%.`);
      }
      found = true;
    }
  }
  const overall = text.match(/\b(bigger|larger|smaller)\b/);
  if (overall) {
    const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
    const p = (pct ? Number(pct[1]) : 20) / 100;
    const f = overall[1] === 'smaller' ? 1 - p : 1 + p;
    factors.width = factors.depth = factors.height = f;
    notes.push(`Scaled the design to ${Math.round(f * 100)}%.`);
    found = true;
  }
  if (!found) return null;
  if (Object.values(factors).some((f) => !(f > 0))) throw new RuleError('That size change would leave nothing of the design.');
  return factors;
}

/** Components whose name or id is mentioned. Longest words win, so "pen bin" does not match every "bin". */
function mentioned(text: string, bp: DesignBlueprint): BlueprintComponent[] {
  const full = bp.components.filter((c) => text.includes(c.name.toLowerCase()) || text.includes(c.id.replace(/_/g, ' ')));
  if (full.length) return full;
  const STOP = new Set(['small', 'parts', 'part', 'board', 'with', 'the', 'and', 'for', 'scale', 'reference', 'check', 'fit']);
  return bp.components.filter((c) => c.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length > 2 && !STOP.has(w) && new RegExp(`\\b${w}s?\\b`).test(text)));
}

function applyColour(text: string, bp: DesignBlueprint, notes: string[]): DesignBlueprint | null {
  const key = Object.keys(COLOURS).find((c) => new RegExp(`\\b${c}\\b`).test(text));
  if (!key) return null;
  const c = COLOURS[key];
  const targets = mentioned(text, bp);
  const usedBy = (id: string) => bp.components.filter((x) => x.materialId === id).length;
  const materialIds = targets.length
    ? [...new Set(targets.map((t) => t.materialId))]
    : [[...bp.materials].sort((a, b) => usedBy(b.id) - usedBy(a.id))[0].id];
  // A named part may share its material with others, so give it its own.
  if (targets.length && materialIds.some((id) => bp.components.some((x) => x.materialId === id && !targets.includes(x)))) {
    const id = `m_${key}`.slice(0, 32);
    const material = { id, name: c.name, color: c.color, roughness: c.roughness ?? 0.6, metalness: c.metalness ?? 0 };
    notes.push(`Changed ${[...new Set(targets.map((t) => t.name))].join(', ')} to ${c.name.toLowerCase()}.`);
    return {
      ...bp,
      materials: bp.materials.some((m) => m.id === id) ? bp.materials : [...bp.materials, material],
      components: bp.components.map((x) => (targets.includes(x) ? { ...x, materialId: id } : x)),
    };
  }
  notes.push(`Changed ${targets.length ? [...new Set(targets.map((t) => t.name))].join(', ') : 'the main material'} to ${c.name.toLowerCase()}.`);
  return {
    ...bp,
    materials: bp.materials.map((m) => (materialIds.includes(m.id)
      ? { ...m, name: c.name, color: c.color, roughness: c.roughness ?? m.roughness, metalness: c.metalness ?? m.metalness }
      : m)),
  };
}

function applyWalls(text: string, bp: DesignBlueprint, notes: string[]): DesignBlueprint | null {
  if (!/\bwalls?\b/.test(text)) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mm|cm)/);
  const has = bp.components.some((c) => c.params.wall !== null);
  if (!has) throw new RuleError('This design has no hollow parts with a wall thickness to change.');
  const next = (wall: number) => (m ? toMm(m[1], m[2]) : /thin/.test(text) ? wall * 0.75 : wall * 1.25);
  notes.push(m ? `Set wall thickness to ${toMm(m[1], m[2])} mm.` : /thin/.test(text) ? 'Made the walls 25% thinner.' : 'Made the walls 25% thicker.');
  return { ...bp, components: bp.components.map((c) => (c.params.wall === null ? c : { ...c, params: { ...c.params, wall: next(c.params.wall) } })) };
}

function applyRemove(text: string, bp: DesignBlueprint, notes: string[]): DesignBlueprint | null {
  if (!/\b(remove|delete|without|drop)\b/.test(text)) return null;
  const targets = mentioned(text, bp);
  if (!targets.length) throw new RuleError(`Could not find that part. Parts: ${[...new Set(bp.components.map((c) => c.name))].join(', ')}.`);
  if (targets.length === bp.components.length) throw new RuleError('That would remove the whole design.');
  notes.push(`Removed ${[...new Set(targets.map((t) => t.name))].join(', ')}.`);
  return removeComponents(bp, new Set(targets.map((t) => t.id)));
}

function applyAdd(text: string, bp: DesignBlueprint, notes: string[]): DesignBlueprint | null {
  if (!/\b(add|another|extra|duplicate)\b/.test(text)) return null;
  const target = mentioned(text, bp)[0];
  if (!target) throw new RuleError('Without AI, I can only add another copy of an existing part. Name one, like "add another cup".');
  let n = 2;
  while (bp.components.some((c) => c.id === `${target.id}_${n}`.slice(0, 32))) n++;
  const span = target.params.width ?? (target.params.radius ?? 10) * 2;
  const copy: BlueprintComponent = {
    ...target,
    id: `${target.id}_${n}`.slice(0, 32),
    position: { ...target.position, x: bp.dimensions.width / 2 + span / 2 + 4 },
  };
  notes.push(`Added another ${target.name}, beside the design.`);
  return { ...bp, components: [...bp.components, copy] };
}

/** Electrical values live in the circuit spec; changing one rebuilds the design from it. */
function applyCircuitValues(text: string, bp: DesignBlueprint, notes: string[]): DesignBlueprint | null {
  if (!bp.circuit) return null;
  const ohms = text.match(/(\d+(?:\.\d+)?)\s*(k)?\s*(?:ω|ohms?)(?![a-z])/) ?? text.match(/resistor\D*(\d+(?:\.\d+)?)\s*(k)?/);
  const volts = text.match(/(\d+(?:\.\d+)?)\s*v(?:olts?)?\b/);
  if (!ohms && !volts) return null;
  const set = (type: string, value: number, label: string) => {
    if (!bp.circuit?.components.some((c) => c.type === type)) throw new RuleError(`This circuit has no ${type}.`);
    notes.push(`Set the ${type} to ${label}.`);
    return value;
  };
  const resistance = ohms ? set('resistor', Number(ohms[1]) * (ohms[2] ? 1000 : 1), `${ohms[1]}${ohms[2] ?? ''} Ω`) : null;
  const voltage = volts ? set('battery', Number(volts[1]), `${volts[1]} V`) : null;
  return circuitToBlueprint({
    ...bp.circuit,
    components: bp.circuit.components.map((c) => {
      if (c.type === 'resistor' && resistance !== null) return { ...c, value: resistance };
      if (c.type === 'battery' && voltage !== null) return { ...c, value: voltage };
      return c;
    }),
  });
}

/** A character's main colour lives in its spec, so the 3D figure and the live view stay matched. */
function applyPetColour(text: string, bp: DesignBlueprint, notes: string[]): DesignBlueprint | null {
  if (!bp.pet || bp.customModel) return null;
  const key = Object.keys(COLOURS).find((c) => new RegExp(`\\b${c}\\b`).test(text));
  if (!key) return null;
  notes.push(`Changed ${bp.pet.name} to ${COLOURS[key].name.toLowerCase()}.`);
  return petToBlueprint({ ...bp.pet, bodyColor: COLOURS[key].color });
}

/** Throws RuleError if nothing in the text could be applied. */
export function refineWithRules(bp: DesignBlueprint, instruction: string): { blueprint: DesignBlueprint; notes: string[] } {
  const text = instruction.toLowerCase();
  const notes: string[] = [];
  let next = applyCircuitValues(text, bp, notes) ?? applyPetColour(text, bp, notes) ?? bp;
  if (notes.length) return { blueprint: next, notes };
  for (const apply of [applyRemove, applyAdd, applyWalls, applyColour]) next = apply(text, next, notes) ?? next;
  const factors = sizeFactors(text, next, notes);
  if (factors) next = scaleBlueprint(next, factors.width, factors.depth, factors.height);
  if (!notes.length) throw new RuleError(`I couldn't apply that without AI. ${RULE_HELP}`);
  return { blueprint: next, notes };
}

/** Picks a template from the words in the prompt and then applies any sizes or colours it mentions. */
export function interpretWithRules(text: string): { blueprint: DesignBlueprint; notes: string[] } {
  const lower = text.toLowerCase();
  // Most specific first, so "a pet for my desk" is a pet. Whole words, so "PETG" is not.
  const byPriority = [...DESIGN_TEMPLATES].sort((a, b) => Number(b.build().pet || b.build().circuit ? 1 : 0) - Number(a.build().pet || a.build().circuit ? 1 : 0));
  const template = byPriority.find((t) => t.keywords.some((k) => new RegExp(`\\b${k}s?\\b`).test(lower)));
  if (!template) {
    throw new RuleError(`Without AI, I can only start from a built-in design: ${DESIGN_TEMPLATES.map((t) => t.title.toLowerCase()).join(', ')}.`);
  }
  const base = template.build();
  const notes = [`Matched the built-in "${template.title}" design from your words. No AI was used.`];
  try {
    const refined = refineWithRules({ ...base, dimensions: boundsOf(base) }, lower);
    return { blueprint: refined.blueprint, notes: [...notes, ...refined.notes] };
  } catch (err) {
    if (err instanceof RuleError) return { blueprint: base, notes };
    throw err;
  }
}

/** Templates carry placeholder dimensions until validated, and size wording needs the real ones. */
function boundsOf(bp: DesignBlueprint) {
  const b = designBounds(bp.components);
  return { width: b.max.x - b.min.x, depth: b.max.y - b.min.y, height: b.max.z - b.min.z };
}
