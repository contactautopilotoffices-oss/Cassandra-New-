import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageOrganization, canManageProperty, getUserProfile } from "@/lib/authorization";
import { canUserSeePrices } from "@/lib/procurement";

async function canReadOrganizationRequests(userId: string, organizationId: string) {
  const profile = await getUserProfile(userId);
  if (profile?.is_master_admin) {
    return true;
  }

  if (await canManageOrganization(userId, organizationId)) {
    return true;
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("organization_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  return !!membership;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.user.id;

    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organizationId");
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }
    const ticketId = searchParams.get("ticketId");
    const approverId = searchParams.get("approverId");
    const floorNumber = searchParams.get("floorNumber") ?? searchParams.get("floor_number") ?? searchParams.get("floor");

    if (!propertyId && !organizationId) {
      return NextResponse.json({ error: "Missing propertyId or organizationId" }, { status: 400 });
    }

    if (propertyId) {
      const access = await getPropertyAccess(userId, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (organizationId && !(await canReadOrganizationRequests(userId, organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin
      .from("material_requests")
      .select(
        `
        *,
        ticket:tickets!inner(ticket_number, title, floor_number),
        line_items:material_request_items(*),
        requester:users!material_requests_requested_by_fkey(full_name),
        assignee:users!material_requests_assignee_uid_fkey(full_name)
        `
      )
      .order("created_at", { ascending: false });

    if (organizationId) query = query.eq("organization_id", organizationId);
    if (propertyId) query = query.eq("property_id", propertyId);
    if (ticketId) query = query.eq("ticket_id", ticketId);
    if (approverId) {
      query = query.or(`assignee_uid.eq.${approverId},target_approver_id.eq.${approverId}`);
    }
    if (floorNumber && floorNumber !== "all") {
      if (floorNumber === "unspecified") {
        query = query.or('floor_number.is.null,floor_number.eq.""', { foreignTable: "tickets" });
      } else {
        query = query.eq("tickets.floor_number", floorNumber);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error("[saas-mobile-server] procurement requests GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = await Promise.all(
      (data ?? []).map(async (item: any) => {
        const items = [...(Array.isArray(item.items) ? item.items : []), ...(item.line_items ?? [])];
        const showPrices = item.organization_id
          ? await canUserSeePrices(userId, item.organization_id, item.property_id ?? undefined)
          : false;

        const maskedItems = items.map((entry: any) =>
          showPrices
            ? entry
            : {
                ...entry,
                unit_price: null,
                total_price: null,
                estimated_cost: null,
              }
        );

        return {
          ...item,
          items: maskedItems,
          total_amount: showPrices ? item.total_amount : null,
          total_estimated_cost: showPrices ? item.total_estimated_cost : null,
        };
      })
    );

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("[saas-mobile-server] procurement requests GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json();
    const {
      ticket_id,
      property_id,
      organization_id,
      budget_type,
      assignee_uid,
      has_custom_items,
      items,
    } = body;

    if (!ticket_id || !property_id || !organization_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(userId, property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const totalAmount = items.reduce((sum: number, item: any) => {
      const unitPrice = Number(item.unit_price ?? 0);
      const quantity = Number(item.quantity ?? 0);
      return sum + unitPrice * quantity;
    }, 0);

    const { data: materialRequest, error: requestError } = await admin
      .from("material_requests")
      .insert({
        ticket_id,
        property_id,
        organization_id,
        requested_by: userId,
        assignee_uid: assignee_uid ?? null,
        budget_type: budget_type ?? null,
        has_custom_items: !!has_custom_items,
        total_amount: totalAmount,
        status: "pending_quotation",
      })
      .select("*")
      .single();

    if (requestError || !materialRequest) {
      console.error("[saas-mobile-server] procurement requests POST create error:", requestError);
      return NextResponse.json({ error: requestError?.message ?? "Failed to create request" }, { status: 500 });
    }

    const lineItems = items.map((item: any) => {
      const unitPrice = Number(item.unit_price ?? 0);
      const quantity = Number(item.quantity ?? 0);
      return {
        request_id: materialRequest.id,
        organization_id,
        catalog_item_id: item.catalog_item_id ?? null,
        name: item.name,
        quantity,
        unit_price: unitPrice,
        total_price: unitPrice * quantity,
        photo_url: item.photo_url ?? null,
        description: item.description ?? item.notes ?? null,
        links: item.links ?? null,
      };
    });

    if (lineItems.length > 0) {
      const { error: lineItemsError } = await admin.from("material_request_items").insert(lineItems);
      if (lineItemsError) {
        console.error("[saas-mobile-server] procurement requests POST items error:", lineItemsError);
        return NextResponse.json({ error: "Failed to create request items" }, { status: 500 });
      }
    }

    void admin.from("ticket_comments").insert({
      ticket_id,
      user_id: userId,
      comment: `Material requested: ${lineItems.length} items sent to procurement for quotation.`,
      is_internal: false,
    });

    void admin.from("ticket_activity_log").insert({
      ticket_id,
      user_id: userId,
      action: "procurement_requested",
      new_value: `Requested ${lineItems.length} materials`,
    });

    return NextResponse.json(materialRequest, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] procurement requests POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json();
    const { requestId, assignee_uid } = body;

    if (!requestId || !assignee_uid) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: current, error: fetchError } = await admin
      .from("material_requests")
      .select("id, property_id, organization_id")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const canManage =
      (current.property_id ? await canManageProperty(userId, current.property_id) : false) ||
      (current.organization_id ? await canManageOrganization(userId, current.organization_id) : false);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await admin
      .from("material_requests")
      .update({ assignee_uid, updated_at: new Date().toISOString() })
      .eq("id", requestId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] procurement requests PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
