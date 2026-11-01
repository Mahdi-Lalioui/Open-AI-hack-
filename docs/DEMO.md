# Living Paper: two-minute demo

This script is for **example mode**, without an API key. The 3D scene, editable blueprint, simulation and audience synchronisation are real; image recognition and the example pet decision must be described accurately.

## Rehearse once

1. Run `npm ci`, `npm run build`, then `npm start`.
2. Open the host studio at `http://localhost:5173` in a WebGL-capable browser. Keep a second browser at `/join` ready. For phones, set `PUBLIC_BASE_URL` to a reachable LAN or HTTPS origin before starting the server; test the QR code on the actual Wi-Fi.
3. Confirm the connection indicator and example-mode label. Build a pet once and try an audience interaction; then return to the pet creation controls.
4. Keep the circuit example available. Use a 9 V battery, a 2 V LED and a 470 Ω resistor for a closed-loop current of approximately 14.9 mA. Switch open means 0 mA.
5. Close unrelated windows, enlarge the browser for the projector, and keep the guest tab or phone within reach. Do not depend on a live API request during this no-key demonstration.

## Exact run of show

| Time | Presenter action | Say |
| --- | --- | --- |
| 0:00–0:15 | Show the empty studio and its example-mode label. | “Living Paper turns a small idea into a world you can test. We focus on two things people immediately understand: a pet you can care for, and a circuit you can experiment with.” |
| 0:15–0:35 | In **Pet**, press **Try example**. Change the name to **Pixel** and change an obvious part, such as the ears or body colour. | “This run uses labelled examples because no API key is configured. The editable blueprint describes the parts. With credentials, our vision adapter can read a sketch into this same structure for the user to check.” |
| 0:35–0:50 | Press **Build in 3D**. Rotate or zoom the stage once. | “The app validates that blueprint, then assembles preset 3D pieces. It is an interpreted model, and I can keep editing the design.” |
| 0:50–1:10 | Show the audience QR code. On the prepared phone or guest browser, press **Feed**, **Pet**, then **Play**, pausing briefly between actions. Point to the host needs and current action. | “The audience shares this world. These actions change the pet's needs and animation, and the server broadcasts the same state to every connected screen.” |
| 1:10–1:25 | Press **Ask Pixel** and show its source label. | “The pet can choose its next action from a bounded set. Here the decision is explicitly a rule-based example. The live adapter uses current needs and recent interactions, and application code checks the result before applying it.” |
| 1:25–1:45 | Choose **Circuit**, press **Try example**, set the resistor to **470** if necessary, and press **Build in 3D**. Close the switch if open. | “The same blueprint approach also builds a circuit. This is a single series loop: nine volts, a two-volt LED and 470 ohms gives about 14.9 milliamps.” |
| 1:45–2:00 | Flip the switch open, show zero current, then close it again. | “The light follows a real calculation, and opening the switch stops the current. The idea is simple: make the interpretation editable, then let people test its behaviour together.” |

The exact rule-based pet action depends on current needs; do not promise a particular choice. Circuit numbers are the calculated example above, not a measurement from physical hardware.

## Optional proof points after the timed demo

- Draw on the canvas, use the eraser or undo, and press **Save PNG**. Explain that **Read this sketch** needs server credentials. Do not claim the example was read from the drawing.
- Press **Save blueprint**, change the creation, and use **Open blueprint** to rebuild the saved design. The JSON file is a design specification, not a mesh or CAD file.
- Press **Present** to make the stage easier to see on a projector; use **Back to studio** or Escape to return to the full studio.
- Show the automated checks in [VERIFICATION.md](VERIFICATION.md). Avoid quoting results that are not recorded there.

## Recovery lines

| Situation | Response |
| --- | --- |
| Phone cannot join | “This venue network is blocking the phone connection; this second browser uses the same audience page.” Continue from the prepared guest browser. |
| WebGL is unavailable | Use another prepared WebGL-capable browser. If none is available, demonstrate the editable blueprint and live readout, and state that this browser cannot show the 3D scene. |
| A live integration fails | Read the visible status and continue with **Try example**. Say “That live call failed; this example path is labelled.” |
| Time is running out | Finish the audience interaction and circuit switch. Leave optional drawing, files and presentation controls for questions. |

Do not submit a deployment or video link until it exists and has been opened successfully. Submission text and missing metadata are in [SUBMISSION.md](SUBMISSION.md).
