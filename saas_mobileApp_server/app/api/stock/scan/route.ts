import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

/**
 * POST /api/stock/scan
 * Scan a barcode/item code and record a stock movement.
 * Aligned with saas_one web app scan logic.
 *
 * Body:
 *   propertyId: string
 *   itemId: string
 *   action: 'in' | 'out' | 'add' | 'remove' | 'adjust'
 *   quantity: number
 *   notes?: string
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, itemId, action, quantity, notes = "Scanned via Mobile" } = body;

    if (!propertyId || !itemId || !action || quantity === undefined || quantity === null) {
      return NextResponse.json(
        { error: "propertyId, itemId, action, and quantity are required" },
        { status: 400 }
      );
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Map "In/Out" to "add/remove"
    const rawAction = String(action).toLowerCase();
    const finalAction =
      rawAction === "in" ? "add" : rawAction === "out" ? "remove" : rawAction;

    if (!["add", "remove", "adjust"].includes(finalAction)) {
      return NextResponse.json(
        { error: "Invalid action. Must be add, remove, adjust, in, or out" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Get current item
    const { data: item, error: itemError } = await admin
      .from("stock_items")
      .select("*")
      .eq("id", itemId)
      .eq("property_id", propertyId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Calculate new quantity
    let quantityChange = 0;
    if (finalAction === "add") {
      quantityChange = Number(quantity);
    } else if (finalAction === "remove") {
      quantityChange = -Number(quantity);
    } else if (finalAction === "adjust") {
      quantityChange = Number(quantity) - Number(item.quantity ?? 0);
    }

    const newQuantity = Number(item.quantity ?? 0) + quantityChange;

    // Don't allow negative quantities
    if (newQuantity < 0) {
      return NextResponse.json(
        { error: "Cannot reduce stock below zero" },
        { status: 400 }
      );
    }

    // Update item quantity
    const { error: updateError } = await admin
      .from("stock_items")
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Record movement
    const { data: movement, error: movementError } = await admin
      .from("stock_movements")
      .insert({
        item_id: itemId,
        property_id: propertyId,
        organization_id: item.organization_id,
        action: finalAction,
        quantity_change: quantityChange,
        quantity_before: item.quantity,
        quantity_after: newQuantity,
        user_id: auth.user.id,
        notes,
      })
      .select()
      .single();

    if (movementError) {
      return NextResponse.json({ error: movementError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      movement,
      newQuantity,
      item_name: item.name,
    }, { status: 201 });
  } catch (err) {
    console.error("[saas-mobile-server] stock scan POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
