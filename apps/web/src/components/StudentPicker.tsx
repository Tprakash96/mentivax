import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '@mentivax/core';
import type { Student } from '@mentivax/api-client';

/**
 * Searchable student selector: type a name (or parent / class) and pick from the
 * filtered list — with keyboard navigation (↓ ↑ to move, Enter to select, Esc to
 * close). `value` is the selected student id; `onChange('')` clears it.
 */
export function StudentPicker({
  students,
  value,
  onChange,
  placeholder = 'Type a student name…',
}: {
  students: Student[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const selected = students.find((s) => s.id === value) ?? null;
  const [query, setQuery] = useState(selected ? selected.name : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();
  const activeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Anchor rect for the portal dropdown (so a scrolling modal can't clip it).
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Track the input position while the menu is open (reposition on scroll/resize).
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = q
      ? students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.parentName ?? '').toLowerCase().includes(q) ||
            s.className.toLowerCase().includes(q),
        )
      : students;
    return arr.slice(0, 8);
  }, [students, query]);

  // Reset the highlight to the top whenever the filtered list changes.
  useEffect(() => setActive(0), [query]);
  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (s: Student) => {
    onChange(s.id);
    setQuery(s.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && matches[active]) {
        e.preventDefault();
        pick(matches[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const menuStyle: React.CSSProperties = rect
    ? { position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 1000 }
    : {};

  return (
    <div className="picker">
      <input
        ref={inputRef}
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          if (value && v !== selected?.name) onChange(''); // typing invalidates the pick
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {open &&
        rect &&
        matches.length > 0 &&
        createPortal(
          <div className="picker-menu" style={menuStyle} onMouseDown={(e) => e.preventDefault()}>
            {matches.map((s, i) => (
              <button
                key={s.id}
                ref={i === active ? activeRef : undefined}
                type="button"
                className={`picker-opt${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
              >
                <span className="picker-name">{s.name}</span>
                <span className="picker-meta">
                  {s.className} · {formatMoney(s.pending)} due
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      {open &&
        rect &&
        query.trim() &&
        matches.length === 0 &&
        createPortal(
          <div className="picker-menu" style={menuStyle}>
            <div className="picker-empty">No students match “{query.trim()}”.</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
