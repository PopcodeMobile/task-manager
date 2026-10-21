import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route =>
    new URL(route.request().url()).origin === new URL(baseURL!).origin && route.request().method() === 'GET' ? route.continue() : route.abort(),
  );
});
test('custom HEX applies only on save, persists through reload/theme and presets clear overrides', async ({ page }) => {
  await page.goto('/app-local/w/w1/settings?sec=appearance');
  const hex = page.getByRole('textbox', { name: 'Código HEX', exact: true });
  await hex.fill('#f58220');
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', '#F58220');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', '#F58220');
  await page.reload();
  await expect(hex).toHaveValue('#F58220');
  await page.getByRole('radio', { name: 'Escuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(hex).toHaveValue('#F58220');
  await hex.fill('url(evil)');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HEX válido');
  await expect(page.locator('html')).toHaveAttribute('data-accent', '#F58220');
  await page.getByRole('radio', { name: 'indigo', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'indigo');
  expect(await page.locator('html').evaluate(el => (el as HTMLElement).style.getPropertyValue('--acc-l'))).toBe('');
});
test('organization logo previews, saves, survives reload and can be removed', async ({ page }) => {
  await page.goto('/app-local/w/w1/settings?sec=workspace');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f58220';
    ctx.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page
    .getByLabel('Enviar logo da organização', { exact: true })
    .setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.organization-logo-editor img')).toBeVisible();
  await expect(page.locator('.workspace-picker .brand-symbol img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salvar espaço', exact: true }).click();
  await expect(page.locator('.workspace-picker .brand-symbol img')).toBeVisible();
  await page.reload();
  await expect(page.locator('.workspace-picker .brand-symbol img')).toBeVisible();
  await expect(page.locator('.workspace-picker .brand-symbol img')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await page.getByRole('button', { name: 'Remover logo', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar espaço', exact: true }).click();
  await expect(page.locator('.workspace-picker .brand-symbol img')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.workspace-picker .brand-symbol img')).toHaveCount(0);
});
test('unsupported and oversized logos fail inline without replacing saved identity', async ({ page }) => {
  await page.goto('/app-local/w/w1/settings?sec=workspace');
  const upload = page.getByLabel('Enviar logo da organização', { exact: true });
  await upload.setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('.organization-logo-editor [role="alert"]')).toContainText('PNG, JPG ou WebP');
  await upload.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.locator('.organization-logo-editor [role="alert"]')).toContainText('2 MB');
  await expect(page.locator('.workspace-picker .brand-symbol img')).toHaveCount(0);
});
