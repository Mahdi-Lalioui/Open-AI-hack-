import { expect, test } from '@playwright/test';
import { DEFAULT_PET } from '../../shared/creations';
import { getState, trackErrors } from './helpers';

test.beforeEach(async ({ request }) => {
  await request.post('/api/creation', { data: { mode: 'pet', pet: DEFAULT_PET, source: 'example' } });
});

test('host can feed, pet and play with the confirmed creation', async ({ page, request }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const before = (await getState(request)).pet!.counts;
  for (const kind of ['feed', 'pet', 'play'] as const) {
    const button = page.getByTestId(`host-${kind}`);
    await expect(button).toBeVisible({ timeout: 2000 });
    await button.click();
    await expect.poll(async () => (await getState(request)).pet!.counts[kind]).toBe(before[kind] + 1);
  }
  await expect(page.getByTestId('host-confirmation')).toContainText(/play/i);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('presentation keeps the stage and interactions usable and Escape restores the editor', async ({ page, request }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Sketch to creation' });
  await expect(editor).toBeVisible();
  const toggle = page.getByTestId('presentation-toggle');
  await expect(toggle).toBeVisible({ timeout: 2000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeHidden();
  await expect(page.getByTestId('world-canvas')).toBeVisible();
  await expect(page.getByTestId('pet-hunger')).toBeVisible();
  const count = (await getState(request)).pet!.counts.feed;
  await page.getByTestId('host-feed').click();
  await expect.poll(async () => (await getState(request)).pet!.counts.feed).toBe(count + 1);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(editor).toBeVisible();
});
