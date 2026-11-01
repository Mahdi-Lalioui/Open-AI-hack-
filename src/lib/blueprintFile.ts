import type { CreationConfig } from '../../shared/creations';
import { buildCreationSchema, type BuildCreationInput } from '../../shared/blueprint';

export const MAX_BLUEPRINT_BYTES = 128 * 1024;
const FORMAT = 'living-paper/blueprint';

/** Portable specifications only: never save session state, audience names or credentials. */
export function serializeBlueprint(creation: CreationConfig): { filename: string; contents: string } {
  const result = buildCreationSchema.safeParse(creation);
  if (!result.success) throw new Error('This creation does not have a valid blueprint to save.');
  const design = result.data;
  const name = design.mode === 'pet' ? design.pet.name : 'circuit';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'creation';
  return {
    filename: `${slug}.living-paper.json`,
    contents: JSON.stringify({ format: FORMAT, version: 1, design }, null, 2),
  };
}

export function parseBlueprint(text: string): BuildCreationInput {
  if (new TextEncoder().encode(text).length > MAX_BLUEPRINT_BYTES) throw new Error('Blueprint files must be under 128 KB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose a Living Paper blueprint.'); }
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== FORMAT) {
    throw new Error('Choose a Living Paper blueprint saved with “Save blueprint”.');
  }
  const file = value as { version?: unknown; design?: unknown };
  if (file.version !== 1) throw new Error('This blueprint version is not supported. Expected version 1.');
  const result = buildCreationSchema.safeParse(file.design);
  if (!result.success) throw new Error('The blueprint contains invalid or incomplete creation details. Your current creation was kept.');
  // A file is editable user input; importing does not claim a fresh AI interpretation.
  return { ...result.data, source: 'manual' };
}

export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
