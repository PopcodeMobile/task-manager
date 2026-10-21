import { KairosLogo } from './design/KairosMark';
import { supervisionCatalogs } from '../locales/supervision.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { useAuth } from './auth/AuthProvider';
import { ConsentPage } from './auth/ConsentPage';
import { AuthScreen } from './auth/AuthScreen';
import { ConnectionsPage } from './integrations/ConnectionsPage';
import { WorkspacePanel } from './shell/WorkspacePanel';
import { supabase } from './integrations/client';
import { NormalizedRepository } from '../workspace/normalized';
import type { RepositoryFactory } from '../workspace/repository';
import { createLocalWorkspaceRepository } from '../workspace/local-panel-repository';
import { createLocalRepository } from '../workspace/local.js';
import { seed } from '../data/seed.js';
import { emptyWorkspace } from '../data/workspace.js';
import { loadAppearance, saveAppearance } from '../workspace/device-preferences.js';
import { applyAccentPreference } from '../core/custom-accent.js';
import { errorMessage } from './shell/messages';
export function App() {
  const { session } = useAuth();
  const local = location.pathname.startsWith('/app-local');
  return (
    <AppearanceApp key={local ? 'local' : (session?.user.id ?? 'anonymous')} identityKey={local ? 'local' : (session?.user.id ?? 'anonymous')} local={local} />
  );
}
function AppearanceApp({ identityKey, local }: { identityKey: string; local: boolean }) {
  const { session, loading, recovery, authError, sessionBoundary } = useAuth();
  const [initial] = useState(() => {
    try {
      return loadAppearance(localStorage, identityKey);
    } catch {
      return { lang: 'pt-BR', theme: 'light', density: 'comfortable' };
    }
  });
  const [locale, setLocale] = useState(initial.lang),
    [theme, setTheme] = useState(initial.theme),
    [density, setDensity] = useState(initial.density),
    [extras, setExtras] = useState<Record<string, unknown>>(initial),
    [appearanceError, setAppearanceError] = useState<unknown>(null),
    [logoutError, setLogoutError] = useState(false);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    const update = () => {
      try {
        const value = loadAppearance(localStorage, identityKey);
        setLocale(value.lang);
        setTheme(value.theme);
        setDensity(value.density);
        setExtras(value);
      } catch (e) {
        setAppearanceError(e);
      }
    };
    addEventListener('gr8r:appearance', update);
    return () => removeEventListener('gr8r:appearance', update);
  }, [identityKey]);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  const t = useCallback((pt: string, en: string) => supervisionCatalogs[locale]?.[en] ?? (locale === 'en' ? en : pt), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.density = density;
    applyAccentPreference(document.documentElement, extras.accent, dark);
    document.documentElement.dataset.side = String(extras.side ?? 'comfortable');
    if (extras.motion === 'reduce') document.documentElement.dataset.motion = 'reduce';
    else delete document.documentElement.dataset.motion;
    return () => applyAccentPreference(document.documentElement, undefined);
  }, [locale, dark, density, extras]);
  const appearance = (patch: { lang?: string; theme?: string; density?: string }) => {
    try {
      saveAppearance(localStorage, identityKey, patch);
      if (patch.lang) setLocale(patch.lang);
      if (patch.theme) setTheme(patch.theme);
      if (patch.density) setDensity(patch.density);
      setAppearanceError(null);
      dispatchEvent(new Event('gr8r:appearance'));
    } catch (err) {
      setAppearanceError(err);
    }
  };
  const repositoryFactory = useMemo<RepositoryFactory>(() => {
    if (local) {
      const persistence = createLocalRepository({ storage: localStorage, seed, blank: emptyWorkspace });
      return workspaceId => createLocalWorkspaceRepository({ persistence, storage: localStorage, identity: 'local', workspaceId });
    }
    return workspaceId => new NormalizedRepository(supabase!, identityKey, workspaceId);
  }, [identityKey, local]);
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
      <select id="language" value={locale} onChange={e => appearance({ lang: e.target.value })}>
        <option value="pt-BR">Português</option>
        <option value="en">English</option>
      </select>
      <Button variant="ghost" aria-label={t('Alternar tema', 'Toggle theme')} onClick={() => appearance({ theme: dark ? 'light' : 'dark' })}>
        {dark ? t('Tema claro', 'Light theme') : t('Tema escuro', 'Dark theme')}
      </Button>
      {session && !local && (
        <Button data-action="logout" variant="ghost" onClick={() => void logout()}>
          {t('Sair', 'Sign out')}
        </Button>
      )}
      {appearanceError !== null && <span role="alert">{errorMessage(appearanceError, t)}</span>}
      {logoutError && <span role="alert">{t('Não foi possível sair. Tente novamente.', 'Could not sign out. Try again.')}</span>}
    </>
  );
  if (
    (local || session) &&
    (local || (!loading && !authError && !recovery)) &&
    (location.pathname.startsWith('/app') ||
      location.pathname === '/' ||
      location.pathname === '/index.html' ||
      location.pathname === '/login' ||
      location.pathname === '/auth/callback')
  )
    return (
      <WorkspacePanel
        key={local ? 'local' : sessionBoundary!}
        identity={{
          name: local ? 'Você' : String(session!.user.user_metadata?.name ?? session!.user.email ?? ''),
          email: local ? undefined : session!.user.email,
        }}
        repositoryFactory={repositoryFactory}
        onSignOut={async () => {
          const result = await supabase!.auth.signOut();
          if (result.error) throw result.error;
        }}
        density={density}
        setDensity={value => appearance({ density: value })}
        t={t}
        controls={controls}
      />
    );
  return (
    <div className="react-shell">
      <header className="shell-header">
        <a className="brand" href="/app" aria-label="Kairos">
          <KairosLogo height={22} />
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
