import { useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../components/ui/alert-dialog';
import type { PanelProps } from './types';
import { StateExamples } from './StateExamples';
import { DesignCatalogue } from './DesignCatalogue';
import { Sun, Moon, Monitor, FolderKanban, ListChecks, Plus, WifiOff, BellOff, SearchX } from 'lucide-react';
import { errorMessage } from '../shell/messages';
export function CataloguePage(p: PanelProps) {
  const { t } = p;
  const opener = useRef<HTMLElement | null>(null);
  const remember = () => {
    opener.current = document.activeElement as HTMLElement;
  };
  const restore = (event: Event) => {
    event.preventDefault();
    opener.current?.focus();
  };
  const [modal, setModal] = useState(false),
    [confirm, setConfirm] = useState(false),
    [offline, setOffline] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  return (
    <section className="page catalogue-page">
      <div className="ph">
        <div>
          <h1>{p.route === 'system' ? t('Design system', 'Design system') : t('Estados do sistema', 'System states')}</h1>
          <p>
            {p.route === 'system'
              ? t(
                  'Tokens e componentes do Gr8r. Alterne o tema para ver as duas paletas.',
                  'Tokens and components that make up Gr8r. Switch themes to see both palettes.',
                )
              : t('Estados vazios, carregamento, erro e confirmação usados no Gr8r.', 'Empty, loading, error, and confirmation states used throughout Gr8r.')}
          </p>
        </div>
        <div className="acts">
          {p.route === 'system' ? (
            <div className="seg">
              {[
                ['light', t('Claro', 'Light')],
                ['dark', t('Escuro', 'Dark')],
                ['system', t('Sistema', 'System')],
              ].map(([key, label]) => {
                const Icon = key === 'light' ? Sun : key === 'dark' ? Moon : Monitor;
                return (
                  <Button
                    variant="ghost"
                    className={String(p.prefs.theme ?? 'light') === key ? 'on' : ''}
                    key={key}
                    onClick={() => void p.savePrefs({ theme: key }).catch(error => setError(errorMessage(error, t)))}
                  >
                    <Icon size={13} />
                    {label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <Button variant="outline" onClick={() => setOffline(!offline)}>
              <WifiOff size={14} />
              {t('Simular offline', 'Simulate offline')}
            </Button>
          )}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}

      {p.route === 'system' ? (
        <DesignCatalogue
          {...p}
          onModal={() => {
            remember();
            setModal(true);
          }}
          onConfirm={() => {
            remember();
            setConfirm(true);
          }}
          onToast={failed =>
            failed
              ? setError(t('Erro de exemplo. Nenhum dado foi alterado.', 'Sample error. No data changed.'))
              : setMessage(t('Mensagem de exemplo. Nenhuma rede foi acessada.', 'Sample message. No network request was made.'))
          }
        />
      ) : (
        <>
          {offline && (
            <p role="alert" className="configuration-note">
              {t('Simulação offline ativa.', 'Offline simulation active.')}{' '}
              <Button onClick={() => setOffline(false)}>{t('Encerrar simulação', 'Exit simulation')}</Button>
            </p>
          )}
          {loading && (
            <p role="status" aria-busy="true">
              {t('Carregando demonstração...', 'Loading demonstration...')}
            </p>
          )}
          <h2 className="sec">{t('Estados vazios', 'Empty states')}</h2>
          <div className="states-grid">
            {[
              {
                cap: t('Sem projetos', 'No projects'),
                title: t('Nenhum projeto ainda', 'No projects yet'),
                text: t('Crie seu primeiro projeto para organizar seu trabalho.', 'Create your first project to start organizing your work.'),
                Icon: FolderKanban,
                action: () => p.go('projects', { create: 'true' }),
                cta: t('Criar projeto', 'Create project'),
              },
              {
                cap: t('Sem tarefas', 'No tasks'),
                title: t('Nenhuma tarefa aqui', 'No tasks here'),
                text: t('Adicione uma tarefa para começar.', 'Add a task to get things moving.'),
                Icon: ListChecks,
                action: () => p.createTask(),
                cta: t('Adicionar tarefa', 'Add task'),
              },
              {
                cap: t('Sem notificações', 'No notifications'),
                title: t('Tudo em dia.', "You're all caught up."),
                text: t('Novas menções e atribuições aparecerão aqui.', 'New mentions and assignments will show up here.'),
                Icon: BellOff,
              },
              {
                cap: t('Sem resultados', 'No search results'),
                title: t('Nenhum resultado encontrado', 'No results found'),
                text: t(
                  'Nenhum resultado para “brand guidelines”. Confira a escrita ou tente outro termo.',
                  'Nothing matches “brand guidelines”. Check the spelling or try a broader term.',
                ),
                Icon: SearchX,
                action: () => p.go('search'),
                cta: t('Limpar busca', 'Clear search'),
              },
            ].map(({ cap, title, text, Icon, action, cta }) => (
              <article className="panel" key={cap}>
                <div className="cap">
                  <Icon size={13} />
                  {cap}
                </div>
                <div className="empty-state">
                  <div className="glyph">
                    <Icon size={20} />
                  </div>
                  <h3 className="es-h">{title}</h3>
                  <p>{text}</p>
                  {action && (
                    <Button
                      variant={cap === t('Sem resultados', 'No search results') ? 'outline' : 'default'}
                      className="btn-sm"
                      disabled={p.readOnly && cap !== t('Sem resultados', 'No search results')}
                      onClick={action}
                    >
                      {cap !== t('Sem resultados', 'No search results') && <Plus size={14} />}
                      {cta}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <StateExamples
            p={p}
            loading={loading}
            setLoading={setLoading}
            confirm={() => {
              remember();
              setConfirm(true);
            }}
            toast={failed =>
              failed
                ? setError(t('Erro de exemplo. Nenhum dado foi alterado.', 'Sample error. No data changed.'))
                : setMessage(t('Tentativa de exemplo. Nenhuma rede foi acessada.', 'Sample retry. No network request was made.'))
            }
          />
        </>
      )}
      {message && (
        <p role="status">
          {message}
          <Button variant="ghost" onClick={() => setMessage('')}>
            {t('Fechar', 'Dismiss')}
          </Button>
        </p>
      )}
      <Sheet open={modal} onOpenChange={setModal}>
        <SheetContent className="panel-modal catalogue-modal" onCloseAutoFocus={restore} closeLabel={t('Fechar', 'Close')}>
          <SheetTitle>{t('Modal de exemplo', 'Sample modal')}</SheetTitle>
          <SheetDescription>{t('Use Tab para navegar e Escape para fechar.', 'Use Tab to navigate and Escape to close.')}</SheetDescription>
          <Button onClick={() => setModal(false)}>{t('Concluir exemplo', 'Finish example')}</Button>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent onCloseAutoFocus={restore}>
          <AlertDialogTitle>{t('Confirmação de exemplo', 'Sample confirmation')}</AlertDialogTitle>
          <AlertDialogDescription>{t('Este exemplo não exclui dados.', 'This example does not delete data.')}</AlertDialogDescription>
          <div className="button-row">
            <AlertDialogCancel asChild>
              <Button variant="outline">{t('Cancelar', 'Cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => setMessage(t('Exemplo confirmado.', 'Example confirmed.'))}>{t('Confirmar exemplo', 'Confirm example')}</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
