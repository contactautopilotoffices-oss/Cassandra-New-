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
    if (!propertyId) return NextResponse.json({ error: "property_id is required" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();

    const { data: today } = await admin
      .from("mst_daily_scores")
      .select("total_points, tickets_resolved, sla_met_count, first_time_fixes, avg_resolution_minutes, streak_days")
      .eq("property_id", propertyId)
      .eq("user_id", auth.user.id)
      .order("score_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: badges } = await admin
      .from("mst_user_badges")
      .select("badge_code, earned_at, badge:gamification_badges(code, name, description, icon, color, tier, points_bonus)")
      .eq("user_id", auth.user.id)
      .order("earned_at", { ascending: false });

    return NextResponse.json({
      property_id: propertyId,
      user_id: auth.user.id,
      today: {
        total_points: today?.total_points || 0,
        tickets_resolved: today?.tickets_resolved || 0,
        sla_met_count: today?.sla_met_count || 0,
        first_time_fixes: today?.first_time_fixes || 0,
        avg_resolution_minutes: today?.avg_resolution_minutes ?? null,
        rank: null,
        total_in_rank: 0
      },
      all_time: {
        total_points: today?.total_points || 0,
        tickets_resolved: today?.tickets_resolved || 0,
        sla_met_count: today?.sla_met_count || 0
      },
      streak: {
        current: today?.streak_days || 0,
        longest: today?.streak_days || 0
      },
      badges: (badges ?? []).map((entry: any) => ({
        code: entry.badge?.code || entry.badge_code,
        name: entry.badge?.name || entry.badge_code,
        description: entry.badge?.description || "",
        icon: entry.badge?.icon || "award",
        color: entry.badge?.color || "#F59E0B",
        tier: entry.badge?.tier || "bronze",
        points_bonus: entry.badge?.points_bonus || 0,
        earned_at: entry.earned_at
      })),
      next_achievements: []
    });
  } catch (error) {
    console.error("[saas-mobile-server] gamification my-stats error:", error);
    return NextResponse.json({
      property_id: "",
      user_id: "",
      today: { total_points: 0, tickets_resolved: 0, sla_met_count: 0, first_time_fixes: 0, avg_resolution_minutes: null, rank: null, total_in_rank: 0 },
      all_time: { total_points: 0, tickets_resolved: 0, sla_met_count: 0 },
      streak: { current: 0, longest: 0 },
      badges: [],
      next_achievements: []
    });
  }
}
