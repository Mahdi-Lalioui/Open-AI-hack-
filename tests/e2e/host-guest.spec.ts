/** Pet + circuit flows in example mode (no OpenAI key). Host = default page, guest = phone context. */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { getState, trackErrors, saveScreenshot } from './helpers';

let ipSeq = 20;
async function newGuest(browser: Browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    extraHTTPHeaders: { 'X-Forwarded-For': `10.20.0.${ipSeq++}` },
  });
  const page = await ctx.newPage();
  return { ctx, page, errors: trackErrors(page) };
}
const num = async (page: Page, id: string) => Number(await page.getByTestId(id).getAttribute('data-value'));

async function buildExample(page: Page, mode: 'pet' | 'circuit') {
  await page.goto('/');
  if (mode === 'circuit') await page.getByTestId('mode-circuit').check();
  await page.getByTestId('try-example').click();
  await page.getByTestId('build-world').click();
  await expect(page.getByTestId('world-canvas')).toBeVisible();
}

test('pet: guest Feed lowers hunger and increments feed count on both screens', async ({ page, browser, request }) => {
  const hostErrors = trackErrors(page);
  await buildExample(page, 'pet');
  await expect(page.getByTestId('pet-hunger')).toBeVisible();
  await expect.poll(async () => (await getState(request)).creation?.mode).toBe('pet');
  const s0 = await getState(request);
  const feeds0 = s0.pet!.counts.feed;
  const g = await newGuest(browser);
  await g.page.goto('/join');
  await g.page.getByTestId('guest-nickname').fill('Mina');
  const hunger0 = await num(page, 'pet-hunger');
  await g.page.getByTestId('guest-feed').click();
  await expect(g.page.getByTestId('guest-confirmation')).toContainText(/Yum/);
  await expect.poll(async () => (await getState(request)).pet!.counts.feed).toBe(feeds0 + 1);
  await expect(page.getByText(new RegExp(`Fed ${feeds0 + 1}\\b`))).toBeVisible();
  expect(await num(page, 'pet-hunger')).toBeLessThan(hunger0);
  await expect(g.page.getByTestId('guest-live')).toContainText('Hunger');
  // reload must not resend
  await g.page.reload();
  await expect(g.page.getByTestId('guest-feed')).toBeVisible();
  expect((await getState(request)).pet!.counts.feed).toBe(feeds0 + 1);
  await saveScreenshot(page, 'flow-host-pet');
  await saveScreenshot(g.page, 'flow-guest-pet');
  expect(hostErrors, hostErrors.join('\n')).toEqual([]);
  expect(g.errors, g.errors.join('\n')).toEqual([]);
  await g.ctx.close();
});

test('circuit: guest Flip switch turns the LED on with a current in mA', async ({ page, browser, request }) => {
  const hostErrors = trackErrors(page);
  await buildExample(page, 'circuit');
  await expect(page.getByTestId('circuit-led')).toHaveText('Off');
  const g = await newGuest(browser);
  await g.page.goto('/join');
  await g.page.getByTestId('guest-toggle_switch').click();
  await expect(g.page.getByTestId('guest-confirmation')).toContainText(/flipped/);
  await expect(page.getByTestId('circuit-led')).toHaveText('On');
  await expect(page.getByTestId('circuit-current')).toContainText('mA');
  expect(await num(page, 'circuit-current')).toBeGreaterThan(0);
  await expect(g.page.getByTestId('guest-live')).toContainText('LED on');
  const s = await getState(request);
  expect(s.circuit?.switchClosed).toBe(true);
  await saveScreenshot(page, 'flow-host-circuit');
  expect(hostErrors, hostErrors.join('\n')).toEqual([]);
  expect(g.errors, g.errors.join('\n')).toEqual([]);
  await g.ctx.close();
});

test('example mode: API badges say Not configured and example is labelled', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('try-example').click();
  await expect(page.getByTestId('example-badge')).toBeVisible();
  for (const k of ['vision', 'decisions', 'image']) {
    const b = page.getByTestId(`api-status-${k}`);
    if (await b.count()) await expect(b).toHaveText(/Not configured/);
  }
});
