import { getSupabase, isCloudMode, configurationError } from './config.js';
import { WorkspaceError } from './errors.js';
export { isCloudMode, configurationError };
const result = response => {
  if (response.error) throw new WorkspaceError('auth');
  return response.data;
};
export async function getAuthSession() {
  if (!isCloudMode()) return null;
  const client = await getSupabase();
  return result(await client.auth.getSession()).session;
}
export async function signIn({ email, password }) {
  return result(await (await getSupabase()).auth.signInWithPassword({ email, password })).session;
}
export async function signUp({ email, password, name }) {
  return result(
    await (await getSupabase()).auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } }),
  );
}
export async function signOut() {
  if (!isCloudMode()) return;
  return result(await (await getSupabase()).auth.signOut());
}
export async function resetPassword(email) {
  return result(await (await getSupabase()).auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#reset' }));
}
export async function updatePassword(password) {
  return result(await (await getSupabase()).auth.updateUser({ password }));
}
export async function onAuthChange(callback) {
  if (!isCloudMode()) return () => {};
  const client = await getSupabase();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    // Run outside GoTrue's auth lock; callbacks may need database/session reads.
    setTimeout(() => callback(event, session), 0);
  });
  return () => data.subscription.unsubscribe();
}
