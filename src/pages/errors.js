import { t as tr } from '../core/i18n.js';
/* ---------- 404 / DENIED / FAILED ---------- */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';

export function page404() {
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('file-question', 20)}</div></div><span class="code">${tr('ERROR 404')}</span><h1>${tr('Page not found')}</h1><p>${tr("The page you're looking for was moved, deleted, or never existed. Check the link or head back home.")}</p><div class="row"><button class="btn btn-secondary" data-a="back">${tr('{value1}Go back', { value1: ic('arrow-left', 14) })}</button><button class="btn btn-primary" data-a="go" data-r="home">${tr('Go to Home')}</button></div></div></div>`;
}
export function stateDenied(p) {
  const lead = mem(p?.lead);
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${tr('ERROR 403')}</span><h1>${tr("You don't have access")}</h1><p>${tr("{value1}Ask {value2} to add you, or request access and we'll let them know.", { value1: p ? `<b>${esc(p.name)}</b> ${tr('is a private project.')} ` : '', value2: lead ? esc(lead.name) : tr('the project owner') })}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="projects">${tr('Back to projects')}</button><button class="btn btn-primary" data-a="requestAccess" data-id="${p?.id || ''}">${tr('Request access')}</button></div></div></div>`;
}
export function stateFailed() {
  return `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${tr('Something went wrong.')}</h1><p>${tr('This page failed to load. Your data is safe — try again in a moment.')}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="home">${tr('Go to Home')}</button><button class="btn btn-primary" data-a="reload">${tr('{value1}Try again', { value1: ic('refresh-cw', 14) })}</button></div></div></div>`;
}
