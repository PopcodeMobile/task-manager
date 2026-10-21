import { KairosLogo } from '../design/KairosMark';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { supabase } from '../integrations/client';
import { useAuth } from './AuthProvider';
import type { Translate } from './ConsentPage';
export function AuthScreen({ t }: { t: Translate }) {
  const { configured, recovery, completeRecovery, authError } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'verify' | 'sent'>('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const change = (next: typeof mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  };
  const callback = (reset = false) => {
    const url = new URL('/auth/callback', location.origin);
    url.searchParams.set('returnTo', location.pathname + location.search);
    if (reset) url.searchParams.set('mode', 'recovery');
    return url.href;
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    if (mode === 'signup' && !name.trim()) {
      setError(t('Informe seu nome.', 'Enter your name.'));
      return;
    }
    if ((mode === 'signup' || recovery) && (!/\d|[^a-zA-Z]/.test(password) || password.length < 10)) {
      setError(t('Use pelo menos 10 caracteres, incluindo um número ou símbolo.', 'Use at least 10 characters, including a number or symbol.'));
      return;
    }
    if (recovery && password !== confirm) {
      setError(t('As senhas não coincidem.', 'Passwords do not match.'));
      return;
    }
    setBusy(true);
    try {
      if (recovery) {
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        setPassword('');
        setConfirm('');
        completeRecovery();
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() }, emailRedirectTo: callback() } });
        if (result.error) throw result.error;
        setPassword('');
        if (!result.data.session) setMode('verify');
      } else if (mode === 'forgot') {
        const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback(true) });
        if (result.error) throw result.error;
        setMode('sent');
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        setPassword('');
      }
    } catch {
      setError(
        mode === 'login'
          ? t('E-mail ou senha inválidos. Confira e tente novamente.', 'Invalid email or password. Check and try again.')
          : t('Não foi possível concluir. Confira os dados e tente novamente.', 'Could not complete this request. Check the fields and try again.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-card">
      <div className="auth-logo">
        <KairosLogo />
      </div>
      <h1>
        {recovery
          ? t('Escolha uma nova senha', 'Choose a new password')
          : mode === 'signup'
            ? t('Crie sua conta', 'Create your account')
            : mode === 'forgot'
              ? t('Redefina sua senha', 'Reset your password')
              : mode === 'verify' || mode === 'sent'
                ? t('Confira seu e-mail', 'Check your email')
                : t('Entre pra continuar', 'Sign in to continue')}
      </h1>
      <p className="intro">
        {recovery
          ? t('Atualize a senha para continuar na sua conta.', 'Update your password to continue to your account.')
          : mode === 'verify'
            ? t('Confirme seu e-mail pelo link que enviamos e entre na sua conta.', 'Confirm your email using the link we sent, then sign in.')
            : mode === 'sent'
              ? t('Se esta conta existir, o link de recuperação chegará em instantes.', 'If this account exists, a recovery link will arrive shortly.')
              : mode === 'signup'
                ? t('Crie seu espaço de trabalho no Kairos.', 'Create your workspace in Kairos.')
                : mode === 'forgot'
                  ? t('Informe seu e-mail para receber um link de recuperação.', 'Enter your email to receive a password reset link.')
                  : t('Acesse suas organizações e acompanhe o trabalho da equipe.', 'Access your workspaces and follow your team’s work.')}
      </p>
      {!configured && (
        <p role="status" className="configuration-note">
          {t(
            'As integrações estão indisponíveis neste ambiente. O workspace local continua disponível.',
            'Integrations are unavailable in this environment. Your local workspace remains available.',
          )}
        </p>
      )}
      {authError && (
        <p role="alert" className="error-message">
          {t('O link de acesso expirou ou não é válido. Solicite um novo link.', 'The access link expired or is invalid. Request a new link.')}
        </p>
      )}
      {mode === 'verify' || mode === 'sent' ? (
        <Button variant="outline" onClick={() => change('login')}>
          {t('Voltar para entrar', 'Back to sign in')}
        </Button>
      ) : (
        <form onSubmit={e => void submit(e)}>
          {mode === 'signup' && !recovery && (
            <label className="form-field">
              {t('Nome completo', 'Full name')}
              <Input value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoComplete="name" disabled={busy} />
            </label>
          )}
          {!recovery && (
            <label className="form-field">
              {t('E-mail', 'Email')}
              <Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !configured} />
            </label>
          )}
          {(mode !== 'forgot' || recovery) && (
            <div className="form-field">
              <div className="auth-password-label">
                <label htmlFor="auth-password">{recovery ? t('Nova senha', 'New password') : t('Senha', 'Password')}</label>
                {mode === 'login' && !recovery && (
                  <Button className="auth-link" variant="ghost" type="button" onClick={() => change('forgot')}>
                    {t('Esqueceu a senha?', 'Forgot password?')}
                  </Button>
                )}
              </div>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'}
                required
                minLength={10}
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={busy || !configured}
              />
            </div>
          )}
          {recovery && (
            <label className="form-field">
              {t('Confirme a senha', 'Confirm password')}
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                disabled={busy || !configured}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <Button className="login-button" type="submit" disabled={busy || !configured}>
            {busy
              ? t('Aguarde...', 'Please wait...')
              : recovery
                ? t('Atualizar senha', 'Update password')
                : mode === 'signup'
                  ? t('Criar conta', 'Create account')
                  : mode === 'forgot'
                    ? t('Enviar link de recuperação', 'Send reset link')
                    : t('Entrar', 'Sign in')}
          </Button>
        </form>
      )}
      {mode === 'login' && !recovery && (
        <div className="auth-links">
          <Button variant="ghost" onClick={() => change('signup')}>
            {t('Criar conta', 'Create account')}
          </Button>
        </div>
      )}
      {(mode === 'signup' || mode === 'forgot') && !recovery && (
        <Button variant="ghost" onClick={() => change('login')}>
          {t('Voltar para entrar', 'Back to sign in')}
        </Button>
      )}
      {!configured && (
        <p className="footnote">
          <a href="/app-local">{t('Continuar neste dispositivo', 'Continue on this device')}</a>
        </p>
      )}
    </section>
  );
}
