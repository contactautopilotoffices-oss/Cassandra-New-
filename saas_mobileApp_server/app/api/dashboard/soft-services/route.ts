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
    
    const access = await getPropertyAccess(userId, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Access Denied to this Property" }, { status: 403 });
    }

    const cacheKey = `dashboard:soft-services:${propertyId}:${userId}`;

    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, source: "cache" });
    }

    const admin = createAdminClient();

    const [
      { data: membership },
      { data: shiftData },
      { data: resolverStats },
      { data: stockItems }
    ] = await Promise.all([
      admin.from('property_memberships').select('role')
        .eq('property_id', propertyId)
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('resolver_stats').select('is_checked_in')
        .eq('property_id', propertyId)
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('resolver_stats').select('skills, specialization')
        .eq('property_id', propertyId)
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('stock_items').select('id, quantity, min_threshold')
        .eq('property_id', propertyId)
    ]);

    let userRole = '';
    if (membership?.role) {
      userRole = membership.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    let userSkills: string[] = [];
    let specialization: string | null = null;
    if (resolverStats?.skills && Array.isArray(resolverStats.skills)) {
      userSkills = resolverStats.skills;
      if (resolverStats.skills.length > 0) {
        specialization = resolverStats.skills.map((s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(', ');
      }
    } else if (resolverStats?.specialization) {
      specialization = resolverStats.specialization.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    let stockStats = { total: 0, lowStock: 0, outOfStock: 0 };
    if (stockItems) {
      stockStats.total = stockItems.length;
      stockStats.lowStock = stockItems.filter((s: any) => s.quantity > 0 && s.quantity <= (s.min_threshold ?? 10)).length;
      stockStats.outOfStock = stockItems.filter((s: any) => s.quantity <= 0).length;
    }

    // SOP checklists are disabled in schema, set default stats
    const checklistStats = { total: 0, pending: 0, completed: 0 };

    const dashboardData = {
      userRole,
      isCheckedIn: !!shiftData?.is_checked_in,
      userSkills,
      specialization,
      stockStats,
      checklistStats
    };

    await setCache(cacheKey, dashboardData, CACHE_TTL.HOT);

    return NextResponse.json({ success: true, data: dashboardData, source: "db" });
  } catch (error) {
    console.error("[saas-mobile-server] soft-services dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
