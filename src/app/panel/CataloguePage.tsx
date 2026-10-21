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
    <section className="panel-page">
      {error && <p role="alert">{error}</p>}
      <p className="configuration-note">{t('Catálogo e demonstrações de interface.', 'Interface catalogue and demonstrations.')}</p>
      {p.route === 'system' ? (
        <>
          <h2>{t('Aparência', 'Appearance')}</h2>
          <div className="panel-toolbar">
            <label>
              {t('Destaque', 'Accent')}
              <select
                value={String(p.prefs.accent ?? 'indigo')}
                onChange={e => void p.savePrefs({ accent: e.target.value }).catch(e => setError(errorMessage(e, t)))}
              >
                {['indigo', 'violet', 'blue', 'teal', 'green', 'amber', 'rose'].map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              {t('Densidade', 'Density')}
              <select
                value={String(p.prefs.density ?? 'comfortable')}
                onChange={e => void p.savePrefs({ density: e.target.value }).catch(e => setError(errorMessage(e, t)))}
              >
                <option value="comfortable">{t('Confortável', 'Comfortable')}</option>
                <option value="compact">{t('Compacta', 'Compact')}</option>
              </select>
            </label>
            <label>
              {t('Tema', 'Theme')}
              <select
                value={String(p.prefs.theme ?? 'light')}
                onChange={e => void p.savePrefs({ theme: e.target.value }).catch(e => setError(errorMessage(e, t)))}
              >
                {['light', 'dark', 'system'].map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <h2>{t('Cores e tipografia', 'Colors and typography')}</h2>
          <div className="token-swatches">
            {['accent', 'surface', 'sunken', 'text', 'text-3', 'border'].map(token => (
              <div key={token}>
                <span style={{ background: `var(--${token})` }} />
                {token}
              </div>
            ))}
          </div>
          <h3>{t('Título de seção', 'Section title')}</h3>
          <p>{t('Texto de conteúdo para leitura e trabalho diário.', 'Content text for reading and everyday work.')}</p>
          <div className="button-row">
            <Button>{t('Primário', 'Primary')}</Button>
            <Button variant="outline">{t('Secundário', 'Secondary')}</Button>
            <Button variant="ghost">{t('Discreto', 'Ghost')}</Button>
            <Button disabled>{t('Desabilitado', 'Disabled')}</Button>
          </div>
        </>
      ) : (
        <>
          {offline && (
            <p role="alert" className="configuration-note">
              {t('Simulação offline ativa.', 'Offline simulation active.')}{' '}
              <Button onClick={() => setOffline(false)}>{t('Encerrar simulação', 'Exit simulation')}</Button>
            </p>
          )}
          <div className="button-row">
            <Button onClick={() => setOffline(!offline)}>{t('Simular offline', 'Simulate offline')}</Button>
            <Button onClick={() => setLoading(!loading)}>
              {loading ? t('Encerrar carregamento', 'Stop loading') : t('Simular carregamento', 'Simulate loading')}
            </Button>
            <Button onClick={() => p.go('unknown')}>{t('Abrir exemplo 404', 'Open 404 example')}</Button>
          </div>
          {loading && (
            <p role="status" aria-busy="true">
              {t('Carregando demonstração...', 'Loading demonstration...')}
            </p>
          )}
          <div className="panel-grid">
            {[
              [t('Estado vazio', 'Empty state'), t('Nenhum item. Crie seu primeiro item.', 'No items. Create your first item.')],
              [t('Sem acesso', 'Access denied'), t('Você não tem permissão para este conteúdo.', 'You do not have permission for this content.')],
              [
                t('Falha ao salvar', 'Save failed'),
                t('As alterações continuam no formulário. Tente novamente.', 'Your changes remain in the form. Try again.'),
              ],
            ].map(([title, text]) => (
              <article className="panel-card" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </>
      )}
      <h2>{t('Controles de demonstração', 'Demonstration controls')}</h2>
      <div className="button-row">
        <Button
          onClick={() => {
            remember();
            setModal(true);
          }}
        >
          {t('Abrir modal de exemplo', 'Open sample modal')}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            remember();
            setConfirm(true);
          }}
        >
          {t('Abrir confirmação', 'Open confirmation')}
        </Button>
        <Button variant="outline" onClick={() => setMessage(t('Mensagem de demonstração.', 'Demonstration message.'))}>
          {t('Mostrar mensagem', 'Show message')}
        </Button>
        <Button variant="outline" onClick={() => document.dispatchEvent(new CustomEvent('gr8r:palette'))}>
          {t('Abrir comandos', 'Open commands')}
        </Button>
      </div>
      {message && (
        <p role="status">
          {message}
          <Button variant="ghost" onClick={() => setMessage('')}>
            {t('Fechar', 'Dismiss')}
          </Button>
        </p>
      )}
      <Sheet open={modal} onOpenChange={setModal}>
        <SheetContent onCloseAutoFocus={restore} closeLabel={t('Fechar', 'Close')}>
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
