export type RoleLevel = 0 | 1 | 2 | 3 | 4;

export type RoleKey =
    | 'super_admin'
    | 'master_admin'
    | 'org_admin'
    | 'owner'
    | 'property_admin'
    | 'manager_executive'
    | 'purchase_manager'
    | 'purchase_executive'
    | 'mst' | 'maintenance_staff' | 'hk' | 'fe' | 'se' | 'technician' | 'field_staff' | 'bms_operator' | 'staff'
    | 'soft_service_staff' | 'soft_service_supervisor' | 'soft_service_manager'
    | 'tenant_user' | 'tenant' | 'super_tenant'
    | 'vendor'
    | 'security';

export type CapabilityDomain =
    | 'users'
    | 'properties'
    | 'tickets'
    | 'assets'
    | 'procurement'
    | 'visitors'
    | 'security'
    | 'dashboards'
    | 'reports'
    | 'vendors'
    | 'stock'
    | 'sop';

export type CapabilityAction = 'view' | 'create' | 'update' | 'approve' | 'assign' | 'delete' | 'suspend';

export type CapabilityMatrix = Partial<Record<CapabilityDomain, CapabilityAction[]>>;

export interface RequestContext {
    user_id: string;
    role_key: RoleKey;
    role_level: RoleLevel;
    property_id: string;
    capabilities: CapabilityMatrix;
}

// ─── Resolver / shift status (resolver_stats table) ──────────────────────────

export interface ResolverStat {
  id: string;
  user_id: string;
  property_id?: string | null;
  skill_group_id?: string | null;
  /** Whether the staff member is currently on-shift and available for assignment */
  is_available: boolean;
  total_resolved?: number | null;
  avg_resolution_minutes?: number | null;
  sla_compliance_rate?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}
