import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("property_id") || request.nextUrl.searchParams.get("propertyId");
    const period = (request.nextUrl.searchParams.get("period") || "daily") as "daily" | "weekly";
    if (!propertyId) return NextResponse.json({ error: "property_id is required" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const table = period === "weekly" ? "mst_weekly_scores" : "mst_daily_scores";
    let scores: any[] = [];

    const { data, error } = await admin
      .from(table)
      .select("user_id, total_points, tickets_resolved, sla_met_count, first_time_fixes, streak_days, score_date, user:users(full_name, user_photo_url)")
      .eq("property_id", propertyId)
      .order("total_points", { ascending: false });

    if (!error && data) {
      scores = data as any[];
    }

    const leaderboard = scores.map((row, index) => ({
      rank: index + 1,
      user_id: row.user_id,
      name: row.user?.full_name || "Unknown",
      photo_url: row.user?.user_photo_url || null,
      score: row.total_points || 0,
      tickets_resolved: row.tickets_resolved || 0,
      sla_met_count: row.sla_met_count || 0,
      first_time_fixes: row.first_time_fixes || 0,
      streak_days: row.streak_days || 0,
      badges: []
    }));

    return NextResponse.json({
      period,
      score_date: new Date().toISOString().slice(0, 10),
      leaderboard,
      total: leaderboard.length
    });
  } catch (error) {
    console.error("[saas-mobile-server] gamification leaderboard error:", error);
    return NextResponse.json({ period: "daily", score_date: new Date().toISOString().slice(0, 10), leaderboard: [], total: 0 });
  }
}
