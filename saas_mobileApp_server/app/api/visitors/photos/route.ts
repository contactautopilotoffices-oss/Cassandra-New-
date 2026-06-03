import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

const BUCKET_NAME = "visitor-photos";

/**
 * POST /api/visitors/photos?propertyId=...
 * Upload visitor photo to Supabase Storage
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const visitorId = formData.get("visitor_id") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!visitorId) {
      return NextResponse.json({ error: "visitor_id required" }, { status: 400 });
    }

    // Validate file size (max 2MB before compression)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 2MB" }, { status: 400 });
    }

    // Generate path: {propertyId}/{visitorId}.webp
    const fileExt = file.type === "image/webp" ? "webp" : "jpg";
    const filePath = `${propertyId}/${visitorId}.${fileExt}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    // Update visitor_logs with photo URL
    const { error: updateError } = await admin
      .from("visitor_logs")
      .update({ photo_url: publicUrl })
      .eq("visitor_id", visitorId)
      .eq("property_id", propertyId);

    if (updateError) {
      console.error("Update error:", updateError);
      // Photo uploaded but DB not updated - still return success with URL
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath,
    });
  } catch (error) {
    console.error("Photo upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
