/** Trusted administrator CLI. Secrets come from process environment, never argv or browser. */
import { validateWebhookTarget } from '../supabase/functions/_shared/webhook-targets.ts';
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error('configuration');
  return value;
};
async function rpc(name: string, body: Record<string, unknown>) {
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${required('SUPABASE_URL')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('configuration');
  }
  return response.json();
}
try {
  if (Deno.args.length !== 1 || !['subscription', 'scheduler'].includes(Deno.args[0])) throw new Error('usage');
  if (Deno.args[0] === 'subscription') {
    const target = required('WEBHOOK_TARGET_URL');
    await validateWebhookTarget(target);
    const id = await rpc('provision_webhook_subscription', {
      p_workspace_id: required('WEBHOOK_WORKSPACE_ID'),
      p_connection_id: required('WEBHOOK_CONNECTION_ID'),
      p_admin_user_id: required('WEBHOOK_ADMIN_USER_ID'),
      p_target_url: target,
      p_secret: required('WEBHOOK_SIGNING_SECRET'),
    });
    console.log(JSON.stringify({ subscriptionId: id }));
  } else {
    const job = await rpc('configure_webhook_scheduler', {
      p_dispatch_url: required('WEBHOOK_DISPATCH_URL'),
      p_worker_secret: required('WEBHOOK_WORKER_SECRET'),
    });
    console.log(JSON.stringify({ schedulerJobId: job }));
  }
} catch {
  console.error('Webhook setup failed. Check the selected action, administrator connection, public HTTPS DNS and private environment configuration.');
  Deno.exit(1);
}
