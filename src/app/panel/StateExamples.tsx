import {
  Archive,
  CircleAlert,
  CloudAlert,
  FileQuestion,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  Loader,
  RefreshCw,
  Trash2,
  UserMinus,
  WifiOff,
  Lock,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import type { PanelProps } from './types';

export function StateExamples({
  p,
  loading,
  setLoading,
  confirm,
  toast,
}: {
  p: PanelProps;
  loading: boolean;
  setLoading: (value: boolean) => void;
  confirm: () => void;
  toast: (error?: boolean) => void;
}) {
  const { t } = p;
  return (
    <>
      <h2 className="sec">{t('Carregamento', 'Loading states')}</h2>
      <div className="states-grid">
        <article className="panel">
          <div className="cap">
            <ListChecks size={13} />
            {t('Linhas de lista e tabela', 'List / table rows')}
          </div>
          <div className="catalogue-skeleton skeleton-rows">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="row" key={index}>
                <span className="sk sk-square" />
                <span className="sk grow" />
                <span className="sk sk-meta" />
                <span className="sk sk-avatar" />
                <span className="sk sk-meta" />
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <LayoutGrid size={13} />
            {t('Cartões', 'Cards')}
          </div>
          <div className="catalogue-skeleton">
            <div className="pcard skeleton-project">
              <span className="sk sk-icon" />
              <span className="sk sk-title" />
              <span className="sk sk-line" />
              <span className="sk sk-short" />
              <span className="sk sk-progress" />
            </div>
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <FolderKanban size={13} />
            {t('Coluna do quadro', 'Board column')}
          </div>
          <div className="catalogue-skeleton skeleton-board">
            {[0, 1].map(index => (
              <div className="kcard" key={index}>
                <span className="sk sk-title" />
                <span className="sk sk-line" />
                <div className="row">
                  <span className="sk sk-short" />
                  <span className="sp" />
                  <span className="sk sk-avatar" />
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <Loader size={13} />
            {t('Botões e página', 'Buttons & page')}
          </div>
          <div className="loading-example">
            <div className="row">
              <Button className="is-loading" aria-label={t('Salvando exemplo', 'Saving sample')}>
                {t('Salvando', 'Saving')}
              </Button>
              <Button className="is-loading" variant="outline">
                {t('Carregando', 'Loading')}
              </Button>
              <Button onClick={() => setLoading(!loading)}>
                {loading ? t('Encerrar carregamento', 'Stop loading') : t('Simular carregamento', 'Simulate loading')}
              </Button>
            </div>
            <div className="row muted">
              <Loader className="example-spinner" size={16} />
              {t('Carregando projeto de exemplo', 'Loading sample project')}…
            </div>
            <Button className="btn-sm" variant="ghost" onClick={() => setLoading(!loading)}>
              <RefreshCw size={13} />
              {t('Repetir esqueleto da página', 'Replay page skeleton')}
            </Button>
          </div>
        </article>
      </div>
      <h2 className="sec">{t('Erros', 'Error states')}</h2>
      <div className="states-grid">
        <article className="panel">
          <div className="cap">
            <WifiOff size={13} />
            {t('Erro de rede', 'Network error')}
          </div>
          <div className="empty-state err sm">
            <div className="glyph">
              <WifiOff size={20} />
            </div>
            <h3 className="es-h">{t('Você está offline', "You're offline")}</h3>
            <p>{t('Confira sua conexão. A mensagem demonstra uma falha de rede.', 'Check your connection. This message demonstrates a network failure.')}</p>
            <Button className="btn-sm" variant="outline" onClick={() => toast()}>
              <RefreshCw size={13} />
              {t('Tentar novamente', 'Try again')}
            </Button>
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <CloudAlert size={13} />
            {t('Falha ao carregar', 'Failed to load')}
          </div>
          <div className="empty-state err sm">
            <div className="glyph">
              <CloudAlert size={20} />
            </div>
            <h3 className="es-h">{t('Algo deu errado.', 'Something went wrong.')}</h3>
            <p>{t('Não foi possível carregar esta amostra. Seus dados estão preservados.', 'This sample view failed to load. Your data is safe.')}</p>
            <Button className="btn-sm" variant="outline" onClick={() => toast()}>
              {t('Tentar novamente', 'Try again')}
            </Button>
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <CircleAlert size={13} />
            {t('Falha ao salvar', 'Failed to save')}
          </div>
          <div className="state-save-example">
            <div className="alert danger">
              <CircleAlert size={15} />
              <div>
                <b>{t('Não foi possível salvar as alterações.', "Your changes couldn't be saved.")}</b>
                <div className="muted">
                  {t('O servidor não respondeu a tempo. Mensagem de exemplo.', 'The server did not respond in time. Sample message.')}
                </div>
              </div>
            </div>
            <Button className="btn-sm" variant="outline" onClick={() => toast(true)}>
              {t('Mostrar mensagem', 'Show as toast')}
            </Button>
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <Lock size={13} />
            {t('Sem permissão', 'Permission denied')}
          </div>
          <div className="empty-state sm">
            <div className="glyph">
              <Lock size={20} />
            </div>
            <h3 className="es-h">{t('Você não tem acesso', "You don't have access")}</h3>
            <p>{t('Peça ao responsável pelo projeto para adicionar você.', 'Ask the project owner to add you.')}</p>
            <Button className="btn-sm" variant="outline" onClick={() => p.go('projects')}>
              {t('Abrir exemplo', 'Open example')}
            </Button>
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <FileQuestion size={13} />
            {t('Página não encontrada', 'Page not found')}
          </div>
          <div className="empty-state sm">
            <div className="glyph">
              <FileQuestion size={20} />
            </div>
            <h3 className="es-h">{t('Página não encontrada', 'Page not found')}</h3>
            <p>{t('A página foi movida, excluída ou nunca existiu.', 'The page was moved, deleted, or never existed.')}</p>
            <Button className="btn-sm" variant="outline" onClick={() => p.go('unknown')}>
              {t('Abrir exemplo 404', 'Open 404 example')}
            </Button>
          </div>
        </article>
        <article className="panel">
          <div className="cap">
            <CircleAlert size={13} />
            {t('Validação de formulário', 'Form validation')}
          </div>
          <div className="state-validation-example">
            <label className="field">
              Email
              <Input className="is-error" defaultValue="hello@example" aria-invalid="true" aria-describedby="gallery-email-error" />
              <span className="err" id="gallery-email-error">
                <CircleAlert size={12} />
                {t('Informe um email válido, como nome@empresa.com', 'Enter a valid email, like name@company.com')}
              </span>
            </label>
          </div>
        </article>
      </div>
      <h2 className="sec">{t('Confirmações', 'Confirmation dialogs')}</h2>
      <div className="row gallery-confirmations">
        {[
          [t('Excluir projeto', 'Delete project'), Trash2],
          [t('Excluir tarefa', 'Delete task'), Trash2],
          [t('Remover membro', 'Remove member'), UserMinus],
          [t('Arquivar projeto', 'Archive project'), Archive],
        ].map(([label, Icon]) => {
          const Mark = Icon as typeof Trash2;
          return (
            <Button variant="outline" key={String(label)} onClick={confirm}>
              <Mark size={14} />
              {String(label)}
            </Button>
          );
        })}
      </div>
      <p className="hint">{t('Confirmações de exemplo. Confirmar não altera dados reais.', 'Sample confirmations. Confirming does not change real data.')}</p>
    </>
  );
}
