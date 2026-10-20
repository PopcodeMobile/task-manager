import { supervisionCatalogs } from '../locales/supervision.js';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { useAuth } from './auth/AuthProvider';
import { ConsentPage } from './auth/ConsentPage';
import { AuthScreen } from './auth/AuthScreen';
import { ConnectionsPage } from './integrations/ConnectionsPage';
import { WorkspacePanel } from './shell/WorkspacePanel';
import { supabase } from './integrations/client';
export function App() {
  const { session, loading, recovery, authError, sessionBoundary } = useAuth();
  const [locale, setLocale] = useState(() => localStorage.getItem('gr8r-react-locale') ?? 'pt-BR'),
    [dark, setDark] = useState(() => localStorage.getItem('gr8r-react-theme') === 'dark'),
    [logoutError, setLogoutError] = useState(false);
  const t = useCallback((pt: string, en: string) => supervisionCatalogs[locale]?.[en] ?? (locale === 'en' ? en : pt), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem('gr8r-react-locale', locale);
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('gr8r-react-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    document.documentElement.dataset.density = localStorage.getItem('gr8r-react-density') ?? 'comfortable';
  }, []);
  async function logout() {
    setLogoutError(false);
    const result = await supabase?.auth.signOut();
    if (result?.error) setLogoutError(true);
  }
  const controls = (
    <>
      <label className="sr-only" htmlFor="language">
        {t('Idioma', 'Language')}
      </label>
      <select id="language" value={locale} onChange={e => setLocale(e.target.value)}>
        <option value="pt-BR">Português</option>
        <option value="en">English</option>
      </select>
      <Button variant="ghost" aria-label={t('Alternar tema', 'Toggle theme')} onClick={() => setDark(!dark)}>
        {dark ? t('Tema claro', 'Light theme') : t('Tema escuro', 'Dark theme')}
      </Button>
      {session && (
        <Button data-action="logout" variant="ghost" onClick={() => void logout()}>
          {t('Sair', 'Sign out')}
        </Button>
      )}
      {logoutError && <span role="alert">{t('Não foi possível sair. Tente novamente.', 'Could not sign out. Try again.')}</span>}
    </>
  );
  if (
    session &&
    !loading &&
    !authError &&
    !recovery &&
    (location.pathname.startsWith('/app') || location.pathname === '/react.html' || location.pathname === '/login' || location.pathname === '/auth/callback')
  )
    return <WorkspacePanel key={sessionBoundary!} session={session} t={t} controls={controls} />;
  return (
    <div className="react-shell">
      <header className="shell-header">
        <a className="brand" href="/app" aria-label="Gr8r Studio">
          <span className="brand-symbol" aria-hidden="true">
            g.
          </span>
          Gr8r Studio
        </a>
        <div className="shell-controls">{controls}</div>
      </header>
      <main className="auth-content">
        <section className="auth-panel" aria-busy={loading}>
          {loading ? (
            <p role="status">{t('Carregando sua conta...', 'Loading your account...')}</p>
          ) : !session || recovery || authError ? (
            <AuthScreen t={t} />
          ) : location.pathname === '/oauth/consent' ? (
            <ConsentPage t={t} />
          ) : (
            <ConnectionsPage t={t} />
          )}
        </section>
      </main>
      <footer className="shell-footer">{t('Seu trabalho, com cada acesso sob seu controle.', 'Your work, with every connection under your control.')}</footer>
    </div>
  );
}
