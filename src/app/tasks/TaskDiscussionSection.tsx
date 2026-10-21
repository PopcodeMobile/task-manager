import { useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { Task, Comment, CommentReaction, ActivityEntry } from '../../domain/contracts';
import type { Member, DomainEvent, Agent } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import type { DetailAction } from './TaskRelationSection';
import { ActivityPage } from '../activity/ActivityPage';
import { Button } from '../../components/ui/button';
export function TaskDiscussionSection({
  task,
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
}: {
  task: Task;
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
}) {
  const [tab, setTab] = useState('comments'),
    [body, setBody] = useState(''),
    [id, setId] = useState(() => crypto.randomUUID());
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mention = body.match(/(?:^|\s)@([^@\s]*)$/u);
  const candidates = mention ? members.filter(m => m.name.toLocaleLowerCase().includes(mention[1].toLocaleLowerCase())) : [];
  return (
    <section className="drawer-section">
      <div role="tablist" aria-label={t('Discussão da tarefa', 'Task discussion')} className="button-row">
        {['comments', 'activity'].map(key => (
          <Button
            key={key}
            role="tab"
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
      {tab === 'activity' ? (
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
            <article className="comment" key={item.id}>
              <strong>{members.find(m => m.user_id === item.authorUserId)?.name ?? t('Autor histórico', 'Historical author')}</strong>
              <div className="rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.body, { USE_PROFILES: { html: true } }) }} />
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
                      disabled={disabled || !actorId}
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
            </article>
          ))}
          <form
            onSubmit={e => {
              e.preventDefault();
              void action(async () => {
                await execute('add_task_comment', { id, taskId: task.id, body });
                setBody('');
                setId(crypto.randomUUID());
              });
            }}
          >
            <label className="form-field">
              {t('Comentário', 'Comment')}
              <textarea ref={textarea} required maxLength={20000} value={body} disabled={disabled || !actorId} onChange={e => setBody(e.target.value)} />
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
            <Button type="submit" disabled={disabled || !actorId}>
              {t('Comentar', 'Post comment')}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
