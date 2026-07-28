import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

/** Suggested prompts to seed the "ask" box. */
const EXAMPLES = [
  'How much fee is pending this month?',
  'Show collections by class for this term',
  'Which students have partial payments?',
  'Total paid vs pending for Grade 5',
];

export function AskReportsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');

  const ask = () => {
    if (!q.trim()) return;
    toast('Ask Reports — natural-language reporting is coming soon');
  };

  return (
    <>
      <div className="ask-row">
        <div className="ask-bar">
          <Icon name="sparkles" size={21} />
          <input
            placeholder="Ask anything about your school’s data…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
          />
        </div>
        <button className="ask-btn" onClick={ask}>
          <Icon name="arrowRight" size={17} />
          Ask
        </button>
      </div>

      <div className="card-t" style={{ padding: 20 }}>
        <div className="sec" style={{ marginTop: 0 }}>Try asking</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="btn ask-ex" onClick={() => setQ(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
