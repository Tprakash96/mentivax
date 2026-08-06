import { useNavigate } from 'react-router-dom';
import { formatMoney } from '@mentivax/core';
import type { AskAnswer } from '@mentivax/api-client';
import { Icon } from './Icon';

/**
 * One rendered Ask answer: how the question was read, the prose, the figures, the
 * rows behind them, and where to go next.
 *
 * Shared by the home hero and the top bar so the two can't drift — the top bar
 * shows this in a dropdown, the hero inline, and both are the same component on
 * the same dark surface.
 */
export function AskResult({ result, onReset }: { result: AskAnswer; onReset: () => void }) {
  const navigate = useNavigate();

  const cell = (value: string | number, money: boolean) =>
    money && typeof value === 'number' ? formatMoney(value) : String(value ?? '');

  return (
    <div className={`askbar-answer${result.understood === false ? ' askbar-unsure' : ''}`}>
      {/* What the question was taken to mean. Shown because the reading can be
          wrong, and seeing it is what lets someone rephrase instead of trusting
          the wrong answer. */}
      {result.reading && (
        <div className="askbar-reading">
          Read as <b>{result.reading}</b>
          {result.corrections && result.corrections.length > 0 && (
            <>
              {' · '}
              {result.corrections.map(([typed, readAs]) => `“${typed}” as “${readAs}”`).join(', ')}
            </>
          )}
        </div>
      )}

      <div className="askbar-prose">{result.answer}</div>

      {result.stats.length > 0 && (
        <div className="askbar-stats">
          {result.stats.map((s, i) => (
            <div key={`${s.label}-${i}`}>
              <span>{s.label}</span>
              <b className="mono">{s.value}</b>
              <small>{s.sub}</small>
            </div>
          ))}
        </div>
      )}

      {result.table && result.table.rows.length > 0 && (
        <div className="askbar-table">
          <table>
            <thead>
              <tr>
                {result.table.columns.map((c) => (
                  <th key={c.key} className={c.money ? 'num' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.table.rows.map((row, i) => (
                <tr key={i}>
                  {result.table!.columns.map((c) => (
                    <td key={c.key} className={c.money ? 'num mono' : undefined}>
                      {cell(row[c.key] ?? '', c.money)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.table.truncated && (
            <div className="askbar-more">
              Showing {result.table.rows.length} of {result.table.matched} — open the page for the rest.
            </div>
          )}
        </div>
      )}

      <div className="askbar-foot">
        <div className="askbar-links">
          {result.links.map((l) => (
            <button key={l.to} onClick={() => navigate(l.to)}>
              {l.label} <Icon name="arrowRight" size={13} />
            </button>
          ))}
        </div>
        <button className="askbar-reset" onClick={onReset}>
          Ask something else
        </button>
      </div>

      {!result.ai && result.understood !== false && (
        <div className="askbar-note">{result.note ?? 'Answered directly from your records.'}</div>
      )}
    </div>
  );
}
