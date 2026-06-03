import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Session } from '@supabase/supabase-js';

import { createClient } from '@/utils/supabase/client';
import { UserMembership, PropertyInfo } from '@/types/membership';
import { clearToken } from '@/services/cassandra/cassandraAuthService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended user type that includes common metadata fields. */
export type AuthUser = User & {
  name?: string;
  avatar?: string;
  full_name?: string;
};

export interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  membership: UserMembership | null;
  isMembershipLoading: boolean;
  // Auth actions
  signIn: (email: string, password: string) => Promise<{ data: { user: AuthUser | null; session: Session | null }; error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ user: AuthUser | null; session: Session | null; error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  // Cache helpers
  refreshMembership: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enrichUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const meta = u.user_metadata as Record<string, string> | undefined;
  return {
    ...u,
    name: meta?.full_name ?? meta?.name ?? undefined,
    avatar: meta?.avatar_url ?? undefined,
    full_name: meta?.full_name ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Membership cache (AsyncStorage-backed, 5-minute TTL)
// ---------------------------------------------------------------------------

const MEMBERSHIP_CACHE_PREFIX = '@autopilot_membership:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — mobile apps should cache aggressively

async function loadCachedMembership(
  userId: string
): Promise<UserMembership | null> {
  try {
    const raw = await AsyncStorage.getItem(`${MEMBERSHIP_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw) as {
      data: UserMembership;
      timestamp: number;
    };
    if (Date.now() - timestamp < CACHE_TTL_MS) return data;
  } catch {
    // Corrupt cache entry — treat as miss
  }
  return null;
}

async function persistMembershipCache(
  userId: string,
  data: UserMembership
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${MEMBERSHIP_CACHE_PREFIX}${userId}`,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // Storage error — non-fatal
  }
}

async function clearMembershipCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${MEMBERSHIP_CACHE_PREFIX}${userId}`);
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [membership, setMembership] = useState<UserMembership | null>(null);
  const [isMembershipLoading, setIsMembershipLoading] = useState(false);

  // Prevents duplicate parallel membership fetches within the same render pass
  const fetchingRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);

  // ---------------------------------------------------------------------------
  // fetchMembership — queries org + property memberships, caches result
  // ---------------------------------------------------------------------------
  const fetchMembership = useCallback(
    async (userId: string) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      // Fast path: return cached data without a loading state flash
      const cached = await loadCachedMembership(userId);
      if (cached) {
        setMembership(cached);
        // Even with cache hit, we still fetch in background to refresh,
        // but we don't block the UI.
      }

      setIsMembershipLoading(true);

      try {
        // Fetch organisation membership
        const { data: orgData } = await supabase
          .from('organization_memberships')
          .select(
            `
            role,
            organization:organizations (
              id,
              name
            )
          `
          )
          .eq('user_id', userId)
          .or('is_active.eq.true,is_active.is.null')
          .limit(1)
          .maybeSingle();

        // Fetch all property memberships for this user
        const { data: propData } = await supabase
          .from('property_memberships')
          .select(
            `
            role,
            property:properties (
              id,
              name,
              code,
              image_url
            )
          `
          )
          .eq('user_id', userId)
          .or('is_active.eq.true,is_active.is.null');

        let builtProperties: PropertyInfo[] = (propData ?? [])
          .map((p: any) => {
            const prop = p.property as any;
            if (!prop?.id) return null;
            return {
              id: prop.id as string,
              name: (prop.name as string) ?? '',
              code: (prop.code as string) ?? '',
              role: (p.role as string) ?? 'tenant',
              image_url: (prop.image_url as string) ?? '',
            };
          })
          .filter((p: PropertyInfo | null): p is PropertyInfo => p !== null);

        // Auto-inject all org properties if the user is an org admin
        const fetchedOrgId = ((orgData as any)?.organization)?.id;
        const fetchedOrgRole = (orgData as any)?.role;
        const ORG_ADMIN_ROLES = ['org_super_admin', 'org_admin', 'owner'];
        
        if (fetchedOrgId && fetchedOrgRole && ORG_ADMIN_ROLES.includes(fetchedOrgRole)) {
          const { data: orgPropsData } = await supabase
            .from('properties')
            .select('id, name, code, image_url')
            .eq('organization_id', fetchedOrgId);
            
          if (orgPropsData) {
            const existingIds = new Set(builtProperties.map(p => p.id));
            const additionalProps = orgPropsData
              .filter(p => !existingIds.has(p.id))
              .map(p => ({
                id: p.id,
                name: p.name || '',
                code: p.code || '',
                role: fetchedOrgRole, // Inherit org role
                image_url: p.image_url || null,
              }));
              
            builtProperties = [...builtProperties, ...additionalProps];
          }
        }

        console.log('[AuthContext] property memberships raw:', JSON.stringify(propData));
        console.log('[AuthContext] builtProperties:', JSON.stringify(builtProperties));

        // PERMANENT FIX: Derive org_id from properties if no org membership exists.
        // This handles property-only users who lack an organization_memberships row.
        let resolvedOrgId = ((orgData as any)?.organization)?.id ?? null;
        if (!resolvedOrgId && builtProperties.length > 0) {
          // Look up the organization_id from the first property's parent org
          const firstPropId = builtProperties[0].id;
          const { data: propOrgData } = await supabase
            .from('properties')
            .select('organization_id')
            .eq('id', firstPropId)
            .single();
          resolvedOrgId = (propOrgData as any)?.organization_id ?? null;
          console.log('[AuthContext] Derived org_id from property:', resolvedOrgId);
        }

        const membershipData: UserMembership = {
          org_id: resolvedOrgId,
          org_name: ((orgData as any)?.organization)?.name ?? null,
          org_role: (orgData as any)?.role ?? null,
          properties: builtProperties,
        };

        await persistMembershipCache(userId, membershipData);
        setMembership(membershipData);
      } catch (err) {
        console.error('[AuthContext] fetchMembership error:', err);
        // FALLBACK: if network fetch fails but we have stale cached data,
        // keep using it rather than leaving membership null.
        if (cached) {
          console.log('[AuthContext] Using stale cached membership as fallback');
          setMembership(cached);
        }
      } finally {
        fetchingRef.current = false;
        setIsMembershipLoading(false);
      }
    },
    [supabase]
  );

  // ---------------------------------------------------------------------------
  // refreshMembership — clears cache and re-fetches
  // ---------------------------------------------------------------------------
  const refreshMembership = useCallback(async () => {
    if (user?.id) {
      await clearMembershipCache(user.id);
      await fetchMembership(user.id);
    }
  }, [user?.id, fetchMembership]);

  // ---------------------------------------------------------------------------
  // Foreground re-validation — critical security fix for 24h cache gap
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && user?.id) {
        console.log('[AuthContext] App foregrounded — re-validating membership');
        // Re-fetch membership in background; if user was removed,
        // this will clear membership and trigger UI logout gates.
        fetchMembership(user.id);
      }
    });
    return () => subscription.remove();
  }, [user?.id, fetchMembership]);

  // ---------------------------------------------------------------------------
  // Auth state initialisation + onAuthStateChange subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    console.log('[AuthContext] useEffect firing — fetching session...');
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession }, error }) => {
        if (error) {
          console.error('[AuthContext] getSession error:', error.message);
          // If the token is invalid, we must sign out to clear the corrupted session from storage
          if (error.message.includes('refresh_token_not_found') || error.message.includes('Invalid Refresh Token')) {
             supabase.auth.signOut().catch(() => {});
             setSession(null);
             setUser(null);
          }
          setIsLoading(false);
          return;
        }

        console.log('[AuthContext] getSession result:', initialSession ? `user=${initialSession.user?.email}` : 'null session');
        setSession(initialSession);
        setUser(enrichUser(initialSession?.user ?? null));
        if (initialSession?.user) {
          fetchMembership(initialSession.user.id);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('[AuthContext] getSession exception:', err);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(enrichUser(nextSession?.user ?? null));

      if (event === 'SIGNED_IN' && nextSession?.user) {
        fetchMembership(nextSession.user.id);
      } else if (event === 'SIGNED_OUT') {
        setMembership(null);
        clearToken().catch(() => {});
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchMembership]);

  // ---------------------------------------------------------------------------
  // Auth actions
  // ---------------------------------------------------------------------------

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        return { data: { user: null, session: null }, error: error.message };
      }

      // State is also updated via onAuthStateChange, but we update immediately
      // so callers can rely on the returned session right away.
      const enrichedUser = enrichUser(data.session.user);
      setSession(data.session);
      setUser(enrichedUser);

      await fetchMembership(data.session.user.id);

      return { data: { user: enrichedUser, session: data.session }, error: null };
    },
    [supabase, fetchMembership]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        return { user: null, session: null, error: error.message };
      }

      if (data.session) {
        const enrichedUser = enrichUser(data.session.user);
        setSession(data.session);
        setUser(enrichedUser);

        // ─── Create users profile row (mirrors web app auth callback) ───
        // This must exist before onboarding tries to .update() it.
        await (supabase as any).from('users').upsert({
          id: data.session.user.id,
          email: email,
          full_name: fullName,
        }, { onConflict: 'id' });

        await fetchMembership(data.session.user.id);
      }

      return {
        user: enrichUser(data.user ?? null),
        session: data.session,
        error: null,
      };
    },
    [supabase, fetchMembership]
  );

  const signOut = useCallback(async () => {
    if (user?.id) {
      await clearMembershipCache(user.id);
    }
    setMembership(null);
    await supabase.auth.signOut();
  }, [supabase, user?.id]);

  const resetPassword = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw new Error(error.message);
    },
    [supabase]
  );

  // ---------------------------------------------------------------------------
  // Context value (memoised to prevent unnecessary re-renders)
  // ---------------------------------------------------------------------------
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isLoading,
      membership,
      isMembershipLoading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshMembership,
    }),
    [
      user,
      session,
      isLoading,
      membership,
      isMembershipLoading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshMembership,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
