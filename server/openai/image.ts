/**
 * Bean mascot generation with the Image API.
 *
 * Request shape verified against (2026-11-01):
 * - https://developers.openai.com/api/docs/guides/image-generation (background "transparent" needs png/webp)
 * - https://developers.openai.com/api/reference/resources/images/methods/generate
 *   POST /v1/images/generations → { data: [{ b64_json }] } (GPT Image models always return base64)
 */
import { invalidOutputError } from './errors';

export const BEAN_PROMPT = [
  'A friendly, round coffee-bean pet mascot named Bean.',
  'Flat 2D sticker style with a clean outline, big expressive eyes and a small happy smile, tiny arms waving hello.',
  'Warm paper cream, teal and coral colour palette.',
  'Centered, full body, isolated on a transparent background.',
  'No text, no letters, no logo, no frame.',
].join(' ');

export function buildImageRequest(model: string) {
  return {
    model,
    prompt: BEAN_PROMPT,
    n: 1,
    size: '1024x1024',
    quality: 'medium',
    background: 'transparent',
    output_format: 'png',
  };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function parseImageResponse(response: unknown): Buffer {
  const data = (response as { data?: unknown } | null)?.data;
  const first = Array.isArray(data) ? (data[0] as { b64_json?: unknown } | undefined) : undefined;
  const b64 = first?.b64_json;
  if (typeof b64 !== 'string' || !b64) throw invalidOutputError('image', 'no image data');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw invalidOutputError('image', 'the image was not a PNG');
  }
  return bytes;
}

import type { PetSpec } from '../../shared/creations';

/** 2D portrait/skin of the user's pet built from its parts (a flat texture, not a 3D model). */
export function petImagePrompt(pet: PetSpec): string {
  const eyes = `${pet.eyeCount} ${pet.eyeStyle} eye${pet.eyeCount > 1 ? 's' : ''}`;
  const parts = [
    `a ${pet.bodyShape} body in ${pet.bodyColor} with ${pet.accentColor} accents`,
    eyes,
    pet.ears === 'none' ? 'no ears' : `${pet.ears} ears`,
    pet.legs ? `${pet.legs} little legs` : 'no legs',
    pet.tail === 'none' ? 'no tail' : `a ${pet.tail} tail`,
    pet.mouth === 'none' ? 'no mouth' : `a ${pet.mouth === 'open' ? 'open happy' : 'smiling'} mouth`,
    ...(pet.extras.length ? [`extras: ${pet.extras.join(', ')}`] : []),
  ];
  return [
    `A cute 2D character portrait of a friendly pet creature named ${pet.name.replace(/[^\p{L}\p{N} '-]/gu, '')}:`,
    `${parts.join('; ')}.`,
    'Flat 2D sticker illustration, clean outline, soft shading, front view, centered, full body,',
    'transparent background. No text, no letters, no frame.',
  ].join(' ');
}

export function buildPetImageRequest(model: string, pet: PetSpec) {
  return { ...buildImageRequest(model), prompt: petImagePrompt(pet) };
}
