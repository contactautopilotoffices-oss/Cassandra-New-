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

    const cacheKey = `dashboard:staff:${propertyId}:${userId}`;

    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, source: "cache" });
    }

    const admin = createAdminClient();

    const [
      { data: propData },
      { data: ticketData },
      { data: shiftData },
      { data: ppmData },
      { data: mstSkills },
      { data: resolverStats }
    ] = await Promise.all([
      admin.from('properties').select('name').eq('id', propertyId).maybeSingle(),
      admin.from('tickets').select(`
          *,
          assignee:users!assigned_to(id, full_name, email, user_photo_url),
          creator:users!raised_by(id, full_name)
        `)
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false }),
      admin.from('resolver_stats').select('is_checked_in')
        .eq('property_id', propertyId)
        .eq('user_id', userId)
        .maybeSingle(),
      (async () => { try { return await admin.rpc("get_ppm_stats", { prop_id: propertyId }); } catch { return { data: null }; } })(),
      admin.from('mst_skills').select('skill_group_code')
        .eq('property_id', propertyId)
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('resolver_stats').select('skills, specialization')
        .eq('property_id', propertyId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    let userSkills: string[] = [];
    let specialization: string | null = null;

    if (mstSkills?.skill_group_code) {
      userSkills = [mstSkills.skill_group_code];
      specialization = mstSkills.skill_group_code.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    } else if (resolverStats?.skills && Array.isArray(resolverStats.skills)) {
      userSkills = resolverStats.skills;
      if (resolverStats.skills.length > 0) {
        specialization = resolverStats.skills[0].replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    }

    const dashboardData = {
      property: propData ?? null,
      tickets: ticketData ?? [],
      isCheckedIn: !!shiftData?.is_checked_in,
      userSkills,
      specialization,
      ppmStats: ppmData ?? {
        total: 0,
        done: 0,
        pending: 0,
        overdue: 0,
        postponed: 0
      },
    };

    await setCache(cacheKey, dashboardData, CACHE_TTL.HOT);

    return NextResponse.json({ success: true, data: dashboardData, source: "db" });
  } catch (error) {
    console.error("[saas-mobile-server] staff dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
