import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCache, setCache, CACHE_TTL } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const cacheKey = `tickets:stats:${orgId ?? 'none'}:${propertyId ?? 'none'}`;
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, source: "cache" });
    }

    const admin = createAdminClient();
    
    // Call the original get_ticket_stats RPC via admin client securely
    const { data, error } = await admin.rpc("get_ticket_stats", {
      org_id: orgId || null,
      prop_id: propertyId || null,
    });

    if (error) {
      console.error("[saas-mobile-server] get_ticket_stats RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await setCache(cacheKey, data, CACHE_TTL.HOT);

    return NextResponse.json({ success: true, data, source: "db" });
  } catch (error) {
    console.error("[saas-mobile-server] tickets stats API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
