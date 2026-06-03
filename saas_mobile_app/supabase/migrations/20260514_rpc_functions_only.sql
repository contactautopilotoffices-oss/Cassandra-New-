-- rpc functions only
-- no indexes, no rls, no triggers

-- fix: ensure visitor_logs has purpose column (expected by app code)
alter table if exists visitor_logs
add column if not exists purpose text;

-- 1. property health score

create or replace function
get_property_health_score(
  p_property_id uuid
)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_score numeric := 100;
  v_breakdown jsonb := '[]';
  v_open_critical int;
  v_open_high int;
  v_sla_risk int;
  v_unassigned int;
  v_stale int;
  v_sop_total int;
  v_sop_completed int;
  v_sop_pct numeric;
  v_avg_res_hours numeric;
  v_total_open int;
begin
  select count(*) into v_open_critical
  from tickets
  where property_id = p_property_id
    and status not in (
      'resolved', 'closed',
      'satisfied'
    )
    and priority = 'critical';

  select count(*) into v_open_high
  from tickets
  where property_id = p_property_id
    and status not in (
      'resolved', 'closed',
      'satisfied'
    )
    and priority = 'high';

  select count(*) into v_sla_risk
  from tickets
  where property_id = p_property_id
    and sla_breached = false
    and status not in (
      'resolved', 'closed',
      'satisfied'
    )
    and sla_deadline is not null
    and sla_deadline <= (
      now() + interval '4 hours'
    );

  select count(*) into v_unassigned
  from tickets
  where property_id = p_property_id
    and status in (
      'open', 'assigned'
    )
    and assigned_to is null;

  select count(*) into v_stale
  from tickets
  where property_id = p_property_id
    and status not in (
      'resolved', 'closed',
      'satisfied'
    )
    and created_at < (
      now() - interval '7 days'
    );

  select count(*) into v_sop_total
  from sop_completions
  where property_id = p_property_id
    and created_at >= date_trunc(
      'day', now()
    );

  select count(*) into v_sop_completed
  from sop_completions
  where property_id = p_property_id
    and status = 'completed'
    and created_at >= date_trunc(
      'day', now()
    );

  v_sop_pct := case
    when v_sop_total > 0
    then (
      v_sop_completed::numeric
      / v_sop_total
    ) * 100
    else 100
  end;

  select coalesce(
    avg(
      extract(
        epoch from (
          resolved_at - created_at
        )
      ) / 3600
    ),
    0
  ) into v_avg_res_hours
  from tickets
  where property_id = p_property_id
    and resolved_at is not null
    and created_at >= (
      now() - interval '30 days'
    );

  select count(*) into v_total_open
  from tickets
  where property_id = p_property_id
    and status not in (
      'resolved', 'closed',
      'satisfied'
    );

  v_breakdown := jsonb_build_array(
    jsonb_build_object(
      'component', 'open_critical',
      'value', v_open_critical,
      'weight', 8,
      'impact', v_open_critical * 8
    ),
    jsonb_build_object(
      'component', 'open_high',
      'value', v_open_high,
      'weight', 4,
      'impact', v_open_high * 4
    ),
    jsonb_build_object(
      'component', 'sla_risk',
      'value', v_sla_risk,
      'weight', 6,
      'impact', v_sla_risk * 6
    ),
    jsonb_build_object(
      'component', 'unassigned',
      'value', v_unassigned,
      'weight', 3,
      'impact', v_unassigned * 3
    ),
    jsonb_build_object(
      'component', 'stale_tickets',
      'value', v_stale,
      'weight', 2,
      'impact', v_stale * 2
    ),
    jsonb_build_object(
      'component', 'sop_compliance_pct',
      'value', round(v_sop_pct, 1),
      'weight', 0.5,
      'impact', round(
        (100.0 - v_sop_pct) * 0.5,
        1
      )
    ),
    jsonb_build_object(
      'component', 'avg_resolution_hours',
      'value', round(v_avg_res_hours, 1),
      'weight', 1,
      'impact', case
        when v_avg_res_hours > 48.0
        then round(
          (v_avg_res_hours - 48.0) * 0.5,
          1
        )
        else 0.0
      end
    ),
    jsonb_build_object(
      'component', 'total_open',
      'value', v_total_open,
      'weight', 0,
      'impact', 0
    )
  );

  v_score := greatest(0, 100
    - v_open_critical * 8
    - v_open_high * 4
    - v_sla_risk * 6
    - v_unassigned * 3
    - v_stale * 2
    - (100 - v_sop_pct) * 0.5
    - case
      when v_avg_res_hours > 48
      then (v_avg_res_hours - 48) * 0.5
      else 0
    end
  );

  return jsonb_build_object(
    'score', round(v_score, 0),
    'total_open', v_total_open,
    'sla_risk', v_sla_risk,
    'stale', v_stale,
    'sop_compliance_pct',
    round(v_sop_pct, 1),
    'avg_resolution_hours',
    round(v_avg_res_hours, 1),
    'breakdown', v_breakdown
  );
end;
$$;


-- 2. ticket funnel

create or replace function
get_ticket_funnel(
  p_property_id uuid,
  p_days int default 30
)
returns table (
  status_label text,
  ticket_count bigint,
  avg_hours numeric
)
language sql
security definer
stable
as $$
  select
    t.status as status_label,
    count(*) as ticket_count,
    round(
      coalesce(avg(
        case
          when t.resolved_at is not null
          then extract(
            epoch from (
              t.resolved_at - t.created_at
            )
          ) / 3600
          else extract(
            epoch from (
              now() - t.created_at
            )
          ) / 3600
        end
      ), 0)::numeric,
      1
    ) as avg_hours
  from tickets t
  where t.property_id = p_property_id
    and t.created_at >= (
      now()
      - (p_days || ' days')::interval
    )
  group by t.status
  order by case t.status
    when 'open' then 1
    when 'assigned' then 2
    when 'in_progress' then 3
    when 'paused' then 4
    when 'pending_validation' then 5
    when 'resolved' then 6
    when 'closed' then 7
    when 'satisfied' then 8
    else 9
  end;
$$;


-- 3. attention items

create or replace function
get_attention_items(
  p_property_id uuid,
  p_limit int default 10
)
returns table (
  id uuid,
  severity text,
  type text,
  title text,
  description text,
  entity_type text,
  entity_id uuid,
  action_label text,
  created_at timestamptz
)
language sql
security definer
stable
as $$
  select * from (

    -- sla risk
    select
      t.id,
      'critical'::text as severity,
      'sla_risk'::text as type,
      'SLA Breach Imminent'::text as title,
      (
        'Ticket #'
        || coalesce(t.ticket_number, t.id::text)
        || ' "'
        || left(t.title, 40)
        || '" will breach SLA in '
        || round(
          extract(
            epoch from (
              t.sla_deadline - now()
            )
          ) / 60,
          0
        )
        || ' minutes'
      )::text as description,
      'ticket'::text as entity_type,
      t.id as entity_id,
      'Assign Now'::text as action_label,
      t.created_at
    from tickets t
    where t.property_id = p_property_id
      and t.sla_breached = false
      and t.status not in (
        'resolved', 'closed',
        'satisfied'
      )
      and t.sla_deadline is not null
      and t.sla_deadline <= (
        now() + interval '4 hours'
      )

    union all

    -- critical unassigned
    select
      t.id,
      'critical'::text as severity,
      'unassigned_critical'::text as type,
      'Critical Ticket Unassigned'::text as title,
      (
        'Ticket #'
        || coalesce(t.ticket_number, t.id::text)
        || ' "'
        || left(t.title, 40)
        || '" has been unassigned for '
        || round(
          extract(
            epoch from (
              now() - t.created_at
            )
          ) / 3600,
          1
        )
        || ' hours'
      )::text as description,
      'ticket'::text as entity_type,
      t.id as entity_id,
      'Assign Now'::text as action_label,
      t.created_at
    from tickets t
    where t.property_id = p_property_id
      and t.status in ('open', 'assigned')
      and t.assigned_to is null
      and t.priority = 'critical'
      and t.created_at < (
        now() - interval '1 hour'
      )

    union all

    -- high unassigned
    select
      t.id,
      'high'::text as severity,
      'unassigned_high'::text as type,
      'High Priority Ticket Unassigned'::text as title,
      (
        'Ticket #'
        || coalesce(t.ticket_number, t.id::text)
        || ' "'
        || left(t.title, 40)
        || '" has been unassigned for '
        || round(
          extract(
            epoch from (
              now() - t.created_at
            )
          ) / 3600,
          1
        )
        || ' hours'
      )::text as description,
      'ticket'::text as entity_type,
      t.id as entity_id,
      'Assign Now'::text as action_label,
      t.created_at
    from tickets t
    where t.property_id = p_property_id
      and t.status in ('open', 'assigned')
      and t.assigned_to is null
      and t.priority = 'high'
      and t.created_at < (
        now() + interval '2 hours'
      )

    union all

    -- stale tickets
    select
      t.id,
      case
        when t.priority = 'critical'
        then 'critical'
        when t.priority = 'high'
        then 'high'
        else 'medium'
      end::text as severity,
      'stale_ticket'::text as type,
      'Stale Ticket'::text as title,
      (
        'Ticket #'
        || coalesce(t.ticket_number, t.id::text)
        || ' "'
        || left(t.title, 40)
        || '" has been open for '
        || round(
          extract(
            epoch from (
              now() - t.created_at
            )
          ) / 86400,
          0
        )
        || ' days'
      )::text as description,
      'ticket'::text as entity_type,
      t.id as entity_id,
      'Review'::text as action_label,
      t.created_at
    from tickets t
    where t.property_id = p_property_id
      and t.status not in (
        'resolved', 'closed',
        'satisfied'
      )
      and t.created_at < (
        now() - interval '7 days'
      )

    union all

    -- sop missed
    select
      sc.id,
      'medium'::text as severity,
      'sop_missed'::text as type,
      'SOP Checklist Missed'::text as title,
      'SOP checklist was not completed today'
      ::text as description,
      'sop'::text as entity_type,
      sc.id as entity_id,
      'Review'::text as action_label,
      sc.created_at
    from sop_completions sc
    where sc.property_id = p_property_id
      and sc.status != 'completed'
      and sc.created_at >= date_trunc(
        'day', now()
      )

  ) as items
  order by case items.severity
    when 'critical' then 1
    when 'high' then 2
    when 'medium' then 3
    when 'low' then 4
  end,
  items.created_at asc
  limit p_limit;
$$;


-- 4. recent activity

create or replace function
get_recent_activity(
  p_property_id uuid,
  p_limit int default 20
)
returns table (
  id uuid,
  actor_name text,
  actor_role text,
  action_type text,
  entity_type text,
  entity_title text,
  created_at timestamptz
)
language sql
security definer
stable
as $$

  -- tickets created today
  select
    t.id,
    coalesce(u.full_name, 'Unknown')::text,
    coalesce(pm.role::text, 'member')::text,
    'ticket_created'::text,
    'ticket'::text,
    left(t.title, 60)::text,
    t.created_at
  from tickets t
  left join users u on u.id = t.raised_by
  left join property_memberships pm
    on pm.user_id = t.raised_by
    and pm.property_id = t.property_id
  where t.property_id = p_property_id
    and t.created_at >= date_trunc(
      'day', now()
    )

  union all

  -- tickets resolved today
  select
    t.id,
    coalesce(u.full_name, 'Unknown')::text,
    coalesce(pm.role::text, 'member')::text,
    'ticket_resolved'::text,
    'ticket'::text,
    left(t.title, 60)::text,
    t.resolved_at
  from tickets t
  left join users u on u.id = t.assigned_to
  left join property_memberships pm
    on pm.user_id = t.assigned_to
    and pm.property_id = t.property_id
  where t.property_id = p_property_id
    and t.resolved_at >= date_trunc(
      'day', now()
    )

  union all

  -- visitors checked in today
  select
    v.id,
    coalesce(v.name, 'Guest')::text,
    'guest'::text,
    'visitor_checkin'::text,
    'visitor'::text,
    (
      'Visit: '
      || coalesce(v.purpose, 'General')
    )::text,
    v.checkin_time
  from visitor_logs v
  where v.property_id = p_property_id
    and v.checkin_time >= date_trunc(
      'day', now()
    )

  order by created_at desc
  limit p_limit;
$$;
