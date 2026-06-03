import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const propertyId = body.propertyId || body.property_id;
    if (!propertyId || !body.organization_id || !body.title) return NextResponse.json({ error: "Missing template fields" }, { status: 400 });
    if (!(await canManageProperty(auth.user.id, propertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data: template, error } = await admin
      .from("sop_templates")
      .insert({
        property_id: propertyId,
        organization_id: body.organization_id,
        title: body.title,
        description: body.description ?? null,
        category: body.category ?? "general",
        frequency: body.frequency,
        assigned_to: body.assigned_to ?? [],
        is_running: body.is_running ?? true,
        is_active: body.is_active ?? true,
        start_time: body.start_time ?? null,
        end_time: body.end_time ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Failed to create template" }, { status: 500 });

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > 0) {
      const rows = items.map((item: any) => ({
        template_id: template.id,
        title: item.title,
        description: item.description ?? null,
        type: item.type,
        requires_photo: item.requires_photo ?? false,
        requires_comment: item.requires_comment ?? false,
        is_optional: item.is_optional ?? false,
        order_index: item.order_index ?? 0,
        start_time: item.start_time ?? null,
        end_time: item.end_time ?? null,
      }));
      const { error: itemsError } = await admin.from("sop_checklist_items").insert(rows);
      if (itemsError) return NextResponse.json({ error: "Failed to create checklist items" }, { status: 500 });
    }

    return NextResponse.json({ success: true, template }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] checklist templates POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
