// ============================================
// Autopilot Mobile - Type Definitions
// Phase 1-6: Complete Type System
// ============================================

// ===== AUTH TYPES =====
export interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  /** Maps to users.user_photo_url in FMS — NOT avatar_url */
  avatar?: string;
  userPhotoUrl?: string;
  role: UserRole;
  organizationId?: string;
  propertyId?: string;
  departmentId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export type UserRole = 
  | 'master_admin'
  | 'org_admin' 
  | 'property_admin'
  | 'property_manager'
  | 'mst'
  | 'security_guard'
  | 'tenant'
  | 'super_tenant'
  | 'soft_service_manager'
  | 'food_vendor'
  | 'vendor'
  | 'client';

export const USER_ROLES: UserRole[] = [
  'master_admin',
  'org_admin',
  'property_admin',
  'property_manager',
  'mst',
  'security_guard',
  'tenant',
  'super_tenant',
  'soft_service_manager',
  'food_vendor',
  'vendor',
  'client',
];

export interface AuthSession {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
  phone?: string;
  organizationId?: string;
}

// ===== ORGANIZATION & PROPERTY TYPES =====
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
  settings: OrganizationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSettings {
  timezone: string;
  currency: string;
  dateFormat: string;
  features: string[];
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  status?: string;
  organizationId: string;
  managerId?: string;
  totalUnits: number;
  occupiedUnits: number;
  amenities: string[];
  code?: string;
  settings?: PropertySettings;
  createdAt: string;
  updatedAt: string;
}

export type PropertyType = 'residential' | 'commercial' | 'industrial' | 'mixed_use' | 'coworking';

export interface PropertySettings {
  checkInTime: string;
  checkOutTime: string;
  visitorPolicy: string;
  parkingAvailable: boolean;
}

// ===== TICKET TYPES =====
export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  subcategory?: string;
  createdBy: string;
  assignedTo?: string;
  propertyId: string;
  organizationId: string;
  unitId?: string;
  attachments: Attachment[];
  comments: Comment[];
  slaDeadline?: string;
  slaBreached: boolean;
  rating?: number;
  ratingComment?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  metadata?: Record<string, any>;
}

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

// TicketComment is an alias for Comment (used by ticket service)
export type TicketComment = Comment;

export interface Comment {
  id: string;
  ticketId: string;
  userId: string;
  content: string;
  attachments: Attachment[];
  isInternal: boolean;
  createdAt: string;
}

export interface Attachment {
  id: string;
  url: string;
  type: 'image' | 'video' | 'document';
  name: string;
  size: number;
  createdAt: string;
}

// ===== KANBAN / FLOW MAP TYPES =====
export interface KanbanColumn {
  id: string;
  title: string;
  status: TicketStatus;
  tickets: Ticket[];
  order: number;
  wipLimit?: number;
}

export interface FlowMapData {
  columns: KanbanColumn[];
  lastUpdated: string;
}

// ===== VISITOR / VMS TYPES =====
export interface Visitor {
  id: string;
  visitorId?: string;
  name: string;
  email?: string;
  phone: string;
  company?: string;
  purpose: string;
  hostId?: string;
  hostName: string;
  checkInTime?: string;
  checkOutTime?: string;
  expectedTime?: string;
  status: VisitorStatus;
  photo?: string;
  idProof?: string;
  passCode?: string;
  vehicleNumber?: string;
  belongings?: string;
  propertyId: string;
  preRegistered: boolean;
  createdAt: string;
  updatedAt: string;
}

export type VisitorStatus = 'expected' | 'checked_in' | 'checked_out' | 'overstayed';

export interface VMSKioskSettings {
  propertyId: string;
  welcomeMessage: string;
  requirePhoto: boolean;
  requireIdProof: boolean;
  autoNotifyHost: boolean;
  printBadge: boolean;
}

// ===== INVENTORY / STOCK TYPES =====
export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  quantity: number;
  /** Maps to stock_items.min_threshold in FMS — NOT min_quantity */
  minQuantity?: number;
  minThreshold?: number;
  maxQuantity?: number;
  unit?: string;
  location?: string;
  propertyId?: string;
  qrCode?: string;
  barcode?: string;
  supplierId?: string;
  costPerUnit?: number;
  lastRestocked?: string;
  images?: string[];
  qrCodeData?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockTransaction {
  id: string;
  itemId: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reason: string;
  referenceType?: 'ticket' | 'purchase' | 'return';
  referenceId?: string;
  performedBy: string;
  timestamp: string;
  notes?: string;
}

// ===== DIESEL / ELECTRICITY TYPES =====
export interface DieselLog {
  id: string;
  propertyId: string;
  tankId: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  filledAmount?: number;
  cost?: number;
  loggedBy: string;
  timestamp: string;
  notes?: string;
  images: string[];
}

export interface DieselTank {
  id: string;
  propertyId: string;
  name: string;
  capacity: number;
  currentLevel: number;
  minLevel: number;
  location: string;
  lastReading?: DieselLog;
}

export interface ElectricityLog {
  id: string;
  propertyId: string;
  meterId: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  cost?: number;
  loggedBy: string;
  timestamp: string;
  notes?: string;
  images: string[];
}

export interface ElectricityMeter {
  id: string;
  propertyId: string;
  name: string;
  meterNumber: string;
  location: string;
  lastReading?: ElectricityLog;
}

// ===== SOP / CHECKLIST TYPES =====
export interface SOP {
  id: string;
  title: string;
  description?: string;
  category: string;
  propertyId: string;
  organizationId: string;
  steps: SOPStep[];
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'on_demand';
  assignedRoles: string[];
  qrCode?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SOPStep {
  id: string;
  sopId?: string;
  /** Maps to sop_checklist_items.order_index in FMS — NOT order */
  order?: number;
  orderIndex?: number;
  title: string;
  description?: string;
  section?: string;
  requiresPhoto: boolean;
  requiresSignature: boolean;
  requiresNote: boolean;
}

export interface SOPChecklistRun {
  id: string;
  sopId: string;
  propertyId: string;
  startedBy: string;
  startedAt: string;
  completedAt?: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  notes?: string;
  createdAt?: string;
}

export interface StepResult {
  id?: string;
  completionId?: string;
  stepId: string;
  completed: boolean;
  photoUrl?: string;
  signatureData?: string;
  note?: string;
  timestamp: string;
}

// ===== MEETING ROOM TYPES =====
export interface MeetingRoom {
  id: string;
  name: string;
  propertyId: string;
  capacity: number;
  size?: number;
  amenities: string[];
  location: string;
  images: string[];
  status: 'available' | 'maintenance' | 'inactive';
  hourlyRate?: number;
  creditsPerHour?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomBooking {
  id: string;
  roomId: string;
  title: string;
  organizerId: string;
  attendees: string[];
  startTime: string;
  endTime: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  creditsUsed: number;
  notes?: string;
  createdAt: string;
}

// ===== MST / SHIFT TYPES =====
export interface MSTShift {
  id: string;
  userId: string;
  propertyId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'ended' | 'auto_ended';
  totalDuration?: number;
  ticketsHandled: number;
  lastHeartbeat: string;
}

export interface ShiftHeartbeat {
  shiftId: string;
  timestamp: string;
  location?: { lat: number; lng: number };
  batteryLevel?: number;
}

// ===== VENDOR TYPES =====
export interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  category: string;
  services: string[];
  kycStatus: 'pending' | 'verified' | 'rejected';
  kycDocuments: KYCDocument[];
  organizationId: string;
  properties: string[];
  rating?: number;
  isActive: boolean;
  createdAt: string;
}

export interface KYCDocument {
  id: string;
  type: 'pan' | 'gst' | 'license' | 'insurance' | 'other';
  number?: string;
  url: string;
  verifiedAt?: string;
  verifiedBy?: string;
  status: 'pending' | 'verified' | 'rejected';
}

// ===== ESCALATION TYPES =====
export interface EscalationRule {
  id: string;
  name: string;
  organizationId: string;
  triggerType: 'sla_breach' | 'no_response' | 'manual';
  conditions: EscalationCondition[];
  actions: EscalationAction[];
  isActive: boolean;
}

export interface EscalationCondition {
  type: 'priority' | 'category' | 'time_elapsed';
  operator: 'equals' | 'greater_than' | 'less_than';
  value: string | number;
}

export interface EscalationAction {
  type: 'notify' | 'reassign' | 'change_priority';
  target: string;
  message?: string;
}

// ===== PPM / AMC TYPES =====
export interface PPMTask {
  id: string;
  title: string;
  description?: string;
  propertyId: string;
  category: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDue: string;
  lastCompleted?: string;
  assignedTo?: string;
  vendorId?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue';
  checklist?: SOP;
}

export interface AMCContract {
  id: string;
  vendorId: string;
  propertyId: string;
  title: string;
  startDate: string;
  endDate: string;
  value: number;
  coverage: string[];
  status: 'active' | 'expired' | 'terminated';
}

// ===== SNAG TYPES =====
export interface Snag {
  id: string;
  title: string;
  description?: string;
  propertyId: string;
  unitId?: string;
  location?: { x: number; y: number };
  category: string;
  priority: TicketPriority;
  status: 'open' | 'in_progress' | 'resolved';
  reportedBy: string;
  assignedTo?: string;
  images: string[];
  createdAt: string;
  resolvedAt?: string;
}

// ===== ANALYTICS / REPORT TYPES =====
export interface DashboardStats {
  tickets: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
  };
  visitors: {
    today: number;
    total: number;
    checkedIn: number;
  };
  stock: {
    total: number;
    lowStock: number;
    outOfStock: number;
  };
  users: {
    total: number;
    active: number;
  };
  resolvedToday: number;
  avgResolutionTime: number;
  slaCompliance: number;
}

// Legacy flat form (for backward compat)
export interface LegacyDashboardStats {
  totalTickets: number;
  openTickets: number;
  resolvedToday: number;
  avgResolutionTime: number;
  slaCompliance: number;
  visitorCount: number;
  lowStockItems: number;
}

export interface TicketAnalytics {
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<string, number>;
  trend: { date: string; count: number }[];
}

// ===== NOTIFICATION TYPES =====
export interface PushNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  type: NotificationType;
  read: boolean;
  createdAt: string;
}

export type NotificationType = 
  | 'ticket_assigned'
  | 'ticket_updated'
  | 'ticket_escalated'
  | 'visitor_arrived'
  | 'stock_low'
  | 'booking_reminder'
  | 'shift_reminder'
  | 'sop_due'
  | 'system';

// ===== CAPABILITY / RBAC TYPES =====
export type Capability = 
  | 'tickets:read' | 'tickets:create' | 'tickets:update' | 'tickets:delete' | 'tickets:assign'
  | 'visitors:read' | 'visitors:create' | 'visitors:update' | 'visitors:delete'
  | 'inventory:read' | 'inventory:create' | 'inventory:update' | 'inventory:delete'
  | 'users:read' | 'users:create' | 'users:update' | 'users:delete'
  | 'reports:read' | 'reports:create'
  | 'settings:read' | 'settings:update'
  | 'admin:full';

export const CAPABILITY_MATRIX: Record<string, Capability[]> = {
  master_admin: ['admin:full'],
  org_admin: [
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:delete', 'tickets:assign',
    'visitors:read', 'visitors:create', 'visitors:update', 'visitors:delete',
    'inventory:read', 'inventory:create', 'inventory:update', 'inventory:delete',
    'users:read', 'users:create', 'users:update', 'users:delete',
    'reports:read', 'reports:create',
    'settings:read', 'settings:update'
  ],
  property_admin: [
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:assign',
    'visitors:read', 'visitors:create', 'visitors:update',
    'inventory:read', 'inventory:create', 'inventory:update',
    'users:read', 'users:create', 'users:update',
    'reports:read',
    'settings:read'
  ],
  property_manager: [
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:assign',
    'visitors:read', 'visitors:create', 'visitors:update',
    'inventory:read', 'inventory:create', 'inventory:update',
    'users:read',
    'reports:read'
  ],
  mst: [
    'tickets:read', 'tickets:create', 'tickets:update',
    'visitors:read', 'visitors:create',
    'inventory:read'
  ],
  security_guard: [
    'visitors:read', 'visitors:create', 'visitors:update',
    'tickets:read'
  ],
  tenant: [
    'tickets:read', 'tickets:create'
  ],
  super_tenant: [
    'tickets:read', 'tickets:create'
  ],
  soft_service_manager: [
    'tickets:read', 'tickets:create', 'tickets:update', 'tickets:assign',
    'visitors:read', 'visitors:create', 'visitors:update',
    'inventory:read', 'inventory:create', 'inventory:update',
    'users:read',
    'reports:read',
    'settings:read'
  ],
  food_vendor: [
    'tickets:read', 'tickets:update'
  ],
  vendor: [
    'tickets:read', 'tickets:update'
  ],
  client: [
    'tickets:read', 'tickets:create'
  ]
};

// ===== OFFLINE / SYNC TYPES =====
export interface OfflineQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  data: any;
  timestamp: string;
  retryCount: number;
  error?: string;
}

export interface SyncStatus {
  lastSync: string;
  pendingItems: number;
  isSyncing: boolean;
  error?: string;
}

// ===== SHARED API RESPONSE =====
// Centralised response envelope used by all service layers.
// Previously defined in services/api/client.ts — moved here so that file
// can be deleted and services no longer depend on the legacy API client.
export interface ApiResponse<T> {
  data: T | null;
  error?: Error | string | null;
  status?: number;
  success?: boolean;
}
