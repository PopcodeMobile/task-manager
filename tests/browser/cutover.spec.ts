import { test, expect } from '@playwright/test';
const cloud = !!process.env.TEST_SUPABASE_URL;
test('final SPA serves root, auth callback, consent and deep links with query-preserving reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const destination of [
    '/',
    '/index.html',
    '/login?returnTo=%2Fapp%2Fw%2Ffixture%2Ftasks',
    '/auth/callback?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dretained&probe=callback',
    '/oauth/consent?authorization_id=retained&probe=consent',
    '/integrations?probe=integration',
    '/app/w/fixture/tasks?task=retained&probe=deep-link',
  ]) {
    const response = await page.goto(destination);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Entre pra continuar' })).toBeVisible();
    const expected = new URL(destination, page.url());
    expect(new URL(page.url()).search).toBe(expected.search);
    await page.reload();
    await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
    expect(new URL(page.url()).search).toBe(expected.search);
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.locator('#app')).toHaveCount(0);
  }
  if (!cloud) {
    await page.getByRole('link', { name: 'Continuar neste dispositivo' }).click();
    await expect(page.locator('.work-status')).toContainText('Armazenado neste dispositivo');
    await page.reload();
    await expect(page.locator('.work-status')).toContainText('Armazenado neste dispositivo');
  }
  expect(errors).toEqual([]);
});
