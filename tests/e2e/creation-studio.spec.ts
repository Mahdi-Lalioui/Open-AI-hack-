import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DEFAULT_PET } from '../../shared/creations';

test('refresh keeps the confirmed editable pet blueprint', async ({ page, request }) => {
  const custom = { ...DEFAULT_PET, name: 'Nova', bodyShape: 'tall', bodyColor: '#AABBDD', ears: 'floppy', extras: ['wings'] };
  await request.post('/api/creation', { data: { mode: 'pet', pet: custom, source: 'manual' } });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Nova');
  await expect(page.getByTestId('pet-body')).toHaveValue('tall');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Nova 2');
  await page.getByTestId('build-world').click();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).creation?.pet?.name).toBe('Nova 2');
  const state = await (await request.get('/api/state')).json();
  expect(state.creation.pet).toEqual({ ...custom, name: 'Nova 2' });
});

test('draw pad supports strokes, undo, clear and a real PNG download', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('input-draw').click();
  const pad = page.getByTestId('sketch-canvas');
  await expect(pad).toBeVisible();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 65, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('sketch-undo')).toBeEnabled();
  expect(await pad.evaluate((el) => {
    const pixels = (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 560, 360).data;
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 240 && pixels[i + 1] < 240 && pixels[i + 2] < 240) ink++;
    return ink;
  })).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.getByTestId('input-draw').click();
  await expect(page.getByTestId('sketch-undo')).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await page.getByTestId('sketch-download').click();
  const png = await downloaded;
  expect(png.suggestedFilename()).toBe('my-living-paper-sketch.png');
  const bytes = await readFile((await png.path())!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([560, 360]);
  await page.getByTestId('sketch-undo').click();
  await expect(page.getByTestId('sketch-undo')).toBeDisabled();
  await expect(page.getByTestId('sketch-clear')).toBeDisabled();
});

test('blueprint download and import rebuild a real creation', async ({ page, request }) => {
  await request.post('/api/creation', { data: { mode: 'pet', pet: DEFAULT_PET, source: 'manual' } });
  await page.goto('/');
  const downloaded = page.waitForEvent('download');
  await page.getByTestId('blueprint-download').click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('pixel.living-paper.json');
  const contents = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(contents.design.pet).toEqual(DEFAULT_PET);
  const pet = { ...DEFAULT_PET, name: 'Imported', ears: 'round' };
  await page.getByTestId('blueprint-import').setInputFiles({ name: 'pet.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'living-paper/blueprint', version: 1, design: { mode: 'pet', pet, source: 'manual' } })) });
  await expect.poll(async () => (await (await request.get('/api/state')).json()).creation?.pet?.name).toBe('Imported');
  await expect(page.getByTestId('blueprint-status')).toContainText(/imported/i);
});

test('a starter can become a real creation from the first input card', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('starter-orbit').click();
  await page.getByTestId('quick-build').click();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).creation?.pet?.name).toBe('Orbit');
  const creation = (await (await request.get('/api/state')).json()).creation;
  expect(creation.pet.eyeCount).toBe(3);
  expect(creation.pet.extras).toEqual(['wings']);
  expect(creation.source).toBe('example');
});

test('invalid blueprint import keeps the last confirmed creation', async ({ page, request }) => {
  await request.post('/api/creation', { data: { mode: 'pet', pet: DEFAULT_PET, source: 'manual' } });
  await page.goto('/');
  await page.getByTestId('blueprint-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"mode":"unknown"}') });
  await expect(page.getByTestId('blueprint-status')).toContainText(/Living Paper/i);
  expect((await (await request.get('/api/state')).json()).creation.pet.name).toBe('Pixel');
});

test('opening a blueprint waits for the current build to finish', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('quick-build').click();
  await expect(page.getByTestId('blueprint-import')).toBeDisabled();
  await expect(page.getByTestId('quick-build')).toBeEnabled();
  await expect(page.getByTestId('blueprint-import')).toBeEnabled();
});
