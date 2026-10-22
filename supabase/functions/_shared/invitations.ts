import type { Actor } from '../../../src/domain/contracts.ts';
import { PublicError } from './errors.ts';
import { rpc } from './operations.ts';
import { object } from './validation.ts';

type Invitation = {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'guest';
  expiresAt: string;
  sendCount: number;
  workspaceName: string;
  inviterName: string;
};
const roles = { admin: 'admin', member: 'membro', guest: 'convidado' } as const;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
// Display names come from user metadata; strip control characters before they reach a subject line.
const plain = (value: unknown, max: number) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);

function checkedInvitation(value: unknown): Invitation {
  const v = value as Record<string, unknown> | null;
  if (
    !object(v) ||
    typeof v.id !== 'string' ||
    typeof v.email !== 'string' ||
    !Object.hasOwn(roles, String(v.role)) ||
    typeof v.expiresAt !== 'string' ||
    typeof v.sendCount !== 'number'
  )
    throw new PublicError('temporarily_unavailable');
  return v as Invitation;
}

/** Sends through Resend's REST API. Failure is reported, never thrown: the invitation already exists. */
export async function sendInvitationEmail(invitation: Invitation): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY'),
    app = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  if (!key || !app) return false;
  const link = `${app}/login?invite=1`,
    workspace = plain(invitation.workspaceName, 120) || 'Kairos',
    inviter = plain(invitation.inviterName, 80) || 'Alguém',
    role = roles[invitation.role],
    until = new Date(invitation.expiresAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const text = [
    `${inviter} convidou você para participar de ${workspace} no Kairos como ${role}.`,
    `Para entrar, acesse ${link} e entre ou crie sua conta com este e-mail (${invitation.email}).`,
    `O convite vale até ${until}.`,
    'Se você não esperava este convite, pode ignorar este e-mail.',
  ].join('\n\n');
  const html = `<p>${escape(inviter)} convidou você para participar de <strong>${escape(workspace)}</strong> no Kairos como ${role}.</p>
<p>Para entrar, acesse o link abaixo e entre ou crie sua conta com este e-mail (${escape(invitation.email)}).</p>
<p><a href="${escape(link)}">Abrir o Kairos</a></p>
<p>O convite vale até ${escape(until)}.</p>
<p style="color:#666">Se você não esperava este convite, pode ignorar este e-mail.</p>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'idempotency-key': `invitation-${invitation.id}-${invitation.sendCount}`,
      },
      body: JSON.stringify({
        from: Deno.env.get('INVITE_FROM') ?? 'Kairos <send@deltaacademy.com.br>',
        to: [invitation.email],
        subject: 'Você recebeu um convite para o Kairos',
        html,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

/** Human-only: OAuth clients and organization tokens cannot grant workspace access. */
export async function createInvitation(actor: Actor, workspaceId: string, input: Record<string, unknown>) {
  if (actor.kind === 'organization_token' || actor.clientId !== null) throw new PublicError('forbidden');
  if (
    Object.keys(input).some(key => !['email', 'role'].includes(key)) ||
    typeof input.email !== 'string' ||
    input.email.length > 254 ||
    typeof input.role !== 'string'
  )
    throw new PublicError('validation_error');
  const invitation = checkedInvitation(
    await rpc(actor, 'create_workspace_invitation', { p_workspace_id: workspaceId, p_email: input.email, p_role: input.role }),
  );
  return { data: invitation, emailSent: await sendInvitationEmail(invitation) };
}
