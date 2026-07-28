import { useEffect, useMemo, useState } from 'react';

/** Client-side pagination over an in-memory list. Resets when the list shrinks. */
export function usePager<T>(items: T[], initialSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [pages, page]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, pageSize, setPageSize, total, pages, pageItems };
}

const SIZES = [10, 25, 50, 100];

export function Pagination({
  page,
  pages,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="pager">
      <label className="pager-rpp">
        Rows per page
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <span className="pager-range">
        {start}–{end} of {total}
      </span>
      <div className="pager-btns">
        <button disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">
          «
        </button>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          ›
        </button>
        <button disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Last page">
          »
        </button>
      </div>
    </div>
  );
}
