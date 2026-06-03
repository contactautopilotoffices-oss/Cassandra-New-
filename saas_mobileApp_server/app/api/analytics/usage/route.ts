import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCache, setCache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = "analytics_usage_metrics";
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_usage_metrics");

    if (error) {
      console.error("[saas-mobile-server] analytics/usage error:", error);
      return NextResponse.json({ error: "Failed to fetch usage metrics" }, { status: 500 });
    }

    await setCache(cacheKey, data, CACHE_TTL.HOT);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[saas-mobile-server] analytics/usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
