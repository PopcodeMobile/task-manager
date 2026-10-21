import { expect } from '@playwright/test';
// Exercise the authored controls users see, including the mobile account menu.
export async function openAccount(page) {
  if (await page.getByRole('dialog', { name: /^(Account menu|Menu da conta)$/ }).isVisible()) return;
  const top = page.locator('.work-topbar').getByRole('button', { name: /^(Account menu|Menu da conta)$/ });
  if (await top.isVisible()) await top.click();
  else {
    const account = page.locator('.work-sidebar').getByRole('button', { name: /^(Account menu|Menu da conta)$/ });
    if (!(await account.isVisible())) await page.getByRole('button', { name: /^(Open navigation|Abrir navegação)$/ }).click();
    await account.click();
  }
}

export async function setLanguage(page, language) {
  if (!(await page.locator('.work-shell').count())) {
    await page.locator('#language').selectOption(language);
    return;
  }
  await openAccount(page);
  await page.locator('#language').selectOption(language);
  await closeShellMenus(page);
}

export async function toggleTheme(page) {
  if (!(await page.locator('.work-shell').count())) {
    await page.getByRole('button', { name: /^(Toggle theme|Alternar tema)$/ }).click();
    return;
  }
  await openAccount(page);
  await page.getByRole('button', { name: /^(Toggle theme|Alternar tema)$/ }).click();
  await closeShellMenus(page);
}

export async function createWorkspace(page) {
  await page.getByRole('button', { name: /^(Switch workspace|Alternar organização)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Create workspace|Criar organização)$/ }).click();
}

export async function switchWorkspace(page, workspaceId) {
  await page.getByRole('button', { name: /^(Switch workspace|Alternar organização)$/ }).click();
  const name = await page.evaluate(id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')).records[id].data.ws.name, workspaceId);
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}

export async function closeShellMenus(page) {
  await page.keyboard.press('Escape');
  const close = page.locator('.work-sidebar').getByRole('button', { name: /^(Close navigation|Fechar navegação)$/ });
  if (await close.isVisible()) await close.click();
}
export async function switchWorkspaceNamed(page, name) {
  const trigger = page.getByRole('button', { name: /^(Switch workspace|Alternar organização)$/ });
  if (!(await trigger.isVisible())) await page.getByRole('button', { name: /^(Open navigation|Abrir navegação)$/ }).click();
  await trigger.click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}
export async function expectWorkspaceSelected(page, name) {
  await page.getByRole('button', { name: /^(Switch workspace|Alternar organização)$/ }).click();
  await expect(page.getByRole('menuitemradio', { name, exact: true })).toHaveAttribute('aria-checked', 'true');
  await closeShellMenus(page);
}
export async function openWorkspaceRoute(page, name) {
  const help = page.getByRole('button', { name: /^(Help & resources|Ajuda e recursos)$/ });
  if (!(await help.isVisible())) await page.getByRole('button', { name: /^(Open navigation|Abrir navegação)$/ }).click();
  await help.click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
export async function chooseVisibleOption(page, field, choice) {
  await page.getByRole('button', { name: field, exact: true }).click();
  await page.getByRole('menuitemradio', { name: choice, exact: true }).click();
}
export async function expectVisibleOption(page, field, choice, selected = true) {
  await page.getByRole('button', { name: field, exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: choice, exact: true })).toHaveAttribute('aria-checked', String(selected));
  await page.keyboard.press('Escape');
}
export async function editDescriptionSource(page) {
  const mode = page.getByRole('button', { name: /^(Edit description|Preview description|Editar descrição|Visualizar descrição)$/ });
  await expect(mode).toBeVisible();
  if (/^(Edit description|Editar descrição)$/.test(await mode.getAttribute('aria-label'))) await mode.click();
  const source = page.getByRole('textbox', { name: /^(Description|Descrição)$/ }).and(page.locator('textarea.task-description-source'));
  await expect(source).toBeVisible();
  return source;
}
export async function chooseTaskDate(page, field, date) {
  await page.getByRole('button', { name: field, exact: true }).click();
  for (let step = 0; step < 240; step++) {
    const day = page.locator(`[data-date-choice="${date}"]`);
    if (await day.count()) {
      await day.click();
      return;
    }
    const middle = await page.locator('[data-date-choice]').nth(20).getAttribute('data-date-choice');
    await page
      .getByRole('button', { name: date.slice(0, 7) < middle.slice(0, 7) ? /^(Previous month|Mês anterior)$/ : /^(Next month|Próximo mês)$/, exact: true })
      .click();
  }
  throw new Error('Requested task date is outside the bounded calendar navigation');
}
export async function expectTaskDate(page, field, date) {
  await page.getByRole('button', { name: field, exact: true }).click();
  await expect(page.locator(`[data-date-choice="${date}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
}

export async function renameFileMetadata(page, currentName, nextName) {
  const fileId = new URL(page.url()).searchParams.get('file');
  expect(fileId).toBeTruthy();
  const row = page.locator(`[data-file-id="${fileId}"]`);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Search files', { exact: true }).fill('');
  await row.getByRole('button', { name: 'File options: ' + currentName, exact: true }).click();
  await page.getByRole('menu', { name: 'File options', exact: true }).getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const rename = page.getByRole('dialog', { name: 'Rename file', exact: true });
  await rename.getByLabel('File name', { exact: true }).fill(nextName);
  await rename.getByRole('button', { name: 'Rename file', exact: true }).click();
  await expect(rename).toHaveCount(0);
  await row.getByRole('button', { name: nextName, exact: true }).click();
  expect(new URL(page.url()).searchParams.get('file')).toBe(fileId);
}

export function settingSelect(page, title) {
  return page
    .locator('label.setting-row')
    .filter({ has: page.getByText(title, { exact: true }) })
    .getByRole('combobox');
}
export function teamMemberChoice(page, name) {
  return page
    .getByRole('dialog')
    .locator('label.mi')
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole('checkbox');
}
export function directoryMemberButton(page, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('button.member-name').filter({ has: page.locator('b').filter({ hasText: new RegExp('^' + escaped + '(?: \\((?:you|você)\\))?$') }) });
}
