import { esc } from '../core/utils.js';
import { LOGO, ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { getLocale, t } from '../core/i18n.js';
import { effectiveDark } from '../core/theme.js';
import { isCloudMode } from '../workspace/auth.js';

export function authShell(inner) {
  return `<div class="auth"><div class="auth-top"><span class="brand">${LOGO(22)}</span><div class="row">
    <label class="sr" for="auth-language">${t('Language')}</label><select class="select" id="auth-language" data-in="authLanguage"><option value="pt-BR" ${getLocale() === 'pt-BR' ? 'selected' : ''}>Português</option><option value="en" ${getLocale() === 'en' ? 'selected' : ''}>English</option></select>
    <button class="ibtn" data-a="toggleDark" aria-label="${t('Toggle theme')}">${ic(effectiveDark() ? 'sun' : 'moon', 16)}</button></div></div><div class="auth-c">${inner}</div></div>`;
}
const field = (id, label, type = 'text', autocomplete = '', value = '') =>
  `<div class="field"><label class="label" for="${id}">${t(label)}</label><input class="input input-lg" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" value="${esc(value)}" required ${type === 'password' ? 'minlength="10"' : ''}></div>`;
const action = (label, route) => `<button type="button" class="link" data-a="auth" data-v="${route}">${t(label)}</button>`;
const submit = label =>
  `<button class="btn btn-primary btn-lg btn-block" type="submit" ${S.ui.authBusy ? 'disabled aria-busy="true"' : ''}>${t(label)}</button>`;

export function renderAuth() {
  const route = S.ui.auth;
  const email = S.ui.af?.email || '';
  const error = S.ui.errors.auth ? `<div class="alert danger" role="alert">${ic('circle-alert', 15)}<span>${esc(t(S.ui.errors.auth))}</span></div>` : '';
  const form = (handler, title, body, description = '') =>
    authShell(
      `<form class="auth-card" data-submit="${handler}" novalidate><h1>${t(title)}</h1>${description ? `<p class="sub">${t(description)}</p>` : ''}${error}${body}</form>`,
    );
  if (route === 'loading') return authShell(`<div class="auth-card" role="status"><h1>${t('Loading your workspaces…')}</h1></div>`);
  if (route === 'workspace-error')
    return authShell(
      `<div class="auth-card"><h1>${t('Workspace unavailable')}</h1><p class="sub">${t('We could not open your workspace. Check the connection and try again.')}</p>${error}<button class="btn btn-primary" data-a="retryWorkspace">${t('Try again')}</button><button class="btn btn-secondary" data-a="signOut">${t('Sign out')}</button></div>`,
    );
  if (route === 'workspace-create' || route === 'onboarding')
    return form(
      'createWorkspace',
      'Create workspace',
      `${field('workspace-name', 'Workspace name', 'text', 'organization', S.ui.workspaceName || '')}${submit('Create workspace')}${S.workspace?.id ? `<button class="btn btn-ghost" type="button" data-a="cancelWorkspace">${t('Cancel')}</button>` : ''}`,
      'Create an independent space for your projects and tasks.',
    );
  if (!isCloudMode())
    return authShell(
      `<div class="auth-card"><h1>${t('Local demonstration')}</h1><p class="sub">${t('Your work stays in this browser. Cloud sign-in will be available after setup.')}</p><button class="btn btn-primary btn-lg" data-a="enterLocal">${t('Continue on this device')}</button></div>`,
    );
  if (route === 'signup')
    return form(
      'doSignup',
      'Create your account',
      `${field('s-name', 'Full name', 'text', 'name', S.ui.af?.name || '')}${field('s-email', 'Email', 'email', 'email', email)}${field('s-pw', 'Password', 'password', 'new-password')}<p class="hint">${t('Use at least 10 characters, including a number or symbol.')}</p>${submit('Create account')}${action('Back to sign in', 'login')}`,
      'Use your email to access your organizations.',
    );
  if (route === 'forgot')
    return form(
      'doForgot',
      'Reset your password',
      `${field('f-email', 'Email', 'email', 'email', email)}${submit('Send reset link')}${action('Back to sign in', 'login')}`,
      'Enter your email to receive a password reset link.',
    );
  if (route === 'forgot-sent' || route === 'verify')
    return authShell(
      `<div class="auth-card"><h1>${t('Check your email')}</h1><p class="sub">${t(route === 'verify' ? 'Confirm your email using the link we sent, then sign in.' : 'If this email has an account, a reset link will arrive shortly.')}</p>${action('Back to sign in', 'login')}</div>`,
    );
  if (route === 'reset')
    return form(
      'doReset',
      'Choose a new password',
      `${field('r-pw', 'New password', 'password', 'new-password')}${field('r-pw2', 'Confirm password', 'password', 'new-password')}${submit('Update password')}`,
    );
  return form(
    'doLogin',
    'Welcome back',
    `${field('l-email', 'Email', 'email', 'email', email)}${field('l-pw', 'Password', 'password', 'current-password')}${action('Forgot password?', 'forgot')}${submit('Sign in')}${action('Sign up', 'signup')}`,
    'Sign in to your workspaces',
  );
}
