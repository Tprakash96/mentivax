import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient, type MentivaxClient, type Organization } from '@mentivax/api-client';

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000') + '/api';
const ORG_KEY = 'mentivax.orgId';

interface ApiContextValue {
  api: MentivaxClient;
  orgs: Organization[];
  currentOrg: Organization | null;
  setOrg: (id: string) => void;
  loading: boolean;
  /** Effective enabled module keys for the current org. */
  modules: string[];
  hasModule: (key: string) => boolean;
  reloadModules: () => void;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const orgIdRef = useRef<string | null>(localStorage.getItem(ORG_KEY));
  const [orgId, setOrgId] = useState<string | null>(orgIdRef.current);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<string[]>([]);
  const [moduleNonce, setModuleNonce] = useState(0);

  // A single client; org id is read live from the ref so the header stays current.
  const api = useMemo(
    () => createClient({ baseUrl: BASE_URL, getOrgId: () => orgIdRef.current }),
    [],
  );

  const setOrg = useCallback((id: string) => {
    orgIdRef.current = id;
    localStorage.setItem(ORG_KEY, id);
    setOrgId(id);
  }, []);

  const reloadModules = useCallback(() => setModuleNonce((n) => n + 1), []);

  // Load which organizations this user can access.
  useEffect(() => {
    let active = true;
    api.organizations
      .listMine()
      .then((list) => {
        if (!active) return;
        setOrgs(list);
        if (!orgIdRef.current && list[0]) setOrg(list[0].id);
      })
      .catch(() => void 0)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, setOrg]);

  // Load the active org's enabled modules (re-runs when org changes or after
  // plugging a module in/out).
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    api.modules
      .enabled()
      .then((r) => active && setModules(r.modules))
      .catch(() => active && setModules([]));
    return () => {
      active = false;
    };
  }, [api, orgId, moduleNonce]);

  const currentOrg = orgs.find((o) => o.id === orgId) ?? orgs[0] ?? null;
  const hasModule = useCallback((key: string) => modules.includes(key), [modules]);

  return (
    <ApiContext.Provider
      value={{ api, orgs, currentOrg, setOrg, loading, modules, hasModule, reloadModules }}
    >
      {children}
    </ApiContext.Provider>
  );
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within ApiProvider');
  return ctx;
}
