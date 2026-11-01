# Public demo and API key handoff

The current app runs a single Express/Socket.IO server with one authoritative **in-memory** session. For the deadline demo, run that Node process on the credentialed teammate's machine or an existing Node environment, and expose it through an existing reachable HTTPS endpoint or tunnel. Host, audience, API and Socket.IO must use the same public origin.

## Verify on the teammate's machine

Keep the real `OPENAI_API_KEY` in the project-root `.env` or the server environment. The smoke script loads `.env`; there is no need to send the key in chat or commit it. From the repository root:

```bash
npm ci
npm run smoke:live
npm run build
npm start
```

The smoke check makes real pet/circuit vision and pet-decision requests. It prints `PASS` or `FAIL` per integration. It reports “not verified” when no key is configured. To verify portrait generation as well, run `npm run smoke:live -- --image`; that also requests a billed image. A key's presence alone does not confirm model access or working requests.

Set `PUBLIC_BASE_URL` in `.env` to the actual public HTTPS origin, without `/join`, before starting the server. The QR code appends `/join`. Keep the single Node process running during the demonstration; restarting it clears the live session, so save important blueprints first. This is the existing application topology, not a new hosting integration.

Open that public origin in the host browser and scan its QR code on a phone. Build a pet, send Feed/Pet/Play from the phone, confirm the host readout changes, then build a circuit and flip its switch. Reconnect the phone once and confirm the same creation returns. The HTTPS endpoint must forward both ordinary HTTP requests and WebSocket upgrades to the same Node process.

## Configure a key in Vercel

A local `.env` on your friend's computer does **not** automatically configure a Vercel deployment. In the intended Vercel project's **Settings → Environment Variables**, add `OPENAI_API_KEY` with type **Secret**, scoped to **Production** and to **Preview** if previews need live AI. Save it and redeploy each target environment: variable changes apply to new deployments. Keep the name server-only; never use `VITE_OPENAI_API_KEY` or another `VITE_` prefix for a secret. Model settings and `PUBLIC_BASE_URL` are non-secret configuration. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

Setting that key supplies credentials; it does not resolve the app's shared-state architecture.

## What a complete Vercel deployment still needs

Vercel supports WebSockets and Socket.IO with the client configured for websocket-only transport. A connection stays on one function instance, but other connections or reconnects can reach another instance. Connections also close at function maximum duration. Shared state and pub/sub must live outside process memory. See [Vercel's WebSocket lifecycle and state guidance](https://vercel.com/docs/functions/websockets#manage-persistent-state).

For this repository, completing that deployment therefore requires:

- A Vercel server entry/routing configuration that serves the client, REST API and Socket.IO endpoint, with the client using the matching WebSocket path and transport.
- Shared authoritative creation, pet/circuit, interaction and decision state, plus pub/sub so every host and guest receives changes across instances. Cached portrait bytes and simulation ownership also need a consistent home.
- Reconnect/resynchronisation tests across different instances, function-duration disconnects and deployments, plus the real public host/phone flow and live API checks.

Those changes are not implemented or verified by adding this guide. Publishing only `dist/client`, or adding an API key to an otherwise static Vercel build, does not deploy the complete shared-world application. Use the single-process path above for the current demo until the distributed flow has been implemented and tested.
