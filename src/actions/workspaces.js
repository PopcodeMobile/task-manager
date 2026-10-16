import { t as tr } from '../core/i18n.js';
import { A, IN, BLUR, KEY, DBL } from './registry.js';
import { $ } from '../core/utils.js';
import { D, S, initializeWorkspace, switchWorkspace, createWorkspace, flushWorkspace, reloadWorkspace, save } from '../core/store.js';
import { getAuthSession, signIn, signUp, signOut, resetPassword, updatePassword, onAuthChange, isCloudMode } from '../workspace/auth.js';
import { t, normalizeLocale } from '../core/i18n.js';
import { go, render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { confirmDlg } from './actions.js';

let booting;
let authTransition = false;
const emailPattern = /^\S+@\S+\.\S+$/;
const validPassword = value => value.length >= 10 && /[0-9\W]/.test(value);
const error = message => {
  S.ui.errors.auth = message;
  render();
};
const clearLayers = () => {
  Object.assign(S.ui, { pop: null, palette: null, drawer: null, modals: [], errors: {} });
  $('#toasts')?.replaceChildren();
};

export async function bootWorkspace({ route = null } = {}) {
  if (booting) return booting;
  booting = (async () => {
    S.ui.auth = 'loading';
    clearLayers();
    render();
    try {
      await initializeWorkspace();
      const session = isCloudMode() ? await getAuthSession() : null;
      S.ui.auth = isCloudMode() && !session ? 'login' : !S.workspace.id ? 'workspace-create' : null;
      if (session && route === 'reset') S.ui.auth = 'reset';
      if (!S.ui.auth && route && !['login', 'signup', 'forgot', 'reset', 'verify', 'onboarding'].includes(route)) S.ui.route = route;
      render();
    } catch {
      S.ui.auth = 'workspace-error';
      render();
    }
  })();
  try {
    await booting;
  } finally {
    booting = null;
  }
}

async function runAuth(work, failure = 'Could not complete this request. Please try again.') {
  if (S.ui.authBusy) return;
  S.ui.authBusy = true;
  S.ui.errors = {};
  authTransition = true;
  render();
  try {
    await work();
  } catch {
    S.ui.errors.auth = failure;
  } finally {
    S.ui.authBusy = false;
    authTransition = false;
    render();
  }
}

A.auth = el => {
  S.ui.auth = el.dataset.v;
  S.ui.errors = {};
  render();
};
IN.authLanguage = el => {
  S.prefs.lang = normalizeLocale(el.value);
  save();
  render();
};
A.doLogin = () => {
  const email = $('#l-email').value.trim(),
    password = $('#l-pw').value;
  S.ui.af = { email };
  if (!emailPattern.test(email)) return error('Enter a valid email address.');
  if (!password) return error('Enter your password.');
  return runAuth(async () => {
    await signIn({ email, password });
    await bootWorkspace();
  }, 'Could not sign in. Check your email and password.');
};
A.doSignup = () => {
  const email = $('#s-email').value.trim(),
    password = $('#s-pw').value,
    name = $('#s-name').value.trim();
  S.ui.af = { email, name };
  if (!name) return error('Enter your name.');
  if (!emailPattern.test(email)) return error('Enter a valid email address.');
  if (!validPassword(password)) return error('Use at least 10 characters, including a number or symbol.');
  return runAuth(async () => {
    await signUp({ email, password, name });
    if (await getAuthSession()) await bootWorkspace();
    else S.ui.auth = 'verify';
  });
};
A.doForgot = () => {
  const email = $('#f-email').value.trim();
  S.ui.af = { email };
  if (!emailPattern.test(email)) return error('Enter a valid email address.');
  return runAuth(async () => {
    await resetPassword(email);
    S.ui.auth = 'forgot-sent';
  });
};
A.doReset = () => {
  const password = $('#r-pw').value;
  if (!validPassword(password)) return error('Use at least 10 characters, including a number or symbol.');
  if (password !== $('#r-pw2').value) return error('Passwords do not match.');
  return runAuth(async () => {
    await updatePassword(password);
    await bootWorkspace();
    toast(t(tr('Password updated')));
  });
};
A.signOut = async () => {
  authTransition = true;
  try {
    await flushWorkspace();
    if (isCloudMode()) await signOut();
    await initializeWorkspace();
    clearLayers();
    S.ui.auth = 'login';
    render();
  } catch {
    toast(t('Changes could not be saved. Your work is still open on this device.'), { kind: 'err' });
  } finally {
    authTransition = false;
  }
};
A.enterLocal = () => {
  if (!isCloudMode()) {
    S.ui.auth = null;
    go('home');
  }
};
A.newWorkspace = A.startOnboarding = () => {
  clearLayers();
  S.ui.workspaceName = '';
  S.ui.auth = 'workspace-create';
  render();
};
A.cancelWorkspace = () => {
  S.ui.auth = null;
  render();
};
A.createWorkspace = () => {
  const name = $('#workspace-name').value.trim();
  S.ui.workspaceName = name;
  if (!name) return error('Enter a workspace name.');
  return runAuth(async () => {
    await createWorkspace({ name });
    S.ui.auth = null;
    go('projects');
    toast(t('Workspace created'));
  });
};
A.switchWs = async el => {
  try {
    await switchWorkspace(el.dataset.v);
    clearLayers();
    S.ui.auth = null;
    go('home');
  } catch {
    toast(t('Changes could not be saved. Your work is still open on this device.'), { kind: 'err' });
  }
};
A.retryWorkspace = () => bootWorkspace();
A.retrySave = async () => {
  try {
    save();
    await flushWorkspace();
  } catch {
    /* Banner retains the failed draft. */
  }
  render();
};
A.reloadWorkspace = () =>
  confirmDlg({
    title: t('Reload and discard unsaved changes?'),
    body: t('Export your draft first if you want to keep your changes.'),
    ok: t('Reload workspace'),
    danger: true,
    run: async () => {
      try {
        await reloadWorkspace();
        clearLayers();
        render();
      } catch {
        toast(t('Workspace unavailable'), { kind: 'err' });
      }
    },
  });
A.exportDraft = () => {
  const blob = new Blob([JSON.stringify({ workspaceId: S.workspace.id, data: D(), exportedAt: new Date().toISOString() }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = 'workspace-draft.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Account demonstrations cannot masquerade as remote account changes.
const demoAccountActions = [
  'setup2fa',
  'verify2fa',
  'disable2fa',
  'revokeSession',
  'revokeAll',
  'changePlan',
  'delWorkspace',
  'resetDemo',
  'socialAuth',
  'copyInviteLink',
];
for (const name of demoAccountActions) {
  const original = A[name];
  A[name] = (...args) =>
    isCloudMode() || !original ? toast(t('This option is a local demonstration and is not connected to your account.'), { kind: 'info' }) : original(...args);
}
const membershipActions = ['invite', 'submitInvite', 'resendInvite', 'shareInvite', 'removeMember', 'ctxRole', 'share', 'projShare', 'setAccess'];
for (const name of membershipActions) {
  const original = A[name];
  A[name] = (...args) => (isCloudMode() ? toast(t('Member access is managed in the workspace database.'), { kind: 'info' }) : original?.(...args));
}
for (const name of ['shareAccess', 'sharePerm']) {
  const original = IN[name];
  IN[name] = (...args) => (isCloudMode() ? toast(t('All members of this workspace can access its projects.'), { kind: 'info' }) : original?.(...args));
}
// These controls are presentation gates; PostgreSQL remains the access authority.
const guardEdit =
  handler =>
  (...args) =>
    S.workspace?.membership?.role === 'guest' ? toast(t('You do not have permission to edit this workspace.'), { kind: 'info' }) : handler?.(...args);
const writeActions = [
  'newTask',
  'newProject',
  'newTeam',
  'submitTask',
  'submitProject',
  'submitTeam',
  'editTask',
  'editProject',
  'editTeam',
  'editCell',
  'startComposer',
  'commitComposer',
  'toggleDone',
  'toggleSub',
  'toggleFavTask',
  'toggleFavProj',
  'archiveTask',
  'archiveProject',
  'restoreTask',
  'restoreProject',
  'purgeTask',
  'delTask',
  'delProject',
  'delTeam',
  'dupTask',
  'dupProject',
  'bulkSet',
  'bulkDelete',
  'colDoneAll',
  'colArchive',
  'colSortPrio',
  'popPick',
  'popToggleLabel',
  'popToggleDep',
  'rmSub',
  'promoteSub',
  'rmAttach',
  'postComment',
  'delComment',
  'react',
  'renameFile',
  'delFile',
  'dupFile',
  'saveWorkspace',
  'wsColor',
  'projUp',
  'projDown',
  'saveViewSubmit',
  'renameView',
  'delView',
  'saveProfile',
  'avColor',
];
for (const name of writeActions) A[name] = guardEdit(A[name]);
for (const name of ['formFiles', 'uploadFiles', 'subNote']) IN[name] = guardEdit(IN[name]);
for (const table of [BLUR, KEY, DBL]) {
  for (const name of Object.keys(table)) table[name] = guardEdit(table[name]);
}
A.delWorkspace = () => toast(t('Workspace deletion is not available yet.'), { kind: 'info' });
const localPassword = A.savePassword;
A.savePassword = async () => {
  if (!isCloudMode()) return localPassword();
  const currentPassword = $('#pw-cur').value,
    password = $('#pw-new').value,
    confirmation = $('#pw-conf').value;
  if (!validPassword(password) || password !== confirmation) {
    toast(t(password !== confirmation ? 'Passwords do not match.' : 'Use at least 10 characters, including a number or symbol.'), { kind: 'err' });
    return;
  }
  authTransition = true;
  try {
    const session = await getAuthSession();
    await signIn({ email: session.user.email, password: currentPassword });
    await updatePassword(password);
    S.ui.pwDone = true;
    S.ui.pwNew = '';
    render();
    toast(t('Password updated'));
  } catch {
    toast(t('Could not complete this request. Please try again.'), { kind: 'err' });
  } finally {
    authTransition = false;
  }
};

export function listenForWorkspaceChanges() {
  window.addEventListener('workspace:sync', () => render());
  window.addEventListener('workspace:change', () => {
    $('#toasts')?.replaceChildren();
    render();
  });
  onAuthChange((event, session) => {
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || authTransition) return;
    if (event === 'SIGNED_IN' && S.workspace.ready && session?.user.id === S.workspace.membership?.userId) return;
    setTimeout(() => bootWorkspace({ route: event === 'PASSWORD_RECOVERY' ? 'reset' : null }), 0);
  }).catch(() => {
    /* Configuration errors are presented by bootWorkspace. */
  });
  window.addEventListener('beforeunload', event => {
    if (['pending', 'saving', 'error'].includes(S.sync?.status)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
