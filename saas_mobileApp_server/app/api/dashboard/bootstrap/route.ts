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

    const cacheKey = `dashboard:${propertyId}:${userId}`;

    // 1. Try to fetch from Redis Cache
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, source: "cache" });
    }

    // 2. Cache miss -> Fetch from Database in parallel
    const admin = createAdminClient();

    const todayStr = new Date().toISOString().split("T")[0];

    const [
      profileResult,
      notificationsResult,
      recentTicketsResult,
      ticketStatsResult,
      propertyResult,
      stockResult,
      sopTemplatesResult,
      sopCompletionsResult,
      shiftResult,
      ppmStatsResult,
      visitorStatsResult,
    ] = await Promise.all([
      // Profile
      admin.from("users").select("*").eq("id", userId).single(),
      
      // Notifications (unread count)
      admin.from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false),

      // Recent Tickets
      admin.from("tickets")
        .select("id, ticket_number, title, status, priority, created_at, assigned_to, assignee:users!assigned_to(full_name)")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .limit(50),

      // Ticket Stats
      admin.from("tickets")
        .select("id, status, assigned_to")
        .eq("property_id", propertyId),

      // Property Name
      admin.from("properties").select("name").eq("id", propertyId).single(),

      // Stock Items
      admin.from("stock_items").select("id, name, quantity, min_threshold, category, unit").eq("property_id", propertyId),

      // SOP Templates
      admin.from("sop_templates").select("id").eq("property_id", propertyId).eq("is_active", true),

      // SOP Completions Today
      admin.from("sop_completions").select("status").eq("property_id", propertyId).eq("completion_date", todayStr),

      // Shift Status
      admin.from("resolver_stats").select("is_checked_in").eq("property_id", propertyId).eq("user_id", userId).maybeSingle(),

      // PPM Stats (RPC or manual calculation)
      admin.rpc("get_ppm_stats", { prop_id: propertyId }),

      // Visitor Stats (RPC)
      admin.rpc("get_visitor_stats", { prop_id: propertyId, target_date: todayStr })
    ]);

    // Compute derived stats
    const allTickets = ticketStatsResult.data ?? [];
    const openTickets = allTickets.filter(t => ['open', 'in_progress', 'assigned', 'client_raised', 'waitlist', 'blocked'].includes(t.status)).length;
    const myTickets = allTickets.filter(t => t.assigned_to === userId).length;

    const allStock = stockResult.data ?? [];
    const lowStock = allStock.filter(s => s.quantity > 0 && s.quantity <= (s.min_threshold ?? 10)).length;
    const outStock = allStock.filter(s => s.quantity <= 0).length;

    const dashboardData = {
      profile: profileResult.data,
      propertyName: propertyResult.data?.name ?? "",
      notifications: { unreadCount: notificationsResult.count ?? 0 },
      recentTickets: recentTicketsResult.data ?? [],
      ticketStats: {
        total: allTickets.length,
        open: openTickets,
        mine: myTickets,
      },
      stockStats: {
        total: allStock.length,
        lowStock,
        outStock,
        items: allStock,
      },
      sopStats: {
        total: sopTemplatesResult.data?.length ?? 0,
        completed: (sopCompletionsResult.data ?? []).filter(s => s.status === 'completed').length,
      },
      ppmStats: ppmStatsResult.data ?? { total: 0, done: 0, pending: 0, overdue: 0, postponed: 0 },
      visitorStats: visitorStatsResult.data ?? { total_today: 0, checked_in: 0, checked_out: 0 },
      shiftStatus: shiftResult.data?.is_checked_in ?? false,
    };

    // 3. Store in Redis
    await setCache(cacheKey, dashboardData, CACHE_TTL.HOT);

    return NextResponse.json({ success: true, data: dashboardData, source: "db" });
  } catch (error) {
    console.error("[saas-mobile-server] dashboard bootstrap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
