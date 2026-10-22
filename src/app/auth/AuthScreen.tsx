import { KairosLogo } from '../design/KairosMark';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { supabase } from '../integrations/client';
import { useAuth } from './AuthProvider';
import type { Translate } from './ConsentPage';
type AuthField = 'name' | 'email' | 'password' | 'confirm';
type FieldErrors = Partial<Record<AuthField, string>>;
export function AuthScreen({ t }: { t: Translate }) {
  const { configured, recovery, completeRecovery, authError } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'verify' | 'sent'>('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const newPassword = mode === 'signup' || recovery;
  const pendingFocus = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!busy) {
      pendingFocus.current?.focus();
      pendingFocus.current = null;
    }
  }, [busy, fieldErrors]);
  const change = (next: typeof mode) => {
    setMode(next);
    setError('');
    setFieldErrors({});
    setPassword('');
    setConfirm('');
  };
  const callback = (reset = false) => {
    const url = new URL('/auth/callback', location.origin);
    url.searchParams.set('returnTo', location.pathname + location.search);
    if (reset) url.searchParams.set('mode', 'recovery');
    return url.href;
  };
  function validate(form: HTMLFormElement): FieldErrors {
    const errors: FieldErrors = {};
    if (mode === 'signup' && !recovery && !name.trim()) errors.name = t('Informe seu nome.', 'Enter your name.');
    if (!recovery) {
      const input = form.elements.namedItem('email') as HTMLInputElement;
      if (!email.trim()) errors.email = t('Informe seu e-mail.', 'Enter your email.');
      else if (input.validity.typeMismatch)
        errors.email = t('Informe um e-mail válido, como nome@exemplo.com.', 'Enter a valid email, such as name@example.com.');
    }
    if (mode !== 'forgot' || recovery) {
      if (!password) errors.password = t('Informe sua senha.', 'Enter your password.');
      else if (newPassword && password.length < 10)
        errors.password = t('A senha precisa ter pelo menos 10 caracteres.', 'Your password must have at least 10 characters.');
      else if (newPassword && !/\d|[^a-zA-Z]/.test(password))
        errors.password = t('Inclua pelo menos um número ou símbolo na senha.', 'Include at least one number or symbol in your password.');
    }
    if (recovery) {
      if (!confirm) errors.confirm = t('Confirme sua nova senha.', 'Confirm your new password.');
      else if (password !== confirm) errors.confirm = t('As senhas não coincidem.', 'Passwords do not match.');
    }
    return errors;
  }
  const fieldProps = (field: AuthField) => ({
    id: `auth-${field}`,
    name: field,
    'aria-invalid': !!fieldErrors[field],
    'aria-describedby':
      [field === 'password' && newPassword ? 'auth-password-hint' : '', fieldErrors[field] ? `auth-${field}-error` : ''].filter(Boolean).join(' ') || undefined,
  });
  function edit(field: AuthField, value: string) {
    ({ name: setName, email: setEmail, password: setPassword, confirm: setConfirm })[field](value);
    setError('');
    setFieldErrors(previous => ({ ...previous, [field]: undefined, ...(field === 'password' ? { confirm: undefined } : {}) }));
  }
  const fieldMessage = (field: AuthField) =>
    fieldErrors[field] && (
      <p id={`auth-${field}-error`} className="auth-field-error" role="alert">
        {fieldErrors[field]}
      </p>
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || busy) return;
    const form = e.currentTarget;
    setError('');
    const errors = validate(form);
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      (form.elements.namedItem(first) as HTMLInputElement).focus();
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
    } catch (failure) {
      const code = typeof failure === 'object' && failure !== null && 'code' in failure ? failure.code : undefined;
      if (code === 'weak_password' || code === 'same_password') {
        setFieldErrors({
          password:
            code === 'same_password'
              ? t('Escolha uma senha diferente da atual.', 'Choose a password different from your current one.')
              : t(
                  'Esta senha não atende aos requisitos de segurança. Escolha outra senha.',
                  'This password does not meet the security requirements. Choose another password.',
                ),
        });
        pendingFocus.current = form.elements.namedItem('password') as HTMLInputElement;
      } else if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
        setError(
          t(
            'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
            'Too many attempts in a short time. Wait a few minutes and try again.',
          ),
        );
      } else if (code === 'email_not_confirmed') {
        setError(
          t(
            'Confirme seu e-mail antes de entrar. Confira sua caixa de entrada e a pasta de spam.',
            'Confirm your email before signing in. Check your inbox and spam folder.',
          ),
        );
      } else if (code === 'request_timeout' || (failure instanceof Error && failure.name === 'AuthRetryableFetchError')) {
        setError(t('Não foi possível conectar. Confira sua conexão e tente novamente.', 'Could not connect. Check your connection and try again.'));
      } else
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
      {new URLSearchParams(location.search).has('invite') && !recovery && (
        <p className="hint">
          {t(
            'Você recebeu um convite. Entre ou crie sua conta com o e-mail que recebeu o convite para aceitá-lo.',
            'You received an invitation. Sign in or sign up with the invited email to accept it.',
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
        <form noValidate onSubmit={e => void submit(e)}>
          {mode === 'signup' && !recovery && (
            <div className="form-field">
              <label htmlFor="auth-name">{t('Nome completo', 'Full name')}</label>
              <Input
                {...fieldProps('name')}
                value={name}
                onChange={e => edit('name', e.target.value)}
                required
                maxLength={120}
                autoComplete="name"
                disabled={busy}
              />
              {fieldMessage('name')}
            </div>
          )}
          {!recovery && (
            <div className="form-field">
              <label htmlFor="auth-email">{t('E-mail', 'Email')}</label>
              <Input
                {...fieldProps('email')}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={e => edit('email', e.target.value)}
                disabled={busy || !configured}
              />
              {fieldMessage('email')}
            </div>
          )}
          {(mode !== 'forgot' || recovery) && (
            <div className="form-field">
              <div className="auth-password-label">
                <label htmlFor="auth-password">{recovery ? t('Nova senha', 'New password') : t('Senha', 'Password')}</label>
                {mode === 'login' && !recovery && (
                  <Button className="auth-link" variant="ghost" type="button" disabled={busy} onClick={() => change('forgot')}>
                    {t('Esqueceu a senha?', 'Forgot password?')}
                  </Button>
                )}
              </div>
              <Input
                {...fieldProps('password')}
                type="password"
                autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'}
                required
                minLength={newPassword ? 10 : undefined}
                value={password}
                onChange={e => edit('password', e.target.value)}
                disabled={busy || !configured}
              />
              {newPassword && (
                <p id="auth-password-hint" className="auth-field-hint">
                  {t('Use pelo menos 10 caracteres, incluindo um número ou símbolo.', 'Use at least 10 characters, including a number or symbol.')}
                </p>
              )}
              {fieldMessage('password')}
            </div>
          )}
          {recovery && (
            <div className="form-field">
              <label htmlFor="auth-confirm">{t('Confirme a senha', 'Confirm password')}</label>
              <Input
                {...fieldProps('confirm')}
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={confirm}
                onChange={e => edit('confirm', e.target.value)}
                disabled={busy || !configured}
              />
              {fieldMessage('confirm')}
            </div>
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
          <Button variant="ghost" disabled={busy} onClick={() => change('signup')}>
            {t('Criar conta', 'Create account')}
          </Button>
        </div>
      )}
      {(mode === 'signup' || mode === 'forgot') && !recovery && (
        <Button variant="ghost" disabled={busy} onClick={() => change('login')}>
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
