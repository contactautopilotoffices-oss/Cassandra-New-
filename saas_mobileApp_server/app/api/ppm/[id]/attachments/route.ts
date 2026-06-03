import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "ppm-attachments";

/**
 * POST /api/ppm/[id]/attachments
 * Upload a file attachment (photo, doc, or invoice) for a PPM schedule.
 * Aligned with saas_one web app logic.
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

    // Verify schedule exists and get property_id
    const { data: schedule } = await admin
      .from("ppm_schedules")
      .select("property_id")
      .eq("id", id)
      .single();

    if (!schedule) {
      return NextResponse.json({ error: "PPM schedule not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, schedule.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const attachType = formData.get("attach_type") as "photo" | "doc" | "invoice" | null;

    if (!file || !attachType) {
      return NextResponse.json({ error: "file and attach_type are required" }, { status: 400 });
    }
    if (!["photo", "doc", "invoice"].includes(attachType)) {
      return NextResponse.json(
        { error: "attach_type must be photo, doc, or invoice" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "bin";
    const path = `${id}/${attachType}_${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to storage using admin client
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const url = urlData.publicUrl;

    // Update attachments JSONB column
    const { data: existing } = await admin
      .from("ppm_schedules")
      .select("attachments")
      .eq("id", id)
      .single();

    const currentAttachments: Record<string, any> = existing?.attachments || {};

    if (attachType === "photo") {
      const photos: string[] = Array.isArray(currentAttachments.photos)
        ? currentAttachments.photos
        : [];
      currentAttachments.photos = [...photos, url];
      // Also update legacy completion_photos column for compatibility
      const { data: scheduleData } = await admin
        .from("ppm_schedules")
        .select("completion_photos")
        .eq("id", id)
        .single();
      const legacyPhotos: string[] = scheduleData?.completion_photos || [];
      await admin
        .from("ppm_schedules")
        .update({
          completion_photos: [...legacyPhotos, url],
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } else if (attachType === "doc") {
      currentAttachments.certificate = url;
      await admin
        .from("ppm_schedules")
        .update({
          completion_doc_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } else {
      currentAttachments.invoice = url;
      await admin
        .from("ppm_schedules")
        .update({
          invoice_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    // Update attachments JSONB
    const { error: updateError } = await admin
      .from("ppm_schedules")
      .update({ attachments: currentAttachments, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: `DB update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, url, attachments: currentAttachments });
  } catch (err) {
    console.error("[saas-mobile-server] ppm attachment POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/ppm/[id]/attachments
 * Remove an attachment from a PPM schedule.
 * Query params: url, attach_type (photo | doc | invoice)
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

    const { searchParams } = request.nextUrl;
    const url = searchParams.get("url");
    const attachType = searchParams.get("attach_type") as "photo" | "doc" | "invoice" | null;

    if (!url || !attachType) {
      return NextResponse.json({ error: "url and attach_type are required" }, { status: 400 });
    }

    // Verify schedule exists
    const { data: schedule } = await admin
      .from("ppm_schedules")
      .select("property_id")
      .eq("id", id)
      .single();

    if (!schedule) {
      return NextResponse.json({ error: "PPM schedule not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, schedule.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Try to remove from storage
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split(`/${BUCKET}/`);
      if (pathParts.length > 1) {
        await admin.storage.from(BUCKET).remove([pathParts[1]]);
      }
    } catch {
      // Non-fatal: continue with DB update even if storage removal fails
    }

    // Update legacy columns
    const { data: existing, error: fetchError } = await admin
      .from("ppm_schedules")
      .select("completion_photos, completion_doc_url, invoice_url, attachments")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const currentAttachments: Record<string, any> = existing?.attachments || {};

    if (attachType === "photo") {
      const existing_photos: string[] = existing?.completion_photos || [];
      updatePayload.completion_photos = existing_photos.filter((p) => p !== url);
      currentAttachments.photos = (currentAttachments.photos || []).filter(
        (p: string) => p !== url
      );
    } else if (attachType === "doc") {
      updatePayload.completion_doc_url = null;
      currentAttachments.certificate = null;
    } else {
      updatePayload.invoice_url = null;
      currentAttachments.invoice = null;
    }

    updatePayload.attachments = currentAttachments;

    const { error: updateError } = await admin
      .from("ppm_schedules")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[saas-mobile-server] ppm attachment DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/ppm/[id]/attachments
 * Update attachments JSONB directly (backward compat).
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
    const admin = createAdminClient();

    const { data: schedule } = await admin
      .from("ppm_schedules")
      .select("property_id")
      .eq("id", id)
      .maybeSingle();

    if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = await getPropertyAccess(auth.user.id, schedule.property_id);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin
      .from("ppm_schedules")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] ppm attachments PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, schedule: data });
  } catch (error) {
    console.error("[saas-mobile-server] ppm attachments PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
