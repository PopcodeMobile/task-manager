import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from './auth/AuthProvider';
import { ConsentPage } from './auth/ConsentPage';
import { ConnectionsPage } from './integrations/ConnectionsPage';
import { supabase } from './integrations/client';
export function App() {
  const { session, loading, configured } = useAuth();
  const [locale, setLocale] = useState(() => localStorage.getItem('gr8r-react-locale') ?? 'pt-BR');
  const [dark, setDark] = useState(() => localStorage.getItem('gr8r-react-theme') === 'dark');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const t = useCallback((pt: string, en: string) => (locale === 'en' ? en : pt), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem('gr8r-react-locale', locale);
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('gr8r-react-theme', dark ? 'dark' : 'light');
  }, [dark]);
  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword('');
    } catch {
      setError(t('E-mail ou senha inválidos. Confira e tente novamente.', 'Invalid email or password. Check and try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="react-shell">
      <header className="shell-header">
        <a className="brand" href="/" aria-label="Gr8r Studio">
          <span className="brand-symbol" aria-hidden="true">
            g.
          </span>
          Gr8r Studio
        </a>
        <div className="shell-controls">
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
            <Button variant="ghost" onClick={() => void supabase?.auth.signOut()}>
              {t('Sair', 'Sign out')}
            </Button>
          )}
        </div>
      </header>
      <main className="auth-content">
        <section className="auth-panel" aria-busy={loading || busy}>
          {loading ? (
            <p role="status">{t('Carregando sua conta...', 'Loading your account...')}</p>
          ) : !session ? (
            <>
              <h1>{t('Entre pra continuar', 'Sign in to continue')}</h1>
              <p className="intro">
                {t(
                  'Conecte seus aplicativos aos workspaces do Gr8r. Você escolhe o acesso de cada conexão.',
                  'Connect your apps to Gr8r workspaces. You choose access for each connection.',
                )}
              </p>
              {!configured && (
                <p role="status" className="configuration-note">
                  {t('As conexões precisam de uma conta cloud configurada neste ambiente.', 'Connections need a cloud account configured in this environment.')}
                </p>
              )}
              <form onSubmit={event => void login(event)}>
                <div className="form-field">
                  <label htmlFor="email">{t('E-mail', 'Email')}</label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={busy || !configured}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="password">{t('Senha', 'Password')}</label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={10}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={busy || !configured}
                  />
                </div>
                {error && (
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                )}
                <Button className="login-button" disabled={busy || !configured} type="submit">
                  {busy ? t('Entrando...', 'Signing in...') : t('Entrar', 'Sign in')}
                </Button>
              </form>
              <p className="footnote">
                <a href="/">{t('Voltar ao workspace', 'Back to workspace')}</a>
              </p>
            </>
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
