# Full Database Schema

`sql
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  code text UNIQUE NOT NULL, -- Unified identifier (was 'slug')
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS property_memberships (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS property_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,
  username text UNIQUE,
  full_name text,
  avatar_url text,
  user_photo_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text,
  is_private boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  event_by uuid,
  event_at timestamptz NOT NULL DEFAULT now(),
  object_type text NOT NULL,
  object_id text,
  action text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS generators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,                      -- e.g., "DG-1", "DG-2"
  make text,                               -- e.g., "Cummins", "CAT", "Kirloskar"
  capacity_kva integer,                    -- e.g., 500, 750, 125
  tank_capacity_litres integer DEFAULT 1000,
  fuel_efficiency_lphr numeric DEFAULT 15, -- Litres per hour (for alerts)
  status text DEFAULT 'active',            -- 'active' | 'standby' | 'maintenance'
  last_maintenance_date date,              -- Last service date
  next_maintenance_date date,              -- Scheduled next service
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diesel_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  generator_id uuid NOT NULL REFERENCES generators(id) ON DELETE CASCADE,
  reading_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_hours numeric NOT NULL,          -- Hour meter opening reading
  diesel_added_litres numeric DEFAULT 0,   -- Litres added during the day
  closing_hours numeric NOT NULL,          -- Hour meter closing reading
  computed_run_hours numeric GENERATED ALWAYS AS (closing_hours - opening_hours) STORED,
  computed_consumed_litres numeric,        -- Staff-provided or auto-calculated
  notes text,
  alert_status text DEFAULT 'normal',      -- 'normal' | 'warning' | 'critical'
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(generator_id, reading_date)       -- One entry per generator per day
);

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  shop_name text NOT NULL,
  owner_name text,
  commission_rate numeric DEFAULT 10,           -- Percentage
  payment_gateway_enabled boolean DEFAULT false,
  status text DEFAULT 'active',                 -- 'active' | 'inactive' | 'suspended'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)                  -- One vendor per user per property
);

CREATE TABLE IF NOT EXISTS vendor_daily_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  revenue_amount numeric NOT NULL DEFAULT 0,
  revenue_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(vendor_id, revenue_date)                 -- One entry per vendor per day
);

CREATE TABLE IF NOT EXISTS commission_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL,                -- 1, 2, 3, etc.
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  total_revenue numeric DEFAULT 0,
  commission_rate numeric NOT NULL,             -- Locked at cycle creation
  commission_due numeric DEFAULT 0,
  status text DEFAULT 'in_progress',            -- 'in_progress' | 'payable' | 'paid' | 'overdue'
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(vendor_id, cycle_start)
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES commission_cycles(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  gateway_txn_id text,
  gateway_name text,                            -- 'razorpay' | 'stripe' | 'manual'
  status text DEFAULT 'pending',                -- 'pending' | 'success' | 'failed'
  receipt_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  user_role text,
  export_type text,                             -- 'vendor_revenue' | 'diesel' | 'commission'
  date_range_start date,
  date_range_end date,
  property_scope uuid[],                        -- Array of property IDs exported
  file_format text DEFAULT 'csv',               -- 'csv' | 'xlsx'
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visitor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visitor_id text UNIQUE NOT NULL,              -- Format: PROP-VIS-00123
  category varchar(20) NOT NULL,                -- 'visitor' | 'vendor' | 'other'
  name text NOT NULL,
  mobile text,
  coming_from text,
  whom_to_meet text NOT NULL,
  photo_url text,                               -- Supabase Storage URL
  checkin_time timestamptz DEFAULT now(),
  checkout_time timestamptz,
  status varchar(20) DEFAULT 'checked_in',      -- 'checked_in' | 'checked_out'
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vms_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status varchar(20) DEFAULT 'open',            -- 'open' | 'in_progress' | 'resolved'
  reported_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visitor_id_counters (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  last_number integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skill_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  code text NOT NULL,                           -- 'mst_technical', 'mst_plumbing', 'vendor'
  name text NOT NULL,                           -- 'MST (Technical)', 'MST (Plumbing)', 'Vendor'
  description text,
  is_manual_assign boolean DEFAULT false,       -- Vendor = true (manual escalation)
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, code)
);

CREATE TABLE IF NOT EXISTS issue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  code text NOT NULL,                           -- 'ac_breakdown', 'water_leakage'
  name text NOT NULL,                           -- 'AC Breakdown', 'Water Leakage'
  skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
  sla_hours integer DEFAULT 24,                 -- SLA deadline in hours
  priority text DEFAULT 'medium',               -- 'low', 'medium', 'high', 'urgent'
  icon text,                                    -- Optional icon name
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, code)
);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,           -- Auto-generated: TKT-PROP-00001
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES issue_categories(id) ON DELETE SET NULL,
  skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  location text,                                -- Unit/floor/area
  priority text DEFAULT 'medium',               -- 'low', 'medium', 'high', 'urgent'
  status text DEFAULT 'open',                   -- 'open', 'assigned', 'in_progress', 'resolved', 'closed', 'waitlist'
  raised_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  sla_hours integer,                            -- Copied from category at creation
  sla_deadline timestamptz,                     -- Calculated: assigned_at + sla_hours
  sla_started boolean DEFAULT false,            -- SLA only starts on assignment
  sla_breached boolean DEFAULT false,           -- Set true if deadline passed
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resolver_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
  current_floor integer DEFAULT 1,
  avg_resolution_minutes integer DEFAULT 60,
  total_resolved integer DEFAULT 0,
  is_available boolean DEFAULT true,
  last_ticket_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id, skill_group_id)
);

CREATE TABLE IF NOT EXISTS sla_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  category_code text NOT NULL,
  response_sla_hours integer DEFAULT 1,
  resolution_sla_hours integer DEFAULT 24,
  priority text DEFAULT 'medium',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, category_code)
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  is_internal boolean DEFAULT false,            -- Internal notes vs public comments
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,                         -- 'created', 'assigned', 'status_change', 'comment', etc.
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_counters (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  last_number integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meter_multipliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES electricity_meters(id) ON DELETE CASCADE,
  
  -- Factor Components
  ct_ratio_primary numeric NOT NULL DEFAULT 200,
  ct_ratio_secondary numeric NOT NULL DEFAULT 5,
  pt_ratio_primary numeric NOT NULL DEFAULT 11000,
  pt_ratio_secondary numeric NOT NULL DEFAULT 110,
  meter_constant numeric NOT NULL DEFAULT 1.0,
  
  -- Computed Multiplier Value
  multiplier_value numeric GENERATED ALWAYS AS (
    (ct_ratio_primary / NULLIF(ct_ratio_secondary, 0)) *
    (pt_ratio_primary / NULLIF(pt_ratio_secondary, 0)) *
    meter_constant
  ) STORED,
  
  -- Time Versioning
  effective_from date NOT NULL,
  effective_to date,
  reason text,
  
  -- Audit
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grid_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  utility_provider text,
  rate_per_unit numeric NOT NULL,
  unit_type text DEFAULT 'kVAh' CHECK (unit_type = 'kVAh'),
  
  effective_from date NOT NULL,
  effective_to date,
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dg_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generator_id uuid NOT NULL REFERENCES generators(id) ON DELETE CASCADE,
  
  cost_per_litre numeric NOT NULL,
  
  effective_from date NOT NULL,
  effective_to date,
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_end TIMESTAMPTZ,
    duration_seconds INT,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL, -- 'broken_feature', 'performance', 'bug', 'other'
  status text DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  priority text DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  assigned_to uuid REFERENCES users(id), -- Master Admin who takes the ticket
  work_started_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  comment text NOT NULL,
  is_internal boolean DEFAULT false, -- Only visible to Master Admin
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT DEFAULT 'units',
    quantity INTEGER NOT NULL DEFAULT 0,
    min_threshold INTEGER DEFAULT 10,
    location TEXT,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(property_id, item_code)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    action TEXT NOT NULL CHECK (action IN ('add', 'remove', 'adjust', 'initial')),
    quantity_change INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    user_id UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    total_items INTEGER NOT NULL DEFAULT 0,
    low_stock_count INTEGER NOT NULL DEFAULT 0,
    total_added INTEGER NOT NULL DEFAULT 0,
    total_removed INTEGER NOT NULL DEFAULT 0,
    report_data JSONB,
    generated_by UUID REFERENCES users(id),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(property_id, report_date)
);

CREATE TABLE IF NOT EXISTS sop_missed_alerts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID        NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
    slot_time   TIMESTAMPTZ NOT NULL,   -- the scheduled time of the missed slot
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (template_id, slot_time)
);

CREATE TABLE IF NOT EXISTS sop_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'on_demand')),
    assigned_to TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sop_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    requires_photo BOOLEAN DEFAULT FALSE,
    requires_comment BOOLEAN DEFAULT FALSE,
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sop_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    completed_by UUID NOT NULL REFERENCES users(id),
    completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'partial')),
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sop_completion_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completion_id UUID NOT NULL REFERENCES sop_completions(id) ON DELETE CASCADE,
    checklist_item_id UUID NOT NULL REFERENCES sop_checklist_items(id) ON DELETE CASCADE,
    is_checked BOOLEAN DEFAULT FALSE,
    photo_url TEXT,
    comment TEXT,
    checked_at TIMESTAMPTZ,
    UNIQUE(completion_id, checklist_item_id)
);

CREATE TABLE IF NOT EXISTS mst_skills (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  skill_code text NOT NULL, -- e.g., 'technical', 'plumbing', 'soft_service', 'vendor'
  PRIMARY KEY (user_id, skill_code)
);

CREATE TABLE IF NOT EXISTS shift_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  check_in_at timestamptz DEFAULT now(),
  check_out_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(property_id, feature_key)
);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL, -- 'broken_feature', 'performance', 'bug', 'other'
  status text DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  priority text DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  assigned_to uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  comment text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  feature_name text NOT NULL,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'tenant',
  invitation_code text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  max_uses integer DEFAULT 1,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invite_link_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id uuid NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  used_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ticket_classification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Rule engine results
  rule_top_bucket text NOT NULL,           -- Top skill_group from rules
  rule_scores jsonb NOT NULL DEFAULT '{}', -- All candidate scores: {"technical": 5, "plumbing": 3}
  rule_margin int NOT NULL DEFAULT 0,      -- Difference between top two scores
  entropy float DEFAULT 0,                 -- Score distribution entropy (optional V1)
  
  -- LLM results (nullable if not used)
  llm_used boolean NOT NULL DEFAULT false,
  llm_bucket text,                         -- LLM selected bucket (if used)
  llm_secondary_bucket text,               -- LLM selected secondary bucket
  llm_risk_flag text,                      -- LLM detected risk flag
  llm_confidence float,                    -- LLM confidence score (0-1)
  llm_reason text,                         -- LLM reasoning (for debugging)
  llm_latency_ms int,                      -- LLM API response time
  prompt_tokens int,                       -- Token usage from prompt
  completion_tokens int,                   -- Token usage from response
  total_tokens int,                         -- Total token usage
  
  -- Final decision
  final_bucket text NOT NULL,              -- The actual assigned bucket
  decision_source text NOT NULL DEFAULT 'rule', -- 'rule' | 'llm' | 'human'
  zone text NOT NULL DEFAULT 'A',          -- 'A' (rule) | 'B' (llm) | 'C' (human)
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS llm_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  fallback_count int NOT NULL DEFAULT 0,
  avg_latency_ms float,
  p95_latency_ms float,
  total_prompt_tokens bigint DEFAULT 0,
  total_completion_tokens bigint DEFAULT 0,
  total_cost_usd float DEFAULT 0,
  window_minutes int NOT NULL DEFAULT 5  -- Aggregation window
);

CREATE TABLE IF NOT EXISTS issue_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS issue_keywords (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_category_id uuid NOT NULL REFERENCES issue_categories(id) ON DELETE CASCADE,
    keyword text NOT NULL,
    match_type text DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'regex')),
    created_at timestamptz DEFAULT now(),
    UNIQUE (issue_category_id, keyword)
);

CREATE TABLE IF NOT EXISTS skill_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_manual_assign boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, code)
);

CREATE TABLE IF NOT EXISTS feature_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  feature_name text NOT NULL, -- 'ticketing', 'viewer', 'analytics', 'procurement', 'visitors'
  action text NOT NULL, -- 'accessed', 'created', 'updated', 'viewed', etc.
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS electricity_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,                      -- e.g., "Main Meter", "DG Meter"
  meter_number text,                       -- Physical meter number
  meter_type text DEFAULT 'main',          -- 'main' | 'dg' | 'solar' | 'backup'
  max_load_kw numeric,                     -- Maximum load capacity
  status text DEFAULT 'active',            -- 'active' | 'inactive' | 'faulty'
  last_reading numeric DEFAULT 0,          -- Last recorded reading (kWh)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS electricity_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES electricity_meters(id) ON DELETE CASCADE,
  reading_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_reading numeric NOT NULL,        -- kWh reading at start
  closing_reading numeric NOT NULL,        -- kWh reading at end
  computed_units numeric GENERATED ALWAYS AS (closing_reading - opening_reading) STORED,
  peak_load_kw numeric,                    -- Peak load recorded (optional)
  notes text,
  alert_status text DEFAULT 'normal',      -- 'normal' | 'warning' | 'critical'
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'tenant',
  invitation_code text UNIQUE NOT NULL, -- e.g., "INV_xyz123"
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  max_uses integer DEFAULT 1,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}', -- For additional context (e.g., reason, notes)
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invite_link_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id uuid NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id), -- User who used the link
  used_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS snag_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  imported_by uuid NOT NULL REFERENCES users(id),
  filename text NOT NULL,
  total_rows integer NOT NULL,
  valid_rows integer NOT NULL,
  error_rows integer DEFAULT 0,
  status text DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    logo_url TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (property_id, name)
);

CREATE TABLE IF NOT EXISTS company_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- member | admin
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, company_id) -- User can be in multiple companies if they are across different properties, but usually one
);

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS procurement_orders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_request_id uuid NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
    property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ordered_by          uuid NOT NULL REFERENCES users(id),
    vendor_name         text,
    vendor_contact      text,
    items               jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_amount        numeric DEFAULT 0,
    invoice_number      text,
    invoice_url         text,
    payment_status      text DEFAULT 'unpaid',
    delivery_status     text DEFAULT 'pending',
    expected_delivery   date,
    actual_delivery     date,
    notes               text,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_activity_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_request_id uuid REFERENCES material_requests(id) ON DELETE CASCADE,
    procurement_order_id uuid REFERENCES procurement_orders(id) ON DELETE CASCADE,
    user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
    action              text NOT NULL,
    old_value           text,
    new_value           text,
    metadata            jsonb DEFAULT '{}'::jsonb,
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_settings (
    property_id         uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    threshold_amount    numeric NOT NULL DEFAULT 5000,
    low_approver_id     uuid REFERENCES users(id),  -- For requests < threshold
    high_approver_id    uuid REFERENCES users(id), -- For requests >= threshold
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_budgets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    budget_type         text NOT NULL CHECK (budget_type IN ('rnm', 'general')),
    total_amount        numeric NOT NULL DEFAULT 0,
    spent_amount        numeric NOT NULL DEFAULT 0,
    period_start        date NOT NULL DEFAULT CURRENT_DATE,
    period_end          date,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    UNIQUE(property_id, budget_type, period_start)
);

CREATE TABLE IF NOT EXISTS procurement_catalog (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                text NOT NULL,
    description         text,
    photo_url           text,
    category            text,
    unit                text DEFAULT 'pcs',
    estimated_price     numeric DEFAULT 0,
    stock_item_id       uuid REFERENCES stock_items(id) ON DELETE SET NULL, -- Link to existing inventory
    is_active           boolean DEFAULT true,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_request_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id          uuid NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    catalog_item_id     uuid REFERENCES procurement_catalog(id),
    name                text NOT NULL,
    quantity            numeric NOT NULL DEFAULT 1,
    unit_price          numeric NOT NULL DEFAULT 0,
    total_price         numeric NOT NULL DEFAULT 0,
    photo_url           text,
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ocr_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
    reading_id uuid REFERENCES electricity_readings(id) ON DELETE CASCADE,
    event_type text NOT NULL, -- 'process_start' | 'process_success' | 'process_failure' | 'manual_override'
    payload jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_queue (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID REFERENCES tickets(id) ON DELETE SET NULL,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone        TEXT NOT NULL,
    message      TEXT NOT NULL,
    media_url    TEXT,
    media_type   TEXT CHECK (media_type IN ('image', 'video')),
    event_type   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    retry_count  INT NOT NULL DEFAULT 0,
    error        TEXT,
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL DEFAULT 'awaiting_property',
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pending_text TEXT,
    pending_media_url TEXT,
    pending_media_key TEXT,
    pending_video_url TEXT,
    pending_video_key TEXT,
    pending_is_image BOOLEAN DEFAULT FALSE,
    pending_is_video BOOLEAN DEFAULT FALSE,
    property_options JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_room_credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,        -- tenant
    assigned_by UUID REFERENCES users(id),                               -- admin who assigned
    monthly_hours DECIMAL(6,2) NOT NULL DEFAULT 0,                      -- total hours granted per month
    remaining_hours DECIMAL(6,2) NOT NULL DEFAULT 0,                    -- hours left this cycle
    last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                   -- when last monthly reset happened
    next_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (property_id, user_id)
);

CREATE TABLE IF NOT EXISTS meeting_room_credit_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,        -- tenant requesting
    requested_hours DECIMAL(6,2) NOT NULL DEFAULT 0,                    -- 0 = just a refill request, admin decides amount
    reason TEXT,                                                          -- optional note from tenant
    status TEXT NOT NULL DEFAULT 'pending',                              -- pending | approved | rejected
    admin_note TEXT,                                                      -- admin's response note
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_room_credit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_id UUID NOT NULL REFERENCES meeting_room_credits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),                          -- tenant whose credits changed
    action TEXT NOT NULL,  -- 'assigned' | 'deducted' | 'refunded' | 'monthly_reset' | 'manual_refill' | 'request_approved'
    hours_changed DECIMAL(6,2) NOT NULL,                                 -- positive = added, negative = deducted
    hours_after DECIMAL(6,2) NOT NULL,                                   -- remaining after change
    booking_id UUID REFERENCES meeting_room_bookings(id) ON DELETE SET NULL,
    request_id UUID REFERENCES meeting_room_credit_requests(id) ON DELETE SET NULL,
    performed_by UUID REFERENCES users(id),                              -- who triggered the change
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escalation_hierarchies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE, -- NULL = org-wide
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hierarchy_id uuid NOT NULL REFERENCES escalation_hierarchies(id) ON DELETE CASCADE,
  level_number integer NOT NULL CHECK (level_number >= 1),
  employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  escalation_time_minutes integer NOT NULL DEFAULT 30 CHECK (escalation_time_minutes > 0),
  notification_channels text[] DEFAULT ARRAY['push', 'email'],
  created_at timestamptz DEFAULT now(),
  UNIQUE (hierarchy_id, level_number)
);

CREATE TABLE IF NOT EXISTS ticket_escalation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  hierarchy_id uuid REFERENCES escalation_hierarchies(id) ON DELETE SET NULL,
  from_employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  to_employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_level integer,
  to_level integer,
  reason text DEFAULT 'timeout', -- 'timeout' | 'manual' | 'inactive_employee'
  escalated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    device_info TEXT,
    browser TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    deep_link TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    push_token TEXT,
    delivery_status VARCHAR(20),
    delivered_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL, -- ticket_assigned, sla_warning, admin_reminder
  recipient_role text NOT NULL, -- MST, ADMIN
  recipient_id uuid REFERENCES users(id),
  title text NOT NULL,
  body text NOT NULL,
  entity_id text,
  timestamp timestamptz DEFAULT now(),
  read boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS super_tenant_properties (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id     uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assigned_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now(),
    UNIQUE(user_id, property_id)
);

CREATE TABLE IF NOT EXISTS material_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by    uuid NOT NULL REFERENCES users(id),
    assignee_uid    uuid REFERENCES users(id),           -- procurement user handling this
    items           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ name, quantity, unit, notes, estimated_cost }]
    status          text NOT NULL DEFAULT 'pending',      -- pending | approved | ordered | delivered | cancelled | rejected
    priority        text DEFAULT 'medium',                -- low | medium | high | urgent
    total_estimated_cost numeric DEFAULT 0,
    notes           text,
    approved_by     uuid REFERENCES users(id),
    approved_at     timestamptz,
    ordered_at      timestamptz,
    delivered_at    timestamptz,
    cancelled_at    timestamptz,
    cancellation_reason text,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_orders (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_request_id uuid NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
    property_id       uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ordered_by        uuid NOT NULL REFERENCES users(id),
    vendor_name       text,                               -- external vendor/supplier name
    vendor_contact    text,
    items             jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ name, quantity, unit_price, total_price }]
    total_amount      numeric DEFAULT 0,
    invoice_number    text,
    invoice_url       text,                               -- Supabase storage URL for invoice scan
    payment_status    text DEFAULT 'unpaid',               -- unpaid | partial | paid
    delivery_status   text DEFAULT 'pending',              -- pending | in_transit | delivered | partial
    expected_delivery date,
    actual_delivery   date,
    notes             text,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_activity_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_request_id uuid REFERENCES material_requests(id) ON DELETE CASCADE,
    procurement_order_id uuid REFERENCES procurement_orders(id) ON DELETE CASCADE,
    user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
    action              text NOT NULL,                    -- 'created' | 'approved' | 'rejected' | 'ordered' | 'delivered' | 'cancelled' | 'comment'
    old_value           text,
    new_value           text,
    metadata            jsonb DEFAULT '{}'::jsonb,
    created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_master_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,
    si_no int,
    category text NOT NULL, -- e.g., 'Fire Safety', 'Statutory', 'Canteen'
    requirement text NOT NULL, -- The "Data Required" column
    spoc_name text, -- Friendly name from Excel
    assigned_spoc_id uuid REFERENCES auth.users(id), -- Linked user ID
    period text, -- e.g., 'as on date', 'Apr-25 to Mar-26'
    is_required_by_default boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property_audit_submissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    master_item_id uuid NOT NULL REFERENCES audit_master_items(id) ON DELETE CASCADE,
    property_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    status text DEFAULT 'missing' CHECK (status IN ('missing', 'pending_review', 'compliant', 'not_applicable')),
    remark text, -- The "Remarks" column from your sheet
    proof_url text, -- URL to the uploaded document (PDF/Photo)
    submitted_by uuid REFERENCES auth.users(id),
    submitted_at timestamptz,
    verified_by uuid REFERENCES auth.users(id),
    verified_at timestamptz,
    audit_period_year text DEFAULT '2025-26', -- For filtering yearly audits
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Ensure one submission per master item per property per period
    UNIQUE(master_item_id, property_id, audit_period_year)
);


`