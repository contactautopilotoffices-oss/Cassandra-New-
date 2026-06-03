-- phase 2: ticket intelligence rpc functions

-- priority breakdown

create or replace function
get_ticket_priority_breakdown(p_property_id uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_object_agg(
    coalesce(t.priority, 'unknown'),
    t.cnt
  )
  from (
    select priority, count(*) as cnt
    from tickets
    where property_id = p_property_id
      and status not in (
        'resolved', 'closed', 'satisfied'
      )
    group by priority
  ) t;
$$;


-- category breakdown

create or replace function
get_ticket_category_breakdown(
  p_property_id uuid,
  p_days int default 30
)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_object_agg(
    coalesce(t.category, 'uncategorized'),
    t.cnt
  )
  from (
    select category, count(*) as cnt
    from tickets
    where property_id = p_property_id
      and created_at >= (
        now() - (p_days || ' days')::interval
      )
    group by category
  ) t;
$$;


-- today's flow

create or replace function
get_todays_ticket_flow(p_property_id uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'created_today', (
      select count(*)
      from tickets
      where property_id = p_property_id
        and created_at >= date_trunc('day', now())
    ),
    'resolved_today', (
      select count(*)
      from tickets
      where property_id = p_property_id
        and resolved_at >= date_trunc('day', now())
    ),
    'created_this_week', (
      select count(*)
      from tickets
      where property_id = p_property_id
        and created_at >= date_trunc('week', now())
    ),
    'resolved_this_week', (
      select count(*)
      from tickets
      where property_id = p_property_id
        and resolved_at >= date_trunc('week', now())
    )
  );
$$;


-- top raisers

create or replace function
get_top_ticket_raisers(
  p_property_id uuid,
  p_days int default 30,
  p_limit int default 5
)
returns table (
  user_id uuid,
  full_name text,
  role text,
  ticket_count bigint
)
language sql
security definer
stable
as $$
  select
    t.raised_by as user_id,
    u.full_name,
    pm.role,
    count(*) as ticket_count
  from tickets t
  left join users u on u.id = t.raised_by
  left join property_memberships pm
    on pm.user_id = t.raised_by
    and pm.property_id = t.property_id
  where t.property_id = p_property_id
    and t.created_at >= (
      now() - (p_days || ' days')::interval
    )
  group by t.raised_by, u.full_name, pm.role
  order by count(*) desc
  limit p_limit;
$$;


-- top resolvers

create or replace function
get_top_ticket_resolvers(
  p_property_id uuid,
  p_days int default 30,
  p_limit int default 5
)
returns table (
  user_id uuid,
  full_name text,
  role text,
  ticket_count bigint,
  avg_resolution_hours numeric
)
language sql
security definer
stable
as $$
  select
    t.assigned_to as user_id,
    u.full_name,
    pm.role,
    count(*) as ticket_count,
    round(avg(
      extract(
        epoch from (
          t.resolved_at - t.created_at
        )
      ) / 3600
    ), 1) as avg_resolution_hours
  from tickets t
  left join users u on u.id = t.assigned_to
  left join property_memberships pm
    on pm.user_id = t.assigned_to
    and pm.property_id = t.property_id
  where t.property_id = p_property_id
    and t.resolved_at is not null
    and t.resolved_at >= (
      now() - (p_days || ' days')::interval
    )
  group by t.assigned_to, u.full_name, pm.role
  order by count(*) desc
  limit p_limit;
$$;


-- staff performance summary

create or replace function
get_staff_performance_summary(
  p_property_id uuid,
  p_days int default 30
)
returns table (
  user_id uuid,
  full_name text,
  role text,
  tickets_resolved bigint,
  tickets_assigned bigint,
  avg_resolution_hours numeric,
  sla_compliance_pct numeric
)
language sql
security definer
stable
as $$
  select
    pm.user_id,
    u.full_name,
    pm.role,
    coalesce(resolved.count, 0) as tickets_resolved,
    coalesce(assigned.count, 0) as tickets_assigned,
    coalesce(resolved.avg_hours, 0) as avg_resolution_hours,
    coalesce(
      round(
        resolved.sla_met::numeric
        / nullif(resolved.count, 0)
        * 100,
        1
      ),
      0
    ) as sla_compliance_pct
  from property_memberships pm
  join users u on u.id = pm.user_id
  left join (
    select
      assigned_to as user_id,
      count(*) as count,
      avg(
        extract(
          epoch from (
            resolved_at - created_at
          )
        ) / 3600
      ) as avg_hours,
      count(*) filter (
        where sla_breached = false
      ) as sla_met
    from tickets
    where property_id = p_property_id
      and resolved_at is not null
      and resolved_at >= (
        now() - (p_days || ' days')::interval
      )
    group by assigned_to
  ) resolved on resolved.user_id = pm.user_id
  left join (
    select assigned_to as user_id, count(*) as count
    from tickets
    where property_id = p_property_id
      and status not in (
        'resolved', 'closed', 'satisfied'
      )
    group by assigned_to
  ) assigned on assigned.user_id = pm.user_id
  where pm.property_id = p_property_id
    and pm.is_active = true
  order by coalesce(resolved.count, 0) desc;
$$;
