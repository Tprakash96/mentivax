import { Fragment } from 'react';
import { formatMoney, type FeePeriod } from '@mentivax/core';
import type { Invoice, InvoiceLine } from '@mentivax/api-client';

/** How often a line is charged, e.g. "2 terms", "12 months". */
function durationLabel(l: InvoiceLine): string {
  const n = Array.isArray(l.periods) ? l.periods.length : 1;
  switch (l.period) {
    case 'TERM':
      return n > 1 ? `${n} terms` : 'Term';
    case 'MONTHLY':
      return n > 1 ? `${n} months` : 'Monthly';
    case 'DUE_DATE':
      return 'On due date';
    default:
      return 'One-time';
  }
}

/** Label for one instalment within a line. */
function periodLabel(period: FeePeriod, i: number): string {
  if (period === 'TERM') return `Term ${i + 1}`;
  if (period === 'MONTHLY') return `Instalment ${i + 1}`;
  if (period === 'DUE_DATE') return 'On due date';
  return 'One-time';
}

/**
 * A clear, itemised invoice view: dates, every fee line broken down per period
 * (term/month), the transport line, and — when a concession applies — explicit
 * Amount − Discount = Net columns per fee and per period. Read-only.
 */
export function InvoiceBreakdown({ invoice }: { invoice: Invoice }) {
  const lines = invoice.lines ?? [];
  const hasDiscount = invoice.discountAmount > 0;

  // A whole-invoice concession is allocated across periods, earliest first
  // (how billing settles it), so each term shows the concession it absorbs.
  const perLineHasDiscount = lines.some((l) => l.discountAmount > 0);
  const alloc = new Map<string, number>(); // `${lineId}:${periodIndex}` → discount paise
  if (hasDiscount && !perLineHasDiscount) {
    let remaining = invoice.discountAmount;
    for (const l of lines) {
      if (remaining <= 0) break;
      const periods = Array.isArray(l.periods) && l.periods.length ? l.periods : [l.grossAmount];
      for (let i = 0; i < periods.length; i++) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, periods[i]!);
        if (take > 0) alloc.set(`${l.id}:${i}`, take);
        remaining -= take;
      }
    }
  }

  const periodsOf = (l: InvoiceLine) => (Array.isArray(l.periods) && l.periods.length ? l.periods : [l.grossAmount]);
  const lineDiscount = (l: InvoiceLine) =>
    l.discountAmount > 0 ? l.discountAmount : periodsOf(l).reduce((s, _, i) => s + (alloc.get(`${l.id}:${i}`) ?? 0), 0);

  // A per-line (targeted) discount is spread across that fee's own periods,
  // earliest first — so a concession scoped to one fee still shows per-term.
  const periodDiscount = (l: InvoiceLine, i: number): number => {
    if (l.discountAmount > 0) {
      const periods = periodsOf(l);
      let remaining = l.discountAmount;
      for (let k = 0; k <= i && k < periods.length; k++) {
        const take = Math.min(remaining, periods[k]!);
        if (k === i) return take;
        remaining -= take;
      }
      return 0;
    }
    return alloc.get(`${l.id}:${i}`) ?? 0;
  };

  return (
    <>
      <div className="inv-meta">
        <span className="mono">Issued {invoice.issueDate.slice(0, 10)}</span>
        <span className="mono">Due {invoice.dueDate.slice(0, 10)}</span>
      </div>

      <div className="card-t inv-brk" style={{ marginTop: 10, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Fee</th>
              <th className="num">Amount</th>
              {hasDiscount && <th className="num">Discount</th>}
              {hasDiscount && <th className="num">Net</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const periods = periodsOf(l);
              const multi = periods.length > 1;
              const isTransport = l.feeKey === 'transport';
              const ld = lineDiscount(l);
              return (
                <Fragment key={l.id}>
                  <tr className="inv-line">
                    <td>
                      <b style={{ fontWeight: 600 }}>{l.feeName}</b>
                      <span className="fs-chip" style={{ marginLeft: 8 }}>{durationLabel(l)}</span>
                      {isTransport && <span className="cls" style={{ marginLeft: 6 }}>Transport</span>}
                    </td>
                    <td className="num mono">{formatMoney(l.grossAmount)}</td>
                    {hasDiscount && (
                      <td className="num mono" style={{ color: ld > 0 ? 'var(--red-fig)' : 'var(--ink-6)' }}>
                        {ld > 0 ? `−${formatMoney(ld)}` : '—'}
                      </td>
                    )}
                    {hasDiscount && <td className="num mono" style={{ fontWeight: 600 }}>{formatMoney(l.grossAmount - ld)}</td>}
                  </tr>
                  {multi &&
                    periods.map((amt, i) => {
                      const pd = periodDiscount(l, i);
                      return (
                        <tr key={i} className="inv-period">
                          <td style={{ paddingLeft: 30 }}>{periodLabel(l.period, i)}</td>
                          <td className="num mono">{formatMoney(amt)}</td>
                          {hasDiscount && (
                            <td className="num mono" style={{ color: pd > 0 ? 'var(--red-fig)' : 'var(--ink-6)' }}>
                              {pd > 0 ? `−${formatMoney(pd)}` : '—'}
                            </td>
                          )}
                          {hasDiscount && <td className="num mono">{formatMoney(amt - pd)}</td>}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={hasDiscount ? 4 : 2} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                  No fee lines on this invoice.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="inv-sum">
        <div>
          <span>Gross</span>
          <b className="mono">{formatMoney(invoice.grossAmount)}</b>
        </div>
        {hasDiscount && (
          <div>
            <span>Concession</span>
            <b className="mono" style={{ color: 'var(--red-fig)' }}>−{formatMoney(invoice.discountAmount)}</b>
          </div>
        )}
        <div className="inv-sum-net">
          <span>Net payable</span>
          <b className="mono">{formatMoney(invoice.netAmount)}</b>
        </div>
        {invoice.paidAmount > 0 && (
          <div>
            <span>Paid</span>
            <b className="mono pos">{formatMoney(invoice.paidAmount)}</b>
          </div>
        )}
      </div>
    </>
  );
}
