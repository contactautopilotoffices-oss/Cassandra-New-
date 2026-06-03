import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCache, setCache, CACHE_TTL } from "@/lib/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;
    const cacheKey = `dashboard:super-admin:${userId}`;

    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, source: "cache" });
    }

    const admin = createAdminClient();

    const url = new URL(request.url);
    const urlOrgId = url.searchParams.get("orgId");
    
    let resolvedOrgId = urlOrgId;

    if (!resolvedOrgId) {
      // 1. Resolve Org ID
      const { data: orgMembership } = await admin
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', userId)
        .or('is_active.eq.true,is_active.is.null')
        .in('role', ['org_super_admin', 'org_admin', 'owner', 'super_tenant'])
        .limit(1)
        .maybeSingle();
      
      resolvedOrgId = orgMembership?.organization_id;
    }

    // 2. Fetch Organizations
    let orgQuery = admin
      .from('organizations')
      .select('*, properties(count)')
      .order('created_at', { ascending: false });
      
    if (resolvedOrgId) {
      orgQuery = orgQuery.eq('id', resolvedOrgId);
    }
    
    const { data: orgs } = await orgQuery;

    // 3. Fetch Properties
    let propQuery = admin
      .from('properties')
      .select('id, name, code, address, image_url, organization_id');
      
    if (resolvedOrgId) {
      propQuery = propQuery.eq('organization_id', resolvedOrgId);
    }
    
    const { data: propData } = await propQuery;

    const propertiesList = propData ?? [];
    if (propertiesList.length === 0) {
      return NextResponse.json({ 
        success: true, 
        data: { organizations: orgs ?? [], properties: [], users: [] }, 
        source: "db" 
      });
    }

    const propIds = propertiesList.map(p => p.id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 4. Parallel fetch stats for properties
    const [
      { data: ticketData },
      { data: sopData },
      { data: dieselData },
      { data: electricData },
      { data: historicalElectricData },
      { data: userData }
    ] = await Promise.all([
      admin.from('tickets').select('property_id, status, created_at, priority').in('property_id', propIds),
      admin.from('sop_completions').select('property_id, status').in('property_id', propIds),
      admin.from('diesel_readings').select('property_id, computed_consumed_litres').in('property_id', propIds),
      admin.from('electricity_readings').select('property_id, final_units').in('property_id', propIds),
      admin.from('electricity_readings').select('property_id, final_units, created_at').in('property_id', propIds).gte('created_at', thirtyDaysAgo),
      admin.from('users').select('id, full_name, email, phone').limit(100)
    ]);

    // 5. Aggregation
    const ticketMap = new Map();
    const sopMap = new Map();
    const energyMap = new Map();
    const energyTrendMap = new Map();

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    propIds.forEach(id => {
      ticketMap.set(id, { open: 0, resolved: 0, total: 0, urgent: 0, history: new Map() });
      sopMap.set(id, { completed: 0, total: 0 });
      energyMap.set(id, { diesel: 0, electricity: 0 });
    });

    (ticketData ?? []).forEach((t: any) => {
      const c = ticketMap.get(t.property_id);
      if (!c) return;
      c.total++;
      if (['open', 'assigned', 'in_progress', 'client_raised', 'waitlist', 'blocked'].includes(t.status)) c.open++;
      else if (['resolved', 'closed'].includes(t.status)) c.resolved++;
      
      if (t.priority === 'urgent' || t.priority === 'high') c.urgent++;
      
      const date = new Date(t.created_at);
      if (date >= sevenDaysAgo) {
        const dayKey = dayNames[date.getDay()];
        c.history.set(dayKey, (c.history.get(dayKey) || 0) + 1);
      }
    });

    (sopData ?? []).forEach((s: any) => {
      const c = sopMap.get(s.property_id);
      if (!c) return;
      c.total++;
      if (s.status === 'completed') c.completed++;
    });

    (dieselData ?? []).forEach((d: any) => {
      const c = energyMap.get(d.property_id);
      if (c) c.diesel += (d.computed_consumed_litres || 0);
    });

    (electricData ?? []).forEach((e: any) => {
      const c = energyMap.get(e.property_id);
      if (c) c.electricity += (e.final_units || 0);
    });

    propIds.forEach((id: string) => {
      const propReadings = (historicalElectricData ?? [])
        .filter((r: any) => r.property_id === id)
        .map((r: any) => r.final_units || 0);
      const avg = propReadings.length > 0
        ? propReadings.reduce((a: number, b: number) => a + b, 0) / propReadings.length
        : 0;
      const latest = propReadings.length > 0 ? propReadings[propReadings.length - 1] : 0;
      const trend = avg > 0 ? Math.round(((latest - avg) / avg) * 100) : 0;
      energyTrendMap.set(id, trend);
    });

    const mappedProperties = propertiesList.map(p => {
      const t = ticketMap.get(p.id)!;
      const s = sopMap.get(p.id)!;
      const e = energyMap.get(p.id)!;

      const ticketScore = Math.max(0, 40 - (t.urgent * 5) - (t.open * 2));
      const sopScore = s.total > 0 ? (s.completed / s.total) * 30 : 30;
      const energyScore = e.diesel > 500 ? 20 : 30;

      const totalScore = Math.min(100, ticketScore + sopScore + energyScore);
      const healthStatus = totalScore > 80 ? 'good' : totalScore > 40 ? 'warning' : 'critical';

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        address: p.address,
        image_url: p.image_url,
        openTickets: t.open,
        resolvedTickets: t.resolved,
        totalTickets: t.total,
        healthScore: Math.round(totalScore),
        healthStatus,
        checklist: {
          completed: s.completed,
          total: Math.max(s.total, 1),
          percent: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 100,
        },
        energy: {
          diesel: Math.round(e.diesel),
          electricity: Math.round(e.electricity),
          trend: energyTrendMap.get(p.id) ?? 0,
        },
        tickets: dayNames.map(d => ({
          day: d,
          count: t.history.get(d) || 0,
        })),
        status: totalScore > 80 ? 'optimal' : totalScore > 40 ? 'warning' : 'critical',
      };
    });

    const dashboardData = {
      organizations: orgs ?? [],
      properties: mappedProperties,
      users: userData ?? []
    };

    await setCache(cacheKey, dashboardData, CACHE_TTL.HOT);

    return NextResponse.json({ success: true, data: dashboardData, source: "db" });
  } catch (error) {
    console.error("[saas-mobile-server] super-admin dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
