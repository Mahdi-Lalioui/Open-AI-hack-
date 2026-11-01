/** Contract between the Studio UI and /api/design. */
import type { DesignBlueprint } from './types';

export interface DesignSource {
  kind: 'ai' | 'rules' | 'example' | 'file' | 'manual';
  /** Shown to the user, so it is always clear whether AI produced this. */
  label: string;
  model?: string;
}

export interface DesignVersionSummary {
  version: number;
  summary: string;
  source: DesignSource;
}

export interface StudioDesign {
  id: string;
  version: number;
  blueprint: DesignBlueprint;
  warnings: string[];
  notes: string[];
  source: DesignSource;
  history: DesignVersionSummary[];
}

export interface StudioStatus {
  ok: true;
  ai: { configured: boolean; model: string | null; transcribeModel: string | null };
  templates: { id: string; title: string; scenario: string }[];
  formats: { id: string; label: string; extension: string }[];
  ruleHelp: string;
  /** False on hosts with no long-running server, such as Vercel. */
  liveTest: boolean;
}
