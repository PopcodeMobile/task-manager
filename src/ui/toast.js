/* ---------- toasts ---------- */
import { $, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, save, scope, isScopeCurrent } from '../core/store.js';
import { t } from '../core/i18n.js';
import { render } from '../shell/render.js';

export function toast(msg, opt = {}) {
  const captured = scope();
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  const icon = opt.kind === 'err' ? ic('circle-alert', 15, 'bad') : opt.kind === 'info' ? ic('info', 15) : ic('circle-check', 15, 'ok');
  el.innerHTML = `${icon}<span class="grow">${esc(t(msg))}</span>${opt.action ? `<button class="ta">${esc(t(opt.action))}</button>` : ''}<button class="ibtn ibtn-xs" aria-label="${t('Dismiss')}" style="color:inherit;opacity:.6">${ic('x', 13)}</button>`;
  const kill = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 160);
  };
  if (opt.action)
    el.querySelector('.ta').onclick = () => {
      if (isScopeCurrent(captured)) opt.onAction?.();
      kill();
    };
  el.querySelector('.ibtn').onclick = kill;
  host.appendChild(el);
  setTimeout(kill, opt.ms || 4200);
}
/* guarded mutation: simulates offline failures for the "Failed to save" state */
export function mutate(fn, label, captured = scope()) {
  if (!isScopeCurrent(captured)) return false;
  if (S.workspace?.membership?.role === 'guest') {
    toast(t('You do not have permission to edit this workspace.'), { kind: 'err' });
    return false;
  }
  if (S.ui.offline) {
    toast(t("Your changes couldn't be saved. You're offline."), { kind: 'err', action: t('Try again'), onAction: () => mutate(fn, label, captured) });
    return false;
  }
  const before = structuredClone(S.data);
  try {
    fn();
  } catch {
    S.data = before;
    toast(t('Could not complete this request. Please try again.'), { kind: 'err' });
    return false;
  }
  save(captured);
  render();
  return true;
}
