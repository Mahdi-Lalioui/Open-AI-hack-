# Deploying VDraw

There are two sensible ways to host VDraw, and the choice comes down to whether you need the Live test on the public site. Vercel gives you the landing page and the whole design studio, including AI, 3D and every export, but it has no long-running server, so the Live test and the phone audience are switched off there and the Live test tab doesn't appear. If you want those for the demo, use an always-on Node host such as Render or Railway, or run it on your own machine behind a tunnel.

## Vercel

Import the repository at [vercel.com/new](https://vercel.com/new) and leave the framework preset, build command and output directory alone, because `vercel.json` in the repository already sets them. Before the first deploy, open **Environment Variables** and add these for Production (and for Preview if you want AI on preview links):

| Name | Value |
|---|---|
| `OPENAI_API_KEY` | Your key. Mark it as sensitive, and never give it a `VITE_` prefix, because that would publish it in the browser code |
| `OPENAI_VISION_MODEL` | `gpt-6-astra`, or whichever model your account can use |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-transcribe` |

Don't set `NODE_ENV` yourself. If it's set to `production` during the build, npm skips the development packages and the build fails, so remove it if you added it along with your other variables. Environment variable changes only take effect on a new deployment, so redeploy after changing one.

Once it's deployed, open the site, press **Try it out**, load an example and download an STL to confirm the API works, then press **Sample sketch**, add a description and press **Create design** to confirm the AI works.

### What's different on Vercel

Each request can land on a fresh server instance with empty memory, so the browser sends its copy of the design along with each change or export and the server validates it again. That covers normal use, but **Undo** and the recovery of a design after a page refresh only work while the same instance stays alive, so you may occasionally see a message that the design is no longer on the server. Saving a Blueprint is the reliable way to keep your work.

The function can run for up to 300 seconds, which is enough for a design checked against a drawing (usually a minute or two). That limit depends on your Vercel plan and its settings, so if long requests get cut off, check the function's maximum duration in the project settings. Vercel also limits a request to 4.5 MB, and the app shrinks uploaded photos in the browser to stay under it.

We've built this output and run its function locally, but we haven't been able to test it on Vercel's own servers, so do the checks above on your first deploy.

## An always-on host, with the Live test

On Render, Railway or anything similar that runs a Node process, use these settings:

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Environment variables | `OPENAI_API_KEY`, plus `PUBLIC_BASE_URL` set to the site's public address, without `/join` |

The QR code uses `PUBLIC_BASE_URL`, so set it to the real address once you know it and restart. Run a single instance, because the live session lives in that process's memory and restarting clears it. The host also has to forward WebSocket connections, which these platforms do by default. Then open the site, load the LED circuit, open its Live test, scan the QR code with a phone and flip the switch to confirm that both screens change.

## Your own computer

This is often the safest option for a live demo. Run `npm run build` and `npm start`, then either share this computer's address on the same Wi-Fi or expose it through a tunnel, and set `PUBLIC_BASE_URL` to whichever address phones will use. Some venue networks block devices from reaching each other, so try it on the actual network beforehand.

Whichever host you choose, run `npm run smoke:design` once with the same key to confirm that the key and models work, and keep in mind that the app has no accounts. Anyone with the link can use your API key's credit through the AI features, and on an always-on host they can change the shared Live test too, so keep the link among people you trust and set a spending limit on the key.
