import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
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

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, category, status, created_at, resolved_at, issue_category:category_id(name)")
      .eq("property_id", propertyId)
      .eq("internal", false)
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("[saas-mobile-server] executive summary tickets error:", ticketsError);
      return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
    }

    const { data: property } = await admin
      .from("properties")
      .select("id, name, code")
      .eq("id", propertyId)
      .single();

    const normalised = (tickets || []).map((t: any) => ({
      id: t.id,
      category: t.issue_category?.name || t.category || "Other",
      status: t.status,
      created_at: t.created_at,
      resolved_at: t.resolved_at ?? null,
    }));

    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const fmtMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const getStats = (arr: typeof normalised) => {
      const total = arr.length;
      const closed = arr.filter(t => t.status === "resolved" || t.status === "closed").length;
      const open = total - closed;
      const rate = total > 0 ? Math.round((closed / total) * 100) : 0;
      return { total, closed, open, closureRate: rate };
    };

    const prevTickets = normalised.filter(t => {
      const d = new Date(t.created_at);
      return d.getMonth() === prevMonthStart.getMonth() && d.getFullYear() === prevMonthStart.getFullYear();
    });
    const currTickets = normalised.filter(t => {
      const d = new Date(t.created_at);
      return d.getMonth() === currMonthStart.getMonth() && d.getFullYear() === currMonthStart.getFullYear();
    });

    const prevStats = getStats(prevTickets);
    const currStats = getStats(currTickets);

    const cats: Record<string, number> = {};
    normalised.forEach(t => { const c = t.category || "Other"; cats[c] = (cats[c] || 0) + 1; });
    const topCategories = Object.entries(cats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    const getDailyTrend = (arr: typeof normalised, start: Date, days: number) => {
      const trend = new Array(days).fill(0);
      arr.forEach(t => {
        const d = new Date(t.created_at);
        const diff = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < days) trend[diff]++;
      });
      return trend;
    };

    return NextResponse.json({
      property: property || { id: propertyId, name: "Property", code: "N/A" },
      allTimeTotal: normalised.length,
      prevMonth: { label: fmtMonth(prevMonthStart), ...prevStats },
      currMonth: { label: fmtMonth(currMonthStart), ...currStats },
      topCategories,
      trends: {
        prev: getDailyTrend(prevTickets, prevMonthStart, 30),
        curr: getDailyTrend(currTickets, currMonthStart, 30),
      },
    });
  } catch (error) {
    console.error("[saas-mobile-server] executive summary API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
