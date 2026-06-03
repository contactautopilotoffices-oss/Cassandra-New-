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
    const propertyId = (formData.get("propertyId") as string) || "";

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${auth.user.id}/${Date.now()}.${ext}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("meeting-rooms")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (error) {
      console.error("[saas-mobile-server] meeting-rooms photo upload error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from("meeting-rooms").getPublicUrl(data.path);

    return NextResponse.json({ success: true, url: urlData.publicUrl });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-rooms photo upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
