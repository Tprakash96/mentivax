import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAsk } from '../lib/useAsk';

/** Questions worth suggesting — phrased the way a head would actually ask. */
const CHIPS = [
  'Who still owes fees?',
  'Show dues by class',
  'How did parents pay this year?',
  'Which fee head is collecting worst?',
];

/** One at-a-glance figure shown beside the suggestions, with somewhere to go. */
export interface AskGlance {
  key: string;
  value: string;
  label: string;
  to: string;
  tone: string;
}

/**
 * The home page's ask strip: what to ask, and the two figures worth knowing
 * without asking.
 *
 * It has no input of its own — the top bar owns that, on every page. This offers
 * the starting points, because a blank box is intimidating and nobody knows what
 * a system will understand until they see an example. Picking one drives the same
 * shared state the top bar uses, so the answer always appears in one place.
 *
 * `glance` carries the figures the old "needs attention" band showed, so the
 * numbers stay one look away rather than behind a question.
 */
export function AskBar({ glance }: { glance: AskGlance[] }) {
  const navigate = useNavigate();
  const { ask, busy } = useAsk();

  return (
    <div className="askbar">
      <div className="askbar-top">
        <div className="askbar-label">
          <Icon name="sparkles" size={15} />
          <span>Ask</span>
        </div>

        <div className="askbar-suggest">
          <span className="askbar-hint">
            {busy ? 'Asking…' : 'Ask anything in the bar above — or start with one of these'}
          </span>
          <div className="askbar-chips">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => void ask(c)} disabled={busy}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {glance.length > 0 && (
          <div className="askbar-glance">
            {glance.map((g) => (
              <button key={g.key} onClick={() => navigate(g.to)} title={g.label}>
                <span style={{ color: g.tone }}>{g.value}</span>
                <small>{g.label}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
