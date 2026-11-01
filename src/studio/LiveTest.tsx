/**
 * The Live test output, for designs that do something: a real-time simulation shared with phones.
 * It needs its own scene and server session, but what it runs comes from the design's Blueprint.
 */
import { useState } from 'react';
import { PET_STARTERS } from '../../shared/blueprint/examples';
import { circuitToBlueprint, petToBlueprint } from '../../shared/blueprint/fromCreation';
import type { DesignBlueprint } from '../../shared/blueprint/types';
import type { CircuitSpec, PetSpec } from '../../shared/creations';
import type { PublicState } from '../../shared/types';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { ApiStatusCard } from '../host/ApiStatusCard';
import { AskCard } from '../host/AskCard';
import { AudienceCard } from '../host/AudienceCard';
import { ReadoutCard } from '../host/ReadoutCard';
import { World } from '../scene/World';
import type { CameraCommand, CameraCommandType, StationId } from '../scene/types';
import { BlueprintViewport } from './BlueprintViewport';
import { CircuitEditor, PetEditor, circuitErrors, petErrors } from './SpecEditors';

const CAMERA: { type: CameraCommandType; label: string; icon: IconName }[] = [
  { type: 'reset', label: 'Reset view', icon: 'reset' },
  { type: 'zoomIn', label: 'Zoom in', icon: 'plus' },
  { type: 'zoomOut', label: 'Zoom out', icon: 'minus' },
  { type: 'orbitLeft', label: 'Rotate left', icon: 'rotateLeft' },
  { type: 'orbitRight', label: 'Rotate right', icon: 'rotateRight' },
];

const ACTIVE_ACTIONS = new Set(['eat', 'play', 'dance', 'wave']);

/** A character made from a drawing keeps its drawn body in the live test, and hops when it's doing something. */
function DrawnCharacter({ blueprint, state, reducedMotion }: { blueprint: DesignBlueprint; state: PublicState | null; reducedMotion: boolean }) {
  const hop = blueprint.animations.find((a) => a.name === 'Hop') ?? blueprint.animations[0] ?? null;
  const active = ACTIVE_ACTIONS.has(state?.pet?.action ?? 'idle');
  return (
    <div className="stage-canvas">
      <BlueprintViewport
        blueprint={blueprint}
        revealKey="live"
        selected={null}
        onSelect={() => undefined}
        clip={active && !reducedMotion ? hop : null}
        explode={0}
        spin={false}
        resetNonce={0}
        reducedMotion={reducedMotion}
        fallback={<div className="webgl-fallback" data-testid="webgl-fallback"><Icon name="cube" size={40} /><p>This browser can't show the 3D view. The readout and controls below still work.</p></div>}
      />
    </div>
  );
}

export function LiveStage({ blueprint, state, reducedMotion }: { blueprint: DesignBlueprint; state: PublicState | null; reducedMotion: boolean }) {
  const [selected, setSelected] = useState<StationId | null>(null);
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const [webgl, setWebgl] = useState<string | null>(null);
  if (blueprint.customModel) return <DrawnCharacter blueprint={blueprint} state={state} reducedMotion={reducedMotion} />;
  return (
    <>
      <div className="stage-canvas">
        {state
          ? <World state={state} selected={selected} onSelect={setSelected} cameraCommand={camera} reducedMotion={reducedMotion}
              onWebGLUnavailable={(reason) => setWebgl(reason || 'unknown')}
              fallback={<div className="webgl-fallback" data-testid="webgl-fallback"><Icon name="cube" size={40} /><p>This browser can’t show the 3D view. The readout and controls below still work.</p></div>} />
          : <div className="stage-empty"><p>Connecting…</p></div>}
      </div>
      {webgl && <span className="visually-hidden">3D unavailable: {webgl}</span>}
      <div className="live-camera stage-camera" role="group" aria-label="Camera">
        {CAMERA.map((control) => <button key={control.type} type="button" className="btn btn-icon-only" aria-label={control.label} title={control.label} disabled={!state || Boolean(webgl)}
          data-testid={`camera-${control.type}`} onClick={() => setCamera((previous) => ({ type: control.type, nonce: (previous?.nonce ?? 0) + 1 }))}><Icon name={control.icon} size={18} /></button>)}
      </div>
    </>
  );
}

function SpecCard({ blueprint, busy, onApply }: { blueprint: DesignBlueprint; busy: boolean; onApply: (next: DesignBlueprint, summary: string) => void }) {
  const [pet, setPet] = useState<PetSpec | null>(blueprint.pet);
  const [circuit, setCircuit] = useState<CircuitSpec | null>(blueprint.circuit);
  const errors = pet ? petErrors(pet) : circuit ? circuitErrors(circuit) : [];
  const apply = () => {
    if (pet) onApply(petToBlueprint(pet), `Edited ${pet.name}`);
    else if (circuit) onApply(circuitToBlueprint(circuit), 'Edited the circuit');
  };
  return (
    <Card id="spec" title={pet ? 'Edit this character' : 'Edit the circuit'} className="spec-card">
      {pet && (
        <div className="starter-list" role="group" aria-label="Other characters">
          {PET_STARTERS.map((s) => <button type="button" key={s.id} className="starter" disabled={busy} title={s.note} data-testid={`starter-${s.id}`} onClick={() => setPet(structuredClone(s.pet))}><span className="starter-swatch" style={{ background: s.pet.bodyColor }} aria-hidden="true" />{s.label}</button>)}
        </div>
      )}
      <fieldset className="editor-fields" disabled={busy}>
        {pet && <PetEditor pet={pet} onChange={setPet} />}
        {circuit && <CircuitEditor circuit={circuit} onChange={setCircuit} />}
      </fieldset>
      {errors.length > 0 && <ul className="field-error">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <button type="button" className="btn btn-primary btn-build" data-testid="build-world" disabled={busy || errors.length > 0} onClick={apply}>Apply to the design</button>
    </Card>
  );
}

interface CardsProps {
  blueprint: DesignBlueprint;
  version: number;
  state: PublicState | null;
  connected: boolean;
  busy: boolean;
  onApply: (next: DesignBlueprint, summary: string) => void;
}

export function LiveCards({ blueprint, version, state, connected, busy, onApply }: CardsProps) {
  const mode = blueprint.pet ? 'pet' : 'circuit';
  const creation = state?.creation?.mode === mode ? state.creation : null;
  return (
    <div className="live-grid" data-testid="live-cards">
      <ReadoutCard key={`readout-${creation?.version ?? 'empty'}`} mode={mode} pet={mode === 'pet' && creation ? state?.pet ?? null : null} circuit={mode === 'circuit' && creation ? state?.circuit?.result ?? null : null} switchClosed={state?.circuit?.switchClosed} petName={blueprint.pet?.name} connected={connected} />
      {blueprint.pet && <AskCard key={`ask-${creation?.version ?? 'empty'}`} state={state} petName={blueprint.pet.name} />}
      <AudienceCard state={state} />
      {!blueprint.customModel && <SpecCard key={`spec-${version}`} blueprint={blueprint} busy={busy} onApply={onApply} />}
      <ApiStatusCard state={state} />
    </div>
  );
}
