import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

const BUCKET_NAME = "ticket_photos";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    const { data: ticket, error: ticketError } = await admin
      .from("tickets")
      .select("id, property_id, photo_before_url, photo_after_url")
      .eq("id", id)
      .maybeSingle();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      before: ticket.photo_before_url ?? null,
      after: ticket.photo_after_url ?? null
    });
  } catch (error) {
    console.error("[saas-mobile-server] ticket photos GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user || !auth.token) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const photoType = String(formData.get("type") || "");
    const takenAt = String(formData.get("takenAt") || "");

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!["before", "after"].includes(photoType)) {
      return NextResponse.json({ error: 'Invalid photo type. Use "before" or "after"' }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });

    const admin = createAdminClient();
    const { data: ticket } = await admin
      .from("tickets")
      .select("id, property_id, raised_by, assigned_to")
      .eq("id", id)
      .maybeSingle();

    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.raised_by !== auth.user.id && ticket.assigned_to !== auth.user.id) {
      return NextResponse.json({ error: "Not authorized to upload photos for this ticket" }, { status: 403 });
    }

    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${id}/${photoType}_${Date.now()}.${fileExt}`;
    const supabase = createAnonClient(auth.token);

    const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(fileName, file, {
      cacheControl: "3600",
      upsert: true
    });

    if (uploadError) {
      return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
    }

    const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
    const publicUrl = publicData.publicUrl;
    const updateField = photoType === "before" ? "photo_before_url" : "photo_after_url";

    const { error: updateError } = await admin
      .from("tickets")
      .update({ [updateField]: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to save photo URL" }, { status: 500 });
    }

    await admin.from("ticket_activity_log").insert({
      ticket_id: id,
      user_id: auth.user.id,
      action: `photo_${photoType}_uploaded`,
      new_value: publicUrl,
      old_value: takenAt || new Date().toISOString()
    });

    return NextResponse.json({ success: true, url: publicUrl, type: photoType });
  } catch (error) {
    console.error("[saas-mobile-server] ticket photos POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
