-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 1: Dashboard Intelligence Foundation
-- Date: 2026-05-14
-- Purpose: Indexes, activity_log table, and RPC functions for the Property
--          Admin Dashboard leadership cockpit.
-- ═══════════════════════════════════════════════════════════════════════════════

-- fix: ensure visitor_logs has purpose column (expected by app code)
alter table if exists visitor_logs
add column if not exists purpose text;

-- ─── 1. INDEXES ───────────────────────────────────────────────────────────────
-- These indexes accelerate the dashboard's real-time aggregation queries.

CREATE INDEX IF NOT EXISTS idx_tickets_property_status_priority
    ON tickets (property_id, status, priority);

CREATE INDEX IF NOT EXISTS idx_tickets_property_assigned_status
    ON tickets (property_id, assigned_to, status)
    WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_property_created_at
    ON tickets (property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_property_resolved_at
    ON tickets (property_id, resolved_at DESC)
    WHERE resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline
    ON tickets (property_id, sla_deadline)
    WHERE sla_breached = false AND status NOT IN ('resolved', 'closed', 'satisfied');

CREATE INDEX IF NOT EXISTS idx_tickets_stale
    ON tickets (property_id, created_at)
    WHERE status NOT IN ('resolved', 'closed', 'satisfied');

CREATE INDEX IF NOT EXISTS idx_sop_completions_property_status
    ON sop_completions (property_id, status);

CREATE INDEX IF NOT EXISTS idx_visitor_logs_property_checkin
    ON visitor_logs (property_id, checkin_time DESC);

-- ─── 2. GENERAL ACTIVITY LOG ──────────────────────────────────────────────────
-- Unified append-only log for the dashboard "Recent Activity" feed.
-- Unlike ticket_activity_log (which is ticket-scoped), this is property-scoped.

CREATE TABLE IF NOT EXISTS activity_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id        uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_name      text,          -- denormalized for fast reads
    actor_role      text,          -- denormalized for fast reads
    action_type     text NOT NULL, -- 'ticket_created', 'ticket_resolved', 'visitor_checkin',
                                   -- 'sop_completed', 'meter_reading', 'staff_checkin', etc.
    entity_type     text NOT NULL, -- 'ticket', 'visitor', 'sop', 'meter', 'staff'
    entity_id       uuid,          -- FK to the specific entity (optional)
    entity_title    text,          -- human-readable title (e.g. ticket title)
    metadata        jsonb DEFAULT '{}',
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_property_created
    ON activity_log (property_id, created_at DESC);

-- Row Level Security
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_log_select_policy ON activity_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM property_memberships pm
            WHERE pm.property_id = activity_log.property_id
              AND pm.user_id = auth.uid()
              AND pm.is_active = true
        )
    );

-- ─── 3. RPC: PROPERTY HEALTH SCORE ────────────────────────────────────────────
-- Returns a JSON object: { score, breakdown: [{ component, value, weight, impact }] }

CREATE OR REPLACE FUNCTION get_property_health_score(p_property_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_score           numeric := 100;
    v_breakdown       jsonb := '[]';
    v_open_critical   int;
    v_open_high       int;
    v_sla_risk        int;
    v_unassigned      int;
    v_stale           int;
    v_sop_total       int;
    v_sop_completed   int;
    v_sop_pct         numeric;
    v_avg_res_hours   numeric;
    v_total_open      int;
BEGIN
    -- Open critical tickets
    SELECT COUNT(*) INTO v_open_critical
    FROM tickets
    WHERE property_id = p_property_id
      AND status NOT IN ('resolved', 'closed', 'satisfied')
      AND priority = 'critical';

    -- Open high tickets
    SELECT COUNT(*) INTO v_open_high
    FROM tickets
    WHERE property_id = p_property_id
      AND status NOT IN ('resolved', 'closed', 'satisfied')
      AND priority = 'high';

    -- SLA risk: breaching within 4 hours
    SELECT COUNT(*) INTO v_sla_risk
    FROM tickets
    WHERE property_id = p_property_id
      AND sla_breached = false
      AND status NOT IN ('resolved', 'closed', 'satisfied')
      AND sla_deadline IS NOT NULL
      AND sla_deadline <= (now() + interval '4 hours');

    -- Unassigned open tickets
    SELECT COUNT(*) INTO v_unassigned
    FROM tickets
    WHERE property_id = p_property_id
      AND status IN ('open', 'assigned')
      AND assigned_to IS NULL;

    -- Stale tickets (> 7 days open)
    SELECT COUNT(*) INTO v_stale
    FROM tickets
    WHERE property_id = p_property_id
      AND status NOT IN ('resolved', 'closed', 'satisfied')
      AND created_at < (now() - interval '7 days');

    -- SOP compliance
    SELECT COUNT(*) INTO v_sop_total
    FROM sop_completions
    WHERE property_id = p_property_id
      AND created_at >= date_trunc('day', now());

    SELECT COUNT(*) INTO v_sop_completed
    FROM sop_completions
    WHERE property_id = p_property_id
      AND status = 'completed'
      AND created_at >= date_trunc('day', now());

    v_sop_pct := CASE WHEN v_sop_total > 0
                      THEN (v_sop_completed::numeric / v_sop_total) * 100
                      ELSE 100 END;

    -- Avg resolution time (last 30 days, hours)
    SELECT COALESCE(
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600),
        0
    ) INTO v_avg_res_hours
    FROM tickets
    WHERE property_id = p_property_id
      AND resolved_at IS NOT NULL
      AND created_at >= (now() - interval '30 days');

    -- Total open
    SELECT COUNT(*) INTO v_total_open
    FROM tickets
    WHERE property_id = p_property_id
      AND status NOT IN ('resolved', 'closed', 'satisfied');

    -- Build breakdown array
    v_breakdown := jsonb_build_array(
        jsonb_build_object('component', 'open_critical', 'value', v_open_critical, 'weight', 8, 'impact', (v_open_critical * 8)),
        jsonb_build_object('component', 'open_high', 'value', v_open_high, 'weight', 4, 'impact', (v_open_high * 4)),
        jsonb_build_object('component', 'sla_risk', 'value', v_sla_risk, 'weight', 6, 'impact', (v_sla_risk * 6)),
        jsonb_build_object('component', 'unassigned', 'value', v_unassigned, 'weight', 3, 'impact', (v_unassigned * 3)),
        jsonb_build_object('component', 'stale_tickets', 'value', v_stale, 'weight', 2, 'impact', (v_stale * 2)),
        jsonb_build_object('component', 'sop_compliance_pct', 'value', round(v_sop_pct, 1), 'weight', 0.5, 'impact', round((100.0 - v_sop_pct) * 0.5, 1)),
        jsonb_build_object('component', 'avg_resolution_hours', 'value', round(v_avg_res_hours, 1), 'weight', 1, 'impact', CASE WHEN v_avg_res_hours > 48.0 THEN round((v_avg_res_hours - 48.0) * 0.5, 1) ELSE 0.0 END),
        jsonb_build_object('component', 'total_open', 'value', v_total_open, 'weight', 0, 'impact', 0)
    );

    -- Compute score
    v_score := GREATEST(0, 100
        - (v_open_critical * 8)
        - (v_open_high * 4)
        - (v_sla_risk * 6)
        - (v_unassigned * 3)
        - (v_stale * 2)
        - ((100 - v_sop_pct) * 0.5)
        - CASE WHEN v_avg_res_hours > 48 THEN (v_avg_res_hours - 48) * 0.5 ELSE 0 END
    );

    RETURN jsonb_build_object(
        'score', round(v_score, 0),
        'total_open', v_total_open,
        'sla_risk', v_sla_risk,
        'stale', v_stale,
        'sop_compliance_pct', round(v_sop_pct, 1),
        'avg_resolution_hours', round(v_avg_res_hours, 1),
        'breakdown', v_breakdown
    );
END;
$$;

-- ─── 4. RPC: TICKET FUNNEL ────────────────────────────────────────────────────
-- Returns counts and avg hours spent in each status for tickets created in N days.

CREATE OR REPLACE FUNCTION get_ticket_funnel(p_property_id uuid, p_days int DEFAULT 30)
RETURNS TABLE (
    status_label text,
    ticket_count bigint,
    avg_hours numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT
        t.status AS status_label,
        COUNT(*) AS ticket_count,
        ROUND(
            COALESCE(AVG(
                CASE
                    WHEN t.resolved_at IS NOT NULL THEN
                        EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
                    ELSE
                        EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600
                END
            ), 0)::numeric,
            1
        ) AS avg_hours
    FROM tickets t
    WHERE t.property_id = p_property_id
      AND t.created_at >= (now() - (p_days || ' days')::interval)
    GROUP BY t.status
    ORDER BY
        CASE t.status
            WHEN 'open' THEN 1
            WHEN 'assigned' THEN 2
            WHEN 'in_progress' THEN 3
            WHEN 'paused' THEN 4
            WHEN 'pending_validation' THEN 5
            WHEN 'resolved' THEN 6
            WHEN 'closed' THEN 7
            WHEN 'satisfied' THEN 8
            ELSE 9
        END;
$$;

-- ─── 5. RPC: ATTENTION ITEMS ──────────────────────────────────────────────────
-- Returns ranked list of items requiring leadership action.

CREATE OR REPLACE FUNCTION get_attention_items(p_property_id uuid, p_limit int DEFAULT 10)
RETURNS TABLE (
    id uuid,
    severity text,      -- 'critical', 'high', 'medium', 'low'
    type text,          -- 'sla_risk', 'unassigned_critical', 'unassigned_high',
                        -- 'stale_ticket', 'sop_missed', 'energy_spike'
    title text,
    description text,
    entity_type text,   -- 'ticket', 'sop', 'visitor', 'staff'
    entity_id uuid,
    action_label text,  -- "Assign Now", "Review", "Dismiss"
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    -- 1. SLA risk: tickets breaching within 4 hours
    SELECT
        t.id,
        'critical'::text AS severity,
        'sla_risk'::text AS type,
        'SLA Breach Imminent'::text AS title,
        ('Ticket #' || COALESCE(t.ticket_number, t.id::text) || ' "' || LEFT(t.title, 40) || '" will breach SLA in ' ||
         ROUND(EXTRACT(EPOCH FROM (t.sla_deadline - now())) / 60, 0) || ' minutes')::text AS description,
        'ticket'::text AS entity_type,
        t.id AS entity_id,
        'Assign Now'::text AS action_label,
        t.created_at
    FROM tickets t
    WHERE t.property_id = p_property_id
      AND t.sla_breached = false
      AND t.status NOT IN ('resolved', 'closed', 'satisfied')
      AND t.sla_deadline IS NOT NULL
      AND t.sla_deadline <= (now() + interval '4 hours')

    UNION ALL

    -- 2. Critical tickets unassigned
    SELECT
        t.id,
        'critical'::text AS severity,
        'unassigned_critical'::text AS type,
        'Critical Ticket Unassigned'::text AS title,
        ('Ticket #' || COALESCE(t.ticket_number, t.id::text) || ' "' || LEFT(t.title, 40) || '" has been unassigned for ' ||
         ROUND(EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600, 1) || ' hours')::text AS description,
        'ticket'::text AS entity_type,
        t.id AS entity_id,
        'Assign Now'::text AS action_label,
        t.created_at
    FROM tickets t
    WHERE t.property_id = p_property_id
      AND t.status IN ('open', 'assigned')
      AND t.assigned_to IS NULL
      AND t.priority = 'critical'
      AND t.created_at < (now() - interval '1 hour')

    UNION ALL

    -- 3. High tickets unassigned
    SELECT
        t.id,
        'high'::text AS severity,
        'unassigned_high'::text AS type,
        'High Priority Ticket Unassigned'::text AS title,
        ('Ticket #' || COALESCE(t.ticket_number, t.id::text) || ' "' || LEFT(t.title, 40) || '" has been unassigned for ' ||
         ROUND(EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600, 1) || ' hours')::text AS description,
        'ticket'::text AS entity_type,
        t.id AS entity_id,
        'Assign Now'::text AS action_label,
        t.created_at
    FROM tickets t
    WHERE t.property_id = p_property_id
      AND t.status IN ('open', 'assigned')
      AND t.assigned_to IS NULL
      AND t.priority = 'high'
      AND t.created_at < (now() - interval '2 hours')

    UNION ALL

    -- 4. Stale tickets (> 7 days open)
    SELECT
        t.id,
        CASE
            WHEN t.priority = 'critical' THEN 'critical'
            WHEN t.priority = 'high' THEN 'high'
            ELSE 'medium'
        END::text AS severity,
        'stale_ticket'::text AS type,
        'Stale Ticket'::text AS title,
        ('Ticket #' || COALESCE(t.ticket_number, t.id::text) || ' "' || LEFT(t.title, 40) || '" has been open for ' ||
         ROUND(EXTRACT(EPOCH FROM (now() - t.created_at)) / 86400, 0) || ' days')::text AS description,
        'ticket'::text AS entity_type,
        t.id AS entity_id,
        'Review'::text AS action_label,
        t.created_at
    FROM tickets t
    WHERE t.property_id = p_property_id
      AND t.status NOT IN ('resolved', 'closed', 'satisfied')
      AND t.created_at < (now() - interval '7 days')

    UNION ALL

    -- 5. SOP missed today (incomplete checklists)
    SELECT
        sc.id,
        'medium'::text AS severity,
        'sop_missed'::text AS type,
        'SOP Checklist Missed'::text AS title,
        ('SOP checklist was not completed today')::text AS description,
        'sop'::text AS entity_type,
        sc.id AS entity_id,
        'Review'::text AS action_label,
        sc.created_at
    FROM sop_completions sc
    WHERE sc.property_id = p_property_id
      AND sc.status != 'completed'
      AND sc.created_at >= date_trunc('day', now())

    ORDER BY
        CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
        END,
        created_at ASC
    LIMIT p_limit;
$$;

-- ─── 6. RPC: RECENT ACTIVITY ──────────────────────────────────────────────────
-- Returns unified recent activity for a property (uses activity_log + falls back to tickets/visitors/sops).

CREATE OR REPLACE FUNCTION get_recent_activity(p_property_id uuid, p_limit int DEFAULT 20)
RETURNS TABLE (
    id uuid,
    actor_name text,
    actor_role text,
    action_type text,
    entity_type text,
    entity_title text,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    -- From activity_log (preferred, denormalized)
    SELECT
        al.id,
        al.actor_name,
        al.actor_role,
        al.action_type,
        al.entity_type,
        al.entity_title,
        al.created_at
    FROM activity_log al
    WHERE al.property_id = p_property_id

    UNION ALL

    -- Fallback: tickets created today
    SELECT
        t.id,
        COALESCE(u.full_name, 'Unknown')::text,
        COALESCE(pm.role::text, 'member')::text,
        'ticket_created'::text,
        'ticket'::text,
        LEFT(t.title, 60)::text,
        t.created_at
    FROM tickets t
    LEFT JOIN users u ON u.id = t.raised_by
    LEFT JOIN property_memberships pm ON pm.user_id = t.raised_by AND pm.property_id = t.property_id
    WHERE t.property_id = p_property_id
      AND t.created_at >= date_trunc('day', now())

    UNION ALL

    -- Fallback: tickets resolved today
    SELECT
        t.id,
        COALESCE(u.full_name, 'Unknown')::text,
        COALESCE(pm.role::text, 'member')::text,
        'ticket_resolved'::text,
        'ticket'::text,
        LEFT(t.title, 60)::text,
        t.resolved_at
    FROM tickets t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN property_memberships pm ON pm.user_id = t.assigned_to AND pm.property_id = t.property_id
    WHERE t.property_id = p_property_id
      AND t.resolved_at >= date_trunc('day', now())

    UNION ALL

    -- Fallback: visitors checked in today
    SELECT
        v.id,
        COALESCE(v.name, 'Guest')::text,
        'guest'::text,
        'visitor_checkin'::text,
        'visitor'::text,
        ('Visit: ' || COALESCE(v.purpose, 'General'))::text,
        v.checkin_time
    FROM visitor_logs v
    WHERE v.property_id = p_property_id
      AND v.checkin_time >= date_trunc('day', now())

    ORDER BY created_at DESC
    LIMIT p_limit;
$$;

-- ─── 7. TRIGGER: AUTO-LOG TICKET ACTIVITY ─────────────────────────────────────
-- Automatically writes to activity_log when a ticket is created or resolved.

CREATE OR REPLACE FUNCTION trigger_log_ticket_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_name text;
    v_actor_role text;
BEGIN
    -- Get actor info
    SELECT u.full_name, COALESCE(pm.role::text, 'member')
    INTO v_actor_name, v_actor_role
    FROM users u
    LEFT JOIN property_memberships pm ON pm.user_id = COALESCE(NEW.raised_by, NEW.assigned_to)
                                        AND pm.property_id = NEW.property_id
    WHERE u.id = COALESCE(NEW.raised_by, NEW.assigned_to);

    IF TG_OP = 'INSERT' THEN
        INSERT INTO activity_log (
            property_id, organization_id, actor_id, actor_name, actor_role,
            action_type, entity_type, entity_id, entity_title
        ) VALUES (
            NEW.property_id, NEW.organization_id, NEW.raised_by, v_actor_name, v_actor_role,
            'ticket_created', 'ticket', NEW.id, LEFT(NEW.title, 100)
        );
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Log resolution
        IF OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN
            INSERT INTO activity_log (
                property_id, organization_id, actor_id, actor_name, actor_role,
                action_type, entity_type, entity_id, entity_title
            ) VALUES (
                NEW.property_id, NEW.organization_id, NEW.assigned_to, v_actor_name, v_actor_role,
                'ticket_resolved', 'ticket', NEW.id, LEFT(NEW.title, 100)
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ticket_activity ON tickets;
CREATE TRIGGER trg_log_ticket_activity
    AFTER INSERT OR UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_log_ticket_activity();
