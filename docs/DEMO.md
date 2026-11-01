# VDraw demo script

This takes about three minutes. With a configured key, a new design can take up to a minute and a refinement around 30 seconds, so plan to talk through the problem while they run. The built-in examples need no key and no internet, which makes them your backup if anything goes wrong.

## Before you go on

Run `npm ci`, `npm run build` and `npm start`, then run `npm run smoke:design` once so you know the key and models are working that day. Open `http://localhost:5173` in a browser with WebGL and keep a second browser at `/join` ready. If you want real phones in the room, set `PUBLIC_BASE_URL` to a reachable address before starting the server and try the QR code on the venue's Wi-Fi first. It also helps to close anything unrelated and enlarge the browser for the projector.

## Run of show

| Time | What you do | What you say |
|---|---|---|
| 0:00 | Show the landing page and press **Try it out**. | "Turning an idea into something real usually means learning CAD, 3D tools and some code, so we built VDraw to start from the rough idea instead." |
| 0:15 | Press **Sample sketch**, type *A modular desk organiser with a tall pen bin, two cups and a phone tray, about 24 cm wide*, and press **Create design**. | "I could sketch this, upload a photo, type it or say it out loud. The AI isn't drawing a picture here, it's filling in a structured Blueprint that we check before anything gets built." |
| 1:00 | When it appears, rotate it, press **Exploded view**, then press its animation button. | "This is real geometry measured in millimetres, and underneath you can see what it had to assume." |
| 1:20 | Under **Refine it**, type *make it 20% wider and make the phone tray blue*. | "If I want it changed, I just say so." |
| 1:50 | Click a part in the inspector and change one of its sizes. | "I can also edit the real parameters by hand, and if I ask for something impossible it refuses and keeps my design." |
| 2:05 | Open the **CAD source** and **Web page** tabs, then download the STL. | "All of these come from the same Blueprint, so the CAD file, the print file and the web page can't disagree with each other." |
| 2:25 | Under the examples, press **LED circuit**, then **Live test**. Flip the switch, then flip it from the phone. | "Designs that do something can be tested too. This is a real series calculation, where 9 volts, a 2 volt LED and 470 ohms gives about 14.9 milliamps, and everyone's screen stays in sync." |
| 2:45 | For a laugh, press **Pixel the pet**, then **Live test**, and feed it from the phone. | "And it doesn't always have to be serious." |

The bedside table, the electronics case and the planter are all good to have ready for questions, especially the table with its **Open drawer** animation. When the pet's decision comes from a rule rather than the AI, the app labels it, so don't promise a particular result.

## If something goes wrong

| What happens | What to do |
|---|---|
| The AI is slow or fails | The error explains why and your design stays put. Press **Try without AI**, or load **Desk organiser** from the examples and say that it's a built-in one. |
| A phone can't join | Say the network is blocking phones and carry on with the second browser, since it's the same audience page. |
| WebGL isn't available | Switch browsers if you can. Otherwise show the inspector, the CAD source and the exports, which all still work. |
| You're running out of time | Jump to the CAD source and web page tabs, because that's the moment that shows one idea becoming several real outputs. |

Please don't submit a deployment or video link until it exists and someone has opened it successfully. The rest of the submission text is in [SUBMISSION.md](SUBMISSION.md).
