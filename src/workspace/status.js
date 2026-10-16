import { S } from '../core/store.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';

export function renderWorkspaceStatus() {
  const sync = S.sync || {};
  const cloud = S.workspace?.mode === 'supabase';
  const conflict = sync.error?.code === 'conflict' || sync.error === 'conflict';
  if (sync.status === 'error')
    return `<div class="offline-bar" role="alert">${ic('circle-alert', 15)}<span>${t(conflict ? 'This workspace changed elsewhere. Export your draft before reloading.' : 'Changes could not be saved. Your work is still open on this device.')}</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="exportDraft">${t('Export draft')}</button><button class="btn btn-sm btn-secondary" data-a="${conflict ? 'reloadWorkspace' : 'retrySave'}">${t(conflict ? 'Reload workspace' : 'Retry save')}</button></div>`;
  const label = ['saving', 'pending'].includes(sync.status) ? 'Saving…' : cloud ? 'Saved' : 'Stored on this device';
  return `<div class="workspace-status" role="status"><span>${ic(cloud ? 'cloud' : 'hard-drive', 13)}${t(cloud ? 'Cloud workspace' : 'Local workspace')}</span><span>${t(S.workspace?.membership?.role === 'guest' ? 'Read-only access' : label)}</span></div>`;
}
