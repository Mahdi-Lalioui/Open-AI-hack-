/** A working switch on the built-in LED circuit, solved by the same function the server uses in the studio. */
import { useMemo, useState } from 'react';
import { exampleCircuit } from '../../shared/blueprint/examples';
import { solveCircuit } from '../../server/creation/circuit';

const circuit = exampleCircuit();
const valueOf = (type: string) => circuit.components.find((c) => c.type === type)?.value ?? 0;
const LOOP = 'M90 190 V70 H210 M290 70 H380 M480 70 H610 V150 M610 230 V310 H90 V230';

export function CircuitTest() {
  const [closed, setClosed] = useState(false);
  const result = useMemo(() => solveCircuit(circuit, closed), [closed]);
  return (
    <section id="test" className="lp-section lp-test" aria-labelledby="lp-test-title">
      <div className="lp-wrap lp-test-grid">
        <div className="lp-test-copy">
          <h2 id="lp-test-title" className="lp-h2" data-rv>If a design does something, you can test it</h2>
          <p data-rv>
            A circuit in VDraw runs a real series DC calculation from its own values, so changing the battery or the resistor changes the answer.
            This is the LED circuit from the examples, using the same solver as the studio, and the switch is yours to flip.
          </p>
          <p data-rv>
            In the studio you can also show a QR code, and anyone in the room can join the same test from their phone, which makes it a good fit for a classroom.
          </p>
        </div>

        <div data-rv>
          <div className={`lp-bench ${result.ledOn ? 'is-on' : ''}`}>
            <svg viewBox="0 0 700 380" role="img" aria-label={`Series circuit with a ${valueOf('battery')} volt battery, a switch, a ${valueOf('resistor')} ohm resistor and an LED. ${result.message}`}>
              <path className="lp-wire" d={LOOP} />
              {closed && <path className="lp-current" d="M90 190 V70 H380 M480 70 H610 V150 M610 230 V310 H90 V230" />}
              <g className="lp-part-battery">
                <path d="M60 192 H120 M74 206 H106 M60 220 H120 M74 232 H106" />
                <text x="134" y="218">{valueOf('battery')} V</text>
              </g>
              <g className="lp-part-switch" onClick={() => setClosed((c) => !c)}>
                <rect x="195" y="30" width="110" height="80" fill="transparent" stroke="none" />
                <circle cx="210" cy="70" r="5" />
                <circle cx="290" cy="70" r="5" />
                <path className="lp-lever" d="M210 70 L290 70" style={{ transform: closed ? 'none' : 'rotate(-28deg)' }} />
                <text x="250" y="110" textAnchor="middle">switch</text>
              </g>
              <g>
                <path d="M380 70 l8 -14 l16 28 l16 -28 l16 28 l16 -28 l16 28 l12 -14" />
                <text x="430" y="118" textAnchor="middle">{valueOf('resistor')} Ω</text>
              </g>
              <g className="lp-part-led">
                <circle className="lp-led-glow" cx="610" cy="190" r="78" style={{ opacity: result.brightness }} />
                <circle className="lp-led" cx="610" cy="190" r="26" style={{ fillOpacity: result.brightness }} />
                <path d="M610 150 V164 M610 216 V230 M596 178 H624 L610 202 Z M596 202 H624" />
                <text x="560" y="196" textAnchor="end">LED</text>
              </g>
            </svg>
            <div className="lp-bench-read">
              <p className="lp-reading" aria-live="polite">
                <span className="lp-reading-num">{result.currentMa}</span> <span>mA</span>
                <small>{result.message}</small>
              </p>
              <button type="button" role="switch" aria-checked={closed} className="lp-toggle" onClick={() => setClosed((c) => !c)}>
                <span className="lp-toggle-track" aria-hidden="true"><span /></span>
                {closed ? 'Open the switch' : 'Close the switch'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
