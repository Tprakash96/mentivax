import { useState, type FormEvent } from 'react';
import { brand } from '@mentivax/ui';
import { ApiError } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useApi } from '../lib/api';

/**
 * The unauthenticated shell. Rendered in place of the app when there is no
 * session, so no tenant data is ever fetched before sign-in.
 */
export function LoginPage() {
  const { login } = useApi();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      // On success the provider swaps in the app shell — nothing to do here.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the server. Check your connection and try again.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="mark">M</div>
          <div>
            <b>{brand.name}</b>
            <span>School ERP</span>
          </div>
        </div>

        <h1>Sign in</h1>
        <p className="auth-sub">Use the account your school administrator gave you.</p>

        <form onSubmit={onSubmit} noValidate>
          <div className="fld auth-fld">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              required
            />
          </div>

          <div className="fld auth-fld">
            <label htmlFor="password">Password</label>
            <div className="auth-pw">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="auth-pw-tog"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'ban' : 'eye'} size={15} />
              </button>
            </div>
          </div>

          {error && (
            <div className="auth-err" role="alert">
              {error}
            </div>
          )}

          <button className="btn grn auth-submit" type="submit" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-foot">
          Forgotten your password? Ask an owner at your school to reset it for you.
        </div>
      </div>
    </div>
  );
}
