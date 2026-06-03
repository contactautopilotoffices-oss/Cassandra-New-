import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const admin = createAdminClient();
    const { data: existing } = await admin.from("sop_completions").select("id, property_id, completed_by").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Checklist completion not found" }, { status: 404 });
    const access = await getPropertyAccess(auth.user.id, existing.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Allow admins to edit any completion; staff can only edit their own
    const canAdmin = access.role && ["property_admin", "org_admin", "org_super_admin", "master_admin"].includes(access.role);
    if (existing.completed_by && existing.completed_by !== auth.user.id && !canAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update completion main record
    const updatePayload: Record<string, any> = {};
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.completed_at !== undefined) updatePayload.completed_at = body.completed_at;
    if (body.is_late !== undefined) updatePayload.is_late = body.is_late;
    if (body.notes !== undefined) updatePayload.notes = body.notes;

    let completionData = existing;
    if (Object.keys(updatePayload).length > 0) {
      const { data, error } = await admin
        .from("sop_completions")
        .update(updatePayload)
        .eq("id", id)
        .select("*, user:users(id, full_name)")
        .single();
      if (error) return NextResponse.json({ error: "Failed to update checklist completion" }, { status: 500 });
      completionData = data;
    }

    // Update completion item if provided
    if (body.item) {
      const itemUpdate: Record<string, any> = {};
      if (body.item.is_checked !== undefined) itemUpdate.is_checked = body.item.is_checked;
      if (body.item.comment !== undefined) itemUpdate.comment = body.item.comment;
      if (body.item.value !== undefined) itemUpdate.value = body.item.value;
      if (body.item.photo_url !== undefined) itemUpdate.photo_url = body.item.photo_url;
      if (body.item.video_url !== undefined) itemUpdate.video_url = body.item.video_url;
      if (body.item.checked_at !== undefined) itemUpdate.checked_at = body.item.checked_at;
      if (body.item.checked_by !== undefined) itemUpdate.checked_by = body.item.checked_by;
      if (body.item.admin_rating !== undefined) itemUpdate.admin_rating = body.item.admin_rating;

      if (Object.keys(itemUpdate).length > 0) {
        const { error: itemError } = await admin
          .from("sop_completion_items")
          .update(itemUpdate)
          .eq("id", body.item.completionItemId)
          .eq("completion_id", id);
        if (itemError) {
          console.error("[saas-mobile-server] completion item update error:", itemError);
        }
      }
    }

    return NextResponse.json({ success: true, completion: completionData });
  } catch (error) {
    console.error("[saas-mobile-server] checklist completion PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
