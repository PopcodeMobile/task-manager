import type { Translate } from '../auth/ConsentPage';
import { RepositoryError } from '../../workspace/normalized';
export function errorMessage(error: unknown, t: Translate): string {
  const code = error instanceof RepositoryError ? error.code : '';
  if (code === 'version_conflict')
    return t(
      'Esta tarefa mudou. Seu rascunho foi mantido. Recarregue a versão antes de salvar novamente.',
      'This task changed. Your draft was kept. Reload its version before saving again.',
    );
  if (code === 'already_claimed' || code === 'claim_expired')
    return t('A execução está reservada. Retome o controle humano antes de continuar.', 'Execution is reserved. Resume human control before continuing.');
  if (code === 'forbidden') return t('Você não tem permissão para esta ação.', 'You do not have permission for this action.');
  if (code === 'rate_limited')
    return t('Muitas solicitações. Aguarde um minuto antes de tentar novamente.', 'Too many requests. Wait a minute before trying again.');
  if (code === 'validation_error')
    return t(
      'Confira os campos. Para excluir, desvincule as dependências ou os anexos nas tarefas relacionadas primeiro.',
      'Check the fields. Before deleting, unlink dependencies or attachments in related tasks.',
    );
  if (code === 'not_found') return t('Este item não está mais disponível. Atualize os dados.', 'This item is no longer available. Refresh the data.');
  return t('Não foi possível carregar ou salvar. Confira sua conexão e tente novamente.', 'Could not load or save. Check your connection and try again.');
}
