import { t as tr } from '../core/i18n.js';
/* =====================================================================
   ACTIONS · ARCHIVE: restore and purge
   ===================================================================== */
import { esc } from '../core/utils.js';
import { logAct, task } from '../core/store.js';
import { mutate, toast } from '../ui/toast.js';
import { A, confirmDlg, deleteTasks } from './actions.js';

A.restoreTask = el => {
  const t = task(el.dataset.id);
  if (
    mutate(() => {
      t.archived = false;
      t.archivedAt = null;
      logAct('restored', t);
    })
  )
    toast(tr('Restored “{value1}”', { value1: t.title }), { action: tr('Open'), onAction: () => A.openTask({ dataset: { id: t.id } }) });
};
A.purgeTask = el => {
  const t = task(el.dataset.id);
  confirmDlg({
    title: tr('Delete task permanently?'),
    body: `<b>${esc(t.title)}</b>${tr(", its subtasks, comments, and attachments will be deleted for everyone. This can't be undone.")}`,
    ok: tr('Delete permanently'),
    danger: true,
    run: () => {
      if (mutate(() => deleteTasks([t.id]))) toast(tr('Deleted “{value1}”', { value1: t.title }));
    },
  });
};
