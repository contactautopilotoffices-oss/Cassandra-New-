import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const scheduleId = formData.get("scheduleId") as string;
    const propertyId = formData.get("propertyId") as string;

    if (!file || !scheduleId || !propertyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    
    const { data: schedule, error: fetchError } = await admin
      .from("ppm_schedules")
      .select("attachments")
      .eq("id", scheduleId)
      .eq("property_id", propertyId)
      .single();

    if (fetchError || !schedule) {
      return NextResponse.json({ error: "Schedule not found or forbidden" }, { status: 404 });
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${scheduleId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("ppm-attachments")
      .upload(fileName, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || "Upload failed" }, { status: 500 });
    }

    const { data: urlData } = admin.storage
      .from("ppm-attachments")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;
    
    const existingAttachments = schedule.attachments || {};
    const existingPhotos = existingAttachments.photos || [];
    const newAttachments = {
      ...existingAttachments,
      photos: [...existingPhotos, publicUrl]
    };

    const { error: updateError } = await admin
      .from("ppm_schedules")
      .update({ attachments: newAttachments, updated_at: new Date().toISOString() })
      .eq("id", scheduleId);

    if (updateError) {
       return NextResponse.json({ error: updateError.message || "Database update failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error("[saas-mobile-server] ppm media POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { scheduleId, propertyId, url } = body;

    if (!scheduleId || !propertyId || !url) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    
    const { data: schedule, error: fetchError } = await admin
      .from("ppm_schedules")
      .select("attachments")
      .eq("id", scheduleId)
      .eq("property_id", propertyId)
      .single();

    if (fetchError || !schedule) {
      return NextResponse.json({ error: "Schedule not found or forbidden" }, { status: 404 });
    }

    const existingAttachments = schedule.attachments || {};
    const existingPhotos = existingAttachments.photos || [];
    const newPhotos = existingPhotos.filter((p: string) => p !== url);
    
    const newAttachments = {
      ...existingAttachments,
      photos: newPhotos
    };

    const { error: updateError } = await admin
      .from("ppm_schedules")
      .update({ attachments: newAttachments, updated_at: new Date().toISOString() })
      .eq("id", scheduleId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message || "Database update failed" }, { status: 500 });
    }

    // Optionally delete from storage here as well, but for simplicity we just remove from JSON
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] ppm media DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
