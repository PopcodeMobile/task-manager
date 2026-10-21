import { test, expect, type Page } from '@playwright/test';
let requests: string[];
test.beforeEach(async ({ page }) => {
  requests = [];
  await page.route('**/*', async route => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:5194' && request.method() === 'GET') return route.continue();
    if (url.pathname.startsWith('/auth/v1/')) {
      requests.push(url.pathname);
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' },
        body: JSON.stringify({ code: 'invalid_credentials', msg: 'private backend detail' }),
      });
    }
    return route.abort();
  });
  await page.goto('/login');
});
async function signup(page: Page, password = 'short1') {
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa de teste');
  await page.getByLabel('E-mail', { exact: true }).fill('person@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(password);
}
test('short signup password shows a persistent inline error and never reaches Auth', async ({ page }) => {
  await signup(page);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  const password = page.getByLabel('Senha', { exact: true });
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toBeFocused();
  await expect(page.locator('#auth-password-error')).toContainText('10 caracteres');
  await expect(page.locator('#auth-password-hint')).toBeVisible();
  expect(requests).toEqual([]);
  await password.fill('LongPassword1');
  await password.blur();
  await expect(password).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#auth-password-error')).toBeHidden();
});
test('empty signup and malformed email give field-linked errors with first-invalid focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByLabel('Nome completo', { exact: true })).toBeFocused();
  await expect(page.locator('#auth-name-error')).toBeVisible();
  await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa de teste');
  await page.getByLabel('E-mail', { exact: true }).fill('invalid-email');
  await page.getByLabel('Senha', { exact: true }).fill('LongPassword1');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeFocused();
  await expect(page.locator('#auth-email-error')).toContainText('válido');
  expect(requests).toEqual([]);
});
test('password composition error is field-linked and mode switches clear it', async ({ page }) => {
  await signup(page, 'OnlyLettersLong');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.locator('#auth-password-error')).toContainText('número ou símbolo');
  await page.getByRole('button', { name: 'Voltar para entrar', exact: true }).click();
  await expect(page.locator('#auth-password-error')).toBeHidden();
  await expect(page.locator('#auth-password-hint')).toBeHidden();
  expect(requests).toEqual([]);
});
test('login accepts an existing short password and preserves safe credential errors', async ({ page }) => {
  await page.getByLabel('E-mail', { exact: true }).fill('person@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('short1');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos');
  expect(requests).toEqual(['/auth/v1/token']);
  await expect(page.locator('body')).not.toContainText('private backend detail');
});
test('rate limits show an actionable safe message and preserve typed fields', async ({ page }) => {
  await page.route('**/auth/v1/signup**', route =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' },
      body: JSON.stringify({ code: 'over_email_send_rate_limit', msg: 'private SQL/path details' }),
    }),
  );
  await signup(page, 'LongPassword1');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Aguarde alguns minutos');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('LongPassword1');
  await expect(page.locator('body')).not.toContainText('private SQL/path details');
});
test('a weak-password response focuses its field and hides backend details', async ({ page }) => {
  await page.route('**/auth/v1/signup**', route =>
    route.fulfill({
      status: 422,
      headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' },
      contentType: 'application/json',
      body: JSON.stringify({ code: 'weak_password', msg: 'private weak password detail' }),
    }),
  );
  await signup(page, 'LongPassword1');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.locator('#auth-password-error')).toContainText('Escolha outra senha');
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('aria-describedby', /auth-password-error/);
  await expect(page.locator('body')).not.toContainText('private weak password detail');
});
test('recovery confirmation mismatch stays local and points to confirmation', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('gr8r-recovery', 'true'));
  await page.reload();
  await page.getByLabel('Nova senha', { exact: true }).fill('LongPassword1');
  await page.getByLabel('Confirme a senha', { exact: true }).fill('AnotherPassword2');
  await page.getByRole('button', { name: 'Atualizar senha', exact: true }).click();
  await expect(page.locator('#auth-confirm-error')).toContainText('não coincidem');
  await expect(page.getByLabel('Confirme a senha', { exact: true })).toBeFocused();
  expect(requests).toEqual([]);
});
