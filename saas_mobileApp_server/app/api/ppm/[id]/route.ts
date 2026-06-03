import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

const STATUS_EMOJI: Record<string, string> = {
  done: "✅",
  postponed: "⏸️",
  skipped: "⏭️",
  pending: "⏳",
};

const VALID_STATUSES = ["pending", "done", "postponed", "skipped"];

/**
 * PATCH /api/ppm/[id]
 * Update a PPM schedule entry — aligned with saas_one web app logic.
 *
 * Body fields (all optional except where noted):
 *   status, done_date, remark, verification_status,
 *   vendor_id, vendor_name, vendor_phone, vendor_contact_person
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const {
      status,
      done_date,
      remark,
      verification_status,
      vendor_id,
      vendor_name,
      vendor_phone,
      vendor_contact_person,
    } = body;

    // Validate status
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Fetch existing record to detect status change and get property_id
    const { data: existing, error: fetchError } = await admin
      .from("ppm_schedules")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "PPM schedule not found" }, { status: 404 });
    }

    // Property access check — any active org/property member can update
    const access = await getPropertyAccess(auth.user.id, existing.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build partial update payload (only include provided fields)
    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) updatePayload.status = status;
    if (done_date !== undefined) updatePayload.done_date = done_date || null;
    if (remark !== undefined) updatePayload.remark = remark || null;
    if (verification_status !== undefined) updatePayload.verification_status = verification_status;
    if (vendor_id !== undefined) updatePayload.vendor_id = vendor_id || null;
    if (vendor_name !== undefined) updatePayload.vendor_name = vendor_name || null;
    if (vendor_phone !== undefined) updatePayload.vendor_phone = vendor_phone || null;
    if (vendor_contact_person !== undefined)
      updatePayload.vendor_contact_person = vendor_contact_person || null;

    // Handle completion attachments logic (matching saas_one)
    let finalAttachments: Record<string, any> = existing.attachments || {};

    if (status === "done") {
      const completingUserId = auth.user.id;

      // Fetch the completing user's full name
      const { data: completingUser } = await admin
        .from("users")
        .select("full_name")
        .eq("id", completingUserId)
        .single();

      finalAttachments = {
        ...finalAttachments,
        completed_by: completingUserId,
        completed_by_name: completingUser?.full_name || "Team Member",
        completed_at: new Date().toISOString(),
      };
    } else if (status !== undefined && status !== "done") {
      // Clear completion info if un-marking as done
      const { completed_by, completed_by_name, completed_at, ...restAttachments } =
        finalAttachments;
      finalAttachments = restAttachments;
    }

    updatePayload.attachments = finalAttachments;

    // Perform update
    const { data: updated, error: updateError } = await admin
      .from("ppm_schedules")
      .update(updatePayload)
      .eq("id", id)
      .select("*, maintenance_vendors(id, company_name, contact_person, phone, is_active)")
      .single();

    if (updateError) {
      console.error("[saas-mobile-server] ppm PATCH update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Send notification if status actually changed
    if (existing && status && status !== existing.status) {
      sendPPMUpdateNotification(updated, existing.status, auth.user.id).catch((err) =>
        console.error("[PPM] Update notification error:", err)
      );
    }

    return NextResponse.json({ success: true, schedule: updated });
  } catch (error) {
    console.error("[saas-mobile-server] ppm PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/ppm/[id]
 * Delete a PPM schedule entry.
 */
export async function DELETE(
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

    const { data: existing } = await admin
      .from("ppm_schedules")
      .select("property_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, existing.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await admin.from("ppm_schedules").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] ppm DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Notification helper (aligned with saas_one) ────────────────────────────

async function sendPPMUpdateNotification(
  schedule: any,
  previousStatus: string,
  updatedByUserId: string
) {
  try {
    const admin = createAdminClient();
    const recipientIds = new Set<string>();

    // Org super admins
    const { data: orgAdmins } = await admin
      .from("organization_memberships")
      .select("user_id")
      .eq("organization_id", schedule.organization_id)
      .in("role", ["org_super_admin", "owner", "admin", "org_admin"])
      .neq("is_active", false);

    (orgAdmins || []).forEach((m: any) => recipientIds.add(m.user_id));

    // Property admins
    if (schedule.property_id) {
      const { data: propAdmins } = await admin
        .from("property_memberships")
        .select("user_id")
        .eq("property_id", schedule.property_id)
        .eq("role", "property_admin")
        .eq("is_active", true);

      (propAdmins || []).forEach((m: any) => recipientIds.add(m.user_id));
    }

    if (recipientIds.size === 0) return;

    // Fetch updater name
    const { data: updater } = await admin
      .from("users")
      .select("full_name")
      .eq("id", updatedByUserId)
      .single();

    const updaterName = updater?.full_name || "A team member";

    const emoji = STATUS_EMOJI[schedule.status] || "📋";
    const plannedLabel = new Date(schedule.planned_date + "T12:00:00").toLocaleDateString(
      "en-IN",
      { day: "2-digit", month: "short", year: "numeric" }
    );

    const lines = [
      `${emoji} *PPM Task Updated*`,
      "",
      `📋 *${schedule.system_name}*${schedule.detail_name ? ` — ${schedule.detail_name}` : ""}`,
      schedule.scope_of_work ? `🔧 ${schedule.scope_of_work}` : "",
      schedule.vendor_name ? `🏭 Vendor: ${schedule.vendor_name}` : "",
      schedule.location ? `📍 ${schedule.location}` : "",
      `📅 Planned: ${plannedLabel}`,
      "",
      `📊 Status: *${previousStatus.toUpperCase()}* → *${schedule.status.toUpperCase()}*`,
      schedule.done_date
        ? `✅ Completed on: ${new Date(schedule.done_date + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
        : "",
      schedule.remark ? `💬 Remark: "${schedule.remark}"` : "",
      "",
      `👤 Updated by: ${updaterName}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Queue in-app notifications
    const notifRows = Array.from(recipientIds).map((uid) => ({
      user_id: uid,
      property_id: schedule.property_id,
      organization_id: schedule.organization_id,
      type: "PPM_STATUS_UPDATE",
      title: "PPM Task Updated",
      message: `${schedule.system_name} updated to ${schedule.status.toUpperCase()}`,
      deep_link: `/property/${schedule.property_id}/ppm`,
      status: "unread",
      created_at: new Date().toISOString(),
    }));

    await admin.from("notifications").insert(notifRows);

    // Note: WhatsApp notifications would require the WhatsAppQueueService
    // which is a saas_one dependency. For now, in-app notifications are queued.
  } catch (err) {
    console.error("[PPM] Notification helper error:", err);
  }
}
