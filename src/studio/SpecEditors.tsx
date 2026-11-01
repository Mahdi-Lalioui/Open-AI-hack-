/** Editors for the two structured design kinds. Edits are drafts until applied to the Blueprint. */
import type {
  BodyShape, CircuitComponent, CircuitSpec, ComponentType, EarStyle, EyeStyle, PetExtra, PetSpec, TailStyle,
} from '../../shared/creations';

const SHAPES: BodyShape[] = ['round', 'oval', 'bean', 'blob', 'tall'];
const EARS: EarStyle[] = ['none', 'pointy', 'round', 'floppy', 'antenna'];
const TAILS: TailStyle[] = ['none', 'short', 'long', 'curly'];
const EYES: EyeStyle[] = ['round', 'big', 'sleepy'];
const EXTRAS: PetExtra[] = ['wings', 'horn', 'spots', 'hat', 'whiskers'];
const TYPES: ComponentType[] = ['battery', 'resistor', 'led', 'bulb', 'switch'];
const UNIT: Record<ComponentType, string> = { battery: 'V', resistor: 'Ω', led: 'V fwd', bulb: 'Ω', switch: '' };
const HEX = /^#[0-9a-fA-F]{6}$/;

export function petErrors(p: PetSpec): string[] {
  const e: string[] = [];
  if (!p.name.trim()) e.push('Give the pet a name.');
  if (p.name.length > 20) e.push('Name must be at most 20 characters.');
  if (!HEX.test(p.bodyColor) || !HEX.test(p.accentColor)) e.push('Colors must be #rrggbb.');
  return e;
}

export function circuitErrors(c: CircuitSpec): string[] {
  const e: string[] = [];
  if (!c.components.length) e.push('Add at least one component.');
  if (!c.components.some((x) => x.type === 'battery')) e.push('A circuit needs a battery.');
  const ids = new Set(c.components.map((x) => x.id));
  if (c.wires.some((w) => !ids.has(w.from) || !ids.has(w.to))) e.push('A wire points to a missing component.');
  if (c.components.some((x) => !x.label.trim())) e.push('Every component needs a label.');
  return e;
}

function Select<T extends string | number>({ label, value, options, onChange, testId, show }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; testId?: string; show?: (v: T) => string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={String(value)} data-testid={testId} onChange={(e) => onChange(options.find((o) => String(o) === e.target.value)!)}>
        {options.map((o) => <option key={String(o)} value={String(o)}>{show ? show(o) : String(o)}</option>)}
      </select>
    </label>
  );
}

export function PetEditor({ pet, onChange }: { pet: PetSpec; onChange: (p: PetSpec) => void }) {
  const set = <K extends keyof PetSpec>(k: K, v: PetSpec[K]) => onChange({ ...pet, [k]: v });
  return (
    <div className="editor-grid">
      <label className="field field-wide"><span>Name</span>
        <input type="text" maxLength={20} value={pet.name} data-testid="pet-name" onChange={(e) => set('name', e.target.value)} /></label>
      <Select label="Body shape" value={pet.bodyShape} options={SHAPES} onChange={(v) => set('bodyShape', v)} testId="pet-body" />
      <label className="field"><span>Body color</span><input type="color" value={pet.bodyColor} onChange={(e) => set('bodyColor', e.target.value)} /></label>
      <label className="field"><span>Accent color</span><input type="color" value={pet.accentColor} onChange={(e) => set('accentColor', e.target.value)} /></label>
      <Select label="Eyes" value={pet.eyeCount} options={[1, 2, 3] as const} onChange={(v) => set('eyeCount', v)} />
      <Select label="Eye style" value={pet.eyeStyle} options={EYES} onChange={(v) => set('eyeStyle', v)} />
      <Select label="Ears" value={pet.ears} options={EARS} onChange={(v) => set('ears', v)} />
      <Select label="Legs" value={pet.legs} options={[0, 2, 4] as const} onChange={(v) => set('legs', v)} />
      <Select label="Tail" value={pet.tail} options={TAILS} onChange={(v) => set('tail', v)} />
      <Select label="Mouth" value={pet.mouth} options={['smile', 'open', 'none'] as const} onChange={(v) => set('mouth', v)} />
      <fieldset className="field-wide extras"><legend>Extras</legend>
        {EXTRAS.map((x) => (
          <label key={x} className="check"><input type="checkbox" checked={pet.extras.includes(x)}
            onChange={(e) => set('extras', e.target.checked ? [...pet.extras, x] : pet.extras.filter((y) => y !== x))} /> {x}</label>
        ))}
      </fieldset>
    </div>
  );
}

export function CircuitEditor({ circuit, onChange }: { circuit: CircuitSpec; onChange: (c: CircuitSpec) => void }) {
  const upd = (i: number, patch: Partial<CircuitComponent>) =>
    onChange({ ...circuit, components: circuit.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = () => {
    let n = circuit.components.length + 1;
    while (circuit.components.some((c) => c.id === `c${n}`)) n++;
    onChange({ ...circuit, components: [...circuit.components, { id: `c${n}`, type: 'resistor', label: 'Resistor', value: 470, x: 0.2 + ((n - 1) % 4) * 0.2, y: 0.25 + (Math.floor((n - 1) / 4) % 3) * 0.25 }] });
  };
  const remove = (id: string) => onChange({ components: circuit.components.filter((c) => c.id !== id), wires: circuit.wires.filter((w) => w.from !== id && w.to !== id) });
  const ids = circuit.components.map((c) => c.id);
  const name = (id: string) => circuit.components.find((c) => c.id === id)?.label ?? id;
  return (
    <div>
      <ol className="comp-list">
        {circuit.components.map((c, i) => (
          <li key={c.id} className="comp-row">
            <Select label="Type" value={c.type} options={TYPES} onChange={(v) => upd(i, { type: v, value: v === 'switch' ? null : c.value })} />
            <label className="field"><span>Label</span><input type="text" maxLength={24} value={c.label} onChange={(e) => upd(i, { label: e.target.value })} /></label>
            {c.type !== 'switch' && (
              <label className="field"><span>Value ({UNIT[c.type]})</span>
                <input type="number" min={0} step="any" value={c.value ?? ''} placeholder="default"
                  onChange={(e) => upd(i, { value: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            )}
            <button type="button" className="btn btn-ghost btn-small" onClick={() => remove(c.id)} aria-label={`Remove ${c.label}`}>Remove</button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-secondary btn-small" onClick={add}>Add component</button>
      <h3 className="sub">Wires</h3>
      <ul className="wire-list">
        {circuit.wires.map((w, i) => (
          <li key={i} className="wire-row">
            <Select label="From" value={w.from} options={ids} show={name} onChange={(v) => onChange({ ...circuit, wires: circuit.wires.map((x, j) => (j === i ? { ...x, from: v } : x)) })} />
            <span aria-hidden="true">→</span>
            <Select label="To" value={w.to} options={ids} show={name} onChange={(v) => onChange({ ...circuit, wires: circuit.wires.map((x, j) => (j === i ? { ...x, to: v } : x)) })} />
            <button type="button" className="btn btn-ghost btn-small" aria-label={`Remove wire ${name(w.from)} to ${name(w.to)}`}
              onClick={() => onChange({ ...circuit, wires: circuit.wires.filter((_, j) => j !== i) })}>Remove</button>
          </li>
        ))}
      </ul>
      {ids.length >= 2 && (
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange({ ...circuit, wires: [...circuit.wires, { from: ids[0], to: ids[1] }] })}>Add wire</button>
      )}
    </div>
  );
}
