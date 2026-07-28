import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Blocks in-app navigation (and warns on tab close/refresh) while a page has
 * unsaved edits. Drop `<UnsavedGuard dirty={dirty} onSave={save} />` into any
 * page with a draft + Save button.
 */
export function UnsavedGuard({
  dirty,
  onSave,
}: {
  dirty: boolean;
  /** If provided, the dialog offers "Save & leave". */
  onSave?: () => Promise<void> | void;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  const [saving, setSaving] = useState(false);

  // Native guard for full page unload (refresh / close tab / external link).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (blocker.state !== 'blocked') return null;

  const saveAndLeave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave();
      blocker.proceed();
    } catch {
      setSaving(false); // keep the user here if the save failed
    }
  };

  return (
    <div className="scrim" onClick={() => blocker.reset()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="mh">
          <div>
            <b>Unsaved changes</b>
            <span>Your changes on this page haven’t been saved.</span>
          </div>
        </div>
        <div className="mb">
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>
            Do you want to save your changes before leaving?
          </p>
        </div>
        <div className="mf">
          <button className="btn" disabled={saving} onClick={() => blocker.reset()}>
            Stay
          </button>
          <button className="btn" disabled={saving} onClick={() => blocker.proceed()}>
            Discard &amp; leave
          </button>
          {onSave && (
            <button className="btn grn" disabled={saving} onClick={saveAndLeave}>
              {saving ? 'Saving…' : 'Save & leave'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
