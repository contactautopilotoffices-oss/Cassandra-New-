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
    const month = searchParams.get("month"); // YYYY-MM format
    const startDateParam = searchParams.get("startDate"); // YYYY-MM-DD
    const endDateParam = searchParams.get("endDate");     // YYYY-MM-DD

    if (!propertyId || (!month && (!startDateParam || !endDateParam))) {
      return NextResponse.json({ error: "propertyId and either month or startDate+endDate are required" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Fetch property details
    const { data: property } = await admin
      .from("properties")
      .select("id, name, code, address")
      .eq("id", propertyId)
      .single();

    const { data: feature } = await admin
      .from("property_features")
      .select("is_enabled")
      .eq("property_id", propertyId)
      .eq("feature_key", "ticket_validation")
      .maybeSingle();

    const isValidationEnabled = feature ? feature.is_enabled : true;

    // Calculate date range
    let startDate: string;
    let endDate: string;
    let monthLabel: string;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam + "T00:00:00").toISOString();
      endDate = new Date(endDateParam + "T23:59:59").toISOString();
      monthLabel = `${startDateParam} to ${endDateParam}`;
    } else {
      const [year, monthNum] = month!.split("-").map(Number);
      startDate = new Date(year, monthNum - 1, 1).toISOString();
      endDate = new Date(year, monthNum, 1).toISOString();
      monthLabel = month!;
    }

    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select(`
        id, title, description, category, category_id, skill_group_code, status, priority,
        floor_number, location, created_at, resolved_at, raised_by, assigned_to,
        photo_before_url, photo_after_url, ticket_number, internal,
        issue_category:category_id(id, name, code),
        raiser:users!raised_by(id, full_name, email),
        assignee:users!assigned_to(id, full_name, email)
      `)
      .eq("property_id", propertyId)
      .gte("created_at", startDate)
      .lt("created_at", endDate)
      .order("floor_number", { ascending: true })
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("[saas-mobile-server] requests report tickets error:", ticketsError);
      return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
    }

    const allTickets = tickets || [];

    const totalSnags = allTickets.length;
    const closedSnags = allTickets.filter(t => t.status === "resolved" || t.status === "closed").length;
    const openSnags = allTickets.filter(t => t.status !== "resolved" && t.status !== "closed" && t.status !== "pending_validation").length;
    const pendingValidationCount = allTickets.filter(t => t.status === "pending_validation").length;
    const closureRate = totalSnags > 0 ? ((closedSnags / totalSnags) * 100).toFixed(1) : "0";

    const floorGroups: Record<string, typeof allTickets> = {};
    const floorCounts: Record<string, number> = {};

    allTickets.forEach(ticket => {
      let floor = "Unspecified";
      if (ticket.floor_number === 0) floor = "ground floor";
      else if (ticket.floor_number === -1) floor = "basement";
      else if (ticket.floor_number !== null) floor = `floor ${ticket.floor_number}`;

      if (!floorGroups[floor]) {
        floorGroups[floor] = [];
        floorCounts[floor] = 0;
      }
      floorGroups[floor].push(ticket);
      floorCounts[floor]++;
    });

    const categoryStats: Record<string, { open: number; closed: number }> = {};
    allTickets.forEach((ticket: any) => {
      const categoryName = ticket.issue_category?.name || ticket.category || (ticket.skill_group_code ? ticket.skill_group_code.replace(/_/g, " ") : null) || "Other";
      const key = categoryName.trim();
      if (!categoryStats[key]) categoryStats[key] = { open: 0, closed: 0 };
      if (ticket.status === "resolved" || ticket.status === "closed") categoryStats[key].closed++;
      else categoryStats[key].open++;
    });

    const floorLabels = Object.keys(floorCounts);
    const floorData = Object.values(floorCounts);

    const deptLabels = Object.keys(categoryStats).map(c => c.charAt(0).toUpperCase() + c.slice(1));
    const deptOpen = Object.values(categoryStats).map(s => s.open);
    const deptClosed = Object.values(categoryStats).map(s => s.closed);

    const ticketIds = allTickets.map(t => t.id);
    let activityLogs: any[] = [];
    if (ticketIds.length > 0) {
       const { data } = await admin.from("ticket_activity_log")
          .select("ticket_id, action, new_value, old_value, created_at")
          .in("ticket_id", ticketIds)
          .or("action.eq.photo_before_uploaded,action.eq.video_before_uploaded,action.eq.photo_after_uploaded,action.eq.video_after_uploaded,action.eq.photo_upload,action.eq.video_upload");
       activityLogs = data || [];
    }

    const formattedTickets = allTickets.map(ticket => {
      const logs = activityLogs.filter(l => l.ticket_id === ticket.id);
      const beforeLog = logs.find(l => l.action === "photo_before_uploaded" || l.action === "video_before_uploaded" || (l.action === "photo_upload" && (l.new_value as string)?.includes("before")) || (l.action === "video_upload" && (l.new_value as string)?.includes("before")));
      const afterLog = logs.find(l => l.action === "photo_after_uploaded" || l.action === "video_after_uploaded" || (l.action === "photo_upload" && (l.new_value as string)?.includes("after")) || (l.action === "video_upload" && (l.new_value as string)?.includes("after")));

      const reportedDate = beforeLog?.old_value || beforeLog?.created_at || ticket.created_at;
      const closedDate = afterLog?.old_value || afterLog?.created_at || ticket.resolved_at;

      return {
        id: ticket.id,
        ticketNumber: `#${ticket.id.slice(0, 8).toUpperCase()}`,
        title: ticket.title,
        description: ticket.description,
        category: (ticket.issue_category as any)?.name || ticket.category || (ticket.skill_group_code ? ticket.skill_group_code.replace(/_/g, " ") : null) || "Other",
        status: ticket.status,
        priority: ticket.priority,
        floor: ticket.floor_number !== null ? `${ticket.floor_number}` : null,
        floorLabel: ticket.floor_number === 0 ? "ground floor" : ticket.floor_number === -1 ? "basement" : ticket.floor_number !== null ? `floor ${ticket.floor_number}` : "unspecified",
        location: ticket.location,
        reportedDate,
        closedDate,
        spocName: (ticket.raiser as any)?.full_name || "Unknown",
        spocEmail: (ticket.raiser as any)?.email || "",
        assigneeName: (ticket.assignee as any)?.full_name || "Unassigned",
        beforePhoto: (ticket as any).photo_before_url,
        afterPhoto: (ticket as any).photo_after_url,
        ticketNumberDisplay: ticket.ticket_number || `#${ticket.id.slice(0, 8).toUpperCase()}`,
        internal: !!(ticket as any).internal,
      };
    });

    const displayLabel = startDateParam && endDateParam
      ? `${new Date(startDateParam).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(endDateParam).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      : (() => { const [y, mn] = month!.split("-").map(Number); return new Date(y, mn - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); })();

    return NextResponse.json({
      success: true,
      month: {
        value: startDateParam && endDateParam ? `${startDateParam}_${endDateParam}` : month,
        label: displayLabel,
      },
      property: property || { name: "Unknown Property", code: "N/A" },
      kpis: {
        totalSnags,
        closedSnags,
        openSnags,
        pendingValidationCount,
        isValidationEnabled,
        closureRate: parseFloat(closureRate),
      },
      charts: {
        floor: { labels: floorLabels, data: floorData },
        department: { labels: deptLabels, open: deptOpen, closed: deptClosed },
      },
      floorGroups,
      tickets: formattedTickets,
    });
  } catch (error) {
    console.error("[saas-mobile-server] requests report API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
