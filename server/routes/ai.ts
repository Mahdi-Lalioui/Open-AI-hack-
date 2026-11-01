/** TEMPORARY STUB — the OpenAI agent replaces this file. Keep the export signature. */
import { Router } from 'express';
import type { LiveSessionApi } from '../types';
import type { OpenAIAdapter } from '../openai';

export function createAiRouter(_session: LiveSessionApi, _openai: OpenAIAdapter): Router {
  return Router();
}
