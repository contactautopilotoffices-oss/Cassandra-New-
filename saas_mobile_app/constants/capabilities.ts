import { RoleKey, CapabilityMatrix, RoleLevel } from '../types/rbac';

export const CAPABILITY_MATRIX: Record<RoleKey, CapabilityMatrix> = {
    super_admin: {
        users: ['view', 'create', 'update', 'approve', 'assign', 'delete', 'suspend'],
        properties: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'create', 'update', 'approve', 'assign', 'delete'],
        assets: ['view', 'create', 'update', 'delete'],
        procurement: ['view', 'create', 'update', 'approve', 'delete'],
        visitors: ['view', 'create', 'update', 'delete'],
        security: ['view', 'create', 'update', 'delete'],
        dashboards: ['view'],
        reports: ['view'],
        vendors: ['view', 'create', 'update', 'delete'],
        sop: ['view', 'create', 'update', 'delete']
    },
    master_admin: {
        users: ['view', 'create', 'update', 'approve', 'assign', 'delete', 'suspend'],
        properties: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'create', 'update', 'approve', 'assign', 'delete'],
        assets: ['view', 'create', 'update', 'delete'],
        procurement: ['view', 'create', 'update', 'approve', 'delete'],
        visitors: ['view', 'create', 'update', 'delete'],
        security: ['view', 'create', 'update', 'delete'],
        dashboards: ['view'],
        reports: ['view'],
        vendors: ['view', 'create', 'update', 'delete'],
        sop: ['view', 'create', 'update', 'delete']
    },
    org_admin: {
        users: ['view', 'create', 'update', 'assign', 'suspend'],
        properties: ['view', 'update'],
        tickets: ['view', 'update', 'approve'],
        assets: ['view', 'update'],
        procurement: ['view', 'approve'],
        dashboards: ['view'],
        reports: ['view'],
        sop: ['view', 'create', 'update', 'delete']
    },
    owner: {
        users: ['view', 'create', 'update', 'assign', 'suspend'],
        properties: ['view', 'update'],
        tickets: ['view', 'update', 'approve'],
        assets: ['view', 'update'],
        procurement: ['view', 'approve'],
        dashboards: ['view'],
        reports: ['view'],
        sop: ['view', 'create', 'update', 'delete']
    },
    property_admin: {
        users: ['view', 'create', 'update', 'assign', 'suspend'],
        properties: ['view', 'update'],
        tickets: ['view', 'update', 'approve'],
        assets: ['view', 'update'],
        procurement: ['view', 'approve'],
        dashboards: ['view'],
        reports: ['view'],
        sop: ['view', 'create', 'update', 'delete']
    },
    manager_executive: {
        tickets: ['view', 'approve'],
        assets: ['view'],
        dashboards: ['view'],
        reports: ['view'],
        sop: ['view']
    },
    purchase_manager: {
        procurement: ['view', 'approve'],
        vendors: ['view'],
        dashboards: ['view']
    },
    purchase_executive: {
        procurement: ['view', 'create'],
        vendors: ['view']
    },
    mst: {
        tickets: ['view', 'update'],
        dashboards: ['view'],
        sop: ['view', 'update']
    },
    maintenance_staff: {
        tickets: ['view', 'update'],
        dashboards: ['view'],
        sop: ['view', 'update']
    },
    hk: {
        tickets: ['view', 'update'],
        sop: ['view', 'update']
    },
    fe: {
        tickets: ['view', 'update'],
        sop: ['view', 'update']
    },
    se: {
        tickets: ['view', 'update'],
        sop: ['view', 'update']
    },
    technician: {
        tickets: ['view', 'update'],
        sop: ['view', 'update']
    },
    field_staff: {
        tickets: ['view'],
        sop: ['view']
    },
    bms_operator: {
        assets: ['view', 'update'],
        sop: ['view', 'update']
    },
    tenant_user: {
        tickets: ['create', 'view'],
        visitors: ['create'],
        dashboards: ['view']
    },
    tenant: {
        tickets: ['create', 'view'],
        visitors: ['create'],
        dashboards: ['view']
    },
    super_tenant: {
        tickets: ['view'],
        properties: ['view'],
        dashboards: ['view'],
        reports: ['view']
    },
    vendor: {
        tickets: ['view']
    },
    staff: {
        tickets: ['view', 'create', 'update'],
        dashboards: ['view'],
        sop: ['view', 'update']
    },
    soft_service_staff: {
        stock: ['view', 'create', 'update', 'delete'],
        dashboards: ['view'],
        sop: ['view', 'update']
    },
    soft_service_supervisor: {
        stock: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'approve'],
        dashboards: ['view'],
        reports: ['view'],
        sop: ['view', 'update']
    },
    soft_service_manager: {
        stock: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'approve', 'assign', 'delete'],
        dashboards: ['view'],
        reports: ['view'],
        sop: ['view', 'create', 'update', 'delete']
    },
    security: {
        security: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'update'],
        visitors: ['view', 'create', 'update', 'delete'],
        dashboards: ['view']
    }
};

export const ROLE_LEVEL_MAP: Record<string, RoleLevel> = {
    'super_admin': 0,
    'master_admin': 0,
    'org_admin': 1,
    'owner': 1,
    'property_admin': 2,
    'manager_executive': 3,
    'purchase_manager': 3,
    'purchase_executive': 3,
    'mst': 4,
    'maintenance_staff': 4,
    'hk': 4,
    'fe': 4,
    'se': 4,
    'technician': 4,
    'field_staff': 4,
    'bms_operator': 4,
    'staff': 4,
    'soft_service_staff': 4,
    'soft_service_supervisor': 4,
    'soft_service_manager': 4,
    'tenant_user': 4,
    'tenant': 4,
    'super_tenant': 4,
    'vendor': 4,
    'security': 4
};
