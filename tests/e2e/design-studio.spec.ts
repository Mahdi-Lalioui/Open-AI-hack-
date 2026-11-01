/** The demo path in a real browser, in example mode: real downloads, real rendering. */
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium, expect, test } from '@playwright/test';
import { DEFAULT_PET } from '../../shared/creations';
import { getState, horizontalOverflow, openLiveTest, pixelStats, post, saveScreenshot, trackErrors } from './helpers';

test('the landing page leads into the app', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await horizontalOverflow(page);
  expect(overflow.overflow, overflow.offenders.join(', ')).toBe(false);
  await page.getByRole('link', { name: /try it out/i }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('generate')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('Design Studio', () => {
  test('example -> 3D -> refine -> undo -> every export downloads a real file', async ({ page }, info) => {
    const errors = trackErrors(page);
    await page.goto('/app');
    await expect(page.getByTestId('ai-pill')).toContainText('No API key');
    await page.getByTestId('template-desk_organiser').click();

    await expect(page.getByTestId('design-source')).toContainText('no AI');
    await expect(page.getByTestId('dimensions')).toContainText('240 × 100');
    await page.waitForTimeout(2500);
    const stats = await pixelStats(page, page.getByTestId('studio-stage'));
    expect(stats.std).toBeGreaterThan(4);
    expect(stats.colours).toBeGreaterThan(20);
    await saveScreenshot(page, `studio-organiser-${info.project.name}`);

    await page.getByTestId('refine-input').fill('make it 50% wider');
    await page.getByTestId('refine-go').click();
    await expect(page.getByTestId('dimensions')).toContainText('360 × 100');
    await expect(page.getByTestId('notes')).toContainText('Increased width by 50%');

    await page.getByTestId('undo').click();
    await expect(page.getByTestId('dimensions')).toContainText('240 × 100');

    for (const [format, extension] of [['scad', 'scad'], ['stl', 'stl'], ['glb', 'glb'], ['webComponent', 'js'], ['webPage', 'html'], ['blueprint', 'json']]) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`export-${format}`).click()]);
      expect(download.suggestedFilename()).toBe(`modular-desk-organiser.${extension}`);
      const file = await download.path();
      expect(fs.statSync(file).size).toBeGreaterThan(100);
      await expect(page.getByTestId(`exported-${format}`)).toContainText(extension);
    }
    expect(errors).toEqual([]);
  });

  test('inspector edits flow through validation', async ({ page }) => {
    await page.goto('/app');
    await page.getByTestId('template-desk_organiser').click();
    await expect(page.getByTestId('dimensions')).toBeVisible();

    await page.getByTestId('overall-height').fill('200');
    await page.getByTestId('overall-height').blur();
    await expect(page.getByTestId('dimensions')).toContainText('× 200 mm');

    await page.getByTestId('part-list').getByRole('button', { name: 'Pen bin' }).click();
    const wall = page.getByTestId('param-wall');
    await expect(wall).toHaveValue('2.4');
    await wall.fill('400');
    await wall.blur();
    await expect(page.getByTestId('problem')).toContainText('no cavity');
    await expect(page.getByTestId('problem')).toContainText('current design was kept');
    await wall.fill('3');
    await wall.blur();
    await expect(page.getByTestId('problem')).toHaveCount(0);
  });

  test('the same design appears as CAD source and as a live web page', async ({ page }, info) => {
    await page.goto('/app');
    await page.getByTestId('template-bedside_table').click();
    await expect(page.getByTestId('dimensions')).toBeVisible();

    await page.getByTestId('view-cad').click();
    await expect(page.getByTestId('cad-source')).toContainText('vd_hollow_box(drawer_width');
    await saveScreenshot(page, `studio-cad-${info.project.name}`);

    await page.getByTestId('view-web').click();
    const frame = page.frameLocator('[data-testid="web-preview"]');
    await expect(frame.locator('h1')).toHaveText('Bedside Table with Drawer');
    await expect(frame.locator('vdraw-model')).toBeVisible();
    await page.waitForTimeout(1200);
    await saveScreenshot(page, `studio-web-${info.project.name}`);
    const stats = await pixelStats(page, page.getByTestId('web-preview'));
    expect(stats.colours).toBeGreaterThan(20);
  });

  test('an exported product page runs on its own', async ({ page, request }, info) => {
    const errors = trackErrors(page);
    const { body } = await post(request, '/api/design/interpret', { templateId: 'planter' });
    const res = await request.post('/api/design/export', { data: { id: body.design.id, format: 'webPage' } });
    await page.setContent((await res.body()).toString('utf8'));
    await expect(page.locator('h1')).toHaveText('Planter with Drainage Saucer');
    const model = page.locator('vdraw-model');
    await expect(model).toBeVisible();
    await expect(model.getByRole('button', { name: 'Exploded view' })).toBeVisible();
    await expect(model.getByRole('button', { name: 'Lift pot' })).toBeVisible();
    await page.waitForTimeout(800);
    const before = await pixelStats(page, model);
    expect(before.std).toBeGreaterThan(5);
    await model.getByRole('button', { name: 'Lift pot' }).click();
    await page.waitForTimeout(1500);
    await saveScreenshot(page, `exported-page-${info.project.name}`);
    expect((await horizontalOverflow(page)).overflow).toBe(false);
    expect(errors).toEqual([]);
  });

  test('without AI, words use rules and sketches are not faked', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId('no-ai-note')).toBeVisible();
    await page.getByTestId('sample-sketch').click();
    await page.getByTestId('generate').click();
    await expect(page.getByTestId('problem')).toContainText('needs AI');

    await page.getByTestId('idea-text').fill('a planter for my windowsill');
    await page.getByTestId('generate').click();
    await expect(page.getByTestId('design-source')).toContainText('no AI');
    await expect(page.getByTestId('notes')).toContainText('not analysed');
  });

  test('circuits and the pet export like any other design', async ({ page }) => {
    await page.goto('/app');
    await page.getByTestId('template-pixel_pet').click();
    await expect(page.getByTestId('design-source')).toContainText('no AI');
    const [toy] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-stl').click()]);
    expect(toy.suggestedFilename()).toBe('pixel.stl');
    await page.getByTestId('template-led_circuit').click();
    await expect(page.getByTestId('dimensions')).toContainText('200 × 140');
    await page.getByTestId('view-cad').click();
    await expect(page.getByTestId('cad-source')).toContainText('board_width');
  });

  test('a design saved as a Blueprint opens again, and a bad file changes nothing', async ({ page }) => {
    await page.goto('/app');
    await page.getByTestId('template-led_circuit').click();
    await expect(page.getByTestId('dimensions')).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-blueprint').click()]);
    const saved = await readFile((await file.path())!);
    expect(JSON.parse(saved.toString('utf8')).circuit.components).toHaveLength(4);

    await page.getByTestId('template-planter').click();
    await expect(page.locator('#summary')).toContainText('Planter');
    await page.getByTestId('blueprint-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"name":"nope"}') });
    await expect(page.getByTestId('problem')).toBeVisible();
    await expect(page.locator('#summary')).toContainText('Planter');

    await page.getByTestId('blueprint-import').setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: saved });
    await expect(page.getByTestId('design-source')).toContainText('saved Blueprint');
    await expect(page.getByTestId('view-live')).toBeVisible();
  });

  test('a refresh keeps the design, including edits to a character', async ({ page, request }) => {
    await openLiveTest(page, 'pixel_pet');
    await page.getByTestId('pet-name').fill('Nova');
    await page.getByTestId('pet-body').selectOption('tall');
    await page.getByTestId('build-world').click();
    await expect.poll(async () => (await getState(request)).creation?.pet?.name).toBe('Nova');
    await page.reload();
    await expect(page.locator('#summary')).toContainText('Nova');
    await page.getByTestId('view-live').click();
    await expect(page.getByTestId('pet-name')).toHaveValue('Nova');
    await expect(page.getByTestId('pet-body')).toHaveValue('tall');
  });

  test('a starter character becomes the design', async ({ page, request }) => {
    await openLiveTest(page, 'pixel_pet');
    await page.getByTestId('starter-orbit').click();
    await page.getByTestId('build-world').click();
    await expect.poll(async () => (await getState(request)).creation?.pet?.name).toBe('Orbit');
    expect((await getState(request)).creation?.pet?.extras).toEqual(['wings']);
    await expect(page.locator('#summary')).toContainText('Orbit');
  });

  test('present mode keeps the stage and interactions usable, and Escape restores the studio', async ({ page, request }) => {
    await request.post('/api/creation', { data: { mode: 'pet', pet: DEFAULT_PET, source: 'example' } });
    await openLiveTest(page, 'pixel_pet');
    const idea = page.getByRole('region', { name: 'Your idea' });
    await expect(idea).toBeVisible();
    const toggle = page.getByTestId('presentation-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(idea).toBeHidden();
    await expect(page.getByTestId('world-canvas')).toBeVisible();
    await expect(page.getByTestId('pet-hunger')).toBeVisible();
    const count = (await getState(request)).pet!.counts.feed;
    await page.getByTestId('host-feed').click();
    await expect.poll(async () => (await getState(request)).pet!.counts.feed).toBe(count + 1);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(idea).toBeVisible();
  });

  test('draw pad supports strokes, undo, clear and a real PNG download', async ({ page }) => {
    await page.goto('/app');
    const pad = page.getByTestId('sketch-canvas');
    await pad.scrollIntoViewIfNeeded();
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
    await page.getByTestId('input-image').check({ force: true });
    await page.getByTestId('input-sketch').check({ force: true });
    await expect(page.getByTestId('sketch-undo')).toBeEnabled();
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sketch-download').click()]);
    expect(png.suggestedFilename()).toBe('my-vdraw-sketch.png');
    const bytes = await readFile((await png.path())!);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await page.getByTestId('sketch-undo').click();
    await expect(page.getByTestId('sketch-clear')).toBeDisabled();
  });

  test('fits the screen with no sideways scrolling', async ({ page }) => {
    await page.goto('/app');
    expect((await horizontalOverflow(page)).overflow).toBe(false);
    await page.getByTestId('template-electronics_case').click();
    await expect(page.getByTestId('dimensions')).toBeVisible();
    await page.getByTestId('part-list').getByRole('button', { name: 'Vented lid' }).click();
    const result = await horizontalOverflow(page);
    expect(result.overflow, result.offenders.join(', ')).toBe(false);
  });

  test('shows a notice and keeps working without WebGL', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (orig as any).call(this, type, ...rest);
      };
    });
    await page.goto('/app');
    await page.getByTestId('template-planter').click();
    await expect(page.getByTestId('webgl-fallback')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-glb').click()]);
    expect(download.suggestedFilename()).toBe('planter-with-drainage-saucer.glb');
  });

  test('a browser with WebGL really disabled shows the fallback', async ({ browser: _browser }, info) => {
    test.skip(info.project.name === 'mobile', 'one launch is enough');
    const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
    try {
      const page = await browser.newPage({ baseURL: info.project.use.baseURL, viewport: { width: 1365, height: 768 } });
      await page.goto('/app');
      await page.getByTestId('template-desk_organiser').click();
      await expect(page.getByTestId('webgl-fallback')).toBeVisible();
      await expect(page.getByTestId('inspector')).toBeVisible();
    } finally {
      await browser.close();
    }
  });
});
