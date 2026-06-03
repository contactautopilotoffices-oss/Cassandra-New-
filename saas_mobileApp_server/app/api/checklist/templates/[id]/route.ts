import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

async function getTemplatePropertyId(id: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("sop_templates").select("property_id").eq("id", id).maybeSingle();
  return data?.property_id ?? null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const admin = createAdminClient();
    const { data: template } = await admin.from("sop_templates").select("property_id").eq("id", id).maybeSingle();
    const actualPropertyId = template?.property_id ?? null;
    if (!actualPropertyId) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, actualPropertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updates: Record<string, any> = {};
    for (const key of ["title", "description", "category", "frequency", "assigned_to", "is_running", "is_active", "start_time", "end_time"]) {
      if (key in body) updates[key] = body[key];
    }
    const { error } = await admin.from("sop_templates").update(updates).eq("id", id).eq("property_id", actualPropertyId);
    if (error) return NextResponse.json({ error: "Failed to update template" }, { status: 500 });

    if (Array.isArray(body.items)) {
      await admin.from("sop_checklist_items").delete().eq("template_id", id).eq("property_id", actualPropertyId);
      if (body.items.length > 0) {
        const rows = body.items.map((item: any) => ({
          template_id: id,
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
        if (itemsError) return NextResponse.json({ error: "Failed to update checklist items" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] checklist template PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
