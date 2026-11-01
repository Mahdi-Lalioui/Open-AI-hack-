/** Environment configuration. OWNER: lead. Never log the API key. */
export interface AppConfig {
  host: string;
  port: number;
  publicBaseUrl: string | null;
  isProduction: boolean;
  openai: {
    apiKey: string | null;
    baseUrl: string;
    visionModel: string;
    decisionsModel: string;
    imageModel: string;
    transcribeModel?: string;
    /** Request timeouts in ms. */
    designTimeoutMs?: number;
    visionTimeoutMs: number;
    decisionsTimeoutMs: number;
    imageTimeoutMs: number;
  };
}

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const key = clean(env.OPENAI_API_KEY);
  const publicBase = clean(env.PUBLIC_BASE_URL);
  return {
    host: clean(env.HOST) ?? '0.0.0.0',
    port: Number(env.PORT) || 5173,
    publicBaseUrl: publicBase ? publicBase.replace(/\/+$/, '') : null,
    isProduction: env.NODE_ENV === 'production',
    openai: {
      // Treat the placeholder from .env.example as "not configured".
      apiKey: key && key !== 'sk-your-key-here' ? key : null,
      baseUrl: (clean(env.OPENAI_BASE_URL) ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
      visionModel: clean(env.OPENAI_VISION_MODEL) ?? 'gpt-6-astra',
      decisionsModel: clean(env.OPENAI_DECISIONS_MODEL) ?? 'gpt-6-luna',
      imageModel: clean(env.OPENAI_IMAGE_MODEL) ?? 'gpt-image-2.5-flare',
      transcribeModel: clean(env.OPENAI_TRANSCRIBE_MODEL) ?? 'gpt-4o-transcribe',
      // A full Blueprint is far longer than a sketch reading.
      designTimeoutMs: Number(env.OPENAI_DESIGN_TIMEOUT_MS) || 180_000,
      visionTimeoutMs: Number(env.OPENAI_VISION_TIMEOUT_MS) || 45_000,
      decisionsTimeoutMs: Number(env.OPENAI_DECISIONS_TIMEOUT_MS) || 20_000,
      imageTimeoutMs: Number(env.OPENAI_IMAGE_TIMEOUT_MS) || 90_000,
    },
  };
}
