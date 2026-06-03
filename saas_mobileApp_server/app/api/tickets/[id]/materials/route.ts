import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ticketId } = await params;
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { items, assignee_uid } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items required" }, { status: 400 });
    }
    if (!assignee_uid) {
      return NextResponse.json({ error: "Procurement assignee required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: ticket, error: ticketError } = await admin
      .from("tickets")
      .select("id, property_id, organization_id")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const totalAmount = items.reduce((sum: number, item: any) => {
      const quantity = Number(item.qty ?? item.quantity ?? 0);
      const unitPrice = Number(item.unit_price ?? 0);
      return sum + quantity * unitPrice;
    }, 0);

    const { data: materialRequest, error: materialRequestError } = await admin
      .from("material_requests")
      .insert({
        ticket_id: ticketId,
        property_id: ticket.property_id,
        organization_id: ticket.organization_id,
        requested_by: auth.user.id,
        assignee_uid,
        total_amount: totalAmount,
        status: "pending_quotation",
      })
      .select("*")
      .single();

    if (materialRequestError || !materialRequest) {
      console.error("[saas-mobile-server] ticket materials POST create error:", materialRequestError);
      return NextResponse.json({ error: materialRequestError?.message ?? "Failed to create request" }, { status: 500 });
    }

    const lineItems = items.map((item: any) => {
      const quantity = Number(item.qty ?? item.quantity ?? 0);
      const unitPrice = Number(item.unit_price ?? 0);
      return {
        request_id: materialRequest.id,
        organization_id: ticket.organization_id,
        catalog_item_id: item.catalog_item_id ?? null,
        name: item.name,
        quantity,
        unit_price: unitPrice,
        total_price: quantity * unitPrice,
        photo_url: item.photo_url ?? null,
        description: item.description ?? item.notes ?? null,
        links: item.links ?? null,
      };
    });

    if (lineItems.length > 0) {
      const { error: lineItemsError } = await admin.from("material_request_items").insert(lineItems);
      if (lineItemsError) {
        console.error("[saas-mobile-server] ticket materials POST items error:", lineItemsError);
        return NextResponse.json({ error: "Failed to create request items" }, { status: 500 });
      }
    }

    const summary = items
      .map((item: any, index: number) => {
        const quantity = item.qty ?? item.quantity ?? 1;
        const notes = item.notes ? ` - Notes: ${item.notes}` : "";
        return `${index + 1}. ${quantity} of ${item.name}${notes}`;
      })
      .join("\n");

    void admin.from("ticket_comments").insert({
      ticket_id: ticketId,
      user_id: auth.user.id,
      comment: `[MATERIAL REQUESTED]\n${summary}`,
      is_internal: false,
      metadata: {
        material_request_id: materialRequest.id,
        assignee_uid,
      },
    });

    void admin.from("ticket_activity_log").insert({
      ticket_id: ticketId,
      performed_by: auth.user.id,
      action: "procurement_requested",
      details: JSON.stringify({ material_request_id: materialRequest.id, assignee_uid }),
    });

    return NextResponse.json({ success: true, material_request: materialRequest }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] ticket materials POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
