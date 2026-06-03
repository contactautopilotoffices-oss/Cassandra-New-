'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams, usePathname, useRouter, Slot } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context';
import {
  checkPropertyAccess,
  getRoleAllowedPaths,
  getRoleDefaultPath,
} from '@/utils/api/mobileApi';
import { CAPABILITY_MATRIX } from '@/constants/capabilities';
import { CapabilityDomain } from '@/types/rbac';
import {
  LayoutDashboard,
  Ticket,
  Users,
  UserCheck,
  DoorOpen,
  Fuel,
  Zap,
  Package,
  ArrowUpCircle,
  FileText,
  Settings,
  LogOut,
  ClipboardList,
  Wrench,
  Shield,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { TicketCreateModal } from '../../../components/tickets/TicketCreateModal';
import AnimatedLogo from '@/components/shared/AnimatedLogo';

import SafeBlurView from '@/components/ui/SafeBlurView';
import GlobalBottomNav from '@/components/shared/GlobalBottomNav';

// ---- Layout Constants ----
const SIDEBAR_WIDTH = 288;

// ---- Mobile-only roles (full-screen, no sidebar) ----
// DEPRECATED: All roles now use the unified sidebar layout with capability-based filtering.
const MOBILE_ROLES: string[] = [];

// ---- Roles that render their own full-screen dashboard with internal sidebar ----
// DEPRECATED: All roles now use the unified sidebar layout with capability-based filtering.
const FULL_DASHBOARD_ROLES: string[] = [];

// ---- Full-screen routes for full-dashboard roles (no sidebar) ----
const FULL_SCREEN_ROUTES = [
  'staff', 'soft_service_manager',
  'property_admin', 'lovable-admin', 'lovable-super-admin', 'settings', 'profile', 'tickets', 'dashboard', 'index', 'stock',
  'tenant', 'rooms', 'visitors', 'requests',
];

// ---- Property Context ----
export const PropertyContext = React.createContext<{
  propertyName: string;
  propertyRole: string | null;
  propertyCode?: string;
} | null>(null);

export function usePropertyContext() {
  const ctx = React.useContext(PropertyContext);
  if (!ctx) throw new Error('usePropertyContext must be used within PropertyLayout');
  return ctx;
}

// ---- Nav Item Types ----
type NavItem = {
  label: string;
  route: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  domain?: CapabilityDomain;
};

// ---- Navigation Structure (matches web sidebar) ----
// Each item maps to a capability domain so we can filter by role permissions.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',         route: 'dashboard',    icon: LayoutDashboard, domain: 'dashboards' },
  { label: 'Tickets',           route: 'tickets',      icon: Ticket,          domain: 'tickets' },
  { label: 'Flow Map',          route: 'flow-map',     icon: ArrowUpCircle,   domain: 'tickets' },
  { label: 'User Directory',    route: 'users',        icon: Users,           domain: 'users' },
  { label: 'Visitors',          route: 'visitors',     icon: UserCheck,       domain: 'visitors' },
  { label: 'Security',          route: 'security',     icon: Shield,          domain: 'security' },
  { label: 'Meeting Rooms',     route: 'rooms',        icon: DoorOpen,        domain: 'properties' },
  { label: 'Diesel Manager',    route: 'diesel',       icon: Fuel,            domain: 'assets' },
  { label: 'Electricity',       route: 'electricity',  icon: Zap,             domain: 'assets' },
  { label: 'Stock / Inventory', route: 'stock',        icon: Package,         domain: 'stock' },
  { label: 'SOPs & Checklists', route: 'checklist',    icon: ClipboardList,   domain: 'sop' },
  { label: 'PPM',               route: 'ppm',          icon: Wrench,          domain: 'reports' },
  { label: 'Reports',           route: 'reports',      icon: FileText,        domain: 'reports' },
  { label: 'Settings',          route: 'settings',     icon: Settings },
];

const NAV_SECTIONS: { label: string; routes: string[] }[] = [
  { label: 'OPERATIONS', routes: ['dashboard', 'tickets', 'flow-map', 'users', 'visitors', 'security', 'rooms'] },
  { label: 'UTILITIES',  routes: ['diesel', 'electricity', 'stock', 'checklist', 'ppm', 'reports'] },
];

// ---- Get User Initials ----
function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}

// ---- Sidebar ----
function getFilteredNavItems(role: string): NavItem[] {
  const capabilities = CAPABILITY_MATRIX[role as keyof typeof CAPABILITY_MATRIX] || {};
  return NAV_ITEMS.filter((item) => {
    if (!item.domain) return true;
    return capabilities[item.domain]?.includes('view');
  });
}

function Sidebar({
  currentRoute,
  onNewRequest,
  collapsed,
  onToggle,
  role,
  isMobile,
  onNavigate,
}: {
  currentRoute: string;
  onNewRequest: () => void;
  collapsed: boolean;
  onToggle: () => void;
  role: string;
  isMobile: boolean;
  onNavigate: () => void;
}) {
  const { user, signOut } = useAuth();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { theme } = useTheme();
  const router = useRouter();

  const handleNavigate = (route: string) => {
    if (route.startsWith('/')) {
      if (route === '/new-request') {
        onNewRequest();
      }
      return;
    }
    router.push(`/property/${propertyId}/${route}` as never);
    if (isMobile) {
      onNavigate();
    }
  };

  const isDark = theme === 'dark';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#1A2332';
  const textSecondary = isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)';
  const primary = '#708F96';

  const currentW = isMobile ? (collapsed ? 0 : SIDEBAR_WIDTH) : (collapsed ? 72 : SIDEBAR_WIDTH);
  const sidebarLeft = isMobile ? (collapsed ? -SIDEBAR_WIDTH : 0) : 0;

  const filteredItems = getFilteredNavItems(role);
  const operationsItems = filteredItems.filter((i) => NAV_SECTIONS[0].routes.includes(i.route));
  const utilitiesItems = filteredItems.filter((i) => NAV_SECTIONS[1].routes.includes(i.route));

  const renderNavItem = (item: NavItem) => {
    const isActive =
      currentRoute === item.route ||
      (item.route === 'dashboard' && (currentRoute === 'dashboard' || currentRoute === 'index'));
    const Icon = item.icon;

    if (collapsed) {
      return (
        <TouchableOpacity
          key={item.route}
          style={[styles.navItemCollapsed, isActive && styles.navItemCollapsedActive]}
          onPress={() => handleNavigate(item.route)}
          activeOpacity={0.7}
        >
          <View style={styles.navItemIconCentered}>
            <Icon
              size={18}
              color={isActive ? '#FFFFFF' : (isDark ? 'rgba(230,235,238,0.45)' : 'rgba(26,35,50,0.45)')}
              strokeWidth={1.5}
            />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={item.route}
        style={styles.navItem}
        onPress={() => handleNavigate(item.route)}
        activeOpacity={0.7}
      >
        <View style={styles.navItemInner}>
          <Icon
            size={18}
            color={isActive ? '#FFFFFF' : (isDark ? 'rgba(230,235,238,0.55)' : 'rgba(26,35,50,0.55)')}
            strokeWidth={1.5}
          />
          <Text
            style={[
              styles.navItemLabel,
              { color: isActive ? '#FFFFFF' : (isDark ? 'rgba(230,235,238,0.75)' : 'rgba(26,35,50,0.75)') },
            ]}
          >
            {item.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[styles.sidebar, {
        borderRightColor: borderColor,
        width: currentW,
        left: sidebarLeft,
        backgroundColor: '#0B0B0F',
      }]}
    >
      {/* Header: Logo + close/collapse */}
      <View style={styles.sidebarHeader}>
        {!collapsed ? <AnimatedLogo size="lg" /> : <AnimatedLogo size="md" />}
        <TouchableOpacity
          style={[styles.collapseBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]}
          onPress={onToggle}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isMobile ? 'close-outline' : (collapsed ? 'menu-outline' : 'chevron-back-outline')}
            size={isMobile ? 24 : (collapsed ? 20 : 16)}
            color="rgba(255,255,255,0.5)"
          />
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 4, paddingHorizontal: collapsed ? 10 : 12 }}
      >
        {/* OPERATIONS */}
        {operationsItems.length > 0 && !collapsed && (
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>OPERATIONS</Text>
        )}
        {operationsItems.map(renderNavItem)}

        {/* UTILITIES */}
        {utilitiesItems.length > 0 && !collapsed && (
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>UTILITIES</Text>
        )}
        {utilitiesItems.map(renderNavItem)}
      </ScrollView>

      {/* Bottom: Logout only */}
      <View style={[styles.sidebarBottom, { borderTopColor: 'rgba(255,255,255,0.06)' }]}>
        <TouchableOpacity
          style={styles.logoutRow}
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
          activeOpacity={0.7}
        >
          <LogOut size={16} color="#EF4444" strokeWidth={1.5} />
          {!collapsed && <Text style={styles.logoutText}>Logout</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---- UUID validation helper ----
function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

// ---- Property Layout ----
// Mirrors: saas_development/app/property/[propertyId]/layout.tsx
// Key changes for mobile:
// - Uses direct Supabase checkPropertyAccess() instead of external HTTP call
// - Role path guards via getRoleAllowedPaths / getRoleDefaultPath
// - Skips sidebar for tenant / super_tenant (mobile full-screen glassmorphism dashboard)
// NOTE: Admin sidebar layout renders children directly — nested Stack conflicts with file-based routing
export default function PropertyLayout() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const pathname = usePathname();
  const { user, isLoading: authLoading, membership } = useAuth();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;

  const [accessState, setAccessState] = useState<{
    authorized: boolean | null;
    role: string | null;
    checking: boolean;
  }>({ authorized: null, role: null, checking: true });

  const [ticketModalVisible, setTicketModalVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);

  // Auto-collapse/expand sidebar when screen size changes
  useEffect(() => {
    setSidebarCollapsed(isMobile);
  }, [isMobile]);

  // ---- Access check via web API (mirrors GET /api/auth/property-access) ----
  // CRITICAL: membership is in deps — without it, the layout renders blank when
  // membership loads AFTER the initial effect run (a classic React async race condition).
  useEffect(() => {
    console.log('[PropertyLayout] Effect running — authLoading:', authLoading, 'user:', user?.email, 'propertyId:', propertyId, 'membership:', membership ? 'exists' : 'null');
    const checkAccess = async () => {
      if (authLoading) {
        console.log('[PropertyLayout] Skipping — auth still loading');
        return;
      }
      if (!user) {
        console.log('[PropertyLayout] No user — redirecting to login');
        router.replace('/login');
        return;
      }

      if (!propertyId || (!isUuid(propertyId) && propertyId !== 'all')) {
        console.log('[PropertyLayout] Invalid propertyId:', propertyId);
        setAccessState({ authorized: false, role: null, checking: false });
        return;
      }

      console.log('[PropertyLayout] Calling checkPropertyAccess for:', propertyId);
      try {
        // Pass user from AuthContext so checkPropertyAccess doesn't need to re-hydrate
        // the session — the AuthContext client has it; the mobileApi singleton may not.
        const data = await checkPropertyAccess(propertyId, user);
        console.log('[PropertyLayout] checkPropertyAccess result:', JSON.stringify(data));

        if (!data.authorized) {
          // ---- DEFENSE-IN-DEPTH: checkPropertyAccess failed (may be RLS)
          // Try membership data as the fallback before declaring unauthorized.
          // This is the core fix for the blank-screen bug: when membership loaded
          // after the initial render, propMembership was null, role was "",
          // and isMobileRole was false → admin sidebar with blank Slot.
          console.log('[PropertyLayout] checkPropertyAccess unauthorized — checking membership fallback');
          const propMembership = membership?.properties?.find((p) => p.id === propertyId);
          const membershipRole = propMembership?.role ?? null;
          console.log('[PropertyLayout] Membership fallback — propMembership:', propMembership?.role ?? 'null', 'membershipRole:', membershipRole);

          if (propertyId === 'all') {
            const isPropAdminOrHigher = membership?.properties?.some(p => 
              ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager', 'spoc', 'administrator'].includes((p.role || '').toLowerCase()) || 
              ['org_super_admin', 'org_admin', 'owner'].includes((p.role || '').toLowerCase())
            );
            if (isPropAdminOrHigher) {
              console.log('[PropertyLayout] Authorized via "all" fallback');
              setAccessState({ authorized: true, role: 'property_admin', checking: false });
              return;
            }
          }

          if (membershipRole && MOBILE_ROLES.includes(membershipRole)) {
            console.log('[PropertyLayout] Authorized via membership fallback — role:', membershipRole);
            setAccessState({ authorized: true, role: membershipRole, checking: false });
            return;
          }
          if (membershipRole && !MOBILE_ROLES.includes(membershipRole)) {
            console.log('[PropertyLayout] Authorized via membership fallback (non-mobile) — role:', membershipRole);
            setAccessState({ authorized: true, role: membershipRole, checking: false });
            // Path guard for non-mobile roles
            const allowedPaths = getRoleAllowedPaths(membershipRole, propertyId);
            const isPathAllowed = allowedPaths.some(
              (allowed) => pathname.startsWith(allowed) || pathname === allowed
            );
            if (!isPathAllowed) {
              const defaultPath = getRoleDefaultPath(membershipRole, propertyId);
              console.log('[PropertyLayout] Path not allowed — redirecting to:', defaultPath);
              router.replace(defaultPath as never);
            }
            return;
          }

          console.log('[PropertyLayout] Membership fallback also denied — showing access denied');
          setAccessState({ authorized: false, role: null, checking: false });
          return;
        }

        const role = data.role ?? '';
        console.log('[PropertyLayout] Authorized, role:', role, 'isMobile:', MOBILE_ROLES.includes(role));
        setAccessState({ authorized: true, role, checking: false });

        // ---- Role path guards (exact match to web layout) ----
        if (!MOBILE_ROLES.includes(role)) {
          const allowedPaths = getRoleAllowedPaths(role, propertyId);
          const isPathAllowed = allowedPaths.some(
            (allowed) => pathname.startsWith(allowed) || pathname === allowed
          );

          if (!isPathAllowed) {
            const defaultPath = getRoleDefaultPath(role, propertyId);
            console.log('[PropertyLayout] Path not allowed — redirecting to:', defaultPath);
            router.replace(defaultPath as never);
          }
        }
      } catch (err) {
        console.error('[PropertyLayout] Access check failed:', err);
        setAccessState({ authorized: false, role: null, checking: false });
      }
    };

    checkAccess();
  }, [user, authLoading, propertyId, pathname, router, membership]);

  const propertyInfo = useMemo(() => {
    if (!membership?.properties)
      return { propertyName: '', propertyRole: null, propertyCode: undefined };
    const prop = membership.properties.find((p) => p.id === propertyId);
    console.log('[PropertyLayout] propertyInfo — membership properties:', JSON.stringify(membership.properties.map(p => ({ id: p.id, name: p.name, role: p.role }))), 'selected prop:', prop?.name ?? 'not found');
    return {
      propertyName: prop?.name ?? '',
      propertyRole: prop?.role ?? null,
      propertyCode: prop?.code,
    };
  }, [membership, propertyId]);

  const currentRoute = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    // If we're at /property/[id], the route is 'index' or 'dashboard'
    if (parts.length === 2 && parts[0] === 'property') return 'index';
    return parts[parts.length - 1] ?? 'index';
  }, [pathname]);

  const isFullScreen = useMemo(() => {
    if (FULL_SCREEN_ROUTES.includes(currentRoute)) return true;
    
    // Check for ticket details: property/[id]/tickets/[uuid]
    const parts = pathname.split('/').filter(Boolean);
    const ticketsIdx = parts.indexOf('tickets');
    if (ticketsIdx !== -1 && ticketsIdx === parts.length - 2) {
      return true; // It's a detail page
    }
    
    return false;
  }, [currentRoute, pathname]);

  // Loading state
  // DEFENSE-IN-DEPTH: also guard against membership being null — this prevents
  // the blank-sidebar bug where membership loads after the initial access check.
  // In that gap, accessState.checking=false, authLoading=false, but membership=null.
  if (authLoading || accessState.checking || (user && !membership)) {
    console.log('[PropertyLayout] Loading — authLoading:', authLoading, 'accessChecking:', accessState.checking, 'membershipNull:', !membership);
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Not authenticated
  if (!user) {
    return null;
  }

  // Resolve role: use access check result, or fall back to AuthContext membership data
  // (access check may fail on web due to RLS policies — membership data was already fetched during login)
  const propMembership = membership?.properties?.find((p) => p.id === propertyId);
  const membershipRole = propMembership?.role ?? null;

  // Determine final role: prefer checkPropertyAccess result, fallback to membership role
  let role = accessState.authorized === true
    ? (accessState.role ?? membershipRole ?? '')
    : (membershipRole ?? '');

  if (propertyId === 'all' && accessState.authorized) {
    role = 'property_admin';
  }

  console.log('[PropertyLayout] Final role resolution:', {
    accessAuthorized: accessState.authorized,
    accessRole: accessState.role,
    membershipRole,
    finalRole: role,
    hasMembership: !!propMembership,
    membershipNull: membership === null,
    membershipPropertiesNull: membership?.properties == null,
    propertyId,
  });

  // Not authorized for this property (only show if we genuinely have no role and no membership)
  if (!role && accessState.authorized === false) {
    console.log('[PropertyLayout] Genuinely unauthorized — showing access denied');
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#000',
          padding: 24,
        }}
      >
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Access Denied</Text>
        <Text style={styles.errorMessage}>
          You don't have permission to access this property. Contact your administrator.
        </Text>
      </View>
    );
  }

  console.log('[PropertyLayout] Access granted — role:', role);


  // ---- Unified sidebar layout for ALL roles (unless full-screen) ----
  if (isFullScreen) {
    return (
      <PropertyContext.Provider value={propertyInfo}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Slot />
          {role !== 'tenant' && role !== 'super_tenant' && <GlobalBottomNav />}
        </View>
      </PropertyContext.Provider>
    );
  }

  // Capability-based module filtering in Sidebar ensures each role only sees permitted modules.
  return (
    <PropertyContext.Provider value={propertyInfo}>
      <View style={styles.container}>
        {/* Mobile backdrop when sidebar expanded */}
        {isMobile && !sidebarCollapsed && (
          <Pressable
            style={styles.mobileBackdrop}
            onPress={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Persistent Sidebar */}
        <Sidebar
          currentRoute={currentRoute}
          onNewRequest={() => setTicketModalVisible(true)}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          role={role}
          isMobile={isMobile}
          onNavigate={() => setSidebarCollapsed(true)}
        />

        {/* Content — children render here via Expo Router file-based routing */}
        <View style={[styles.contentArea, {
          backgroundColor: colors.background,
          marginLeft: isMobile ? 0 : (sidebarCollapsed ? 72 : SIDEBAR_WIDTH),
        }]}>
          <Slot />
        </View>

        {/* New Request — ticket modal with AI classification */}
        <TicketCreateModal
          isOpen={ticketModalVisible}
          onClose={() => setTicketModalVisible(false)}
          propertyId={propertyId ?? ''}
          organizationId={membership?.org_id ?? ''}
          role={membershipRole === 'org_super_admin' ? 'super_admin' : (membershipRole === 'property_admin' ? 'admin' : 'tenant')}
        />
        {role !== 'tenant' && role !== 'super_tenant' && <GlobalBottomNav />}
      </View>
    </PropertyContext.Provider>
  );
}

// ---- Styles ----
const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  mobileBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    zIndex: 2,
    overflow: 'hidden',
  },
  contentArea: {
    flex: 1,
    marginLeft: SIDEBAR_WIDTH,
    zIndex: 1,
  },
  sidebarHeader: {
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  collapseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sectionLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 20,
    marginLeft: 4,
  },
  navItem: {
    marginVertical: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  navItemCollapsed: {
    marginVertical: 2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  navItemCollapsedActive: {
    backgroundColor: 'rgba(112,143,150,0.12)',
  },
  navItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navItemIconCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemLabel: {
    fontFamily: 'Urbanist-Medium',
    fontSize: 14,
    letterSpacing: 0.1,
  },
  sidebarBottom: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 24,
  },

  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  logoutText: {
    fontFamily: 'Urbanist-Medium',
    fontSize: 14,
    color: '#EF4444',
  },
  // Access denied styles
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorIconText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#EF4444',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
});
