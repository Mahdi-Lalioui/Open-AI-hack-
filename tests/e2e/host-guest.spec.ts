/**
 * Host + guest flow in example mode (no OpenAI key, no paid calls).
 * Host runs in the default (desktop) page; the guest uses a second, phone-sized browser context.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { expectMetric, getState, metricValue, resetSession, saveScreenshot, trackErrors } from './helpers';

let ipSeq = 20;

/** A phone-sized guest context. Each guest gets its own forwarded IP so the per-IP order limit
 *  (1 per 1.5 s, 12 per minute) does not leak between tests. */
async function newGuest(browser: Browser): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { 'X-Forwarded-For': `10.20.0.${ipSeq++}` },
  });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  return { ctx, page, errors };
}

/** Number shown in the guest queue panel ("3 waiting" / "Waiting: 3"). */
async function guestWaiting(page: Page): Promise<number | null> {
  const el = page.getByTestId('guest-queue');
  const attr = await el.getAttribute('data-waiting');
  if (attr !== null && attr !== '') return Number(attr);
  const text = (await el.innerText()).replace(/\s+/g, ' ');
  const m = text.match(/(\d+)\s*(?:people\s+|orders?\s+|customers?\s+)?waiting/i) ?? text.match(/waiting\D{0,12}(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function openHostWithExample(page: Page) {
  await page.goto('/');
  await page.getByTestId('try-example').click();
  await expect(page.getByTestId('build-world')).toBeEnabled();
  await page.getByTestId('build-world').click();
  await expect(page.getByTestId('world-canvas')).toBeVisible();
}

test.describe('host and guest (example mode)', () => {
  test.beforeEach(async ({ request }) => {
    await resetSession(request);
  });

  test('build world, guest order, add worker, reset, guest reload stay consistent', async ({ page, browser, request }) => {
    const hostErrors = trackErrors(page);
    await openHostWithExample(page);
    const built = await getState(request);
    expect(built.world?.source).toBe('example');
    await expectMetric(page, 'submitted', 0);

    await page.getByTestId('sim-speed').selectOption('10');
    await page.getByTestId('sim-start').click();
    await expect(page.getByTestId('sim-start')).toHaveText(/Pause/);
    // The automatic arrival at t=0 happens on Start.
    await expect.poll(() => metricValue(page, 'submitted')).toBeGreaterThanOrEqual(1);

    const guest = await newGuest(browser);
    await guest.page.goto('/join');
    const before = (await metricValue(page, 'submitted')) ?? 0;
    await guest.page.getByTestId('guest-nickname').fill('Mina');
    await guest.page.getByTestId('guest-send').click();
    await expect(guest.page.getByTestId('guest-confirmation')).toBeVisible();
    await expect.poll(() => metricValue(page, 'submitted')).toBeGreaterThan(before);

    // Pause so both screens can be compared at one instant.
    await page.getByTestId('sim-start').click();
    await expect(page.getByTestId('sim-start')).toHaveText(/Start/);
    const paused = await getState(request);
    expect(paused.sim.running).toBe(false);
    const mine = paused.sim.orders.filter((o) => o.origin === 'audience');
    expect(mine).toHaveLength(1);
    expect(mine[0].nickname).toBe('Mina');
    await expectMetric(page, 'submitted', paused.sim.metrics.submitted);
    await expectMetric(page, 'waiting', paused.sim.metrics.waiting);
    await expect.poll(() => guestWaiting(guest.page)).toBe(paused.sim.metrics.waiting);
    await saveScreenshot(guest.page, 'flow-guest-after-order');

    // Reloading the guest page must not resubmit the order.
    await guest.page.reload();
    await expect(guest.page.getByTestId('guest-queue')).toBeVisible();
    await expect.poll(() => guestWaiting(guest.page)).toBe(paused.sim.metrics.waiting);
    const afterReload = await getState(request);
    expect(afterReload.sim.metrics.submitted).toBe(paused.sim.metrics.submitted);
    expect(afterReload.sim.orders.filter((o) => o.origin === 'audience')).toHaveLength(1);

    // Manual worker.
    await page.getByTestId('add-worker').click();
    await expectMetric(page, 'workers', 2);
    expect((await getState(request)).sim.metrics.workers).toBe(2);
    await saveScreenshot(page, 'flow-host-two-workers');

    // Reset: host and guest both go back to an empty queue.
    await page.getByTestId('sim-reset').click();
    // A confirm dialog is acceptable UX; accept it if it appears.
    const confirm = page.getByRole('button', { name: /^(confirm|yes|reset now|reset)$/i }).filter({ hasNot: page.getByTestId('sim-reset') });
    if (await confirm.count().catch(() => 0)) await confirm.first().click().catch(() => {});
    await expectMetric(page, 'submitted', 0);
    await expectMetric(page, 'workers', 1);
    await expect.poll(() => guestWaiting(guest.page)).toBe(0);
    const resetState = await getState(request);
    expect(resetState.sim.epoch).toBe(paused.sim.epoch + 1);
    expect(resetState.world).not.toBeNull();

    await guest.page.reload();
    await expect(guest.page.getByTestId('guest-queue')).toBeVisible();
    await expect.poll(() => guestWaiting(guest.page)).toBe(0);
    expect((await getState(request)).sim.metrics.submitted).toBe(0);
    await expectMetric(page, 'submitted', 0);

    expect(hostErrors, hostErrors.join('\n')).toEqual([]);
    expect(guest.errors, guest.errors.join('\n')).toEqual([]);
    await guest.ctx.close();
  });

  test('presenter order adds one presenter order', async ({ page, request }) => {
    const errors = trackErrors(page);
    await resetSession(request, { buildWorld: true });
    await page.goto('/');
    await expectMetric(page, 'submitted', 0);
    await page.getByTestId('presenter-order').click();
    await expectMetric(page, 'submitted', 1);
    const s = await getState(request);
    expect(s.sim.orders).toHaveLength(1);
    expect(s.sim.orders[0].origin).toBe('presenter');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('example mode: Ask Bean gives an "Example action", never an AI decision; APIs Not configured', async ({ page, request }) => {
    const errors = trackErrors(page);
    await resetSession(request, { buildWorld: true });
    await page.goto('/');
    for (const kind of ['vision', 'decisions', 'image']) {
      await expect(page.getByTestId(`api-status-${kind}`)).toHaveText(/Not configured/);
    }
    // Clock stopped: the first order goes into service, the next three wait -> rule says call backup.
    for (let i = 1; i <= 4; i++) {
      await page.getByTestId('presenter-order').click();
      await expectMetric(page, 'submitted', i);
    }
    await expectMetric(page, 'waiting', 3);
    await page.getByTestId('ask-bean').click();
    const action = page.getByTestId('bean-action');
    await expect(action).toContainText('Example action');
    await expect(action).not.toContainText('AI decision');
    const s = await getState(request);
    expect(s.bean.lastDecision?.source).toBe('example');
    expect(s.bean.lastDecision?.action).toBe('call_backup');
    // AI management is off, so nothing was changed.
    expect(s.bean.lastDecision?.applied).toBe(false);
    await expectMetric(page, 'workers', 1);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('AI management on: the example rule may add the worker, still labelled "Example action"', async ({ page, request }) => {
    const errors = trackErrors(page);
    await resetSession(request, { buildWorld: true });
    await page.goto('/');
    const box = page.getByTestId('ai-management');
    await box.check();
    await expect.poll(async () => (await getState(request)).bean.aiManagement).toBe(true);
    for (let i = 1; i <= 4; i++) {
      await page.getByTestId('presenter-order').click();
      await expectMetric(page, 'submitted', i);
    }
    await page.getByTestId('ask-bean').click();
    await expect(page.getByTestId('bean-action')).toContainText('Example action');
    await expect(page.getByTestId('bean-action')).not.toContainText('AI decision');
    await expectMetric(page, 'workers', 2);
    const s = await getState(request);
    expect(s.bean.lastDecision).toMatchObject({ source: 'example', action: 'call_backup', applied: true });
    expect(s.sim.workers[1].addedBy).toBe('example');
    await box.uncheck();
    await expect.poll(async () => (await getState(request)).bean.aiManagement).toBe(false);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
