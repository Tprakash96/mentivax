import { useMemo, useState } from 'react';
import { formatMoney, paiseToRupees, rupeesToPaise, type ExpenseMode, type LedgerKind } from '@mentivax/core';
import type {
  ExpenseAccount,
  ExpenseCategory,
  ExpenseSettings,
  LedgerEntry,
  Vendor,
} from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { findHeaderRow, readFileToGrid, SPREADSHEET_ACCEPT } from '../lib/spreadsheet';

type Tab = 'ledger' | 'approvals' | 'statement' | 'reports' | 'categories' | 'vendors';

const MODES: { value: ExpenseMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK', label: 'Bank' },
  { value: 'CHEQUE', label: 'Cheque' },
];
const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.value, m.label]));

/** DD/MM/YYYY from an ISO date, rendered mono per the handoff. */
function dmy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
const today = () => new Date().toISOString().slice(0, 10);

export function ExpensesPage() {
  const { api, can } = useApi();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('ledger');

  const settings = useAsync(() => api.expenses.settings.get(), []);
  const s = settings.data;
  const approvalsOn = s?.approvalsOn ?? true;
  const catsOn = s?.categoriesOn ?? true;

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: 'ledger', label: 'Day book', show: true },
    { key: 'approvals', label: 'Approvals', show: approvalsOn && can('expenses:approve') },
    { key: 'statement', label: 'Statement', show: true },
    { key: 'reports', label: 'Reports', show: true },
    { key: 'categories', label: 'Categories', show: catsOn && can('expenses:manage') },
    { key: 'vendors', label: 'Vendors', show: can('expenses:manage') },
  ];

  return (
    <>
      <div className="subtabs">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            className={`subtab${tab === t.key ? ' on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {settings.loading && <div className="state">Loading…</div>}
      {s && tab === 'ledger' && <DayBook settings={s} />}
      {s && tab === 'approvals' && <Approvals onDone={() => toast('Queue updated')} />}
      {s && tab === 'statement' && <Statement />}
      {s && tab === 'reports' && <Reports settings={s} />}
      {s && tab === 'categories' && <Categories />}
      {s && tab === 'vendors' && <Vendors />}
    </>
  );
}

/* ============================== Day book ============================== */

function DayBook({ settings }: { settings: ExpenseSettings }) {
  const { api, can } = useApi();
  const toast = useToast();
  const [kind, setKind] = useState<'' | LedgerKind>('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [add, setAdd] = useState<null | LedgerKind>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [detail, setDetail] = useState<null | {
    title: string;
    subtitle: string;
    total: number;
    tone: string;
    filter: { kind?: LedgerKind; accountId?: string; status?: 'POSTED' | 'PENDING'; from?: string; to?: string };
  }>(null);

  const range = useMemo(() => ({ from: from || undefined, to: to || undefined }), [from, to]);
  const overview = useAsync(() => api.expenses.overview(range), [from, to]);
  const entries = useAsync(
    () =>
      api.expenses.entries({
        kind: kind || undefined,
        categoryId: categoryId || undefined,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    [kind, categoryId, search, from, to],
  );
  const categories = useAsync(() => (settings.categoriesOn ? api.expenses.categories.list() : Promise.resolve([])), []);

  const ov = overview.data;
  const rows = entries.data ?? [];

  const reload = () => {
    overview.reload();
    entries.reload();
  };

  // Open the read-only detail for a figure, scoped to the same date range.
  const openDetail = (
    title: string,
    subtitle: string,
    total: number,
    tone: string,
    filter: { kind?: LedgerKind; accountId?: string; status?: 'POSTED' | 'PENDING' },
  ) => setDetail({ title, subtitle, total, tone, filter: { ...filter, from: from || undefined, to: to || undefined } });

  // Soft delete: removes the voucher from lists and balances but keeps the row.
  const del = async (e: LedgerEntry) => {
    if (!window.confirm(`Remove voucher ${e.voucherNo} (${e.title})? It will drop out of the day book and balances.`)) return;
    try {
      await api.expenses.removeEntry(e.id);
      toast(`${e.voucherNo} removed`);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not remove the voucher');
    }
  };

  return (
    <>
      <div className="acct-cards">
        {(ov?.accounts ?? []).map((a) => (
          <button
            key={a.id}
            className="acct-card"
            onClick={() => openDetail(a.label, a.note || 'Account ledger', a.closing, '', { accountId: a.id })}
          >
            <div className="acct-label">{a.label}</div>
            <div className="acct-bal mono">{formatMoney(a.closing)}</div>
            <div className="acct-note">
              {a.note}
              {a.awaiting > 0 && <span className="acct-await"> · {formatMoney(a.awaiting)} awaiting</span>}
            </div>
            <div className="acct-view">View entries ›</div>
          </button>
        ))}
      </div>

      <div className="kpi-strip">
        <button
          className="kpi"
          onClick={() => openDetail('Income', 'Money received · posted', ov?.income ?? 0, 'pos', { kind: 'INCOME', status: 'POSTED' })}
        >
          <span>Income</span>
          <b className="mono pos">{formatMoney(ov?.income ?? 0)}</b>
          <span className="kpi-view">View entries ›</span>
        </button>
        <button
          className="kpi"
          onClick={() => openDetail('Expense', 'Money spent · posted', ov?.expense ?? 0, 'neg', { kind: 'EXPENSE', status: 'POSTED' })}
        >
          <span>Expense</span>
          <b className="mono neg">{formatMoney(ov?.expense ?? 0)}</b>
          <span className="kpi-view">View entries ›</span>
        </button>
        {settings.approvalsOn && (
          <button
            className="kpi"
            onClick={() => openDetail('Awaiting approval', 'Vouchers pending sign-off', ov?.awaiting ?? 0, 'amb', { status: 'PENDING' })}
          >
            <span>Awaiting approval</span>
            <b className="mono amb">{formatMoney(ov?.awaiting ?? 0)}</b>
            <span className="kpi-view">View entries ›</span>
          </button>
        )}
        <button
          className="kpi"
          onClick={() => openDetail('Cash in hand', 'All posted entries across books', ov?.closing ?? 0, '', { status: 'POSTED' })}
        >
          <span>Cash in hand</span>
          <b className="mono">{formatMoney(ov?.closing ?? 0)}</b>
          <span className="kpi-view">View entries ›</span>
        </button>
      </div>

      <div className="tbar">
        <div className="seg">
          {(['', 'INCOME', 'EXPENSE'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : undefined} onClick={() => setKind(k)}>
              {k === '' ? 'All' : k === 'INCOME' ? 'Income' : 'Expense'}
            </button>
          ))}
        </div>
        {settings.categoriesOn && (
          <select className="minisel" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <input className="minidate" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <input className="minidate" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        <div className="sp" />
        <div className="search">
          <Icon name="search" />
          <input placeholder="Search title, payee, voucher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {can('expenses:write') && (
          <>
            <button className="btn" onClick={() => setImportOpen(true)}>
              <Icon name="import" size={15} />
              Import
            </button>
            <button className="btn" onClick={() => setAdd('INCOME')}>
              <Icon name="plus" size={15} />
              Income
            </button>
            <button className="btn grn" onClick={() => setAdd('EXPENSE')}>
              <Icon name="plus" size={15} />
              Expense
            </button>
          </>
        )}
      </div>

      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher</th>
              <th>Title</th>
              <th>Paid to / from</th>
              <th>{settings.categoriesOn ? 'Category' : 'Description'}</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>{dmy(e.date)}</td>
                <td className="mono" style={{ fontSize: '12.5px' }}>{e.voucherNo}</td>
                <td>
                  <b style={{ fontWeight: 600 }}>{e.title}</b>
                  <div className="submeta">
                    {MODE_LABEL[e.mode]}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </td>
                <td style={{ color: 'var(--ink-2)' }}>{e.person || '—'}</td>
                <td>{settings.categoriesOn ? <span className="cls">{e.categoryLabel ?? 'Uncategorised'}</span> : (e.note || '—')}</td>
                <td className={`num mono ${e.kind === 'INCOME' ? 'pos' : 'neg'}`} style={{ fontWeight: 650 }}>
                  {e.kind === 'INCOME' ? '+' : '−'}
                  {formatMoney(e.amount)}
                </td>
                <td>
                  <span className={`tag ${e.status === 'POSTED' ? 'paid' : 'due'}`}>
                    <i />
                    {e.status === 'POSTED' ? 'Posted' : 'Pending'}
                  </span>
                </td>
                <td className="num">
                  <div className="rowacts">
                    {can('expenses:write') && (
                      <button className="btn sm grn" onClick={() => setEditing(e)}>
                        <Icon name="pencil" size={13} />
                        Edit
                      </button>
                    )}
                    {can('expenses:delete') && (
                      <button className="btn sm" onClick={() => void del(e)} title="Delete">
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.loading && <div className="state">Loading entries…</div>}
        {entries.error && <div className="state err">{entries.error}</div>}
        {!entries.loading && rows.length === 0 && <div className="state">No entries yet — record an income or expense.</div>}
      </div>

      {(add || editing) && (
        <EntryModal
          kind={add ?? editing!.kind}
          editing={editing}
          settings={settings}
          onClose={() => {
            setAdd(null);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setAdd(null);
            setEditing(null);
            reload();
            toast(msg);
          }}
        />
      )}

      {detail && (
        <LedgerDetailModal
          title={detail.title}
          subtitle={detail.subtitle}
          total={detail.total}
          tone={detail.tone}
          filter={detail.filter}
          categoriesOn={settings.categoriesOn}
          onClose={() => setDetail(null)}
        />
      )}

      {importOpen && (
        <ImportEntriesModal
          settings={settings}
          onClose={() => setImportOpen(false)}
          onDone={(n) => {
            setImportOpen(false);
            reload();
            toast(`${n} ${n === 1 ? 'entry' : 'entries'} imported`);
          }}
        />
      )}
    </>
  );
}

/** Column labels the day-book importer knows, and its identity columns. */
const ENTRY_KEYS = [
  'type', 'kind', 'income', 'expense', 'direction', 'title', 'particular', 'name',
  'amount', 'value', 'paid', 'payee', 'person', 'vendor', 'source', 'from', 'to',
  'date', 'book', 'account', 'fund', 'category', 'head', 'mode', 'method', 'note', 'remark', 'description',
];
const ENTRY_ID_KEYS = ['title', 'particular', 'amount', 'type', 'kind'];

interface ImportEntryRow {
  kind: LedgerKind;
  title: string;
  person: string;
  amount: number; // paise
  amountText: string; // for display when invalid
  mode: ExpenseMode;
  date: string;
  accountId: string | null;
  accountLabel: string;
  categoryId: string | null;
  categoryLabel: string;
  note: string;
  error?: string;
}

/**
 * Bulk-import day-book entries from a CSV/Excel file. Each row is one income or
 * expense; the Book column maps to an account (defaults to the first), Category
 * to a matching head, and the amount/mode/date/payee map straight across.
 */
function ImportEntriesModal({
  settings,
  onClose,
  onDone,
}: {
  settings: ExpenseSettings;
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const { api } = useApi();
  const accounts = useAsync(() => api.expenses.accounts.list(), []);
  const categories = useAsync(() => (settings.categoriesOn ? api.expenses.categories.list() : Promise.resolve([])), []);
  const [rows, setRows] = useState<ImportEntryRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: { title: string; error: string }[] } | null>(null);

  const acctList = accounts.data ?? [];
  const catList = categories.data ?? [];

  const applyGrid = (grid: string[][]) => {
    const cleaned = grid.filter((r) => r.some((c) => c.trim() !== ''));
    const hIdx = findHeaderRow(cleaned, ENTRY_KEYS, ENTRY_ID_KEYS);
    const body = hIdx >= 0 ? cleaned.slice(hIdx) : cleaned;
    if (body.length < 2) {
      setRows([]);
      setParseError('No rows found — the file needs a header row (Title, Amount, …) plus at least one entry.');
      return;
    }
    setParseError(null);
    const header = body[0]!.map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => {
      for (const nm of names) {
        const i = header.findIndex((h) => h === nm || h.includes(nm));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iType = col('type', 'kind', 'direction', 'in/out');
    const iTitle = col('title', 'particular', 'name');
    const iAmount = col('amount', 'value');
    const iPerson = col('paid to', 'payee', 'person', 'vendor', 'source', 'paid', 'from', 'to');
    const iDate = col('date');
    const iBook = col('book', 'account', 'fund');
    const iCategory = col('category', 'head');
    const iMode = col('mode', 'method', 'payment');
    const iNote = col('note', 'remark', 'description');

    const parsed: ImportEntryRow[] = body
      .slice(1)
      .map((r): ImportEntryRow => {
        const typeRaw = ((iType >= 0 ? r[iType] : '') ?? '').toLowerCase();
        const kind: LedgerKind =
          typeRaw.includes('inc') || typeRaw.includes('receipt') || typeRaw.includes('credit') || typeRaw.trim() === 'in'
            ? 'INCOME'
            : 'EXPENSE';
        const title = (iTitle >= 0 ? r[iTitle] : r[0])?.trim() ?? '';
        const amountText = ((iAmount >= 0 ? r[iAmount] : '') ?? '').trim();
        const num = parseFloat(amountText.replace(/[^0-9.]/g, ''));
        const amount = Number.isFinite(num) && num > 0 ? rupeesToPaise(num) : 0;

        const bookRaw = ((iBook >= 0 ? r[iBook] : '') ?? '').trim();
        const account = bookRaw
          ? acctList.find((a) => a.label.toLowerCase() === bookRaw.toLowerCase())
          : acctList[0];

        const catRaw = ((iCategory >= 0 ? r[iCategory] : '') ?? '').trim();
        const cat = catRaw
          ? catList.find((c) => c.label.toLowerCase() === catRaw.toLowerCase() && c.kind === kind)
          : undefined;

        const modeRaw = ((iMode >= 0 ? r[iMode] : '') ?? '').toLowerCase();
        const mode: ExpenseMode = modeRaw.includes('upi') || modeRaw.includes('gpay')
          ? 'UPI'
          : modeRaw.includes('bank') || modeRaw.includes('transfer') || modeRaw.includes('neft')
            ? 'BANK'
            : modeRaw.includes('cheque') || modeRaw.includes('check')
              ? 'CHEQUE'
              : 'CASH';

        const dateRaw = ((iDate >= 0 ? r[iDate] : '') ?? '').trim();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : today();

        let error: string | undefined;
        if (!title) error = 'Missing title';
        else if (amount <= 0) error = 'Invalid amount';
        else if (bookRaw && !account) error = `Unknown book "${bookRaw}"`;

        return {
          kind,
          title,
          person: (iPerson >= 0 ? r[iPerson] : '')?.trim() ?? '',
          amount,
          amountText,
          mode,
          date,
          accountId: account?.id ?? null,
          accountLabel: account?.label ?? bookRaw,
          categoryId: cat?.id ?? null,
          categoryLabel: cat?.label ?? (catRaw || '—'),
          note: (iNote >= 0 ? r[iNote] : '')?.trim() ?? '',
          error,
        };
      })
      .filter((r) => r.title || r.amountText);
    setRows(parsed);
    setResult(null);
  };

  const onFile = async (f: File) => {
    setFileName(f.name);
    setParseError(null);
    try {
      applyGrid(await readFileToGrid(f, ENTRY_KEYS, ENTRY_ID_KEYS));
    } catch {
      setRows([]);
      setParseError('Could not read that file. Try re-saving it as .xlsx or .csv.');
    }
  };

  const valid = rows.filter((r) => !r.error && r.accountId);
  const invalid = rows.filter((r) => r.error || !r.accountId);

  const runImport = async () => {
    setImporting(true);
    const failed: { title: string; error: string }[] = [];
    let created = 0;
    for (const r of valid) {
      try {
        await api.expenses.createEntry({
          kind: r.kind,
          title: r.title,
          person: r.person || undefined,
          amount: r.amount,
          mode: r.mode,
          date: r.date,
          accountId: r.accountId!,
          categoryId: settings.categoriesOn ? r.categoryId ?? undefined : undefined,
          note: r.note || undefined,
        });
        created++;
      } catch (e) {
        failed.push({ title: r.title, error: e instanceof Error ? e.message : 'failed' });
      }
    }
    setImporting(false);
    setResult({ created, failed });
    if (failed.length === 0) onDone(created);
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: '96%' }}>
        <div className="mh">
          <div>
            <b>Import day book</b>
            <span>Upload a CSV or Excel file — one income or expense per row</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <div className="import-drop">
            <input
              id="entries-import-file"
              type="file"
              accept={SPREADSHEET_ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <label htmlFor="entries-import-file" className="import-tile">
              <span className="import-plus">+</span>
              <div>
                <b>{fileName || 'Choose a CSV or Excel file'}</b>
                <span>Columns: Type (income/expense) · Title · Amount · Paid to/from · Date · Book · Category · Mode · Note</span>
              </div>
            </label>
          </div>

          {parseError && <div className="state err" style={{ marginTop: 10 }}>{parseError}</div>}

          {rows.length > 0 && !result && (
            <>
              <div className="import-summary">
                <span className="pos">{valid.length} ready</span>
                {invalid.length > 0 && <span className="neg">{invalid.length} need attention</span>}
              </div>
              <div className="card-t" style={{ maxHeight: 320, overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Paid to / from</th>
                      <th>Book</th>
                      {settings.categoriesOn && <th>Category</th>}
                      <th className="num">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <span className={`tag ${r.kind === 'INCOME' ? 'paid' : 'due'}`}>
                            <i />
                            {r.kind === 'INCOME' ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td><b style={{ fontWeight: 600 }}>{r.title || '—'}</b></td>
                        <td style={{ color: 'var(--ink-2)' }}>{r.person || '—'}</td>
                        <td><span className="cls">{r.accountLabel || '—'}</span></td>
                        {settings.categoriesOn && <td style={{ color: 'var(--ink-2)' }}>{r.categoryLabel}</td>}
                        <td className={`num mono ${r.kind === 'INCOME' ? 'pos' : 'neg'}`} style={{ fontWeight: 650 }}>
                          {r.amount > 0 ? `${r.kind === 'INCOME' ? '+' : '−'}${formatMoney(r.amount)}` : r.amountText || '—'}
                        </td>
                        <td>
                          {r.error || !r.accountId ? (
                            <span className="tag due" title={r.error}>
                              <i />
                              {r.error ?? 'No book'}
                            </span>
                          ) : (
                            <span className="tag paid">
                              <i />
                              Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className="state" style={{ marginTop: 12 }}>
              <b className="pos">
                {result.created} {result.created === 1 ? 'entry' : 'entries'} imported.
              </b>
              {result.failed.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <b className="neg">{result.failed.length} failed:</b>
                  <ul style={{ margin: '6px 0 0 18px' }}>
                    {result.failed.map((f, i) => (
                      <li key={i}>
                        {f.title} — {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button className="btn grn" disabled={valid.length === 0 || importing} onClick={runImport}>
              {importing ? 'Importing…' : `Import ${valid.length} ${valid.length === 1 ? 'entry' : 'entries'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Read-only list of the ledger entries behind a Day-book figure. */
function LedgerDetailModal({
  title,
  subtitle,
  total,
  tone,
  filter,
  categoriesOn,
  onClose,
}: {
  title: string;
  subtitle: string;
  total: number;
  tone: string;
  filter: { kind?: LedgerKind; accountId?: string; status?: 'POSTED' | 'PENDING'; from?: string; to?: string };
  categoriesOn: boolean;
  onClose: () => void;
}) {
  const { api } = useApi();
  const q = useAsync(() => api.expenses.entries(filter), [JSON.stringify(filter)]);
  const rows = q.data ?? [];

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, width: '95%' }}>
        <div className="mh">
          <div>
            <b>
              {title}
              {rows.length ? ` · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}` : ''}
            </b>
            <span>
              {subtitle} — <b className={tone}>{formatMoney(total)}</b>
            </span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ padding: 0 }}>
          <div className="card-t" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, minHeight: 0, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher</th>
                  <th>Title</th>
                  <th>Account</th>
                  {categoriesOn && <th>Category</th>}
                  <th>Paid to / from</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>{dmy(e.date)}</td>
                    <td className="mono" style={{ fontSize: '12.5px' }}>{e.voucherNo}</td>
                    <td>
                      <b style={{ fontWeight: 600 }}>{e.title}</b>
                    </td>
                    <td>
                      <span className="cls">{e.accountLabel}</span>
                    </td>
                    {categoriesOn && <td style={{ color: 'var(--ink-2)' }}>{e.categoryLabel ?? 'Uncategorised'}</td>}
                    <td style={{ color: 'var(--ink-2)' }}>{e.person || '—'}</td>
                    <td className={`num mono ${e.kind === 'INCOME' ? 'pos' : 'neg'}`} style={{ fontWeight: 650 }}>
                      {e.kind === 'INCOME' ? '+' : '−'}
                      {formatMoney(e.amount)}
                    </td>
                    <td>
                      <span className={`tag ${e.status === 'POSTED' ? 'paid' : 'due'}`}>
                        <i />
                        {e.status === 'POSTED' ? 'Posted' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {q.loading && <div className="state">Loading…</div>}
          {!q.loading && rows.length === 0 && <div className="state">No entries here.</div>}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryModal({
  kind,
  editing,
  settings,
  onClose,
  onSaved,
}: {
  kind: LedgerKind;
  editing: LedgerEntry | null;
  settings: ExpenseSettings;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { api } = useApi();
  const accounts = useAsync(() => api.expenses.accounts.list(), []);
  const categories = useAsync(
    () => (settings.categoriesOn ? api.expenses.categories.list() : Promise.resolve<ExpenseCategory[]>([])),
    [],
  );

  const [title, setTitle] = useState(editing?.title ?? '');
  const [person, setPerson] = useState(editing?.person ?? '');
  const [rupees, setRupees] = useState(editing ? String(paiseToRupees(editing.amount)) : '');
  const [mode, setMode] = useState<ExpenseMode>(editing?.mode ?? 'CASH');
  const [date, setDate] = useState(editing?.date ?? today());
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = Number(rupees) || 0;
  const acctList = accounts.data ?? [];
  const effectiveAccount = accountId || acctList[0]?.id || '';
  const catList = (categories.data ?? []).filter((c) => c.kind === kind);
  const valid = title.trim() && amount > 0 && effectiveAccount;

  const needsAppr =
    settings.approvalsOn && kind === 'EXPENSE' && rupeesToPaise(amount) > settings.approvalLimit && !editing;
  const cta = editing
    ? 'Save changes'
    : needsAppr
      ? 'Send for approval'
      : kind === 'INCOME'
        ? 'Post income'
        : 'Post expense';

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      if (editing) {
        await api.expenses.updateEntry(editing.id, {
          title: title.trim(),
          person: person.trim(),
          amount: rupeesToPaise(amount),
          mode,
          date,
          accountId: effectiveAccount,
          categoryId: settings.categoriesOn ? categoryId || null : null,
          note: note.trim(),
        });
        onSaved(`${editing.voucherNo} updated`);
      } else {
        const created = await api.expenses.createEntry({
          kind,
          title: title.trim(),
          person: person.trim() || undefined,
          amount: rupeesToPaise(amount),
          mode,
          date,
          accountId: effectiveAccount,
          categoryId: settings.categoriesOn ? categoryId || undefined : undefined,
          note: note.trim() || undefined,
        });
        onSaved(
          created.status === 'PENDING'
            ? `${created.voucherNo} sent for approval`
            : `${created.voucherNo} posted`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, width: '94%' }}>
        <div className="mh">
          <div>
            <b>{editing ? `Edit ${editing.voucherNo}` : kind === 'INCOME' ? 'Record income' : 'Record expense'}</b>
            <span>{kind === 'INCOME' ? 'Money received into a book' : 'Money paid out of a book'}</span>
          </div>
          <button className="x" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="mb" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="fld">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diesel for Route 3" />
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>Amount (₹)</label>
              <input type="number" min={0} value={rupees} onChange={(e) => setRupees(e.target.value)} placeholder="0" />
            </div>
            <div className="fld">
              <label>{kind === 'INCOME' ? 'Received from' : 'Paid to'}</label>
              <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Name" />
            </div>
          </div>
          <div className="frow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="fld">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="fld">
              <label>Paid by</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as ExpenseMode)}>
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="frow" style={{ gridTemplateColumns: settings.categoriesOn ? '1fr 1fr' : '1fr' }}>
            <div className="fld">
              <label>Book</label>
              <select value={effectiveAccount} onChange={(e) => setAccountId(e.target.value)}>
                {acctList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            {settings.categoriesOn && (
              <div className="fld">
                <label>Category</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Uncategorised</option>
                  {catList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="fld">
            <label>Note / description (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bill 4471 · 62 litres" />
          </div>
          {needsAppr && (
            <div className="appr-note">
              Above the {formatMoney(settings.approvalLimit)} sign-off limit — this will wait for approval before it
              posts.
            </div>
          )}
          {err && <div className="state err">{err}</div>}
        </div>
        <div className="mf">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn grn" disabled={!valid || saving} onClick={save}>
            {saving ? 'Saving…' : cta}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================== Approvals ============================== */

function Approvals({ onDone }: { onDone: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  const pending = useAsync(() => api.expenses.entries({ status: 'PENDING', kind: 'EXPENSE' }), []);
  const rows = pending.data ?? [];
  const total = rows.reduce((s, e) => s + e.amount, 0);

  const act = async (e: LedgerEntry, approve: boolean) => {
    if (approve) await api.expenses.approveEntry(e.id);
    else await api.expenses.rejectEntry(e.id);
    toast(approve ? `${e.voucherNo} approved` : `${e.voucherNo} rejected`);
    pending.reload();
    onDone();
  };

  const approveAll = async () => {
    for (const e of rows) await api.expenses.approveEntry(e.id);
    toast(`${rows.length} approved`);
    pending.reload();
    onDone();
  };

  return (
    <>
      <div className="appr-summary">
        <div>
          <div className="appr-sum-label">Awaiting your approval</div>
          <div className="appr-sum-val mono">{formatMoney(total)}</div>
          <div className="appr-sum-note">{rows.length} expense{rows.length === 1 ? '' : 's'} over the sign-off limit</div>
        </div>
        {rows.length > 0 && (
          <button className="btn grn" onClick={approveAll}>
            Approve all
          </button>
        )}
      </div>
      <div className="appr-list">
        {rows.map((e) => (
          <div key={e.id} className="appr-item">
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>{e.title}</b>
              <div className="submeta">
                {e.person || '—'} · {e.categoryLabel ?? 'Uncategorised'} · {dmy(e.date)} · {e.accountLabel} · {e.voucherNo}
              </div>
            </div>
            <div className="mono neg" style={{ fontWeight: 700, fontSize: 15 }}>−{formatMoney(e.amount)}</div>
            <div className="rowacts">
              <button className="btn sm grn" onClick={() => void act(e, true)}>
                Approve
              </button>
              <button className="btn sm" onClick={() => void act(e, false)}>
                Reject
              </button>
            </div>
          </div>
        ))}
        {!pending.loading && rows.length === 0 && <div className="state">Nothing awaiting approval — all clear.</div>}
      </div>
    </>
  );
}

/* ============================== Statement ============================== */

function Statement() {
  const { api } = useApi();
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const accounts = useAsync(() => api.expenses.accounts.list(), []);
  const stmt = useAsync(
    () => api.expenses.statement({ accountId: accountId || undefined, from: from || undefined, to: to || undefined }),
    [accountId, from, to],
  );
  const data = stmt.data;

  return (
    <>
      <div className="tbar">
        <select className="minisel" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">All books</option>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <input className="minidate" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <input className="minidate" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        <div className="sp" />
        <button className="btn" onClick={() => window.print()}>
          <Icon name="save" size={14} />
          Print
        </button>
      </div>
      <div className="stmt-note">Awaiting-approval money is excluded — only posted entries appear.</div>
      <div className="card-t">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher</th>
              <th>Particulars</th>
              <th className="num">Credit</th>
              <th className="num">Debit</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="stmt-open">
              <td colSpan={5}>
                <b>Opening balance</b>
              </td>
              <td className="num mono">{formatMoney(data?.opening ?? 0)}</td>
            </tr>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>{dmy(r.date)}</td>
                <td className="mono" style={{ fontSize: '12.5px' }}>{r.voucherNo}</td>
                <td>
                  <b style={{ fontWeight: 600 }}>{r.title}</b>
                  {r.person ? <span className="submeta"> · {r.person}</span> : null}
                </td>
                <td className="num mono pos">{r.credit ? formatMoney(r.credit) : '—'}</td>
                <td className="num mono neg">{r.debit ? formatMoney(r.debit) : '—'}</td>
                <td className="num mono">{formatMoney(r.balance)}</td>
              </tr>
            ))}
            <tr className="stmt-close">
              <td colSpan={5}>
                <b>Closing balance</b>
              </td>
              <td className="num mono">{formatMoney(data?.closing ?? 0)}</td>
            </tr>
          </tbody>
        </table>
        {stmt.loading && <div className="state">Loading statement…</div>}
      </div>
    </>
  );
}

/* ============================== Reports ============================== */

function Reports({ settings }: { settings: ExpenseSettings }) {
  const { api } = useApi();
  const report = useAsync(() => api.expenses.report(), []);
  const r = report.data;
  if (!r) return <div className="state">Loading reports…</div>;

  const catMax = Math.max(1, ...r.byCategory.filter((c) => c.kind === 'EXPENSE').map((c) => c.amount));
  const monthMax = Math.max(1, ...r.byMonth.map((m) => Math.max(m.income, m.expense)));

  return (
    <>
      <div className="kpi-strip">
        <div className="kpi">
          <span>Spent this year</span>
          <b className="mono neg">{formatMoney(r.spent)}</b>
        </div>
        <div className="kpi">
          <span>Income booked</span>
          <b className="mono pos">{formatMoney(r.income)}</b>
        </div>
        <div className="kpi">
          <span>Net position</span>
          <b className={`mono ${r.net >= 0 ? 'pos' : 'neg'}`}>{formatMoney(r.net)}</b>
        </div>
        {settings.approvalsOn && (
          <div className="kpi">
            <span>Awaiting approval</span>
            <b className="mono amb">{formatMoney(r.awaiting)}</b>
          </div>
        )}
        {settings.categoriesOn && (
          <div className="kpi">
            <span>Over budget</span>
            <b className="mono">{r.overBudget}</b>
          </div>
        )}
      </div>

      <div className="rep-grid">
        <div className="rep-card">
          <h4 className="section">{settings.categoriesOn ? 'Where the money went' : 'Who it went to'}</h4>
          {settings.categoriesOn
            ? r.byCategory
                .filter((c) => c.kind === 'EXPENSE')
                .sort((a, b) => b.amount - a.amount)
                .map((c) => (
                  <div key={c.label} className="rep-row">
                    <span className="rep-dot" style={{ background: c.color }} />
                    <span className="rep-label">{c.label}</span>
                    <span className="rep-bar">
                      <span style={{ width: `${(c.amount / catMax) * 100}%`, background: c.color }} />
                    </span>
                    <span className="rep-amt mono">{formatMoney(c.amount)}</span>
                  </div>
                ))
            : r.byPayee.map((p) => (
                <div key={p.name} className="rep-row">
                  <span className="rep-dot" style={{ background: '#2450e0' }} />
                  <span className="rep-label">{p.name}</span>
                  <span className="rep-bar">
                    <span style={{ width: `${(p.amount / Math.max(1, r.byPayee[0]?.amount ?? 1)) * 100}%`, background: '#2450e0' }} />
                  </span>
                  <span className="rep-amt mono">{formatMoney(p.amount)}</span>
                </div>
              ))}
          {settings.categoriesOn && r.byCategory.filter((c) => c.kind === 'EXPENSE' && c.amount > 0).length === 0 && (
            <div className="state">No expenses booked yet.</div>
          )}
        </div>

        <div className="rep-card">
          <h4 className="section">Month by month</h4>
          {r.byMonth.map((m) => (
            <div key={m.month} className="rep-month">
              <div className="rep-month-h">
                <b>{m.month}</b>
                <span className={`mono ${m.income - m.expense >= 0 ? 'pos' : 'neg'}`}>
                  {formatMoney(m.income - m.expense)}
                </span>
              </div>
              <div className="rep-mbar">
                <span className="pos-bar" style={{ width: `${(m.income / monthMax) * 100}%` }} />
              </div>
              <div className="rep-mbar">
                <span className="neg-bar" style={{ width: `${(m.expense / monthMax) * 100}%` }} />
              </div>
            </div>
          ))}
          {r.byMonth.length === 0 && <div className="state">No activity yet.</div>}
        </div>
      </div>
    </>
  );
}

/* ============================== Categories ============================== */

function Categories() {
  const { api } = useApi();
  const toast = useToast();
  const cats = useAsync(() => api.expenses.categories.list(), []);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<LedgerKind>('EXPENSE');
  const [budget, setBudget] = useState('');

  const add = async () => {
    if (!label.trim()) return;
    await api.expenses.categories.create({
      label: label.trim(),
      kind,
      budget: kind === 'EXPENSE' ? rupeesToPaise(Number(budget) || 0) : 0,
    });
    setLabel('');
    setBudget('');
    toast('Category added');
    cats.reload();
  };
  const del = async (c: ExpenseCategory) => {
    await api.expenses.categories.remove(c.id);
    toast(`${c.label} removed`);
    cats.reload();
  };

  const list = cats.data ?? [];
  return (
    <div className="card-t">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Kind</th>
            <th className="num">Budget</th>
            <th>Used</th>
            <th className="num">Remaining</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const pct = c.budget > 0 ? Math.min(100, (c.used / c.budget) * 100) : 0;
            const barColor = pct >= 90 ? '#c2410c' : pct >= 60 ? '#e8792b' : '#2450e0';
            const remaining = c.budget - c.used;
            return (
              <tr key={c.id}>
                <td>
                  <b style={{ fontWeight: 600 }}>{c.label}</b>
                </td>
                <td>
                  <span className={`tag ${c.kind === 'INCOME' ? 'paid' : 'old'}`}>
                    {c.kind === 'INCOME' ? 'Income' : 'Expense'}
                  </span>
                </td>
                <td className="num mono">{c.budget > 0 ? formatMoney(c.budget) : '—'}</td>
                <td>
                  {c.budget > 0 ? (
                    <div className="cat-prog">
                      <span style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  ) : (
                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{formatMoney(c.used)}</span>
                  )}
                </td>
                <td className={`num mono ${remaining < 0 ? 'neg' : ''}`}>{c.budget > 0 ? formatMoney(remaining) : '—'}</td>
                <td className="num">
                  <button className="btn sm" onClick={() => void del(c)} title="Delete">
                    <Icon name="trash" size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
          <tr className="addrow">
            <td>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New category" />
            </td>
            <td>
              <select value={kind} onChange={(e) => setKind(e.target.value as LedgerKind)}>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </select>
            </td>
            <td className="num">
              <input
                type="number"
                min={0}
                value={budget}
                disabled={kind === 'INCOME'}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="₹ / year"
              />
            </td>
            <td colSpan={2} />
            <td className="num">
              <button className="btn grn sm" onClick={add} disabled={!label.trim()}>
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ============================== Vendors ============================== */

function Vendors() {
  const { api } = useApi();
  const toast = useToast();
  const vendors = useAsync(() => api.expenses.vendors.list(), []);
  const [name, setName] = useState('');
  const [supplies, setSupplies] = useState('');
  const [phone, setPhone] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await api.expenses.vendors.create({ name: name.trim(), supplies: supplies.trim(), phone: phone.trim() });
    setName('');
    setSupplies('');
    setPhone('');
    toast('Vendor added');
    vendors.reload();
  };
  const del = async (v: Vendor) => {
    await api.expenses.vendors.remove(v.id);
    toast(`${v.name} removed`);
    vendors.reload();
  };

  const initials = (n: string) =>
    n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="card-t">
      <table>
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Supplies</th>
            <th>Phone</th>
            <th className="num">Bills</th>
            <th className="num">Paid</th>
            <th className="num">Due</th>
            <th className="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(vendors.data ?? []).map((v) => (
            <tr key={v.id}>
              <td>
                <div className="stu-cell">
                  <span className="av">{initials(v.name)}</span>
                  <b style={{ fontWeight: 600 }}>{v.name}</b>
                </div>
              </td>
              <td style={{ color: 'var(--ink-2)' }}>{v.supplies || '—'}</td>
              <td className="mono" style={{ fontSize: 12.5 }}>{v.phone || '—'}</td>
              <td className="num mono">{v.bills}</td>
              <td className="num mono">{formatMoney(v.paid)}</td>
              <td className={`num mono ${v.due > 0 ? 'amb' : ''}`}>{v.due ? formatMoney(v.due) : '—'}</td>
              <td className="num">
                <button className="btn sm" onClick={() => void del(v)} title="Delete">
                  <Icon name="trash" size={13} />
                </button>
              </td>
            </tr>
          ))}
          <tr className="addrow">
            <td>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" />
            </td>
            <td>
              <input value={supplies} onChange={(e) => setSupplies(e.target.value)} placeholder="What they supply" />
            </td>
            <td>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
            </td>
            <td colSpan={3} />
            <td className="num">
              <button className="btn grn sm" onClick={add} disabled={!name.trim()}>
                Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
