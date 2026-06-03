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
    const search = request.nextUrl.searchParams.get("search");
    const category = request.nextUrl.searchParams.get("category");
    const lowStockOnly = request.nextUrl.searchParams.get("lowStockOnly") === "true";
    const barcode = request.nextUrl.searchParams.get("barcode");

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin
      .from("stock_items")
      .select("*")
      .eq("property_id", propertyId)
      .order("name", { ascending: true });

    if (search) {
      const term = `%${search}%`;
      query = query.or(`name.ilike.${term},item_code.ilike.${term},barcode.ilike.${term}`);
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (barcode) {
      query = query.or(`barcode.eq.${barcode},item_code.eq.${barcode}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "Failed to fetch stock items" }, { status: 500 });
    }

    // Filter low stock if requested
    let filteredItems = data || [];
    if (lowStockOnly) {
      filteredItems = filteredItems.filter(
        (item) => item.quantity < (item.min_threshold || 10)
      );
    }

    return NextResponse.json({
      success: true,
      items: filteredItems,
      total: filteredItems.length,
    });
  } catch (error) {
    console.error("[saas-mobile-server] stock items GET error:", error);
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
    if (!propertyId || !body.name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!(await canManageProperty(auth.user.id, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Get organization_id from property
    const { data: property } = await admin
      .from("properties")
      .select("organization_id, code")
      .eq("id", propertyId)
      .single();

    const organizationId = property?.organization_id;
    const propCode = property?.code?.toUpperCase() || "STK";

    // Generate item_code if not provided
    const finalItemCode = body.item_code || `ITEM-${Date.now()}`;

    // Auto-generate barcode
    const newBarcode = `${propCode}-ITEM-${(Date.now() * 1000 + Math.floor(Math.random() * 1000)).toString().substring(0, 13)}`;
    const qrCodeData = {
      item_id: null, // will be set after insert
      item_code: finalItemCode,
      name: body.name,
      property_id: propertyId,
      barcode: newBarcode,
      generated_at: new Date().toISOString(),
    };

    const { data: item, error: insertError } = await admin
      .from("stock_items")
      .insert({
        property_id: propertyId,
        organization_id: organizationId,
        name: body.name,
        item_code: finalItemCode,
        description: body.description ?? null,
        category: body.category ?? null,
        quantity: body.quantity ?? 0,
        unit: body.unit ?? null,
        min_threshold: body.min_threshold ?? 10,
        per_unit_cost: body.per_unit_cost ?? 0,
        location: body.location ?? null,
        barcode: newBarcode,
        barcode_format: "CODE128",
        qr_code_data: { ...qrCodeData, item_id: null },
        barcode_generated_at: new Date().toISOString(),
        created_by: auth.user.id,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update qr_code_data with the actual item_id
    await admin
      .from("stock_items")
      .update({
        qr_code_data: {
          ...qrCodeData,
          item_id: item.id,
        },
      })
      .eq("id", item.id);

    // Record initial movement if quantity > 0
    if ((body.quantity ?? 0) > 0) {
      await admin.from("stock_movements").insert({
        item_id: item.id,
        property_id: propertyId,
        organization_id: organizationId,
        action: "initial",
        quantity_change: body.quantity,
        quantity_before: 0,
        quantity_after: body.quantity,
        user_id: auth.user.id,
        notes: "Initial stock entry",
      });
    }

    return NextResponse.json(
      {
        success: true,
        item: { ...item, qr_code_data: { ...qrCodeData, item_id: item.id } },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[saas-mobile-server] stock items POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/stock/items
 * Bulk delete stock items.
 *
 * Body:
 *   propertyId: string
 *   itemIds: string[]
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, itemIds } = body;

    if (!propertyId || !itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { error: "propertyId and itemIds array are required" },
        { status: 400 }
      );
    }

    if (!(await canManageProperty(auth.user.id, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Verify all items belong to this property
    const { data: existingItems, error: fetchError } = await admin
      .from("stock_items")
      .select("id")
      .eq("property_id", propertyId)
      .in("id", itemIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const validIds = (existingItems || []).map((i) => i.id);
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No matching items found" }, { status: 404 });
    }

    const { error: deleteError } = await admin
      .from("stock_items")
      .delete()
      .in("id", validIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedCount: validIds.length,
    });
  } catch (err) {
    console.error("[saas-mobile-server] stock items DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
