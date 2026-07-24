import { useState } from 'react';
import { formatMoney, MODULE_MAP } from '@mentivax/core';
import type { ModuleView } from '@mentivax/api-client';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { useApi } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const CATEGORY_LABEL: Record<string, string> = {
  core: 'Core',
  finance: 'Finance',
  academics: 'Academics',
  communication: 'Communication',
  analytics: 'Analytics',
  operations: 'Operations',
};

export function MarketplacePage() {
  const { api, reloadModules } = useApi();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.modules.catalog(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (m: ModuleView, enable: boolean) => {
    setBusy(m.key);
    try {
      if (enable) await api.modules.enable(m.key);
      else await api.modules.disable(m.key);
      toast(`${m.name} ${enable ? 'enabled' : 'disabled'}`);
      reload();
      reloadModules();
    } catch (e) {
      // Surface dependency errors from the API in a friendly way.
      const msg = e instanceof Error ? e.message : 'Action failed';
      toast(msg);
    } finally {
      setBusy(null);
    }
  };

  const modules = data ?? [];

  return (
    <>
      <div className="autointro">
        <div>
          <h3>Build the platform your school needs</h3>
          <p>
            Mentivax is modular — turn features on only when you need them. Core modules are always
            included; everything else is a plug-in you can enable or disable any time.
          </p>
        </div>
        <div className="stat">
          <b>{modules.filter((m) => m.enabled).length}</b>
          <span>modules active</span>
        </div>
      </div>

      {loading && <div className="state">Loading modules…</div>}
      {error && <div className="state err">{error}</div>}

      <div className="mkt-grid">
        {modules.map((m) => {
          const blocked = m.missingDependencies.length > 0;
          const isBusy = busy === m.key;
          return (
            <div key={m.key} className={`mkt-card${m.enabled ? ' on' : ''}`}>
              <div className="mkt-head">
                <span className="mkt-ic">
                  <Icon name={m.icon} size={18} />
                </span>
                <div className="mkt-title">
                  <b>{m.name}</b>
                  <span>{CATEGORY_LABEL[m.category] ?? m.category}</span>
                </div>
                {m.core ? (
                  <span className="tag paid">
                    <i />
                    Core
                  </span>
                ) : m.status === 'TRIAL' ? (
                  <span className="tag part">
                    <i />
                    Trial
                  </span>
                ) : m.enabled ? (
                  <span className="tag paid">
                    <i />
                    Active
                  </span>
                ) : null}
              </div>

              <p className="mkt-desc">{m.description}</p>

              {m.dependsOn.length > 0 && (
                <div className="mkt-deps">
                  Requires: {m.dependsOn.map((d) => MODULE_MAP[d]?.name ?? d).join(', ')}
                </div>
              )}

              <div className="mkt-foot">
                <span className="mkt-price">
                  {m.core ? 'Included' : m.priceMonthly ? `${formatMoney(m.priceMonthly)}/mo` : 'Free'}
                </span>
                {m.core ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Always on
                  </span>
                ) : m.enabled ? (
                  <button className="btn sm" disabled={isBusy} onClick={() => act(m, false)}>
                    {isBusy ? '…' : 'Disable'}
                  </button>
                ) : (
                  <button
                    className="btn sm grn"
                    disabled={isBusy || blocked}
                    title={blocked ? `Enable ${m.missingDependencies.join(', ')} first` : undefined}
                    onClick={() => act(m, true)}
                  >
                    {isBusy ? '…' : blocked ? 'Locked' : 'Enable'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
