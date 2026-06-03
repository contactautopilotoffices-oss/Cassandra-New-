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
    const templateId = request.nextUrl.searchParams.get("templateId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    let query = admin
      .from("sop_completions")
      .select("id, status, completed_at, template:sop_templates(title)")
      .eq("property_id", propertyId)
      .order("completed_at", { ascending: false })
      .limit(20);

    if (templateId) {
      query = query.eq("template_id", templateId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to fetch completions" }, { status: 500 });
    return NextResponse.json({ completions: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] checklist completions GET error:", error);
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
    if (!propertyId || !body.template_id) return NextResponse.json({ error: "Missing checklist fields" }, { status: 400 });
    if (!(await canManageProperty(auth.user.id, propertyId))) {
      const access = await getPropertyAccess(auth.user.id, propertyId);
      const accessAllowed = access.authorized && body.completed_by === auth.user.id;
      if (!accessAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Insert completion
    const { data, error } = await admin
      .from("sop_completions")
      .insert({
        template_id: body.template_id,
        property_id: propertyId,
        organization_id: body.organization_id ?? null,
        completed_by: body.completed_by ?? auth.user.id,
        status: body.status ?? "in_progress",
        completion_date: body.completion_date,
        slot_time: body.slot_time ?? null,
      })
      .select("*, user:users(id, full_name)")
      .single();
    if (error) return NextResponse.json({ error: "Failed to start checklist" }, { status: 500 });

    // Auto-create completion items from template items
    const { data: templateItems } = await admin
      .from("sop_checklist_items")
      .select("id")
      .eq("template_id", body.template_id)
      .order("order_index", { ascending: true });

    if (templateItems && templateItems.length > 0) {
      const itemsPayload = templateItems.map((item: any) => ({
        completion_id: data.id,
        checklist_item_id: item.id,
        is_checked: false,
      }));
      await admin.from("sop_completion_items").insert(itemsPayload);
    }

    return NextResponse.json({ success: true, completion: data }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] checklist completions POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
