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
