import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

function getPeriodBounds(period: string) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  if (period === "today") {
    return { start: `${todayStr}T00:00:00.000Z`, end: `${todayStr}T23:59:59.999Z` };
  }

  if (period === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: weekAgo.toISOString(), end: now.toISOString() };
  }

  // month (default)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: monthStart.toISOString(), end: monthEnd.toISOString() };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const period = searchParams.get("period") || "month";

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const bounds = getPeriodBounds(period);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];

    // ─── Tickets ──────────────────────────────────────────────────────────────
    let ticketsQuery = admin
      .from("tickets")
      .select("id, status, priority, created_at, resolved_at, closed_at, sla_deadline, category_id, issue_category:category_id(name)")
      .eq("property_id", propertyId);

    if (period !== "all") {
      ticketsQuery = ticketsQuery.gte("created_at", bounds.start).lte("created_at", bounds.end);
    }

    const { data: tickets, error: ticketsError } = await ticketsQuery;
    if (ticketsError) {
      console.error("[saas-mobile-server] insights tickets error:", ticketsError);
      return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
    }

    const ticketList = tickets ?? [];
    const totalTickets = ticketList.length;
    const openTickets = ticketList.filter((t) => ["open", "assigned", "in_progress", "client_raised", "waitlist"].includes(t.status)).length;
    const resolvedTickets = ticketList.filter((t) => ["resolved", "closed"].includes(t.status)).length;
    const criticalTickets = ticketList.filter((t) => t.priority === "critical").length;

    // Avg resolution time (hours) for resolved tickets in period
    let totalResolutionMs = 0;
    let resolvedCount = 0;
    ticketList.forEach((t) => {
      const resolvedDate = t.resolved_at ?? t.closed_at;
      if (resolvedDate) {
        const createdTime = new Date(t.created_at).getTime();
        const resolvedTime = new Date(resolvedDate).getTime();
        totalResolutionMs += resolvedTime - createdTime;
        resolvedCount++;
      }
    });
    const avgResolutionHours = resolvedCount > 0 ? Math.round(totalResolutionMs / resolvedCount / 3600000) : 0;

    // SLA breach count (resolved after deadline OR open and past deadline)
    let slaBreaches = 0;
    ticketList.forEach((t) => {
      const deadline = t.sla_deadline ? new Date(t.sla_deadline).getTime() : null;
      const resolvedDate = t.resolved_at ?? t.closed_at;
      if (deadline) {
        if (resolvedDate) {
          if (new Date(resolvedDate).getTime() > deadline) slaBreaches++;
        } else if (Date.now() > deadline) {
          slaBreaches++;
        }
      }
    });

    // Top issue categories
    const categoryCounts: Record<string, number> = {};
    ticketList.forEach((t) => {
      const catName = (t.issue_category as any)?.name ?? "Uncategorized";
      categoryCounts[catName] = (categoryCounts[catName] ?? 0) + 1;
    });
    const topIssueCategories = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ─── Visitors ─────────────────────────────────────────────────────────────
    let visitorsQuery = admin
      .from("visitor_logs")
      .select("status")
      .eq("property_id", propertyId)
      .gte("checkin_time", bounds.start)
      .lte("checkin_time", bounds.end);

    const { data: visitors, error: visitorsError } = await visitorsQuery;
    if (visitorsError) {
      console.error("[saas-mobile-server] insights visitors error:", visitorsError);
      return NextResponse.json({ error: "Failed to fetch visitors" }, { status: 500 });
    }

    const visitorList = visitors ?? [];
    const totalVisitors = visitorList.length;
    const checkedInVisitors = visitorList.filter((v) => v.status === "checked_in").length;
    const checkedOutVisitors = visitorList.filter((v) => v.status === "checked_out").length;

    // ─── Stock ────────────────────────────────────────────────────────────────
    const { data: stockItems, error: stockError } = await admin
      .from("stock_items")
      .select("quantity, min_threshold")
      .eq("property_id", propertyId);

    if (stockError) {
      console.error("[saas-mobile-server] insights stock error:", stockError);
      return NextResponse.json({ error: "Failed to fetch stock" }, { status: 500 });
    }

    const stockList = stockItems ?? [];
    const totalStock = stockList.length;
    const lowStock = stockList.filter((s) => s.quantity > 0 && s.quantity <= (s.min_threshold ?? 10)).length;
    const outOfStock = stockList.filter((s) => s.quantity <= 0).length;

    // ─── Diesel ───────────────────────────────────────────────────────────────
    const { data: dieselReadings, error: dieselError } = await admin
      .from("diesel_readings")
      .select("reading_date, computed_consumed_litres")
      .eq("property_id", propertyId)
      .order("reading_date", { ascending: false });

    if (dieselError) {
      console.error("[saas-mobile-server] insights diesel error:", dieselError);
      return NextResponse.json({ error: "Failed to fetch diesel" }, { status: 500 });
    }

    const dieselList = dieselReadings ?? [];
    const lastDieselReading = dieselList[0] ?? null;
    const dieselThisMonth = dieselList
      .filter((d) => d.reading_date && d.reading_date >= monthStart)
      .reduce((sum, d) => sum + (Number(d.computed_consumed_litres) || 0), 0);

    // ─── Electricity ──────────────────────────────────────────────────────────
    const { data: electricityReadings, error: electricityError } = await admin
      .from("electricity_readings")
      .select("reading_date, final_units")
      .eq("property_id", propertyId)
      .order("reading_date", { ascending: false });

    if (electricityError) {
      console.error("[saas-mobile-server] insights electricity error:", electricityError);
      return NextResponse.json({ error: "Failed to fetch electricity" }, { status: 500 });
    }

    const electricityList = electricityReadings ?? [];
    const lastElectricityReading = electricityList[0] ?? null;
    const electricityThisMonth = electricityList
      .filter((e) => e.reading_date && e.reading_date >= monthStart)
      .reduce((sum, e) => sum + (Number(e.final_units) || 0), 0);

    // ─── PPM ──────────────────────────────────────────────────────────────────
    const { data: ppmSchedules, error: ppmError } = await admin
      .from("ppm_schedules")
      .select("status, planned_date")
      .eq("property_id", propertyId);

    if (ppmError) {
      console.error("[saas-mobile-server] insights ppm error:", ppmError);
      return NextResponse.json({ error: "Failed to fetch ppm" }, { status: 500 });
    }

    const ppmList = ppmSchedules ?? [];
    const totalPPM = ppmList.length;
    const completedPPM = ppmList.filter((p) => p.status === "completed" && p.planned_date && p.planned_date >= monthStart).length;
    const upcomingPPM = ppmList.filter((p) => {
      if (p.status !== "pending") return false;
      if (!p.planned_date) return false;
      return new Date(p.planned_date) >= new Date(todayStr);
    }).length;

    return NextResponse.json({
      success: true,
      insights: {
        tickets: {
          total: totalTickets,
          open: openTickets,
          resolved: resolvedTickets,
          avgResolutionHours,
          critical: criticalTickets,
        },
        visitors: {
          total: totalVisitors,
          checkedIn: checkedInVisitors,
          checkedOut: checkedOutVisitors,
        },
        stock: {
          total: totalStock,
          lowStock,
          outOfStock,
        },
        diesel: {
          lastReading: lastDieselReading?.reading_date ?? null,
          lastConsumption: lastDieselReading?.computed_consumed_litres ?? null,
          totalConsumptionThisMonth: Math.round(dieselThisMonth * 100) / 100,
        },
        electricity: {
          lastReading: lastElectricityReading?.reading_date ?? null,
          lastUnits: lastElectricityReading?.final_units ?? null,
          totalUnitsThisMonth: Math.round(electricityThisMonth * 100) / 100,
        },
        ppm: {
          total: totalPPM,
          completedThisMonth: completedPPM,
          upcoming: upcomingPPM,
        },
        topIssueCategories,
        slaBreaches,
        period,
      },
    });
  } catch (error) {
    console.error("[saas-mobile-server] insights GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
