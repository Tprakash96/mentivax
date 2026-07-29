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
import {
  createClient,
  type LoginResult,
  type MentivaxClient,
  type Organization,
  type Session,
  type SessionMembership,
} from '@mentivax/api-client';
import { ALL_PERMISSION_KEYS, CORE_MODULE_KEYS, effectivePermissions } from '@mentivax/core';

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000') + '/api';
const ORG_KEY = 'mentivax.orgId';
const ACCESS_KEY = 'mentivax.accessToken';
const REFRESH_KEY = 'mentivax.refreshToken';

interface ApiContextValue {
  api: MentivaxClient;

  // --- Identity ---
  /** Null until signed in. */
  session: Session | null;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  /** True while restoring a stored session on boot — render nothing until false. */
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads /auth/me, e.g. after your own role changes. */
  refreshSession: () => Promise<void>;

  // --- Tenancy ---
  orgs: Organization[];
  currentOrg: Organization | null;
  setOrg: (id: string) => void;
  loading: boolean;

  // --- Entitlements & authority ---
  modules: string[];
  hasModule: (key: string) => boolean;
  reloadModules: () => void;
  /** Permission keys held in the current org, already module-filtered. */
  permissions: string[];
  /** The single "may I?" check used by nav filtering and route guards. */
  can: (permission: string) => boolean;
  /** The caller's role in the active org (null for platform admins). */
  roleName: string | null;
}

const ApiContext = createContext<ApiContextValue | null>(null);

const readToken = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function ApiProvider({ children }: { children: ReactNode }) {
  // Tokens live in refs so the client (created once) always reads current
  // values without being rebuilt on every refresh.
  const accessRef = useRef<string | null>(readToken(ACCESS_KEY));
  const refreshRef = useRef<string | null>(readToken(REFRESH_KEY));
  const orgIdRef = useRef<string | null>(readToken(ORG_KEY));

  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(orgIdRef.current);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<string[]>([]);
  const [moduleNonce, setModuleNonce] = useState(0);

  const storeTokens = useCallback((t: { accessToken: string; refreshToken: string } | null) => {
    accessRef.current = t?.accessToken ?? null;
    refreshRef.current = t?.refreshToken ?? null;
    try {
      if (t) {
        localStorage.setItem(ACCESS_KEY, t.accessToken);
        localStorage.setItem(REFRESH_KEY, t.refreshToken);
      } else {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
      }
    } catch {
      /* private browsing — the session simply won't survive a reload */
    }
  }, []);

  const clearSession = useCallback(() => {
    storeTokens(null);
    setSession(null);
    setOrgs([]);
    setModules([]);
  }, [storeTokens]);

  const api = useMemo(
    () =>
      createClient({
        baseUrl: BASE_URL,
        getToken: () => accessRef.current,
        getRefreshToken: () => refreshRef.current,
        getOrgId: () => orgIdRef.current,
        // The client refreshes expired access tokens transparently; persist the
        // rotated pair so a reload doesn't fall back to a dead token.
        onTokens: (t: LoginResult) => storeTokens(t),
        // The refresh token itself was rejected — the session is over.
        onAuthFailure: () => clearSession(),
      }),
    [storeTokens, clearSession],
  );

  const setOrg = useCallback((id: string) => {
    orgIdRef.current = id;
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {
      /* ignore */
    }
    setOrgId(id);
  }, []);

  const reloadModules = useCallback(() => setModuleNonce((n) => n + 1), []);

  // --- Boot: restore a stored session -------------------------------------
  useEffect(() => {
    let active = true;
    if (!accessRef.current) {
      setBooting(false);
      setLoading(false);
      return;
    }
    api.auth
      .me()
      .then((s) => active && setSession(s))
      .catch(() => active && clearSession())
      .finally(() => {
        if (!active) return;
        setBooting(false);
      });
    return () => {
      active = false;
    };
  }, [api, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.auth.login(email, password);
      storeTokens(result);
      setSession({ user: result.user, memberships: result.memberships });
      // Prefer the org they were last in; otherwise their first school.
      const stored = orgIdRef.current;
      const valid = result.memberships.some((m) => m.organizationId === stored);
      const first = result.memberships[0]?.organizationId;
      if (!valid && first) setOrg(first);
      else if (stored) setOrgId(stored);
    },
    [api, setOrg, storeTokens],
  );

  const logout = useCallback(async () => {
    const token = refreshRef.current;
    // Best-effort server-side revocation; the local session ends either way.
    try {
      if (token) await api.auth.logout(token);
    } catch {
      /* ignore */
    }
    clearSession();
  }, [api, clearSession]);

  const refreshSession = useCallback(async () => {
    try {
      setSession(await api.auth.me());
    } catch {
      clearSession();
    }
  }, [api, clearSession]);

  // --- Which organizations this user can enter ----------------------------
  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    api.organizations
      .listMine()
      .then((list) => {
        if (!active) return;
        setOrgs(list);
        // Self-heal: adopt the first org if the stored id is gone (reseeded DB,
        // or access revoked). Clearing it stops us sending an invalid header.
        const stored = orgIdRef.current;
        const storedIsValid = stored ? list.some((o) => o.id === stored) : false;
        if (!storedIsValid) {
          if (list[0]) {
            setOrg(list[0].id);
          } else {
            orgIdRef.current = null;
            try {
              localStorage.removeItem(ORG_KEY);
            } catch {
              /* ignore */
            }
            setOrgId(null);
          }
        }
      })
      .catch(() => void 0)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, session, setOrg]);

  // --- The active org's enabled modules -----------------------------------
  useEffect(() => {
    if (!session || !orgId) return;
    let active = true;
    api.modules
      .enabled()
      .then((r) => active && setModules(r.modules))
      .catch(() => active && setModules([]));
    return () => {
      active = false;
    };
  }, [api, session, orgId, moduleNonce]);

  const currentOrg = orgs.find((o) => o.id === orgId) ?? orgs[0] ?? null;

  const membership: SessionMembership | null =
    session?.memberships.find((m) => m.organizationId === currentOrg?.id) ?? null;

  const isPlatformAdmin = session?.user.isPlatformAdmin ?? false;

  // A platform admin dropping into a tenant holds no membership there, so the
  // server grants them the full catalog; mirror that here for the UI.
  const permissions = useMemo(
    () =>
      isPlatformAdmin && !membership
        ? effectivePermissions(ALL_PERMISSION_KEYS, modules)
        : (membership?.permissions ?? []),
    [isPlatformAdmin, membership, modules],
  );

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const can = useCallback((permission: string) => permissionSet.has(permission), [permissionSet]);

  // Core modules are always available, so nav never vanishes if /modules is
  // slow or the API is briefly unreachable.
  const hasModule = useCallback(
    (key: string) => CORE_MODULE_KEYS.includes(key) || modules.includes(key),
    [modules],
  );

  return (
    <ApiContext.Provider
      value={{
        api,
        session,
        isAuthenticated: session !== null,
        isPlatformAdmin,
        booting,
        login,
        logout,
        refreshSession,
        orgs,
        currentOrg,
        setOrg,
        loading,
        modules,
        hasModule,
        reloadModules,
        permissions,
        can,
        roleName: membership?.roleName ?? (isPlatformAdmin ? 'Platform admin' : null),
      }}
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
