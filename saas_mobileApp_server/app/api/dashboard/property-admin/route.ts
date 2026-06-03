import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { getCache, setCache, CACHE_TTL } from "@/lib/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    
    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const userId = auth.user.id;
    const cacheKey = `dashboard:property-admin:${propertyId}:${userId}`;

    // 1. Try to fetch from Redis Cache
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, source: "cache" });
    }

    // 2. Cache miss -> Fetch from Database
    const admin = createAdminClient();
    const isAll = propertyId === 'all';
    
    // Resolve which properties this user has access to if "all"
    let propIds: string[] = [];
    if (isAll) {
      // Find org memberships first
      const { data: orgMembership } = await admin
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', userId)
        .or('is_active.eq.true,is_active.is.null')
        .in('role', ['org_super_admin', 'org_admin', 'owner', 'super_tenant'])
        .limit(1)
        .maybeSingle();
        
      if (orgMembership?.organization_id) {
        const { data: props } = await admin
          .from('properties')
          .select('id')
          .eq('organization_id', orgMembership.organization_id);
        propIds = (props ?? []).map((p: any) => p.id);
      } else {
        return NextResponse.json({ error: "Unauthorized access to org properties" }, { status: 403 });
      }
    } else {
      const access = await getPropertyAccess(userId, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Access Denied to this Property" }, { status: 403 });
      }
      propIds = [propertyId];
    }

    if (propIds.length === 0) {
      return NextResponse.json({ success: true, data: null, source: "db" });
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // Build the bulk parallel queries
    const bulkQueries = Promise.all([
      // Property Name (only if single)
      isAll 
        ? Promise.resolve({ data: { name: 'All Properties Overview' } })
        : admin.from('properties').select('name').eq('id', propertyId).single(),
        
      // Recent Tickets
      admin.from('tickets')
        .select('id, title, status, priority, created_at, is_internal, photo_before_url')
        .in('property_id', propIds)
        .order('created_at', { ascending: false })
        .limit(100),
        
      // Active SOP Templates
      admin.from('sop_templates')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('is_active', true),
        
      // SOP Completions Today
      admin.from('sop_completions')
        .select('status', { count: 'exact' })
        .in('property_id', propIds)
        .eq('completion_date', todayStr)
        .eq('status', 'completed'),
        
      // Visitor Logs Today
      admin.from('visitor_logs')
        .select('status')
        .in('property_id', propIds),
        
      // Vendor Daily Revenue
      admin.from('vendor_daily_revenue')
        .select('revenue_amount, vendor_id')
        .in('property_id', propIds),
        
      // Total Tickets Count
      admin.from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds),
        
      // Open Tickets Count
      admin.from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .in('status', ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist', 'blocked']),
        
      // Closed Tickets Count
      admin.from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .in('status', ['resolved', 'closed']),
    ]);

    // Build the per-property parallel queries
    const perPropQueries = Promise.all(propIds.map(async (pid) => {
      const [elec, diesel, health, attention, funnel, ppm] = await Promise.all([
        admin.from('electricity_readings')
          .select('final_units, created_at')
          .eq('property_id', pid)
          .order('created_at', { ascending: false })
          .limit(2),
        admin.from('diesel_readings')
          .select('current_fuel_level, computed_consumed_litres')
          .eq('property_id', pid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin.rpc('get_property_health_score', { p_property_id: pid }),
        admin.rpc('get_attention_items', { p_property_id: pid, p_limit: 10 }),
        admin.rpc('get_ticket_funnel', { p_property_id: pid, p_days: 30 }),
        admin.rpc("get_ppm_stats", { prop_id: pid })
      ]);
      return { elec, diesel, health, attention, funnel, ppm };
    }));

    // Wait for all queries to execute
    const [
      [
        propRes, 
        ticketRes, 
        sopTemplatesRes, 
        sopCompletionsRes, 
        vmsRes, 
        revRes, 
        countTotalRes, 
        countOpenRes, 
        countClosedRes
      ], 
      perPropResults
    ] = await Promise.all([bulkQueries, perPropQueries]);

    // --- AGGREGATE RESULTS ---
    
    // VMS Stats
    let vmsStats = { total: 0, in: 0, out: 0 };
    if (vmsRes?.data) {
      const total = vmsRes.data.length;
      const checkedIn = vmsRes.data.filter((v: any) => v.status === 'checked_in').length;
      const checkedOut = vmsRes.data.filter((v: any) => v.status === 'checked_out').length;
      vmsStats = { total, in: checkedIn, out: checkedOut };
    }

    // Vendor Stats
    let vendorStats = { revenue: 0, commission: 0 };
    if (revRes?.data) {
      const totalRev = revRes.data.reduce((acc: number, row: any) => acc + (row.revenue_amount || 0), 0);
      vendorStats = { revenue: totalRev, commission: totalRev * 0.1 };
    }

    // Per Property Aggregation
    let totalElec = 0;
    let elecTrendSum = 0;
    let elecTrendCount = 0;
    let totalDieselLevel = 0;
    let totalDieselConsumption = 0;
    let dieselCount = 0;
    let healthSum = 0;
    let attentionArr: any[] = [];
    let funnelCounts: Record<string, number> = {};
    let pTotal = 0, pDone = 0, pPending = 0, pOverdue = 0, pPostponed = 0;

    perPropResults.forEach(res => {
      if (res.elec.data && Array.isArray(res.elec.data)) {
        const readings = res.elec.data as any[];
        const todayElec = readings[0]?.final_units || 0;
        const yesterdayElec = readings[1]?.final_units || 0;
        totalElec += todayElec;
        if (yesterdayElec > 0) {
          elecTrendSum += ((todayElec - yesterdayElec) / yesterdayElec) * 100;
          elecTrendCount++;
        }
      }
      if (res.diesel.data) {
        totalDieselLevel += (res.diesel.data.current_fuel_level || 0);
        totalDieselConsumption += (res.diesel.data.computed_consumed_litres || 0);
        dieselCount++;
      }
      if (res.health.data) healthSum += (res.health.data as number);
      if (res.attention.data) attentionArr.push(...(res.attention.data as any[]));
      
      if (res.funnel.data) {
        (res.funnel.data as any[]).forEach(fItem => {
          funnelCounts[fItem.status_label] = (funnelCounts[fItem.status_label] || 0) + fItem.ticket_count;
        });
      }
      
      if (res.ppm.data) {
        pTotal += res.ppm.data.total ?? 0;
        pDone += res.ppm.data.done ?? 0;
        pPending += res.ppm.data.pending ?? 0;
        pOverdue += res.ppm.data.overdue ?? 0;
        pPostponed += res.ppm.data.postponed ?? 0;
      }
    });

    // Derive final fields
    const healthScore = propIds.length > 0 ? Math.round(healthSum / propIds.length) : 100;
    const sortedAttention = attentionArr.sort((a, b) => {
      const score = (sev: string) => sev === 'critical' ? 3 : sev === 'high' ? 2 : 1;
      return score(b.severity) - score(a.severity);
    }).slice(0, 10);
    const ticketFunnel = Object.entries(funnelCounts).map(([status_label, ticket_count]) => ({ status_label, ticket_count }));

    const dashboardData = {
      propertyName: propRes?.data?.name ?? "",
      tickets: ticketRes.data ?? [],
      ticketCounts: {
        total: countTotalRes?.count ?? 0,
        open: countOpenRes?.count ?? 0,
        closed: countClosedRes?.count ?? 0,
      },
      sopTotal: sopTemplatesRes.count ?? 0,
      sopCount: sopCompletionsRes.count ?? 0,
      energyKwh: Math.round(totalElec),
      energyTrend: elecTrendCount > 0 ? Math.round(elecTrendSum / elecTrendCount) : null,
      healthScore,
      attentionItems: sortedAttention,
      ticketFunnel,
      vmsStats,
      vendorStats,
      dieselStats: {
        level: dieselCount > 0 ? Math.round(totalDieselLevel / dieselCount) : 0,
        consumption: Math.round(totalDieselConsumption),
      },
      ppmStats: {
        total: pTotal,
        done: pDone,
        pending: pPending,
        overdue: pOverdue,
        postponed: pPostponed
      },
      loadedPropertyId: propertyId,
      lastUpdatedAt: Date.now(),
    };

    // 3. Store in Redis
    await setCache(cacheKey, dashboardData, CACHE_TTL.HOT);

    return NextResponse.json({ success: true, data: dashboardData, source: "db" });
  } catch (error) {
    console.error("[saas-mobile-server] property-admin dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
