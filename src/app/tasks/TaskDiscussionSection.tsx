import { Bot } from 'lucide-react';
import { MemberAvatar } from '../projects/ProjectVisual';
import { preferredDate } from '../panel/panel-model';
import { useEffect, useMemo, useRef, useState } from 'react';
import { safeRichText } from '../../core/rich-text.js';
import type { Task, Comment, CommentReaction, ActivityEntry } from '../../domain/contracts';
import type { Member, DomainEvent, Agent } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import type { DetailAction } from './TaskRelationSection';
import { ActivityPage } from '../activity/ActivityPage';
import { Button } from '../../components/ui/button';
export function TaskDiscussionSection({
  task,
  more,
  loadMore,
  comments,
  reactions,
  events,
  history,
  members,
  agents,
  actorId,
  admin,
  action,
  execute,
  disabled,
  t,
  registerDraft,
  compact = false,
}: {
  task: Task;
  compact?: boolean;
  more?: boolean;
  loadMore?: () => Promise<void>;
  comments: Comment[];
  reactions: CommentReaction[];
  events: DomainEvent[];
  history: ActivityEntry[];
  members: Member[];
  agents: Agent[];
  actorId: string | null;
  admin: boolean;
  action: DetailAction;
  execute: Execute;
  disabled: boolean;
  t: Translate;
  registerDraft?: (guard: import('./TaskDrawer').DraftGuard | null) => void;
}) {
  const [tab, setTab] = useState('comments'),
    [drafts, setDrafts] = useState<Record<string, { body: string; id: string }>>({}),
    [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [attempt, setAttempt] = useState<{ taskId: string; body: string; id: string } | null>(null);
  const emptyDraft = useMemo(() => ({ body: '', id: crypto.randomUUID() }), [task.id]);
  const { body, id } = drafts[task.id] ?? emptyDraft;
  const setBody = (body: string) => setDrafts(old => ({ ...old, [task.id]: { ...(old[task.id] ?? emptyDraft), body } }));
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    registerDraft?.({
      dirty: !!body || pending || !!attempt,
      flush: async () => {
        setBlocked(true);
        textarea.current?.focus();
        return false;
      },
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (body || pending || attempt) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    if (registerDraft) addEventListener('beforeunload', unload);
    return () => {
      registerDraft?.(null);
      removeEventListener('beforeunload', unload);
    };
  }, [body, pending, attempt, registerDraft]);
  const mention = body.match(/(?:^|\s)@([^@\s]*)$/u);
  const candidates = mention ? members.filter(m => m.name.toLocaleLowerCase().includes(mention[1].toLocaleLowerCase())) : [];
  return (
    <section className={`drawer-section ${compact ? 'task-discussion-compact' : ''}`}>
      {more && (
        <Button variant="outline" disabled={disabled || pending} onClick={() => void loadMore?.()}>
          {t('Carregar mais histórico', 'Load more history')}
        </Button>
      )}
      {!compact && (
        <div role="tablist" aria-label={t('Discussão da tarefa', 'Task discussion')} className="task-discussion-tabs tabs">
          {['comments', 'activity'].map(key => (
            <Button
              key={key}
              role="tab"
              className={`tab ${tab === key ? 'on' : ''}`}
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  setTab(key === 'comments' ? 'activity' : 'comments');
                  e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[key === 'comments' ? 1 : 0]?.focus();
                }
              }}
              variant={tab === key ? 'default' : 'ghost'}
              onClick={() => setTab(key)}
            >
              {key === 'comments' ? t('Comentários', 'Comments') : t('Atividade', 'Activity')}
            </Button>
          ))}
        </div>
      )}
      {!compact && tab === 'activity' ? (
        <div role="tabpanel">
          {history.map(entry => (
            <article className="comment" key={entry.id}>
              <strong>{members.find(m => m.user_id === entry.actorUserId)?.name ?? t('Autor histórico', 'Historical author')}</strong> {entry.verb}{' '}
              <time dateTime={entry.createdAt}>{entry.createdAt.slice(0, 10)}</time>
            </article>
          ))}
          <ActivityPage events={events} members={members} agents={agents} t={t} tasks={[task]} openTask={() => {}} />
        </div>
      ) : (
        <div role="tabpanel">
          {comments.map(item => (
            <article className="comment cmt" key={item.id}>
              {item.authorAgentId ? (
                <span className="av md agent-comment-avatar" aria-label={t('Agente', 'Agent')}>
                  <Bot size={16} />
                </span>
              ) : (
                <MemberAvatar member={members.find(m => m.user_id === item.authorUserId)} size="md" />
              )}
              <div className="comment-body">
                <div className="comment-heading">
                  <strong>
                    {item.authorAgentId
                      ? (agents.find(agent => agent.id === item.authorAgentId)?.name ?? t('Agente', 'Agent'))
                      : (members.find(m => m.user_id === item.authorUserId)?.name ?? t('Autor histórico', 'Historical author'))}
                  </strong>
                  <time dateTime={item.createdAt}>{preferredDate(item.createdAt, {}, t('pt-BR', 'en'))}</time>
                </div>
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: safeRichText(item.body) }} />
                <div className="comment-reactions">
                  {[...new Set(['👍', '❤️', '🎉', ...reactions.filter(r => r.commentId === item.id).map(r => r.reaction)])].map(reaction => {
                    const people = reactions.filter(r => r.commentId === item.id && r.reaction === reaction),
                      mine = people.some(r => r.userId === actorId);
                    return (
                      <Button
                        variant="ghost"
                        key={reaction}
                        aria-label={t('Reagir: ', 'React: ') + reaction}
                        aria-pressed={mine}
                        disabled={disabled || pending || !actorId}
                        title={people.map(r => members.find(m => m.user_id === (r.userId ?? r.legacyUserId))?.name ?? r.legacyUserId).join(', ')}
                        onClick={() => void action(() => execute(mine ? 'remove_reaction' : 'add_reaction', { commentId: item.id, reaction }))}
                      >
                        {reaction}
                        {people.length ? ` ${people.length}` : ''}
                      </Button>
                    );
                  })}
                </div>
                {(admin || (actorId && item.authorUserId === actorId)) && (
                  <Button variant="ghost" disabled={disabled} onClick={() => void action(() => execute('delete_comment', { id: item.id }, item.version))}>
                    {t('Excluir comentário', 'Delete comment')}
                  </Button>
                )}
              </div>
            </article>
          ))}
          {blocked && (
            <p role="alert">
              {t(
                'Envie ou descarte esta resposta antes de sair da conversa. Um envio pendente precisa terminar.',
                'Post or discard this reply before leaving the conversation. A pending send must finish.',
              )}
            </p>
          )}
          {!compact && !comments.length && (
            <p className="discussion-empty">{t('Nenhum comentário ainda. Inicie a conversa.', 'No comments yet. Start the conversation.')}</p>
          )}
          <form
            className="task-comment-composer"
            onSubmit={e => {
              e.preventDefault();
              if (pending) return;
              const command = attempt ?? { taskId: task.id, id, body };
              setAttempt(command);
              setPending(true);
              void action(async () => {
                try {
                  await execute('add_task_comment', command);
                } catch (error) {
                  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
                  if (['validation_error', 'forbidden', 'not_found', 'storage', 'version_conflict', 'rate_limited'].includes(code)) setAttempt(null);
                  throw error;
                }
                setDrafts(old => ({ ...old, [command.taskId]: { body: '', id: crypto.randomUUID() } }));
                setAttempt(null);
                setBlocked(false);
              }).finally(() => setPending(false));
            }}
          >
            {!compact && (
              <span className="comment-composer-avatar">
                <MemberAvatar member={members.find(member => member.user_id === actorId)} />
              </span>
            )}
            <label className="form-field">
              {compact ? <span className="sr-only">{t('Resposta', 'Reply')}</span> : t('Comentário', 'Comment')}
              <textarea
                ref={textarea}
                placeholder={
                  compact
                    ? t('Responda… use @ para mencionar', 'Reply… use @ to mention')
                    : t('Deixe um comentário… digite @ para mencionar', 'Leave a comment… type @ to mention')
                }
                onKeyDown={event => {
                  if (compact && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                required
                maxLength={20000}
                value={body}
                disabled={disabled || pending || !!attempt || !actorId}
                onChange={e => setBody(e.target.value)}
              />
            </label>
            {candidates.length > 0 && (
              <div className="mention-choices" aria-label={t('Mencionar pessoa', 'Mention person')}>
                {candidates.map(m => (
                  <Button
                    key={m.user_id}
                    variant="ghost"
                    type="button"
                    aria-label={t('Mencionar: ', 'Mention: ') + m.name}
                    onClick={() => {
                      setBody(body.replace(/@([^@\s]*)$/u, '@' + m.name + ' '));
                      textarea.current?.focus();
                    }}
                  >
                    {m.name}
                  </Button>
                ))}
              </div>
            )}
            {compact && (
              <span className="reply-key-hint">
                {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'}
                {t('+Enter para enviar', '+Enter to send')}
              </span>
            )}
            <Button type="submit" disabled={disabled || pending || !actorId}>
              {compact ? t('Responder', 'Reply') : t('Comentar', 'Post comment')}
            </Button>
            {registerDraft && body && (
              <Button
                type="button"
                variant="outline"
                disabled={disabled || pending || !!attempt}
                onClick={() => {
                  setDrafts(old => ({ ...old, [task.id]: { body: '', id: crypto.randomUUID() } }));
                  setBlocked(false);
                }}
              >
                {t('Descartar rascunho da resposta', 'Discard reply draft')}
              </Button>
            )}
          </form>
        </div>
      )}
    </section>
  );
}
