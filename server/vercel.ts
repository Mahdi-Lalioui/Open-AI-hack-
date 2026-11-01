/**
 * The API as one Vercel function. Vercel has no long-running process, so there is no Socket.IO here and the
 * live test is switched off (the design status says so). Everything else works from each request.
 */
import { createApp } from './app';
import { loadConfig } from './config';
import { createOpenAIAdapter } from './openai';
import { createDesignAi } from './openai/design';
import { LiveSession } from './session';

const config = loadConfig();
const openai = createOpenAIAdapter(config.openai);
const session = new LiveSession({ initialApiStatus: openai.initialStatus(), publicBaseUrl: config.publicBaseUrl });

export default createApp({ session, openai, designAi: createDesignAi(config.openai), liveTest: false });
