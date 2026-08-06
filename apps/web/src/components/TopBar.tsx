import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { AskResult } from './AskResult';
import { useApi } from '../lib/api';
import { useAsk } from '../lib/useAsk';

/** "Prakash Thangavel" → "PT"; falls back to the email's first letter. */
function initials(name?: string | null, email?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (email ?? '?').slice(0, 2).toUpperCase();
}

/**
 * The bar across the top of every screen: ask anything, and your account.
 *
 * The ask box lives here rather than only on the home page because a question
 * ("who still owes fees?") is just as likely to occur while looking at an invoice
 * as on the dashboard — and walking back to the dashboard to ask it is the kind
 * of friction that stops people using it at all. ⌘K focuses it from anywhere.
 *
 * The answer opens as a panel under the bar, on whatever page you were already
 * on, so asking never loses your place.
 */
export function TopBar() {
  const { session, orgs, currentOrg, setOrg, logout, roleName, hasModule, can } = useApi();
  const navigate = useNavigate();
  const { question, setQuestion, busy, result, failed, ask, reset } = useAsk();
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Ask is gated exactly like the page it reads from.
  const canAsk = hasModule('reports') && can('reports:read');

  // ⌘K / Ctrl+K from anywhere; Escape dismisses whatever is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') {
        setMenuOpen(false);
        if (result || failed) reset();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [result, failed, reset]);

  // Clicking away closes the account menu and the answer panel.
  useEffect(() => {
    if (!menuOpen && !result && !failed) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
      if (result || failed) reset();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen, result, failed, reset]);

  return (
    <div className="topbar" ref={barRef}>
      <div className="topbar-row">
        {canAsk ? (
          <div className="topbar-ask">
            <Icon name="sparkles" size={15} />
            <input
              ref={inputRef}
              placeholder="Find a student, an invoice, ask a question…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask(question)}
              aria-label="Ask a question about your school"
            />
            {busy ? (
              <span className="topbar-busy">Asking…</span>
            ) : (
              <span className="topbar-kbd">⌘K</span>
            )}
          </div>
        ) : (
          <div className="topbar-sp" />
        )}

        <div className="topbar-right">
          <button
            className="topbar-avatar"
            onClick={() => setMenuOpen((v) => !v)}
            title={session?.user.name ?? session?.user.email ?? 'Account'}
            aria-label="Account"
            aria-expanded={menuOpen}
          >
            {initials(session?.user.name, session?.user.email)}
          </button>

          {menuOpen && (
            <div className="lt-menu">
              <div className="lt-menu-sec">
                {session?.user.name ?? session?.user.email}
                {roleName ? ` · ${roleName}` : ''}
              </div>
              {orgs.length > 1 && (
                <>
                  <div className="lt-menu-sec">Switch school</div>
                  {orgs.map((o) => (
                    <button
                      key={o.id}
                      className={`lt-menu-item${o.id === currentOrg?.id ? ' on' : ''}`}
                      onClick={() => {
                        setOrg(o.id);
                        setMenuOpen(false);
                      }}
                    >
                      <span className="ob sm">{o.shortCode}</span>
                      <span>{o.name}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="lt-menu-div" />
              <button
                className="lt-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/home');
                }}
              >
                <Icon name="grid" size={14} />
                <span>All features</span>
              </button>
              <button className="lt-menu-item" onClick={() => void logout()}>
                <Icon name="ban" size={14} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* The answer, over the page rather than replacing it. `askbar` supplies the
          dark surface the shared AskResult styles are written against. */}
      {(result || failed) && (
        <div className="topbar-panel askbar">
          {failed ? (
            <div className="askbar-answer askbar-err">That didn’t go through. Try again in a moment.</div>
          ) : (
            <AskResult result={result!} onReset={reset} />
          )}
        </div>
      )}
    </div>
  );
}
