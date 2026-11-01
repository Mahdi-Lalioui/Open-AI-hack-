/**
 * TEMPORARY STUB written by the lead — the OpenAI agent replaces this file.
 * Contract that must be kept: createOpenAIAdapter(config, deps?) and adapter.initialStatus().
 */
import type { ApiStatusMap } from '../../shared/types';
import type { AppConfig } from '../config';

export interface OpenAIAdapter {
  initialStatus(): ApiStatusMap;
  readonly configured: boolean;
}

export function createOpenAIAdapter(config: AppConfig['openai']): OpenAIAdapter {
  const configured = Boolean(config.apiKey);
  const entry = (model: string) => ({
    state: configured ? ('ready' as const) : ('not_configured' as const),
    model,
    message: configured ? 'Key configured; not called yet.' : 'No OPENAI_API_KEY set — example mode.',
    updatedAt: Date.now(),
  });
  return {
    configured,
    initialStatus: () => ({
      vision: entry(config.visionModel),
      decisions: entry(config.decisionsModel),
      image: entry(config.imageModel),
    }),
  };
}
