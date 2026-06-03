import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

/**
 * GET /api/stock/items/[id]/barcode
 * Get barcode details for a stock item.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: item, error: fetchError } = await admin
      .from("stock_items")
      .select("id, name, item_code, barcode, barcode_format, qr_code_data, barcode_generated_at, property_id")
      .eq("id", id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, item.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!item.barcode) {
      return NextResponse.json({ error: "No barcode generated for this item" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      barcode: item.barcode,
      barcode_format: item.barcode_format || "CODE128",
      qr_code_data: item.qr_code_data,
      item_name: item.name,
      item_code: item.item_code,
    });
  } catch (err) {
    console.error("[saas-mobile-server] stock barcode GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/stock/items/[id]/barcode
 * Regenerate barcode and QR code data for a stock item.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: item, error: fetchError } = await admin
      .from("stock_items")
      .select("id, name, item_code, property_id")
      .eq("id", id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, item.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch property code for barcode generation
    const { data: property, error: propError } = await admin
      .from("properties")
      .select("code")
      .eq("id", item.property_id)
      .single();

    const propCode = property?.code?.toUpperCase() || "STK";

    // Generate new barcode
    const newBarcode = `${propCode}-ITEM-${(Date.now() * 1000 + Math.floor(Math.random() * 1000)).toString().substring(0, 13)}`;

    // Generate new QR code data
    const qrCodeData = {
      item_id: item.id,
      item_code: item.item_code,
      name: item.name,
      property_id: item.property_id,
      barcode: newBarcode,
      regenerated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("stock_items")
      .update({
        barcode: newBarcode,
        barcode_format: "CODE128",
        qr_code_data: qrCodeData,
        barcode_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      barcode: newBarcode,
      qr_code_data: qrCodeData,
      message: "Barcode regenerated successfully",
    });
  } catch (err) {
    console.error("[saas-mobile-server] stock barcode POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
