import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageOrganization } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let propertyId = searchParams.get("propertyId");
    let orgId = searchParams.get("orgId");
    const admin = createAdminClient();
    
    if (!propertyId && !orgId) {
      const { data: mem } = await admin
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .single();
      if (mem) {
        orgId = mem.organization_id;
      } else {
        return NextResponse.json({ error: "Missing propertyId or orgId, and no default org found" }, { status: 400 });
      }
    }

    if (propertyId) {
      const access = await getPropertyAccess(auth.user.id, propertyId);
      if (!access) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (orgId) {
      const canManage = await canManageOrganization(auth.user.id, orgId);
      if (!canManage) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    let propertyIds: string[] = [];

    if (propertyId) {
      propertyIds = [propertyId];
    } else if (orgId) {
      const { data: props } = await admin.from("properties").select("id").eq("organization_id", orgId);
      propertyIds = (props ?? []).map((p) => p.id);
    }

    if (propertyIds.length === 0) {
       return NextResponse.json({
         tickets: { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 },
         stock: { total: 0, lowStock: 0, outOfStock: 0 },
         users: { total: 0 },
         sops: { pending: 0, done: 0, missed: 0 },
         diesel: { totalLogs: 0, totalAdded: 0, totalConsumed: 0 },
         rooms: { totalRooms: 0, todayBookings: 0, activeBookings: 0 },
         mst: { openRequests: 0 }
       });
    }

    // Tickets
    const { data: tickets } = await admin.from("tickets").select("status, created_at, resolved_at, closed_at, priority").in("property_id", propertyIds);
    const ticketCounts = { total: tickets?.length ?? 0, open: 0, inProgress: 0, resolved: 0, closed: 0 };
    
    let resolvedToday = 0;
    const todayStr = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffMs = thirtyDaysAgo.getTime();

    let totalMs = 0;
    let resolvedCount = 0;
    
    let compliantCount = 0;
    const slaHours: Record<string, number> = { urgent: 4, high: 24, medium: 72, low: 168 };

    tickets?.forEach(t => {
       if (t.status === "open") ticketCounts.open++;
       if (t.status === "in_progress") ticketCounts.inProgress++;
       if (t.status === "resolved") ticketCounts.resolved++;
       if (t.status === "closed") ticketCounts.closed++;

       const resolvedDate = t.resolved_at ?? t.closed_at;
       if (resolvedDate) {
         if (resolvedDate.startsWith(todayStr)) resolvedToday++;
         
         const createdTime = new Date(t.created_at).getTime();
         const resolvedTime = new Date(resolvedDate).getTime();
         
         if (resolvedTime >= cutoffMs) {
           totalMs += (resolvedTime - createdTime);
           resolvedCount++;
         }
         
         const deadline = createdTime + (slaHours[t.priority] ?? 72) * 3600000;
         if (resolvedTime <= deadline) compliantCount++;
       }
    });

    const avgResolutionTime = resolvedCount > 0 ? Math.round(totalMs / resolvedCount / 3600000) : 0;
    const slaCompliance = tickets && tickets.length > 0 ? Math.round((compliantCount / tickets.length) * 100) : 100;


    // Stock
    const { data: stock } = await admin.from("stock_items").select("quantity, min_threshold").in("property_id", propertyIds);
    const stockCounts = { total: stock?.length ?? 0, lowStock: 0, outOfStock: 0 };
    stock?.forEach(s => {
       if (s.quantity === 0) stockCounts.outOfStock++;
       else if (s.quantity <= s.min_threshold) stockCounts.lowStock++;
    });

    // Users
    const { data: users } = await admin.from("property_memberships").select("user_id").in("property_id", propertyIds).eq("is_active", true);
    
    // SOPs (Checklist)
    const { data: sops } = await admin.from("sop_runs").select("status").in("property_id", propertyIds);
    const sopCounts = { pending: 0, done: 0, missed: 0 };
    sops?.forEach(s => {
       if (s.status === "pending" || s.status === "in_progress") sopCounts.pending++;
       if (s.status === "completed") sopCounts.done++;
       if (s.status === "missed") sopCounts.missed++;
    });

    // Diesel
    const { data: diesel } = await admin.from("diesel_logs").select("type, quantity").in("property_id", propertyIds);
    const dieselCounts = { totalLogs: diesel?.length ?? 0, totalAdded: 0, totalConsumed: 0 };
    diesel?.forEach(d => {
       if (d.type === "added") dieselCounts.totalAdded += Number(d.quantity);
       if (d.type === "consumed") dieselCounts.totalConsumed += Number(d.quantity);
    });

    // Meeting Rooms
    const today = new Date().toISOString().split("T")[0];
    const { data: rooms } = await admin.from("meeting_rooms").select("id").in("property_id", propertyIds);
    const roomIds = (rooms ?? []).map(r => r.id);
    let roomCounts = { totalRooms: roomIds.length, todayBookings: 0, activeBookings: 0 };
    if (roomIds.length > 0) {
      const { data: bookings } = await admin.from("meeting_room_bookings").select("status, date").in("room_id", roomIds);
      bookings?.forEach(b => {
         if (b.date === today && b.status !== "cancelled") roomCounts.todayBookings++;
         if (b.status === "active" || b.status === "in_progress") roomCounts.activeBookings++;
      });
    }

    // MST
    const { data: mst } = await admin.from("mst_requests").select("status").in("property_id", propertyIds).neq("status", "completed");
    const mstCounts = { openRequests: mst?.length ?? 0 };

    return NextResponse.json({
      success: true,
      stats: {
        tickets: ticketCounts,
        resolvedToday,
        avgResolutionTime,
        slaCompliance,
        stock: stockCounts,
        users: { total: users?.length ?? 0 },
        sops: sopCounts,
        diesel: dieselCounts,
        rooms: roomCounts,
        mst: mstCounts,
      }
    });
  } catch (error) {
    console.error("[saas-mobile-server] dashboard stats GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
