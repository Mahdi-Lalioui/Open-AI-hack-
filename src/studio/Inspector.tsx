/** Design inspector: real parameters of the Blueprint. Every committed edit is validated by the server. */
import { useEffect, useState } from 'react';
import { scaleBlueprint } from '../../shared/blueprint/edit';
import { designVolumeMm3 } from '../../shared/blueprint/geometry';
import { REQUIRED_PARAMS, type BlueprintComponent, type ComponentParams, type DesignBlueprint } from '../../shared/blueprint/types';
import { Card } from '../components/Card';

const PARAM_LABEL: Record<keyof ComponentParams, string> = {
  width: 'Width', depth: 'Depth', height: 'Height', radius: 'Radius', radiusTop: 'Top radius', wall: 'Wall', holeRadius: 'Drain radius', points: 'Points',
};

/** Commits on blur or Enter, so typing "120" doesn't try to build 1 then 12. */
function NumberField({ label, value, unit, onCommit, testId, min }: { label: string; value: number; unit: string; onCommit: (v: number) => void; testId?: string; min?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (text.trim() === '' || !Number.isFinite(v) || (min !== undefined && v < min)) {
      setText(String(value));
      return;
    }
    if (v !== value) onCommit(v);
  };
  return (
    <label className="field">
      <span>{label} ({unit})</span>
      <input
        type="number"
        step="any"
        value={text}
        data-testid={testId}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </label>
  );
}

interface Props {
  blueprint: DesignBlueprint;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (next: DesignBlueprint, summary: string) => void;
  busy: boolean;
}

export function Inspector({ blueprint: bp, selectedId, onSelect, onEdit, busy }: Props) {
  const selected = bp.components.find((c) => c.id === selectedId) ?? null;
  const cm3 = designVolumeMm3(bp) / 1000;

  const patch = (c: BlueprintComponent, change: Partial<BlueprintComponent>, summary: string) =>
    onEdit({ ...bp, components: bp.components.map((x) => (x.id === c.id ? { ...x, ...change } : x)) }, summary);

  const resize = (axis: 'width' | 'depth' | 'height', value: number) => {
    const f = value / bp.dimensions[axis];
    onEdit(scaleBlueprint(bp, axis === 'width' ? f : 1, axis === 'depth' ? f : 1, axis === 'height' ? f : 1), `Set overall ${axis} to ${value} mm`);
  };

  return (
    <Card id="inspector" title="Design inspector" testId="inspector">
      <div className="inspector-grid">
        <NumberField label="Width" unit="mm" value={bp.dimensions.width} min={1} testId="overall-width" onCommit={(v) => resize('width', v)} />
        <NumberField label="Depth" unit="mm" value={bp.dimensions.depth} min={1} testId="overall-depth" onCommit={(v) => resize('depth', v)} />
        <NumberField label="Height" unit="mm" value={bp.dimensions.height} min={1} testId="overall-height" onCommit={(v) => resize('height', v)} />
      </div>
      <p className="muted small inspector-note">
        This design has {bp.components.length} parts and uses up to {cm3 < 100 ? cm3.toFixed(1) : Math.round(cm3)} cm³ of material. Resizing it keeps the wall thickness the same.
      </p>

      <h3 className="sub">Materials</h3>
      <ul className="material-list">
        {bp.materials.map((m) => (
          <li key={m.id}>
            <label className="material-row">
              <input
                type="color"
                value={m.color.toLowerCase()}
                disabled={busy}
                aria-label={`Colour of ${m.name}`}
                onChange={(e) => {
                  const color = e.target.value.toUpperCase();
                  onEdit({ ...bp, materials: bp.materials.map((x) => (x.id === m.id ? { ...x, color } : x)) }, `Recoloured ${m.name}`);
                }}
              />
              <span>{m.name}</span>
            </label>
          </li>
        ))}
      </ul>

      <h3 className="sub">Parts</h3>
      <ul className="part-list" data-testid="part-list">
        {bp.components.map((c) => (
          <li key={c.id}>
            <button type="button" className={`part-row ${c.id === selectedId ? 'part-row-on' : ''}`} aria-pressed={c.id === selectedId} onClick={() => onSelect(c.id === selectedId ? null : c.id)}>
              <span>{c.name}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="part-editor" data-testid="part-editor">
          <p className="part-editor-title">{selected.name}</p>
          {selected.purpose && <p className="muted small">{selected.purpose}</p>}
          <div className="inspector-grid">
            {REQUIRED_PARAMS[selected.primitive].filter((key) => key !== 'points').map((key) => (
              <NumberField
                key={key}
                label={PARAM_LABEL[key]}
                unit="mm"
                value={selected.params[key] as number}
                min={key === 'radiusTop' ? 0 : 0.2}
                testId={`param-${key}`}
                onCommit={(v) => patch(selected, { params: { ...selected.params, [key]: v } }, `${selected.name}: ${PARAM_LABEL[key].toLowerCase()} ${v} mm`)}
              />
            ))}
            {(['x', 'y', 'z'] as const).map((axis) => (
              <NumberField
                key={axis}
                label={`Position ${axis.toUpperCase()}`}
                unit="mm"
                value={selected.position[axis]}
                onCommit={(v) => patch(selected, { position: { ...selected.position, [axis]: v } }, `Moved ${selected.name}`)}
              />
            ))}
            <label className="field">
              <span>Material</span>
              <select value={selected.materialId} disabled={busy} onChange={(e) => patch(selected, { materialId: e.target.value }, `Changed the material of ${selected.name}`)}>
                {bp.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
    </Card>
  );
}
