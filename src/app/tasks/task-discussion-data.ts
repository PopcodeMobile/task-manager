import type { ActivityEntry, Comment, CommentReaction } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
/** Present arrays must exhaust all workspace cursors. Undefined means partial/unknown; [] means complete and empty. */
export type CompleteDiscussion = { comments?: Comment[]; reactions?: CommentReaction[]; activity?: ActivityEntry[] };
export async function loadTaskDiscussion(repo: WorkspaceRepository, taskId: string, graph: CompleteDiscussion, force = false) {
  const [comments, reactions, history] = await Promise.all([
    !force && graph.comments !== undefined
      ? Promise.resolve(graph.comments.filter(comment => comment.taskId === taskId))
      : repo.list<Comment>('list_comments', { taskId }, true),
    !force && graph.reactions !== undefined ? Promise.resolve(graph.reactions) : repo.list<CommentReaction>('list_reactions', {}, true),
    !force && graph.activity !== undefined
      ? Promise.resolve(graph.activity.filter(entry => entry.taskId === taskId))
      : repo.list<ActivityEntry>('list_activity', { taskId }, true),
  ]);
  const ids = new Set(comments.map(comment => comment.id));
  return { comments, reactions: reactions.filter(reaction => ids.has(reaction.commentId)), history };
}
