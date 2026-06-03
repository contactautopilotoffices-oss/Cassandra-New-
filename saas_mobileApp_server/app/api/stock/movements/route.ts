import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const itemId = request.nextUrl.searchParams.get("itemId");
    const limit = Number(request.nextUrl.searchParams.get("limit") || "50");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    let query = admin
      .from("stock_movements")
      .select("id, item_id, action, quantity_change, quantity_before, quantity_after, notes, created_at, stock_items:item_id(name, item_code, unit), users:user_id(full_name)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (itemId) query = query.eq("item_id", itemId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to fetch stock movements" }, { status: 500 });
    return NextResponse.json({ movements: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] stock movements GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const propertyId = body.propertyId || body.property_id;
    const itemId = body.itemId || body.item_id;
    const action = body.action;
    const quantity = Math.abs(Number(body.quantity ?? body.quantity_change ?? 0));
    if (!propertyId || !itemId || !action || !quantity) {
      return NextResponse.json({ error: "Missing movement fields" }, { status: 400 });
    }
    if (!(await canManageProperty(auth.user.id, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: item, error: itemError } = await admin
      .from("stock_items")
      .select("*")
      .eq("id", itemId)
      .eq("property_id", propertyId)
      .single();
    if (itemError || !item) return NextResponse.json({ error: "Stock item not found" }, { status: 404 });

    const quantityBefore = Number(item.quantity ?? 0);
    const normalizedAction = action === "intake" ? "add" : action === "outflow" ? "remove" : action;
    const quantityAfter =
      normalizedAction === "add" ? quantityBefore + quantity :
      normalizedAction === "remove" ? quantityBefore - quantity :
      quantity;
    if (quantityAfter < 0) {
      return NextResponse.json({ error: "Cannot reduce stock below zero" }, { status: 400 });
    }

    const signedChange =
      normalizedAction === "remove" ? -quantity :
      normalizedAction === "adjust" ? quantityAfter - quantityBefore :
      quantity;

    const { data: movement, error: movementError } = await admin
      .from("stock_movements")
      .insert({
        property_id: propertyId,
        item_id: itemId,
        action: normalizedAction,
        quantity_change: signedChange,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        notes: body.notes ?? null,
        user_id: auth.user.id,
      })
      .select("id, item_id, action, quantity_change, quantity_before, quantity_after, notes, created_at, stock_items:item_id(name, item_code, unit), users:user_id(full_name)")
      .single();
    if (movementError) return NextResponse.json({ error: "Failed to record stock movement" }, { status: 500 });

    const { data: updatedItem, error: updateError } = await admin
      .from("stock_items")
      .update({ quantity: quantityAfter, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .select("*")
      .single();
    if (updateError) return NextResponse.json({ error: "Failed to update stock item quantity" }, { status: 500 });

    return NextResponse.json({ success: true, movement, item: updatedItem }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] stock movements POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
